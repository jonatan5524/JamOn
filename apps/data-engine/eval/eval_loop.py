"""
RAG Eval & Auto-Improvement Loop

Usage:
  python -m eval.eval_loop
  python -m eval.eval_loop --iterations 10
  python -m eval.eval_loop --skip-phase1
  python -m eval.eval_loop --dry-run
"""
import argparse
import asyncio
import json
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Tuple


from app.core.config import settings
from app.core.resilience import cb as _circuit_breaker
from app.providers.llm.college.dj import CollegeDJProvider
from app.providers.llm.gemini.hyde import GeminiHyDEProvider
from app.providers.llm.nim.hyde import NimHyDEProvider
from app.providers.llm.gemini.embedding import GeminiEmbeddingProvider
from app.providers.vectordb.chroma import ChromaVectorStore
from app.providers.vectordb.pgvector import PgVectorStore
from app.services.rag import RagEngine
from app.workflows.playlist_generator import PlaylistGraphBuilder

from eval.cached_embedder import CachedEmbeddingProvider, CachedHyDEProvider
from eval.event_generator import get_default_events, get_holdout_events
from eval.runner import RunConfig, RunResult, run_pipeline, stub_validator, load_library
from eval.scorer import score_run, compute_acceptance_rate, compute_retrieval_relevance, compute_size_fulfillment, ScoreResult
from eval.optimizer import run_grid_search, run_hill_climbing, PhaseOneResult, PhaseTwoResult

class _ColorFormatter(logging.Formatter):
    _COLORS = {
        logging.DEBUG:    "\033[90m",   # dark grey
        logging.INFO:     "\033[36m",   # cyan
        logging.WARNING:  "\033[33m",   # yellow
        logging.ERROR:    "\033[31m",   # red
        logging.CRITICAL: "\033[1;31m", # bold red
    }
    _RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self._COLORS.get(record.levelno, "")
        time_str = self.formatTime(record, "%H:%M:%S")
        msg = record.getMessage()
        return f"{color}[{time_str}] {msg}{self._RESET}"


def _setup_logging() -> None:
    # Silence all app/* loggers (pgvector, rag, workflow, etc.) — only eval progress visible.
    logging.getLogger().setLevel(logging.WARNING)

    handler = logging.StreamHandler()
    handler.setFormatter(_ColorFormatter())

    # Configure the "eval" parent so all eval.* submodules (runner, scorer, optimizer, etc.)
    # and __main__ (eval_loop itself) all emit colored INFO logs.
    eval_logger = logging.getLogger("eval")
    eval_logger.setLevel(logging.INFO)
    eval_logger.propagate = False
    eval_logger.addHandler(handler)

    # __main__ is the logger name when eval_loop.py runs as the entry point.
    main_logger = logging.getLogger("__main__")
    main_logger.setLevel(logging.INFO)
    main_logger.propagate = False
    main_logger.addHandler(handler)


_setup_logging()
logger = logging.getLogger(__name__)

EVAL_DIR = Path(__file__).parent
RESULTS_DIR = EVAL_DIR / "results"
OPTIMIZED_DIR = EVAL_DIR / "optimized"
PROMPTS_DIR = EVAL_DIR.parent / "app" / "prompts"
RESULTS_DIR.mkdir(exist_ok=True)
OPTIMIZED_DIR.mkdir(exist_ok=True)


def load_prompt(filename: str) -> str:
    return (PROMPTS_DIR / filename).read_text()


def build_rag_engine_pgvector() -> RagEngine:
    """RagEngine backed by production pgvector — songs and embeddings already exist,
    no Gemini embedding calls needed to seed the library."""
    logger.info("[build] using production pgvector (skipping library embedding)")
    embedder = CachedEmbeddingProvider(GeminiEmbeddingProvider())
    vector_store = PgVectorStore(collection_name="production")
    hyde_provider =  CachedHyDEProvider(NimHyDEProvider())
    dj_provider = CollegeDJProvider()
    return RagEngine(
        vector_store=vector_store,
        embedder=embedder,
        dj=dj_provider,
        hyde=hyde_provider,
    )


