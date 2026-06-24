# Relative Strong-Match Gate + Empty-Spine Guardrail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the brittle *absolute* `strong_match_distance` spine gate (which silently zeroed the library spine on every event in the latest eval) with a *relative*, per-query `strong_match_margin` gate, and add an empty-spine guardrail so a mistuned config can never again masquerade as a healthy 0.67 composite.

**Architecture:** The playlist pipeline retrieves a pool of the user's liked songs via pgvector (gated by the absolute `max_distance` cosine filter), then selects a "spine" of strong matches from that pool. Today the spine gate is `distance <= strong_match_distance` (absolute). Gemini's 3072-dim embeddings pack all real-text cosine distances into a narrow band (~0.20–0.35 observed on event 34), so an absolute threshold set a hundredth too low excludes the entire library. We replace it with `distance <= best_distance + strong_match_margin`, where `best_distance` is the closest match *for this query*. `max_distance` remains the absolute quality gate (applied upstream at retrieval); the margin only picks the best-fitting cluster from songs that already cleared it. A guardrail in the eval loop forces any config that produces an empty spine on *all* events to score 0, so the optimizer rejects it instead of rewarding it.

**Tech Stack:** Python 3.14, FastAPI, LangGraph, pytest-asyncio, Chroma (dev), pgvector (prod), NVIDIA NIM (HyDE + judge), College server (DJ), Gemini (embeddings).

## Global Constraints

- All commands run from `/home/jonatan5524/git/JamOn/apps/data-engine` unless stated otherwise.
- Use the venv interpreter `app/.venv/bin/python` for anything touching the DB or running the eval (system `python` lacks `psycopg2`).
- Tests: `app/.venv/bin/python -m pytest`.
- This is a **rename with a semantic change**: `strong_match_distance` (absolute) → `strong_match_margin` (relative, additive above the per-query minimum). Every one of the 13 enumerated sites must move together or imports/kwargs break.
- The relative gate must NOT change the downstream control flow: `target_wildcards = max(min_wildcards, target_playlist_size - len(strong_songs))` and `spine = strong_songs[:spine_size]` stay exactly as-is.
- `retrieved` is already sorted ascending by distance (playlist_generator.py:39), so `retrieved[0]` is the minimum — do not re-sort.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `app/workflows/playlist_generator.py` | Modify | Replace absolute gate with relative margin; rename constructor param |
| `app/tests/test_dynamic_wildcards.py` | Modify | Rename kwarg in 8 tests; rewrite the lone-weak-song test; add a band-shift robustness test |
| `app/core/tuned_params.py` | Modify | Rename DEFAULTS key `strong_match_distance` → `strong_match_margin` |
| `app/api/endpoints.py` | Modify | Pass `strong_match_margin=tuned["strong_match_margin"]` |
| `eval/runner.py` | Modify | Rename `RunConfig.strong_match_distance` → `strong_match_margin` |
| `eval/eval_loop.py` | Modify | Rename param at 3 call sites; add empty-spine guardrail; report spine size in dry-run |
| `eval/optimizer.py` | Modify | Replace `strong_match_distance` grid with `strong_match_margin` sweep |
| `app/README.md` | Modify | Document relative gate + guardrail |
| `eval/README.md` | Modify | Document relative gate, new grid, guardrail |

---

## Task 1: Replace the absolute spine gate with a relative margin

**Files:**
- Modify: `app/workflows/playlist_generator.py:12-30` (constructor)
- Modify: `app/workflows/playlist_generator.py:41-49` (gate logic in `initial_fetch`)
- Test: `app/tests/test_dynamic_wildcards.py`

**Interfaces:**
- Produces: `PlaylistGraphBuilder(..., strong_match_margin: float = 0.10)` — replaces the `strong_match_distance` keyword argument entirely. Downstream consumers (Tasks 2–3) must pass `strong_match_margin`.

- [ ] **Step 1: Rewrite the affected tests for relative semantics**

