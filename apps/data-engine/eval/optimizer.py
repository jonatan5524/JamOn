import itertools
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Awaitable, List, Dict

import openai

from app.core.config import settings

logger = logging.getLogger(__name__)

PARAM_GRID: Dict[str, List[Any]] = {
    "n_results": [5, 15, 30],
    "max_distance": [0.5, 0.65, 0.8],
    "target_wildcards": [3, 5, 7],
    # Relative margin above the per-query closest match. Observed live distance
    # spread within a retrieved pool is ~0.08-0.12, so this brackets "tight
    # cluster only" (0.06) through "whole pool" (0.14).
    "strong_match_margin": [0.06, 0.10, 0.14],
}


@dataclass
class PhaseOneResult:
    best_params: Dict[str, Any]
    best_partial_score: float
    all_results: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class PhaseTwoResult:
    best_hyde_prompt: str
    best_dj_prompt: str
    best_composite_score: float
    score_history: List[float] = field(default_factory=list)


def grid_combinations() -> List[Dict[str, Any]]:
    keys = list(PARAM_GRID.keys())
    for values in itertools.product(*PARAM_GRID.values()):
        yield dict(zip(keys, values))


async def run_grid_search(
    run_all_events: Callable[[Dict[str, Any]], Awaitable[float]],
    checkpoint_path: Path | None = None,
) -> PhaseOneResult:
    best_params = {}
    best_score = -1.0
    all_results = []

    combos = list(grid_combinations())
    total = len(combos)
    logger.info(f"\n{'='*60}")
    logger.info(f"  PHASE 1: GRID SEARCH  ({total} combinations)")
    logger.info(f"{'='*60}")

    for i, combo in enumerate(combos):
        pct = (i / total) * 100
        best_str = f"best={best_score:.4f}" if best_score >= 0 else "best=—"
        logger.info(
            f"[grid] [{i+1:2d}/{total}] {pct:5.1f}%  {best_str}  | {combo}"
        )
        try:
            score = await run_all_events(combo)
        except Exception as e:
            logger.warning(f"[grid] combo {i+1} failed ({e}), skipping (score=0.0)")
            score = 0.0
        all_results.append({"params": combo, "score": score})

        improved = score > best_score
        marker = " ★ NEW BEST" if improved else ""
        logger.info(f"[grid] [{i+1:2d}/{total}] score={score:.4f}{marker}")

        if improved:
            best_score = score
            best_params = combo
            if checkpoint_path is not None:
                import json as _json
                checkpoint_path.write_text(_json.dumps(best_params, indent=2))
                logger.info(f"[grid] checkpoint → {best_params}")

    logger.info(f"\n[grid] DONE — best params: {best_params} (score={best_score:.4f})")
    return PhaseOneResult(best_params=best_params, best_partial_score=best_score, all_results=all_results)


_META_PROMPT = """You are a prompt engineer improving a music playlist RAG system.

Prompt type: {prompt_type}

Current prompt:
---
{current_prompt}
---

These events produced poor results (alignment < 0.6 or acceptance_rate < 0.6):
{failures_str}

Rewrite the prompt to address these failure modes.

CRITICAL CONSTRAINT — your output is rejected if violated:
You MUST include these exact placeholder tokens verbatim, with curly braces, somewhere in the prompt: {variables}
These are substituted at runtime with real data. They are NOT examples to fill in — copy them literally, braces and all. A prompt without them is useless because the model never receives the event/context.

Return ONLY the improved prompt text, no explanation, no markdown fences."""

_HYDE_VARIABLES = "{event_description}"
_DJ_VARIABLES = "{event_description}, {anchor_artist_list}, {context_str}, {rejected_str}, {count}"

_REQUIRED_VARS: Dict[str, List[str]] = {
    "hyde": ["{event_description}"],
    "dj": ["{event_description}", "{anchor_artist_list}", "{context_str}", "{rejected_str}", "{count}"],
}

# Human-readable labels for re-appending a placeholder the LLM dropped during a rewrite.
_VAR_LABELS: Dict[str, str] = {
    "{event_description}": "Event",
    "{anchor_artist_list}": "Anchor artists",
    "{context_str}": "Library context",
    "{rejected_str}": "Already rejected",
    "{count}": "Number of songs to generate",
}