def build_rag_engine(config: RunConfig) -> RagEngine:
    """Build a RagEngine with a fresh in-memory Chroma collection.

    ChromaVectorStore has no reset() method and its constructor always calls
    create_collection, so we use a unique UUID-based collection name per run
    to guarantee a clean slate without touching any persistent state.
    """
    logger.info("[build] creating Gemini embedder...")
    embedder = GeminiEmbeddingProvider()
    collection_name = f"eval_{uuid.uuid4().hex}"
    vector_store = ChromaVectorStore(collection_name=collection_name)

    library = load_library()
    logger.info(f"[build] embedding {len(library)} songs into Chroma (this calls Gemini embedding API)...")
    # ChromaVectorStore.add_songs looks up lyrics by title (matches production's
    # lyrics_map = {title: lyrics_snippet}), so key by title and supply the snippets.
    lyrics_map = {s["title"]: s.get("lyrics", "") for s in library}
    vector_store.add_songs(library, lyrics_map, embedder)
    logger.info("[build] library embedded successfully")

    hyde_provider = GeminiHyDEProvider()
    dj_provider = CollegeDJProvider()

    rag = RagEngine(
        vector_store=vector_store,
        embedder=embedder,
        dj=dj_provider,
        hyde=hyde_provider,
    )
    return rag


def build_graph(config: RunConfig, rag: RagEngine, event_id: str = ""):
    dj_provider = CollegeDJProvider()

    async def llm_generator(event_desc, count, rejected, db_songs, anchor_artists):
        # College server rate limit: 5 req/min. gemma3:12b takes ~4s, so sleep 9s
        # after each call to stay safely under the limit.
        await asyncio.sleep(9)
        return await asyncio.to_thread(
            dj_provider.generate_playlist, event_desc, db_songs, count, rejected, anchor_artists
        )

    async def db_fetcher(event_desc):
        return await rag.query_songs(
            event_desc, event_id=event_id, n_results=config.n_results, max_distance=config.max_distance
        )

    async def uri_validator(song):
        return stub_validator(song)

    builder = PlaylistGraphBuilder(
        llm_generator=llm_generator,
        db_fetcher=db_fetcher,
        uri_validator=uri_validator,
        target_playlist_size=config.target_playlist_size,
        min_wildcards=config.target_wildcards,
        strong_match_margin=config.strong_match_margin,
        max_attempts=config.max_attempts,
    )
    return builder.build()


