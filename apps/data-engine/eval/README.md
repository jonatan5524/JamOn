# JamOn Eval Harness

Offline optimization tool for the RAG playlist generation pipeline. Run it manually to find better retrieval parameters and prompts; the live `/recommend` endpoint picks them up automatically on the next request — no restart needed.

## The Big Picture

```
python -m eval.eval_loop      (you run this)
        │
        │  uses real production code:
        ├── app.workflows.playlist_generator.PlaylistGraphBuilder
        ├── app.services.rag.RagEngine
        ├── app.providers.llm.*  (Gemini embedder + HyDE, College DJ)
        ├── app.providers.vectordb.chroma.ChromaVectorStore
        │
        │  writes:
        └── eval/optimized/params.json        ← auto-loaded by /recommend on every request
            eval/optimized/hyde_prompt.txt
            eval/optimized/playlist_generation_prompt.txt
```

The connection to production is **one-directional and file-based**: eval writes, production reads.

## Running the Eval Loop

```bash
cd apps/data-engine

python -m eval.eval_loop               # full two-phase run
python -m eval.eval_loop --dry-run     # retrieval-only smoke test (no DJ/judge calls)
python -m eval.eval_loop --skip-phase1 # Phase 2 only (reuse params from previous Phase 1)
python -m eval.eval_loop --iterations 10  # more prompt hill-climbing iterations (default: 5)
```

**Prerequisites:** Gemini API key in `.env` (embedding + HyDE + judge calls), College server reachable (`COLLEGE_BASE_URL`).

**Rate limits:** The college server allows 5 req/min on `/api/generate`. The eval loop sleeps 9s after each DJ call to stay safely under this limit.

---

## How the Pipeline Works (What Eval Actually Exercises)

Understanding what the eval measures requires understanding the playlist generation pipeline it drives. Each eval run exercises this full sequence for every event:

```
Event description (e.g. "late night study session")
        │
        ▼
 [HyDE Expansion]
  LLM generates a hypothetical playlist description to improve retrieval
  e.g. "Ambient, lo-fi hip-hop, slow BPM, focus-inducing, soft piano..."
        │
        ▼
 [Embedding + Vector Search]
  HyDE text embedded → cosine similarity search against indexed library
  Returns up to n_results songs with distance <= max_distance
        │
        ▼
 [Strong Match Filtering]
  Songs within strong_match_margin of the closest match become the "spine"
  (high-confidence library matches that anchor the playlist)
        │
        ▼
 [Dynamic Wildcard Target]
  target = max(min_wildcards, playlist_size - len(strong_songs))
  Weak library match → more AI suggestions; strong library match → fewer
        │
        ▼
 [DJ Generation]
  CollegeDJ generates candidate wildcards with spine songs as context
  Overprovisions by 1.5× (e.g. needs 5, requests 7-8) to hedge rejections
        │
        ▼
 [Wildcard Validation]
  Each candidate goes through Spotify URI resolution (stub in eval)
  ~30% rejected deterministically; regenerate if below target (max 3 attempts)
        │
        ▼
 Final playlist = spine songs + validated wildcards
```

---

## The Four Parameters — What They Actually Control

The grid search tunes four numbers that live in `eval/optimized/params.json` and are loaded by `/recommend` on every request.

### `n_results` — Vector Store Fetch Count
**Swept values:** 5, 15, 30

How many songs the vector store returns per query (before any filtering). This is the candidate pool size before `max_distance` cuts it down.

- **Too low (5):** The DJ has almost nothing to work with from the library. Even a perfect event description may retrieve fewer songs than the playlist needs, forcing more AI wildcards than the user actually has good matches for.
- **Too high (30):** Returns more songs but the tail candidates are weaker matches, diluting the quality signal and adding noise to the DJ's context window.
- **The sweet spot** balances recall (catching all good library matches) against precision (not flooding the DJ with irrelevant songs).

### `max_distance` — Cosine Distance Ceiling
**Swept values:** 0.5, 0.65, 0.8

A post-query filter: any song with cosine distance > this threshold is **discarded before the DJ sees it**. Distance 0.0 = identical, 2.0 = maximally opposite.

- **Stricter (0.5):** Only very close semantic matches pass. If the user's library is small or the event is unusual, this can return 0 songs, making wildcards do all the work.
- **Looser (0.8):** Passes more songs through, including weaker matches. Gives the DJ more library material but includes songs that only vaguely fit the vibe.
- **Effect on recall:** `max_distance` directly controls how many of the `n_results` candidates survive. `retrieval_relevance` captures this as a recall penalty when fewer than `n_results` songs survive the filter.

### `target_wildcards` — Minimum AI-Generated Songs
**Swept values:** 3, 5, 7