In `app/tests/test_dynamic_wildcards.py`, replace every `strong_match_distance=0.4` keyword argument with `strong_match_margin=0.10` (8 occurrences across all builder constructions).

Then **replace** `test_zero_strong_matches_fills_playlist_with_wildcards` (the lone 0.9 song no longer produces an empty spine under relative semantics — a single retrieved song *is* the closest match, so it becomes the spine; absolute weakness is now the job of `max_distance` upstream, which the mock bypasses). Replace it with:

```python
@pytest.mark.asyncio
async def test_single_retrieved_song_becomes_spine():
    """Relative gate: a song that cleared retrieval is the best match for this
    query, so it joins the spine. Absolute weak-pool rejection is now max_distance's
    job (applied upstream at the store), not the spine margin's."""
    captured = {}

    async def mock_db(query):
        return [{"title": "Lose Yourself", "artist": "Eminem", "distance": 0.9}]

    builder = PlaylistGraphBuilder(
        _capturing_llm(captured), mock_db, None,
        target_playlist_size=20, min_wildcards=3, strong_match_margin=0.10,
    )
    state = PlaylistState(
        event_description="chill evening",
        anchor_artists=["Eminem", "Imagine Dragons"],
    )
    result = await builder.initial_fetch(state)

    assert len(result["db_songs"]) == 1               # the lone match is the spine
    assert result["target_wildcards"] == 19           # max(3, 20 - 1)
    assert captured["count"] == 19
```

Then **add** a new test proving the gate is scale-invariant (the whole point of the change):

```python
@pytest.mark.asyncio
async def test_relative_gate_is_invariant_to_band_location():
    """The same relative cluster structure selects the same spine whether the
    distance band sits at 0.16-0.42 or is shifted up to 0.46-0.72. An absolute
    gate would break under the shift; the margin does not."""
    captured_low, captured_high = {}, {}

    async def db_low(query):
        near = [{"title": f"N{i}", "artist": "A", "distance": 0.16 + i * 0.005} for i in range(17)]
        far = [{"title": f"F{i}", "artist": "A", "distance": 0.30 + i * 0.01} for i in range(13)]
        return near + far

    async def db_high(query):
        near = [{"title": f"N{i}", "artist": "A", "distance": 0.46 + i * 0.005} for i in range(17)]
        far = [{"title": f"F{i}", "artist": "A", "distance": 0.60 + i * 0.01} for i in range(13)]
        return near + far

    for mock_db, captured in ((db_low, captured_low), (db_high, captured_high)):
        builder = PlaylistGraphBuilder(
            _capturing_llm(captured), mock_db, None,
            target_playlist_size=20, min_wildcards=3, strong_match_margin=0.10,
        )
        state = PlaylistState(event_description="chill evening", anchor_artists=["A"])
        result = await builder.initial_fetch(state)
        captured["db_songs"] = result["db_songs"]

    # Both bands select exactly the 17 NEAR songs as the spine.
    assert {s["title"] for s in captured_low["db_songs"]} == {f"N{i}" for i in range(17)}
    assert {s["title"] for s in captured_high["db_songs"]} == {f"N{i}" for i in range(17)}
```

- [ ] **Step 2: Run the rewritten/new tests to confirm they fail**

```bash
app/.venv/bin/python -m pytest app/tests/test_dynamic_wildcards.py::test_single_retrieved_song_becomes_spine app/tests/test_dynamic_wildcards.py::test_relative_gate_is_invariant_to_band_location -v 2>&1 | tail -20
```

Expected: `FAILED` — `TypeError: __init__() got an unexpected keyword argument 'strong_match_margin'`.

- [ ] **Step 3: Rename the constructor parameter**

In `app/workflows/playlist_generator.py`, change the constructor (lines 12-30). Replace:

```python
        strong_match_distance: float = 0.4,
        max_attempts: int = 3,
        overprovision_factor: float = 1.0,
    ):
        self.llm_generator = llm_generator
        self.db_fetcher = db_fetcher
        self.uri_validator = uri_validator
        self.target_playlist_size = target_playlist_size
        self.min_wildcards = min_wildcards
        self.strong_match_distance = strong_match_distance
        self.max_attempts = max_attempts
        self.overprovision_factor = overprovision_factor
```

with:

```python
        strong_match_margin: float = 0.10,
        max_attempts: int = 3,
        overprovision_factor: float = 1.0,
    ):
        self.llm_generator = llm_generator
        self.db_fetcher = db_fetcher
        self.uri_validator = uri_validator
        self.target_playlist_size = target_playlist_size
        self.min_wildcards = min_wildcards
        self.strong_match_margin = strong_match_margin
        self.max_attempts = max_attempts
        self.overprovision_factor = overprovision_factor
```

- [ ] **Step 4: Replace the gate logic in `initial_fetch`**

In `app/workflows/playlist_generator.py`, replace lines 41-49:

```python
        # Only songs that STRONGLY match the vibe are eligible for the spine.
        strong_songs = [
            s for s in retrieved
            if s.get("distance", 1.0) <= self.strong_match_distance
        ]
        logger.info(
            f"Library match: {len(retrieved)} retrieved, "
            f"{len(strong_songs)} strong (<= {self.strong_match_distance})"
        )
```

with:

```python
        # Spine eligibility is RELATIVE, not an absolute distance. This embedding
        # model packs all real-text cosine distances into a narrow band (~0.20-0.35),
        # so a fixed absolute gate is brittle: a hair too low excludes the entire
        # library (empty spine), a hair too high admits every song. Instead keep songs
        # within `strong_match_margin` of the CLOSEST match for THIS query. The absolute
        # quality gate is max_distance, applied upstream at retrieval; this margin only
        # picks the best-fitting cluster from the pool that already cleared it.
        if retrieved:
            best_distance = retrieved[0].get("distance", 1.0)  # retrieved is sorted ascending
            cutoff = best_distance + self.strong_match_margin
            strong_songs = [s for s in retrieved if s.get("distance", 1.0) <= cutoff]
            logger.info(
                f"Library match: {len(retrieved)} retrieved, {len(strong_songs)} strong "
                f"(within {self.strong_match_margin} of best={best_distance:.4f}, cutoff={cutoff:.4f})"
            )
        else:
            strong_songs = []
            logger.info("Library match: 0 retrieved, 0 strong")
```

- [ ] **Step 5: Run the full test file to confirm all pass**

```bash
app/.venv/bin/python -m pytest app/tests/test_dynamic_wildcards.py -v 2>&1 | tail -25
```

Expected: all tests pass (the cluster-based tests `test_many_strong_matches_hits_wildcard_floor`, `test_spine_keeps_closest_songs_when_band_is_compressed`, and `test_partial_strong_matches_balance_ratio` still hold because their distances are tight clusters within a 0.10 margin of their minimum).

- [ ] **Step 6: Run the full suite to confirm no regressions elsewhere**

```bash
app/.venv/bin/python -m pytest -q 2>&1 | tail -5
```

Expected: `0 failed`. (Tasks 2–3 fix the remaining `strong_match_distance` references that this rename will surface; if the suite imports `endpoints`/`runner`/`tuned_params`, expect failures there until those tasks land — note which, then proceed. If you are running tasks strictly in order, defer the full-suite green gate to Task 3 Step 4.)

- [ ] **Step 7: Commit**

```bash
git add app/workflows/playlist_generator.py app/tests/test_dynamic_wildcards.py
git commit -m "feat: replace absolute strong-match gate with relative per-query margin"
```

---

## Task 2: Thread `strong_match_margin` through config and runtime

**Files:**
- Modify: `app/core/tuned_params.py:8-13` (DEFAULTS)
- Modify: `app/api/endpoints.py:91`
- Modify: `eval/runner.py:73` (RunConfig)
- Modify: `eval/eval_loop.py:124,143,291` (3 sites)
- Test: `app/tests/test_providers.py`