async def run_all_events_partial(
    events: List[str],
    params: Dict[str, Any],
    hyde_prompt: str,
    dj_prompt: str,
    include_judge: bool = False,
    prebuilt_rag: RagEngine | None = None,
    event_id: str = "",
) -> Tuple[float, List[str]]:
    config = RunConfig(
        n_results=params.get("n_results", 15),
        max_distance=params.get("max_distance", 0.65),
        target_wildcards=params.get("target_wildcards", 5),
        strong_match_margin=params.get("strong_match_margin", 0.10),
        target_playlist_size=params.get("target_playlist_size", 20),
        hyde_prompt=hyde_prompt,
        dj_prompt=dj_prompt,
    )

    # GeminiHyDEProvider and GeminiDJProvider read prompt files on each call
    # (not at construction time), so we write the prompts before running the
    # pipeline and restore them afterwards to avoid side-effects on the live app.
    orig_hyde = (PROMPTS_DIR / "hyde_prompt.txt").read_text()
    orig_dj = (PROMPTS_DIR / "playlist_generation_prompt.txt").read_text()
    (PROMPTS_DIR / "hyde_prompt.txt").write_text(hyde_prompt)
    (PROMPTS_DIR / "playlist_generation_prompt.txt").write_text(dj_prompt)

    try:
        if prebuilt_rag is not None:
            rag = prebuilt_rag
            logger.info("[eval] reusing pgvector RAG engine")
        else:
            logger.info("[eval] building RAG engine (embedding mock songs via Gemini)...")
            rag = await asyncio.to_thread(build_rag_engine, config)
        graph = build_graph(config, rag, event_id=event_id)
        logger.info(f"[eval] RAG engine ready — running {len(events)} events")

        results: List[RunResult] = []
        for i, event in enumerate(events, 1):
            pct = (i / len(events)) * 100
            logger.info(f"[eval] event {i}/{len(events)} ({pct:.0f}%): '{event}'")
            result = await run_pipeline(
                event, graph, config.target_wildcards,
                n_results_requested=config.n_results,
                target_playlist_size=config.target_playlist_size,
            )
            logger.info(
                f"[eval]   ✓ {len(result.library_songs)} library  "
                f"{len(result.validated_wildcards)}/{result.target_wildcards} wildcards  "
                f"{len(result.final_playlist)} total"
            )
            results.append(result)
    finally:
        # Always restore original prompt files regardless of errors
        (PROMPTS_DIR / "hyde_prompt.txt").write_text(orig_hyde)
        (PROMPTS_DIR / "playlist_generation_prompt.txt").write_text(orig_dj)

    if not results:
        return 0.0, []

    # Guardrail: a config where EVERY event produces an empty spine is broken, not
    # merely low-scoring — the library contributes nothing and retrieval_relevance is
    # a flat 0.00. (This is exactly the failure mode that let a mistuned absolute gate
    # pass as a 0.67 composite.) Force it to 0 so the optimizer rejects it, and fail
    # loudly so a human notices instead of trusting the number.
    if all(len(r.library_songs) == 0 for r in results):
        logger.error(
            "⚠ EMPTY SPINE on ALL %d events — the library is contributing nothing and "
            "retrieval_relevance is 0.00. Check strong_match_margin / max_distance against "
            "the real distance distribution (run with --dry-run). Scoring this config as 0.",
            len(results),
        )
        return 0.0, [f"EMPTY SPINE on all {len(results)} events"]

    # Partial score: acceptance_rate + retrieval_relevance + size_fulfillment (no judge)
    total_acceptance = sum(
        compute_acceptance_rate(len(r.validated_wildcards), r.target_wildcards) for r in results
    )
    total_relevance = sum(compute_retrieval_relevance(r.library_songs, r.n_results_requested) for r in results)
    total_size = sum(compute_size_fulfillment(len(r.final_playlist), r.target_playlist_size) for r in results)
    n = len(results)
    partial = 0.20 * (total_acceptance / n) + 0.15 * (total_relevance / n) + 0.15 * (total_size / n)

    if not include_judge:
        return partial, []

    # Full composite (Phase 2): add alignment from judge
    failures = []
    total_alignment = 0.0
    for i, r in enumerate(results, 1):
        logger.info(f"[eval] judging event {i}/{len(results)}: '{r.event_description}' ({len(r.final_playlist)} songs)...")
        score_result = await asyncio.to_thread(score_run, r, True)
        logger.info(
            f"[eval]   ✓ alignment={score_result.alignment:.2f}, acceptance={score_result.acceptance_rate:.2f}, "
            f"relevance={score_result.retrieval_relevance:.2f}, size={score_result.size_fulfillment:.2f}"
        )
        total_alignment += score_result.alignment
        if score_result.alignment < 0.6 or score_result.acceptance_rate < 0.6:
            failures.append(
                f"Event '{r.event_description}': alignment={score_result.alignment:.2f}, "
                f"acceptance={score_result.acceptance_rate:.2f}"
            )

    composite = (
        0.45 * (total_alignment / n)
        + 0.25 * (total_acceptance / n)
        + 0.15 * (total_relevance / n)
        + 0.15 * (total_size / n)
    )
    return composite, failures