The floor on how many AI-suggested new songs the playlist must contain. The workflow's actual wildcard target is dynamic — it can be higher than this floor when library matches are weak:

```python
target = max(min_wildcards, playlist_size - len(strong_songs))
```

If the library has only 8 strong matches for a 20-song playlist, target becomes `max(min_wildcards, 12)` — the library gap forces more wildcards regardless of this parameter.

- **Low (3):** The DJ is given less latitude to add new songs. Library-heavy playlists. Good when the library closely matches the event, risky when it doesn't (the DJ must fill gaps with only 3 wildcards).
- **High (7):** Forces more AI discovery even when the library matches well. Produces more eclectic playlists but exposes more surface area for the ~30% rejection rate to kick in.
- **Interacts with `strong_match_margin`:** Both together determine how the playlist splits between "library spine" and "AI discovery."

### `strong_match_margin` — Relative Spine Filter
**Swept values:** 0.06, 0.10, 0.14

The margin above the per-query closest match that classifies a retrieved library song as a **strong match** (a "spine" song). A song qualifies if `distance <= best_distance + strong_match_margin`, where `best_distance` is the closest match for *this* query.

This replaced the old absolute `strong_match_distance` threshold after a production failure: Gemini's 3072-dim embeddings pack all real-text cosine distances into a narrow band (~0.20–0.35 observed), so an absolute threshold set one hundredth too low excluded the entire library — producing a flat `relevance=0.00` on every event while still achieving an apparently healthy 0.67 composite. The relative margin self-adjusts to the per-query distance band and is immune to this failure mode.

- **Tight (0.06):** Only the very closest cluster qualifies. High personalization signal but more wildcards when the band is wide.
- **Wide (0.14):** Admits most of the retrieved pool as spine songs, giving the DJ richer anchors. Overshoots if the pool contains a long tail of weakly-related songs.
- **Why it matters for wildcards:** Spine size directly determines the dynamic wildcard target. A tighter `strong_match_margin` → fewer spine songs → higher wildcard target → more AI generation pressure → more chances for the 30% rejection rate to cause regeneration loops.

**Empty-spine guardrail:** If every event in a run produces an empty spine, `run_all_events_partial` scores the config as **0.0** and logs an error rather than returning a misleadingly healthy composite. This prevents a broken retriever config from silently passing as a good result.

---

## The Scoring Formula — Full Breakdown

Every eval run produces a `composite` score ∈ [0.0, 1.0] assembled from three metrics. The weights differ by phase.

### Phase 1 Partial Score (no judge)
```
partial = 0.3 × acceptance_rate + 0.2 × retrieval_relevance
```
Maximum possible: **0.5** (judge is absent).

### Phase 2 Full Composite (with judge)
```
composite = 0.5 × alignment + 0.3 × acceptance_rate + 0.2 × retrieval_relevance
```
Maximum possible: **1.0**.

---

### Metric 1: `retrieval_relevance` (weight: 20%)

**What it measures:** How well the vector store retrieved close, plentiful results.

**Formula:**
```python
precision = 1.0 - (sum(distances) / len(distances))   # avg closeness
recall    = min(len(library_songs) / n_results_requested, 1.0)
retrieval_relevance = precision * recall
```

**Precision** (0.0–1.0): The average semantic closeness of retrieved songs. Distance 0 → precision 1.0 (perfect match). Distance 1 → precision 0.0 (completely unrelated). This rewards parameter combos that fetch semantically tight results.

**Recall** (0.0–1.0): The fraction of requested slots that were actually filled. If `n_results=15` was requested but `max_distance=0.5` filtered out 10 of them, only 5 songs come back → recall = 5/15 ≈ 0.33. This penalizes overly strict `max_distance` settings that starve the DJ of library material.

**Combined:** A strict distance ceiling that returns 2 perfect songs scores `1.0 × (2/15) ≈ 0.13`. 15 mediocre-but-present songs score `0.5 × 1.0 = 0.50`. The product penalizes both extremes.

**Example values:**
| Scenario | precision | recall | score |
|---|---|---|---|
| 15/15 songs returned, avg distance 0.3 | 0.70 | 1.00 | 0.70 |
| 8/15 songs returned, avg distance 0.2 | 0.80 | 0.53 | 0.42 |
| 2/15 songs returned, avg distance 0.1 | 0.90 | 0.13 | 0.12 |

---

### Metric 2: `acceptance_rate` (weight: 30%)

**What it measures:** Whether the DJ generated enough valid wildcard suggestions to meet the playlist's AI-discovery target.

**Formula:**
```python
acceptance_rate = min(validated_wildcards / target_wildcards, 1.0)
```

**`validated_wildcards`:** Wildcard candidates that passed the stub Spotify validator. The stub rejects ~30% of wildcards deterministically via MD5 hash of `"title::artist"`, mimicking real production where Spotify Search fails on hallucinated or unavailable tracks.