**Interfaces:**
- Consumes: `PlaylistGraphBuilder(..., strong_match_margin=...)` from Task 1.
- Produces: `load_tuned_params()` returns a dict containing key `"strong_match_margin"`; `RunConfig.strong_match_margin: float`.

- [ ] **Step 1: Write the failing test**

Add to `app/tests/test_providers.py`:

```python
def test_tuned_params_uses_strong_match_margin_not_distance():
    from app.core.tuned_params import load_tuned_params, DEFAULTS
    assert "strong_match_margin" in DEFAULTS
    assert "strong_match_distance" not in DEFAULTS
    params = load_tuned_params()
    assert "strong_match_margin" in params
    assert isinstance(params["strong_match_margin"], float)
```

- [ ] **Step 2: Run to confirm it fails**

```bash
app/.venv/bin/python -m pytest app/tests/test_providers.py::test_tuned_params_uses_strong_match_margin_not_distance -v 2>&1 | tail -10
```

Expected: `FAILED` — `AssertionError` on `"strong_match_margin" in DEFAULTS`.

- [ ] **Step 3: Rename the key in `tuned_params.py` DEFAULTS**

In `app/core/tuned_params.py`, change:

```python
DEFAULTS = {
    "n_results": 20,
    "max_distance": 0.7,
    "target_wildcards": 5,
    "strong_match_distance": 0.20,
}
```

to:

```python
DEFAULTS = {
    "n_results": 20,
    "max_distance": 0.7,
    "target_wildcards": 5,
    "strong_match_margin": 0.10,
}
```

(The merge loop `for key in DEFAULTS` is key-driven, so no other change is needed in this file.)

- [ ] **Step 4: Pass `strong_match_margin` from the endpoint**

In `app/api/endpoints.py`, change line 91:

```python
        strong_match_distance=tuned["strong_match_distance"],
```

to:

```python
        strong_match_margin=tuned["strong_match_margin"],
```

- [ ] **Step 5: Rename the field in `RunConfig`**

In `eval/runner.py`, change line 73:

```python
    strong_match_distance: float = 0.20
```

to:

```python
    strong_match_margin: float = 0.10
```

- [ ] **Step 6: Update the 3 `eval_loop.py` call sites**

In `eval/eval_loop.py`:

Line 124 (inside `build_graph`'s `PlaylistGraphBuilder(...)`):

```python
        strong_match_distance=config.strong_match_distance,
```
→
```python
        strong_match_margin=config.strong_match_margin,
```

Line 143 (inside `run_all_events_partial`'s `RunConfig(...)`):

```python
        strong_match_distance=params.get("strong_match_distance", 0.20),
```
→
```python
        strong_match_margin=params.get("strong_match_margin", 0.10),
```

Line 291 (inside the `--dry-run` `RunConfig(...)`):

```python
            strong_match_distance=best_params.get("strong_match_distance", 0.20),
```
→
```python
            strong_match_margin=best_params.get("strong_match_margin", 0.10),
```

- [ ] **Step 7: Confirm no stale references remain**

```bash
grep -rn "strong_match_distance" app/ eval/ --include="*.py"
```

Expected: **no output** (zero matches in `.py` files; README updates are Task 5).

- [ ] **Step 8: Run the new test + full suite**

```bash
app/.venv/bin/python -m pytest app/tests/test_providers.py::test_tuned_params_uses_strong_match_margin_not_distance -v 2>&1 | tail -8
app/.venv/bin/python -m pytest -q 2>&1 | tail -5
```

Expected: new test `PASSED`; full suite `0 failed`.

- [ ] **Step 9: Commit**

```bash
git add app/core/tuned_params.py app/api/endpoints.py eval/runner.py eval/eval_loop.py app/tests/test_providers.py
git commit -m "feat: thread strong_match_margin through tuned params, endpoint, and eval config"
```

---

## Task 3: Sweep `strong_match_margin` in the Phase 1 grid

**Files:**
- Modify: `eval/optimizer.py:13-18` (PARAM_GRID)
- Test: `app/tests/test_providers.py`

**Interfaces:**
- Consumes: `RunConfig.strong_match_margin` (Task 2), read via `params.get("strong_match_margin", ...)` in eval_loop (already wired in Task 2 Step 6).

- [ ] **Step 1: Write the failing test**

Add to `app/tests/test_providers.py`:

```python
def test_param_grid_sweeps_strong_match_margin():
    from eval.optimizer import PARAM_GRID, grid_combinations
    assert "strong_match_margin" in PARAM_GRID
    assert "strong_match_distance" not in PARAM_GRID
    combos = list(grid_combinations())
    assert len(combos) == 81  # 3 x 3 x 3 x 3
    assert all("strong_match_margin" in c for c in combos)
```

- [ ] **Step 2: Run to confirm it fails**

```bash
app/.venv/bin/python -m pytest app/tests/test_providers.py::test_param_grid_sweeps_strong_match_margin -v 2>&1 | tail -10
```

Expected: `FAILED` — `AssertionError` on `"strong_match_margin" in PARAM_GRID`.

- [ ] **Step 3: Update PARAM_GRID**

In `eval/optimizer.py`, change:

```python
PARAM_GRID: Dict[str, List[Any]] = {
    "n_results": [5, 15, 30],
    "max_distance": [0.5, 0.65, 0.8],
    "target_wildcards": [3, 5, 7],
    "strong_match_distance": [0.15, 0.20, 0.25],
}
```

to:

```python
PARAM_GRID: Dict[str, List[Any]] = {
    "n_results": [5, 15, 30],
    "max_distance": [0.5, 0.65, 0.8],
    "target_wildcards": [3, 5, 7],
    # Relative margin above the per-query closest match. Observed live distance
    # spread within a retrieved pool is ~0.08-0.12, so this brackets "tight
    # cluster only" (0.06) through "whole pool" (0.14).
    "strong_match_margin": [0.06, 0.10, 0.14],
}
```

- [ ] **Step 4: Run the new test + full suite (green gate for Tasks 1–3)**

```bash
app/.venv/bin/python -m pytest app/tests/test_providers.py::test_param_grid_sweeps_strong_match_margin -v 2>&1 | tail -8
app/.venv/bin/python -m pytest -q 2>&1 | tail -5
```

Expected: new test `PASSED`; full suite `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add eval/optimizer.py app/tests/test_providers.py
git commit -m "feat: sweep relative strong_match_margin in Phase 1 grid (81 combos)"
```

---

## Task 4: Empty-spine guardrail + dry-run spine reporting

**Files:**
- Modify: `eval/eval_loop.py` (`run_all_events_partial`, after the results loop; and the `--dry-run` block)
- Test: a standalone async assertion (no DB needed)

**Interfaces:**
- Consumes: `run_all_events_partial(...) -> Tuple[float, List[str]]` (unchanged signature).
- Produces: when every event yields an empty spine, the function returns `(0.0, ["EMPTY SPINE on all N events"])` instead of a misleadingly healthy partial/composite.

- [ ] **Step 1: Add the guardrail in `run_all_events_partial`**

In `eval/eval_loop.py`, locate the early return for no results (after the results-collection loop):

```python
    if not results:
        return 0.0, []
```

Immediately **after** it, insert:

```python
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
```

(Placing it before the partial/composite math means a broken config never reaches the judge, saving LLM calls in Phase 2 too.)

- [ ] **Step 2: Report spine size in the `--dry-run` path**

The dry-run currently measures only the *retrieval pool* (`rag.query_songs`), which is why it gave false reassurance while the real spine was empty. Make it also apply the strong-match margin so the reported number reflects the actual spine.

In `eval/eval_loop.py`, inside the `--dry-run` block, find the per-event retrieval loop:

```python
        all_songs: List[List[Dict[str, Any]]] = []
        for i, event in enumerate(events, 1):
            logger.info(f"[eval] event {i}/{len(events)}: '{event}'")
            library_songs = await rag.query_songs(
                event, event_id=event_id, n_results=config.n_results, max_distance=config.max_distance
            )
            logger.info(f"[eval]   ✓ {len(library_songs)} songs retrieved")
            all_songs.append(library_songs)
```

Replace it with:

```python
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
```

- [ ] **Step 3: Verify the guardrail logic with a focused test**

Create `app/tests/test_eval_guardrail.py`:

```python
import pytest
from eval.runner import RunResult


def test_empty_spine_guardrail_predicate():
    """The guardrail condition: all events with an empty library spine."""
    empty = [
        RunResult(event_description="e1", library_songs=[], validated_wildcards=[],
                  target_wildcards=5, final_playlist=[], n_results_requested=15),
        RunResult(event_description="e2", library_songs=[], validated_wildcards=[],
                  target_wildcards=5, final_playlist=[], n_results_requested=15),
    ]
    assert all(len(r.library_songs) == 0 for r in empty) is True

    mixed = empty[:1] + [
        RunResult(event_description="e3", library_songs=[{"title": "x", "distance": 0.2}],
                  validated_wildcards=[], target_wildcards=5, final_playlist=[], n_results_requested=15),
    ]
    assert all(len(r.library_songs) == 0 for r in mixed) is False
```

Run it:

```bash
app/.venv/bin/python -m pytest app/tests/test_eval_guardrail.py -v 2>&1 | tail -8
```

Expected: `PASSED`.

- [ ] **Step 4: Run full suite**

```bash
app/.venv/bin/python -m pytest -q 2>&1 | tail -5
```

Expected: `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add eval/eval_loop.py app/tests/test_eval_guardrail.py
git commit -m "feat: fail loudly on empty-spine configs and report spine size in dry-run"
```

---

## Task 5: Validate against production data (re-run the eval)

**Files:** none (produces `eval/optimized/params.json`, `eval/optimized/*.txt`, `eval/results/run_*.json`).

**Background:** Event 34 in production has real liked songs with non-null embeddings (verified: retrieval returns 15 songs per event at distances ~0.21–0.31). This task confirms the relative gate produces a non-empty spine, then runs the full optimizer to produce a *trustworthy* composite.

- [ ] **Step 1: Dry-run first — confirm the spine is no longer empty**

```bash
app/.venv/bin/python -m eval.eval_loop --dry-run --event-id 34 2>&1 | grep -iE "retrieved, .* strong|EMPTY SPINE|relevance score"
```

Expected: each event reports a **non-zero** strong count (e.g. `15 retrieved, 10 strong`); **no** `EMPTY SPINE` warnings. If any event still shows an empty spine, STOP — the margin default is still too tight; do not proceed to the costly full run.

- [ ] **Step 2: Run the full eval against event 34**

```bash
app/.venv/bin/python -m eval.eval_loop --event-id 34 2>&1 | tee eval/results/rerun_$(date +%Y%m%d_%H%M%S).log | tail -40
```

This runs Phase 1 (81-combo grid, partial scoring) + Phase 2 (prompt hill-climbing with the NIM judge) + holdout. It uses the College DJ (rate-limited, ~9s/call), the NIM judge, and Gemini `embed_query` (one call per event — well under quota; the pgvector path does NOT re-embed the library). Expect it to take a while.

- [ ] **Step 3: Confirm relevance is now non-zero**

```bash
ls -t eval/results/run_*.json | head -1 | xargs cat
```

Expected: `phase2.best_composite` and `holdout.composite` present, and the per-event judge logs in the run output now show `relevance=` values **> 0.00** (previously a flat 0.00). The saved `phase1.best_params` should now include a `strong_match_margin` key.

- [ ] **Step 4: Confirm the tuned params file carries the new key**

```bash
cat eval/optimized/params.json
```

Expected: JSON containing `"strong_match_margin"` (so `load_tuned_params()` in production picks it up).

- [ ] **Step 5: Commit the new optimized artifacts**

```bash
git add eval/optimized/params.json eval/optimized/hyde_prompt.txt eval/optimized/playlist_generation_prompt.txt
git commit -m "chore: re-tune params with relative strong-match gate (non-zero retrieval relevance)"
```

---

## Task 6: Update documentation

**Files:**
- Modify: `app/README.md` (lines ~228, ~248 reference `strong_match_distance`)
- Modify: `eval/README.md` (lines ~60, ~119-128, ~224, ~268, ~292 reference `strong_match_distance`)

- [ ] **Step 1: Find every doc reference**

```bash
grep -rn "strong_match_distance" app/README.md eval/README.md
```

- [ ] **Step 2: Update `app/README.md`**

Replace the parameter-table row and the grid line so they describe the relative margin. The row currently reads:

```
| `strong_match_distance` | 0.20 | Distance threshold for classifying a library song as a "strong match" (post-retrieval spine filter) |
```

Change to:

```
| `strong_match_margin` | 0.10 | Relative spine filter: keep retrieved songs within this cosine-distance margin of the closest match for the query (replaces the old absolute `strong_match_distance`, which was brittle against this embedding model's narrow distance band) |
```

And the grid line `- `strong_match_distance`: [0.15, 0.20, 0.25]` → `- `strong_match_margin`: [0.06, 0.10, 0.14]`.

- [ ] **Step 3: Update `eval/README.md`**

- The spine description (~line 60): "Songs with distance <= strong_match_distance become the spine" → "Songs within `strong_match_margin` of the query's closest match become the spine".
- The `### strong_match_distance — Spine Threshold` section (~line 121): rename heading to `### strong_match_margin — Relative Spine Filter` and rewrite the body to explain the per-query margin and *why* (Gemini's narrow distance band makes an absolute gate brittle — cite the failure where `0.20` zeroed the entire spine).
- The grid table row (~line 224): `strong_match_distance | 0.15, 0.20, 0.25 | ...` → `strong_match_margin | 0.06, 0.10, 0.14 | Relative margin above the per-query closest match for spine eligibility`.
- The example output (~line 268) and code snippet (~line 292): replace `strong_match_distance` with `strong_match_margin`.
- Add a short note under the metrics section documenting the **empty-spine guardrail**: a config that yields an empty spine on all events is scored 0 and reported as a failure, so a broken retrieval config can no longer pass as a healthy composite.

- [ ] **Step 4: Confirm no stale references anywhere**

```bash
grep -rn "strong_match_distance" . --include="*.py" --include="*.md" | grep -v "docs/superpowers/plans"
```

Expected: no output (plan docs may still reference the old name historically — that's fine).

- [ ] **Step 5: Commit**

```bash
git add app/README.md eval/README.md
git commit -m "docs: document relative strong_match_margin gate and empty-spine guardrail"
```

---

## Self-Review Notes

- **Spec coverage:** Relative gate (Task 1), threaded everywhere (Task 2), tuned by the optimizer (Task 3), guardrail + dry-run honesty (Task 4), validated on real data (Task 5), documented (Task 6). All covered.
- **Type consistency:** The keyword is `strong_match_margin: float` at every site — constructor (Task 1), `tuned_params` DEFAULTS (Task 2), `RunConfig` (Task 2), endpoint (Task 2), eval_loop 3 sites (Task 2), PARAM_GRID (Task 3). `grep` gates in Task 2 Step 7 and Task 6 Step 4 enforce zero stragglers.
- **Out of scope (deliberate):** Embedding whitening / anisotropy removal — a larger change that re-fits on corpus shifts; not needed now. The `scorer.compute_retrieval_relevance` metric itself is unchanged (it correctly scores whatever spine it's handed); the fix is upstream, in what the spine contains.