def print_summary(phase1: PhaseOneResult | None, phase2: PhaseTwoResult, holdout_score: float):
    print("\n" + "=" * 60)
    print("EVAL LOOP RESULTS")
    print("=" * 60)
    if phase1:
        print(f"\nPhase 1 — Best params: {phase1.best_params}")
        print(f"           Partial score: {phase1.best_partial_score:.4f}")
    print(f"\nPhase 2 — Score history: {[f'{s:.3f}' for s in phase2.score_history]}")
    print(f"           Best train composite: {phase2.best_composite_score:.4f}")
    print(f"\nHoldout — Composite on unseen events: {holdout_score:.4f}")
    gap = phase2.best_composite_score - holdout_score
    print(f"           Train−holdout gap: {gap:+.4f}" + ("  ⚠ possible overfitting" if gap > 0.1 else ""))
    print(f"\nOptimized prompts and params written to: {OPTIMIZED_DIR}")
    print("=" * 60)


async def main():
    parser = argparse.ArgumentParser(description="RAG eval & auto-improvement loop")
    parser.add_argument("--iterations", type=int, default=5, help="Prompt optimization iterations (default: 5)")
    parser.add_argument("--skip-phase1", action="store_true", help="Skip parameter grid search")
    parser.add_argument("--dry-run", action="store_true", help="Score current config only, no optimization")
    parser.add_argument(
        "--event-id",
        help="Real event ID from production DB — uses pgvector with pre-computed embeddings instead of re-embedding mock songs",
    )
    args = parser.parse_args()

    _circuit_breaker.failure_count = 0
    _circuit_breaker.state = "CLOSED"
    _circuit_breaker.last_failure_time = 0

    # Build RAG engine once when using pgvector; otherwise each combo builds its own Chroma.
    prebuilt_rag: RagEngine | None = None
    event_id = args.event_id or ""
    if event_id:
        logger.info(f"[startup] --event-id={event_id}: using production pgvector (no library embedding)")
        prebuilt_rag = build_rag_engine_pgvector()
    else:
        logger.info("[startup] no --event-id: using Chroma with mock songs (re-embedded per combo)")

    events = get_default_events()
    logger.info(f"[startup] using {len(events)} hardcoded events:")
    for i, e in enumerate(events, 1):
        logger.info(f"  {i}. {e}")

    hyde_prompt = load_prompt("hyde_prompt.txt")
    dj_prompt = load_prompt("playlist_generation_prompt.txt")
    best_params = {"n_results": 15, "max_distance": 0.65, "target_wildcards": 5}

    phase1_result = None

    if not args.skip_phase1 and not args.dry_run:
        logger.info("\n" + "="*60)
        logger.info("  PHASE 1: PARAMETER GRID SEARCH")
        logger.info("="*60)

        async def grid_runner(params):
            score, _ = await run_all_events_partial(
                events, params, hyde_prompt, dj_prompt,
                include_judge=False, prebuilt_rag=prebuilt_rag, event_id=event_id,
            )
            return score

        phase1_result = await run_grid_search(grid_runner, checkpoint_path=OPTIMIZED_DIR / "params.json")
        best_params = phase1_result.best_params
        (OPTIMIZED_DIR / "params.json").write_text(json.dumps(best_params, indent=2))
        logger.info(f"[phase1] best params saved to {OPTIMIZED_DIR / 'params.json'}: {best_params}")

    if args.dry_run:
        logger.info("Dry run: verifying retrieval pipeline only (no DJ generation or judge calls)")
        config = RunConfig(
            n_results=best_params.get("n_results", 15),
            max_distance=best_params.get("max_distance", 0.65),
            target_wildcards=best_params.get("target_wildcards", 5),
            strong_match_margin=best_params.get("strong_match_margin", 0.10),
        )
        if prebuilt_rag is not None:
            rag = prebuilt_rag
            logger.info("[eval] reusing pgvector RAG engine")
        else:
            logger.info("[eval] building RAG engine (embedding mock songs via Gemini)...")
            rag = await asyncio.to_thread(build_rag_engine, config)
        logger.info(f"[eval] RAG engine ready — querying {len(events)} events")

        all_songs: List[List[Dict[str, Any]]] = []
        for i, event in enumerate(events, 1):
            logger.info(f"[eval] event {i}/{len(events)}: '{event}'")
            library_songs = await rag.query_songs(
                event, event_id=event_id, n_results=config.n_results, max_distance=config.max_distance
            )
            # Apply the same relative spine gate the graph uses, so the dry-run reports
            # the SPINE size (what retrieval_relevance actually scores), not just the pool.
            ordered = sorted(library_songs, key=lambda s: s.get("distance", 1.0))
            if ordered:
                cutoff = ordered[0].get("distance", 1.0) + config.strong_match_margin
                spine = [s for s in ordered if s.get("distance", 1.0) <= cutoff]
            else:
                spine = []
            logger.info(
                f"[eval]   ✓ {len(library_songs)} retrieved, {len(spine)} strong "
                f"(margin={config.strong_match_margin})"
            )
            if not spine:
                logger.warning(f"[eval]   ⚠ EMPTY SPINE for '{event}' — library contributes nothing")
            all_songs.append(spine)

        n = len(all_songs)
        retrieval_score = sum(compute_retrieval_relevance(songs, config.n_results) for songs in all_songs) / n if n else 0.0
        print(f"\nRetrieval relevance score: {retrieval_score:.4f}")
        print("(Retrieval only — no DJ generation or judge. Run without --dry-run for full composite score.)")
        return

    logger.info("\n" + "="*60)
    logger.info("  PHASE 2: PROMPT HILL-CLIMBING")
    logger.info(f"  best params: {best_params}")
    logger.info("="*60)

    async def score_all(hp, dp):
        return await run_all_events_partial(
            events, best_params, hp, dp,
            include_judge=True, prebuilt_rag=prebuilt_rag, event_id=event_id,
        )

    phase2_result = await run_hill_climbing(
        initial_hyde_prompt=hyde_prompt,
        initial_dj_prompt=dj_prompt,
        score_all_events=score_all,
        iterations=args.iterations,
    )

    # Validate the tuned config on held-out events the optimizer never saw.
    holdout_events = get_holdout_events()
    logger.info(f"Validating best config on {len(holdout_events)} held-out events")
    holdout_score, _ = await run_all_events_partial(
        holdout_events, best_params,
        phase2_result.best_hyde_prompt, phase2_result.best_dj_prompt,
        include_judge=True, prebuilt_rag=prebuilt_rag, event_id=event_id,
    )
    logger.info(f"Holdout composite score: {holdout_score:.4f}")

    # Write optimized outputs
    (OPTIMIZED_DIR / "hyde_prompt.txt").write_text(phase2_result.best_hyde_prompt)
    (OPTIMIZED_DIR / "playlist_generation_prompt.txt").write_text(phase2_result.best_dj_prompt)
    (OPTIMIZED_DIR / "params.json").write_text(json.dumps(best_params, indent=2))

    # Save run log
    run_log = {
        "timestamp": datetime.utcnow().isoformat(),
        "events": events,
        "holdout_events": holdout_events,
        "phase1": {"best_params": best_params, "best_partial_score": phase1_result.best_partial_score if phase1_result else None},
        "phase2": {"score_history": phase2_result.score_history, "best_composite": phase2_result.best_composite_score},
        "holdout": {"composite": holdout_score},
    }
    log_path = RESULTS_DIR / f"run_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    log_path.write_text(json.dumps(run_log, indent=2))

    print_summary(phase1_result, phase2_result, holdout_score)


if __name__ == "__main__":
    asyncio.run(main())