**`target_wildcards`:** The dynamic target computed by `PlaylistGraphBuilder` — at minimum `min_wildcards` (from the grid search parameter), but scaled up when strong library matches are scarce.

**Why this matters:** If `target_wildcards=5` but the DJ only manages 3 validated wildcards after 3 regeneration attempts, `acceptance_rate = 3/5 = 0.60`. This reveals parameter combos where the DJ is under too much pressure (too few library anchors, too high a target) or where the stub's 30% rejection rate combines with regeneration limits to cap delivery.

**Example values:**
| DJ delivered | target | score |
|---|---|---|
| 5 validated / target 5 | 1.00 |
| 3 validated / target 5 | 0.60 |
| 7 validated / target 5 | 1.00 (capped) |
| 0 validated / target 5 | 0.00 |

---

### Metric 3: `alignment` (weight: 50%, Phase 2 only)

**What it measures:** How well the final playlist actually fits the event's vibe — the quality signal that the mechanical metrics cannot capture.

**How it works:** NIM (`meta/llama-3.3-70b-instruct`) acts as a music expert judge. It receives the event description and the full tracklist, then rates the playlist 0–10 on genre/mood match, energy appropriateness, and tracklist cohesion. The score is normalized to [0.0, 1.0] (`raw / 10`).

**Failure fallback:** If the judge API call fails, returns 0.5 (neutral) to avoid corrupting the run.

**Why it's 50% of the full composite:** The mechanical metrics (`acceptance_rate`, `retrieval_relevance`) measure pipeline mechanics — did the system fetch songs, did wildcards pass validation. They say nothing about whether the resulting 20 songs actually make a good playlist for a "late night study session." `alignment` is the only metric that evaluates the end product the user experiences.

**Why it's absent from Phase 1:** Running the Gemini judge for all 81 × 8 = 648 event runs would exhaust API quota and take hours. Phase 1 identifies the structural parameter range where the pipeline delivers non-zero results; Phase 2 then optimizes for actual quality within that range.

---

## Phase 1: Parameter Grid Search

Finds the best values for four retrieval/generation parameters by trying all 81 combinations (3⁴):

| Parameter | Values swept | What it controls |
|-----------|-------------|-----------------|
| `n_results` | 5, 15, 30 | Songs fetched from vector store per query |
| `max_distance` | 0.5, 0.65, 0.8 | Cosine distance ceiling for vector store retrieval (pre-retrieval filter) |
| `target_wildcards` | 3, 5, 7 | Minimum AI-generated songs when library match is weak |
| `strong_match_margin` | 0.06, 0.10, 0.14 | Relative margin above the per-query closest match for spine eligibility (post-retrieval filter) |

**How a single combo is scored:**

1. Embeds all songs into a fresh in-memory Chroma collection (Gemini embedding API)
2. Runs all 8 training events through the full `PlaylistGraphBuilder` workflow (College DJ)
3. Scores each run on two mechanical metrics — no LLM judge needed:
   - **acceptance_rate** = `validated_wildcards / target_wildcards` (did the LLM deliver enough wildcards that passed the stub Spotify validator?)
   - **retrieval_relevance** = `(1 − avg_distance) × recall` (did the vector store find close matches?)
4. Partial composite: `0.3 × acceptance_rate + 0.2 × retrieval_relevance`

**Output:** Best params written immediately to `eval/optimized/params.json` (durable — survives a Phase 2 crash). Each new best is checkpointed as it's found, so a partial run doesn't lose progress.

---

## Phase 2: Prompt Hill-Climbing

Takes the best params from Phase 1 and iteratively improves the HyDE and DJ prompts.

**How it works:**

1. Baseline: runs all 8 training events, scores with full composite including **Gemini judge** (asks Gemini Flash to rate 0–10 how well the playlist fits the event)
2. For each iteration (alternates HyDE prompt then DJ prompt):
   - Sends the current prompt + failure cases to Gemini → asks it to rewrite the prompt to address those failures
   - Runs all 8 events with the mutated prompt
   - Keeps the mutation if composite score improved, reverts if not
3. Validates the best result on 4 **held-out events** (never seen during optimization) to detect overfitting
4. Writes best prompts to `eval/optimized/`

**What counts as a failure case:** Any event where `alignment < 0.6` OR `acceptance_rate < 0.6` gets passed to the meta-prompt as a failure example. The prompt mutator is asked to fix these specific cases. If there are no failures, it requests general improvements.

**Overfitting check:** The train–holdout gap is printed at the end. A gap > 0.1 is flagged as possible overfitting — meaning the prompts got better at the 8 training categories but didn't generalize. In that case, consider more training categories or fewer iterations.

---

## Reading the Output

After a full run you'll see:

```
============================================================
EVAL LOOP RESULTS
============================================================

Phase 1 — Best params: {'n_results': 15, 'max_distance': 0.65, 'target_wildcards': 5, 'strong_match_margin': 0.10}
           Partial score: 0.3842

Phase 2 — Score history: ['0.412', '0.445', '0.438', '0.461', '0.455', '0.471']
           Best train composite: 0.4710

Holdout — Composite on unseen events: 0.4523
           Train−holdout gap: +0.0187
```

**Interpreting partial vs composite scores:** Phase 1's max is 0.5 (no alignment term). A Phase 1 partial of 0.38 out of 0.50 = 76% of the mechanical maximum. Phase 2 adds the 0.5-weight alignment term; a composite of 0.47 means alignment averaged ~0.43/1.0, which is meaningful room for improvement.

**Score history:** Each entry is one hill-climbing iteration (alternates HyDE then DJ mutation). An ascending sequence means the optimizer is finding better prompts. A flat or oscillating sequence means the prompts have plateaued or the event set is too small to provide a clear gradient.

---

## How It Connects to Production

**`params.json` → endpoint (wired):**

```python
# app/api/endpoints.py — called on every /recommend request
tuned = load_tuned_params()   # reads eval/optimized/params.json if it exists
builder = PlaylistGraphBuilder(
    strong_match_margin=tuned["strong_match_margin"],
    ...
)
# db_fetch_wrapper uses tuned["n_results"] and tuned["max_distance"]
```

**Prompt files → providers (not yet wired):** `GeminiHyDEProvider` and `CollegeDJProvider` still read from `app/prompts/*.txt`, not `eval/optimized/*.txt`. Phase 2 prompt improvements require manual promotion to `app/prompts/` to take effect in production.

---

## Key Design Choices

**Chroma in eval, pgvector in production.** Eval uses an in-memory Chroma collection (fresh UUID per run) to avoid needing a running postgres instance. Both use cosine distance, so calibrated thresholds transfer to production.

**Stub Spotify validator.** `stub_validator()` in `runner.py` rejects ~30% of wildcards deterministically (MD5 hash of `title::artist`) to simulate real Spotify URI resolution failures. This is why `acceptance_rate` carries real signal — the grid search can distinguish parameter combos that give the LLM enough room to fill the target even with realistic rejection rates.

**`--event-id` flag (pgvector mode).** Pass a real event ID from the production DB to use the pre-computed pgvector embeddings instead of re-embedding mock songs. This skips all Gemini embedding calls during the eval run (uses NIM for HyDE instead), eliminating the main source of API quota consumption during Phase 1.

**No real user data by default.** Uses 20 built-in `MOCK_SONGS` unless you seed `eval/fixtures/user_library.json`:

```bash
# Requires POST /internal/spotify/top-tracks on the orchestrator (not yet implemented)
python -m eval.seed_library --spotify-id <your-id>

# Alternative: query the DB directly and run enrichment manually
python - << 'EOF'
import asyncio, json
from eval.seed_library import enrich_and_tag, LIBRARY_FIXTURE, FIXTURES_DIR

tracks = [{"title": "Song Name", "artist": "Artist"}, ...]  # from DB query

async def run():
    songs = await enrich_and_tag(tracks)
    FIXTURES_DIR.mkdir(exist_ok=True)
    LIBRARY_FIXTURE.write_text(json.dumps(songs, indent=2, ensure_ascii=False))
    print(f"Written {len(songs)} songs to {LIBRARY_FIXTURE}")

asyncio.run(run())
EOF
```

---

## Directory Structure

```
eval/
├── eval_loop.py        Entry point — orchestrates both phases
├── optimizer.py        PARAM_GRID (81 combos), grid_combinations(), run_hill_climbing()
├── runner.py           RunConfig dataclass, run_pipeline(), stub Spotify validator, MOCK_SONGS
├── scorer.py           acceptance_rate, retrieval_relevance, Gemini judge, composite score
├── event_generator.py  8 training events + 4 held-out events (hardcoded)
├── cache.py            HyDE expansion disk cache (avoids redundant Gemini embedding calls)
├── cached_embedder.py  Decorator that caches Gemini embedding calls to avoid quota exhaustion
├── seed_library.py     Seeds eval/fixtures/user_library.json from a real Spotify user
├── fixtures/
│   └── user_library.json   Real user songs (optional; falls back to MOCK_SONGS if absent)
├── optimized/
│   ├── params.json          Best retrieval params → auto-loaded by /recommend
│   ├── hyde_prompt.txt      Best HyDE prompt → manual promotion to app/prompts/ needed
│   └── playlist_generation_prompt.txt  Best DJ prompt → same
└── results/
    └── run_YYYYMMDD_HHMMSS.json   Full run logs (params, scores, events)
```