def _repair_missing_vars(prompt: str, missing: List[str]) -> str:
    """Re-append placeholders the LLM dropped, so an otherwise-good rewrite stays usable.

    The model regularly strips literal placeholders during a rewrite. Discarding the whole
    mutation in that case freezes optimization for that prompt type, so instead we restore
    the dropped tokens on labeled lines and keep the improvements.
    """
    additions = "\n".join(f"{_VAR_LABELS.get(v, v)}: {v}" for v in missing)
    return f"{prompt.rstrip()}\n\n{additions}"

_nim_client: openai.OpenAI | None = None


def _get_nim_client() -> openai.OpenAI:
    global _nim_client
    if _nim_client is None:
        _nim_client = openai.OpenAI(
            base_url=settings.NIM_BASE_URL,
            api_key=settings.NVIDIA_API_KEY,
            timeout=60.0,
        )
    return _nim_client


def propose_prompt_mutation(
    current_prompt: str,
    failures: List[str],
    prompt_type: str,
) -> str:
    variables = _HYDE_VARIABLES if prompt_type == "hyde" else _DJ_VARIABLES
    failures_str = "\n".join(f"- {f}" for f in failures) if failures else "No specific failures — try general improvements."
    prompt = _META_PROMPT.format(
        prompt_type=prompt_type,
        current_prompt=current_prompt,
        failures_str=failures_str,
        variables=variables,
    )
    try:
        client = _get_nim_client()
        response = client.chat.completions.create(
            model=settings.NIM_TAGGING_MODEL,  # meta/llama-3.3-70b-instruct
            messages=[{"role": "user", "content": prompt}],
        )
        mutated = (response.choices[0].message.content or "").strip()
        if not mutated:
            logger.warning(f"Prompt mutation returned empty response for {prompt_type}, keeping current")
            return current_prompt
        missing = [v for v in _REQUIRED_VARS[prompt_type] if v not in mutated]
        if missing:
            logger.warning(f"Prompt mutation dropped {missing} for {prompt_type}, re-appending them")
            mutated = _repair_missing_vars(mutated, missing)
        return mutated
    except Exception as e:
        logger.warning(f"Prompt mutation failed for {prompt_type}: {e}")
        return current_prompt


async def run_hill_climbing(
    initial_hyde_prompt: str,
    initial_dj_prompt: str,
    score_all_events: Callable,
    iterations: int = 5,
) -> PhaseTwoResult:
    hyde_prompt = initial_hyde_prompt
    dj_prompt = initial_dj_prompt

    logger.info(f"\n{'='*60}")
    logger.info(f"  PHASE 2: HILL-CLIMBING  ({iterations} iterations)")
    logger.info(f"{'='*60}")

    best_score, failures = await score_all_events(hyde_prompt, dj_prompt)
    score_history = [best_score]
    logger.info(f"[phase2] baseline score={best_score:.4f}")

    for i in range(iterations):
        # Alternate: even iterations optimize HyDE, odd iterations optimize DJ
        prompt_type = "hyde" if i % 2 == 0 else "dj"
        current = hyde_prompt if prompt_type == "hyde" else dj_prompt

        mutated = propose_prompt_mutation(current, failures, prompt_type)
        candidate_hyde = mutated if prompt_type == "hyde" else hyde_prompt
        candidate_dj = mutated if prompt_type == "dj" else dj_prompt

        score, new_failures = await score_all_events(candidate_hyde, candidate_dj)
        score_history.append(score)
        pct = ((i + 1) / iterations) * 100
        delta = score - best_score
        marker = f" ★ +{delta:.4f}" if score > best_score else f" ({delta:+.4f})"
        logger.info(f"[phase2] [{i+1}/{iterations}] {pct:.0f}%  {prompt_type}  score={score:.4f}{marker}")

        if score > best_score:
            best_score = score
            hyde_prompt = candidate_hyde
            dj_prompt = candidate_dj
            failures = new_failures
            logger.info(f"[phase2] improvement accepted (score={best_score:.4f})")
        else:
            logger.info(f"[phase2] no improvement, reverting")

    return PhaseTwoResult(
        best_hyde_prompt=hyde_prompt,
        best_dj_prompt=dj_prompt,
        best_composite_score=best_score,
        score_history=score_history,
    )
