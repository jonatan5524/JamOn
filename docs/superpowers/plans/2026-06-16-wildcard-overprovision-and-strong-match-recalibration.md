# Wildcard Over-Provisioning + Strong-Match Recalibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two gaps that make the playlist engine produce wrong vibes: (1) the college LLM under-delivers wildcard candidates (asks for 3, returns 1), and (2) the `strong_match_distance=0.4` threshold is hardcoded and dead — every song passes it, so the system never detects a weak-pool event.

**Architecture:**
- Task 1 adds `overprovision_factor` to `PlaylistGraphBuilder` so both `initial_fetch` and `regenerate` request 2× candidates, giving validation enough to fill the target even with a 50%+ rejection rate.
- Tasks 2–4 restore the deleted `tuned_params` + eval source files from git, add `strong_match_distance` to the param grid, and wire it from `load_tuned_params()` into the endpoint so the eval loop can calibrate it automatically.

**Tech Stack:** Python 3.14, FastAPI, LangGraph, pytest-asyncio, Chroma (dev), pgvector (prod)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/data-engine/app/workflows/playlist_generator.py` | Modify | Add `overprovision_factor` param + use in `initial_fetch`/`regenerate` |
| `apps/data-engine/app/api/endpoints.py` | Modify | Pass `overprovision_factor` and read `strong_match_distance` from tuned params |
| `apps/data-engine/app/core/tuned_params.py` | Restore from git | Load eval-optimised params with graceful fallback to defaults |
| `apps/data-engine/eval/optimizer.py` | Restore + modify | Add `strong_match_distance` to `PARAM_GRID` |
| `apps/data-engine/eval/runner.py` | Restore + modify | Pass `strong_match_distance` to `PlaylistGraphBuilder` in eval runs |
| `apps/data-engine/eval/eval_loop.py` | Restore | Orchestrates Phase 1 grid search + Phase 2 prompt hill-climbing |
| `apps/data-engine/eval/scorer.py` | Restore | Computes acceptance_rate, retrieval_relevance, composite score |
| `apps/data-engine/eval/event_generator.py` | Restore | Training + holdout event sets |
| `apps/data-engine/eval/cache.py` | Restore | HyDE expansion disk cache |
| `apps/data-engine/app/tests/test_dynamic_wildcards.py` | Modify | Add over-provisioning tests |

---

## Task 1: Over-provision wildcard generation

**Files:**
- Modify: `apps/data-engine/app/workflows/playlist_generator.py:12-28` (constructor)
- Modify: `apps/data-engine/app/workflows/playlist_generator.py:76-82` (`initial_fetch` llm call)
- Modify: `apps/data-engine/app/workflows/playlist_generator.py:119-134` (`regenerate` llm call)
- Test: `apps/data-engine/app/tests/test_dynamic_wildcards.py`

- [ ] **Step 1: Write the failing tests**

Add to `apps/data-engine/app/tests/test_dynamic_wildcards.py`:

```python
@pytest.mark.asyncio
async def test_initial_fetch_overprovisions_llm_call():
    """llm_generator receives 2x target_wildcards candidates on first call."""
    captured = {}

    async def mock_llm(event, count, rejected, context, anchors):
        captured["count"] = count
        return [
            {"title": f"W{i}", "artist": "AI", "source": "new_suggestion"}
            for i in range(count)
        ]

    async def mock_db(query):
        return []  # empty pool → target_wildcards = 20

    builder = PlaylistGraphBuilder(
        mock_llm, mock_db, None,
        target_playlist_size=20, min_wildcards=3,
        strong_match_distance=0.4, overprovision_factor=2.0,
    )
    state = PlaylistState(event_description="chill evening", anchor_artists=["A"])
    await builder.initial_fetch(state)

    assert captured["count"] == 40  # 20 × 2.0


@pytest.mark.asyncio
async def test_regenerate_overprovisions_llm_call():
    """regenerate requests missing × overprovision_factor candidates."""
    captured = {}

    async def mock_llm(event, count, rejected, context, anchors):
        captured["count"] = count
        return [
            {"title": f"W{i}", "artist": "AI", "source": "new_suggestion"}
            for i in range(count)
        ]

    async def mock_db(query):
        return []

    builder = PlaylistGraphBuilder(
        mock_llm, mock_db, None,
        target_playlist_size=20, min_wildcards=3,
        strong_match_distance=0.4, overprovision_factor=2.0,
    )
    # missing = 2 → should request 4
    state = PlaylistState(
        event_description="chill evening",
        anchor_artists=["A"],
        db_songs=[],
        target_wildcards=5,
        validated_wildcards=[
            {"title": f"V{i}", "artist": "AI", "source": "new_suggestion"}
            for i in range(3)
        ],
        attempts=1,
    )
    await builder.regenerate(state)

    assert captured["count"] == 4  # (5 - 3) × 2.0
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine
python -m pytest app/tests/test_dynamic_wildcards.py::test_initial_fetch_overprovisions_llm_call app/tests/test_dynamic_wildcards.py::test_regenerate_overprovisions_llm_call -v 2>&1 | tail -15
```

Expected: `FAILED` — `TypeError: unexpected keyword argument 'overprovision_factor'`

- [ ] **Step 3: Add `overprovision_factor` to `PlaylistGraphBuilder.__init__`**

In `apps/data-engine/app/workflows/playlist_generator.py`, change the constructor from:

```python
    def __init__(
        self,
        llm_generator: ...,
        db_fetcher: ...,
        uri_validator: ...,
        target_playlist_size: int = 20,
        min_wildcards: int = 3,
        strong_match_distance: float = 0.4,
        max_attempts: int = 3,
    ):
        ...
        self.max_attempts = max_attempts
```

to:

```python
    def __init__(
        self,
        llm_generator: ...,
        db_fetcher: ...,
        uri_validator: ...,
        target_playlist_size: int = 20,
        min_wildcards: int = 3,
        strong_match_distance: float = 0.4,
        max_attempts: int = 3,
        overprovision_factor: float = 1.0,
    ):
        ...
        self.max_attempts = max_attempts
        self.overprovision_factor = overprovision_factor
```

- [ ] **Step 4: Apply over-provisioning in `initial_fetch`**

Change the `llm_generator` call at line 76 from:

```python
        candidate_wildcards = await self.llm_generator(
            state.event_description,
            target_wildcards,
            [],
            spine_songs,
            anchor_artists,
        )
```

to:

```python
        requested_count = round(target_wildcards * self.overprovision_factor)
        candidate_wildcards = await self.llm_generator(
            state.event_description,
            requested_count,
            [],
            spine_songs,
            anchor_artists,
        )
```

- [ ] **Step 5: Apply over-provisioning in `regenerate`**

Change the `llm_generator` call at line 123 from:

```python
        new_candidates = await self.llm_generator(
            state.event_description,
            missing,
            state.rejected_wildcards,
            state.db_songs,
            state.anchor_artists,
        )
```

to:

```python
        requested_count = round(missing * self.overprovision_factor)
        new_candidates = await self.llm_generator(
            state.event_description,
            requested_count,
            state.rejected_wildcards,
            state.db_songs,
            state.anchor_artists,
        )
```

- [ ] **Step 6: Run the new tests to confirm they pass**

```bash
python -m pytest app/tests/test_dynamic_wildcards.py -v 2>&1 | tail -15
```

Expected: all tests in file pass.

- [ ] **Step 7: Run full suite to confirm no regressions**

```bash
python -m pytest -q 2>&1 | tail -4
```

Expected: `89 passed` (or more), `0 failed`.

- [ ] **Step 8: Pass `overprovision_factor` from the endpoint**

In `apps/data-engine/app/api/endpoints.py`, update the `PlaylistGraphBuilder` construction (around line 108):

```python
    builder = PlaylistGraphBuilder(
        llm_generator=llm_gen_wrapper,
        db_fetcher=db_fetch_wrapper,
        uri_validator=validate_spotify_uri_via_nestjs,
        target_playlist_size=20,
        min_wildcards=3,
        strong_match_distance=0.4,
        max_attempts=3,
        overprovision_factor=2.0,
    )
```

- [ ] **Step 9: Commit**

```bash
git add apps/data-engine/app/workflows/playlist_generator.py \
        apps/data-engine/app/api/endpoints.py \
        apps/data-engine/app/tests/test_dynamic_wildcards.py
git commit -m "feat: over-provision wildcard generation (2× factor) to handle LLM under-delivery"
```

---

## Task 2: Restore `tuned_params.py` and add `strong_match_distance`

**Files:**
- Restore: `apps/data-engine/app/core/tuned_params.py` (was deleted; last seen at git commit `632d50c`)
- Test: `apps/data-engine/app/tests/test_providers.py` (add one assertion)

**Background:** `tuned_params.py` was deleted from the working tree but exists in git history at `632d50c`. It loads eval-optimised params from `settings.TUNED_PARAMS_PATH` with graceful fallback to hardcoded defaults. We need to restore it and add `strong_match_distance` as a new key.

- [ ] **Step 1: Write the failing test**

Add to `apps/data-engine/app/tests/test_providers.py`:

```python
def test_tuned_params_includes_strong_match_distance():
    from app.core.tuned_params import load_tuned_params
    params = load_tuned_params()
    assert "strong_match_distance" in params
    assert isinstance(params["strong_match_distance"], float)
```

- [ ] **Step 2: Run to confirm it fails**

```bash
python -m pytest app/tests/test_providers.py::test_tuned_params_includes_strong_match_distance -v 2>&1 | tail -10
```

Expected: `FAILED` — `ModuleNotFoundError: No module named 'app.core.tuned_params'`

- [ ] **Step 3: Restore `tuned_params.py` from git and add `strong_match_distance`**

Create `apps/data-engine/app/core/tuned_params.py` with this exact content (restored from `632d50c`, extended with the new key):

```python
import json
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

DEFAULTS = {
    "n_results": 20,
    "max_distance": 0.7,
    "target_wildcards": 5,
    "strong_match_distance": 0.20,
}


def load_tuned_params() -> dict:
    """Load eval-tuned retrieval/generation params, falling back to defaults.

    The eval loop writes the best config to settings.TUNED_PARAMS_PATH. Production
    reads it here so improvements found by the optimizer actually take effect, while
    a missing or malformed file degrades gracefully to the original defaults.
    """
    params = dict(DEFAULTS)
    path = settings.TUNED_PARAMS_PATH
    try:
        with open(path) as f:
            loaded = json.load(f)
        for key in DEFAULTS:
            if key in loaded:
                params[key] = loaded[key]
        logger.info(f"Loaded tuned params from {path}: {params}")
    except FileNotFoundError:
        logger.info(f"No tuned params file at {path}; using defaults: {params}")
    except Exception as e:
        logger.warning(f"Failed to load tuned params from {path} ({e}); using defaults: {params}")
    return params
```

- [ ] **Step 4: Check `settings.TUNED_PARAMS_PATH` exists in config**

```bash
grep -n "TUNED_PARAMS_PATH" apps/data-engine/app/core/config.py
```

If it's missing, add it. Open `apps/data-engine/app/core/config.py` and find the `Settings.__init__` method. Add the following line inside `__init__` (alongside other `self.X = os.environ.get(...)` assignments):

```python
self.TUNED_PARAMS_PATH = os.environ.get("TUNED_PARAMS_PATH", "eval/optimized/params.json")
```

Do **not** add it as a bare class-level annotation (`TUNED_PARAMS_PATH: str = ...`) — Pydantic Settings classes resolve env vars in `__init__`, so the attribute must be set there.

- [ ] **Step 5: Run the new test to confirm it passes**

```bash
python -m pytest app/tests/test_providers.py::test_tuned_params_includes_strong_match_distance -v 2>&1 | tail -10
```

Expected: `PASSED`

- [ ] **Step 6: Run full suite**

```bash
python -m pytest -q 2>&1 | tail -4
```

Expected: all pass, 0 failed.

- [ ] **Step 7: Commit**

```bash
git add apps/data-engine/app/core/tuned_params.py apps/data-engine/app/core/config.py \
        apps/data-engine/app/tests/test_providers.py
git commit -m "feat: restore tuned_params loader with strong_match_distance default 0.20"
```

---

## Task 3: Wire `strong_match_distance` from tuned params into the endpoint

**Files:**
- Modify: `apps/data-engine/app/api/endpoints.py`

- [ ] **Step 1: Write the failing test**

Add to `apps/data-engine/app/tests/test_providers.py`:

```python
def test_tuned_strong_match_distance_overrides_default(tmp_path, monkeypatch):
    """If eval/optimized/params.json contains strong_match_distance, it is loaded."""
    import json
    from app.core import tuned_params as tp_module

    params_file = tmp_path / "params.json"
    params_file.write_text(json.dumps({"strong_match_distance": 0.18}))

    monkeypatch.setattr(tp_module.settings, "TUNED_PARAMS_PATH", str(params_file))
    params = tp_module.load_tuned_params()
    assert params["strong_match_distance"] == 0.18
```

- [ ] **Step 2: Run to confirm it passes immediately** (it should — we're testing the loader we just wrote)

```bash
python -m pytest app/tests/test_providers.py::test_tuned_strong_match_distance_overrides_default -v 2>&1 | tail -8
```

Expected: `PASSED`

- [ ] **Step 3: Wire tuned params into the endpoint**

In `apps/data-engine/app/api/endpoints.py`, add the import at the top (near other imports):

```python
from app.core.tuned_params import load_tuned_params
```

Then in the `/recommend` endpoint body, **edit the existing** `db_fetch_wrapper` closure and `PlaylistGraphBuilder` construction (do not replace surrounding code):

```python
    tuned = load_tuned_params()
    logger.info(f"Using tuned params: {tuned}")

    async def db_fetch_wrapper(query: str):
        return await rag.query_songs(
            query,
            event_id=request.event_id,
            n_results=tuned["n_results"],
            max_distance=tuned["max_distance"],
        )

    builder = PlaylistGraphBuilder(
        llm_generator=llm_gen_wrapper,
        db_fetcher=db_fetch_wrapper,
        uri_validator=validate_spotify_uri_via_nestjs,
        target_playlist_size=20,
        min_wildcards=3,
        strong_match_distance=tuned["strong_match_distance"],
        max_attempts=3,
        overprovision_factor=2.0,
    )
```

`max_distance` is the vector-store cosine filter (pre-retrieval); `strong_match_distance` is the spine filter inside the graph (post-retrieval). Both need to come from tuned params so the eval loop can calibrate them independently.

- [ ] **Step 4: Run full suite**

```bash
python -m pytest -q 2>&1 | tail -4
```

Expected: all pass, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add apps/data-engine/app/api/endpoints.py
git commit -m "feat: read strong_match_distance and n_results from tuned params in recommend endpoint"
```

---

## Task 4: Restore eval source files and add `strong_match_distance` to grid

**Files:**
- Restore: `apps/data-engine/eval/optimizer.py`
- Restore: `apps/data-engine/eval/runner.py`
- Restore: `apps/data-engine/eval/eval_loop.py`
- Restore: `apps/data-engine/eval/scorer.py`
- Restore: `apps/data-engine/eval/event_generator.py`
- Restore: `apps/data-engine/eval/cache.py`
- Restore: `apps/data-engine/eval/__init__.py`

**Background:** All eval `.py` files were deleted from the working tree; only `.pyc` caches remain. They exist in git at commit `632d50c` (last good commit before deletion). Restore them with `git show`, then extend `optimizer.py` to sweep `strong_match_distance` and `runner.py` to pass it to `PlaylistGraphBuilder`.

- [ ] **Step 1: Restore all eval source files from git**

```bash
cd /home/jonatan5524/git/JamOn
for f in __init__ optimizer runner eval_loop scorer event_generator cache seed_library; do
  git show 632d50c:apps/data-engine/eval/${f}.py > apps/data-engine/eval/${f}.py
done
```

Verify they're back:

```bash
ls apps/data-engine/eval/*.py
```

Expected: 8 `.py` files present.

- [ ] **Step 2: Confirm eval imports work**

```bash
cd apps/data-engine
python -c "from eval.optimizer import PARAM_GRID, grid_combinations; print(PARAM_GRID); print(len(list(grid_combinations())), 'combos')"
```

Expected output: `{'n_results': [5, 15, 30], 'max_distance': [0.5, 0.65, 0.8], 'target_wildcards': [3, 5, 7]}` and `27 combos`

- [ ] **Step 3: Write the failing test for new grid param**

Add to `apps/data-engine/app/tests/test_providers.py`:

```python
def test_param_grid_includes_strong_match_distance():
    from eval.optimizer import PARAM_GRID, grid_combinations
    assert "strong_match_distance" in PARAM_GRID
    combos = list(grid_combinations())
    assert len(combos) == 81  # 3 × 3 × 3 × 3
    assert all("strong_match_distance" in c for c in combos)
```

- [ ] **Step 4: Run to confirm it fails**

```bash
python -m pytest app/tests/test_providers.py::test_param_grid_includes_strong_match_distance -v 2>&1 | tail -10
```

Expected: `FAILED` — `AssertionError` on `"strong_match_distance" in PARAM_GRID`

- [ ] **Step 5: Add `strong_match_distance` to `PARAM_GRID` in `eval/optimizer.py`**

Open `apps/data-engine/eval/optimizer.py` and change:

```python
PARAM_GRID: Dict[str, List[Any]] = {
    "n_results": [5, 15, 30],
    "max_distance": [0.5, 0.65, 0.8],
    "target_wildcards": [3, 5, 7],
}
```

to:

```python
PARAM_GRID: Dict[str, List[Any]] = {
    "n_results": [5, 15, 30],
    "max_distance": [0.5, 0.65, 0.8],
    "target_wildcards": [3, 5, 7],
    "strong_match_distance": [0.15, 0.20, 0.25],
}
```

Range rationale: the current embedding band is ~0.08–0.35; the "genuine chill" cluster ends around 0.18–0.25 in live runs.

- [ ] **Step 6: Pass `strong_match_distance` to `PlaylistGraphBuilder` in `eval/runner.py`**

Open `apps/data-engine/eval/runner.py` and find where `PlaylistGraphBuilder` is constructed (look for `PlaylistGraphBuilder(`). Add `strong_match_distance=params.get("strong_match_distance", 0.20)` to that call. Exact edit depends on the restored file — read it first before editing.

- [ ] **Step 7: Patch `eval_loop.py` for the new `event_id` signature**

The restored `eval_loop.py` from `632d50c` calls `rag.query_songs(...)` without `event_id`, but the current `RagEngine.query_songs` requires it. Find both call sites and add the keyword arg:

```bash
grep -n "query_songs" apps/data-engine/eval/eval_loop.py
```

For every `rag.query_songs(...)` call found, add `event_id=""` as a keyword argument. Eval runs are not scoped to a real event, so empty string is the correct sentinel.

- [ ] **Step 8: Dry-run the eval loop to catch import and API errors before commit**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine
python -m eval.eval_loop --dry-run 2>&1 | tail -20
```

Expected: completes without `TypeError` or `ImportError`; logs show `strong_match_distance` being swept in the param grid. Fix any errors before proceeding.

- [ ] **Step 9: Run the new test to confirm it passes**

```bash
python -m pytest app/tests/test_providers.py::test_param_grid_includes_strong_match_distance -v 2>&1 | tail -8
```

Expected: `PASSED`

- [ ] **Step 10: Run full suite**

```bash
python -m pytest -q 2>&1 | tail -4
```

Expected: all pass, 0 failed.

- [ ] **Step 11: Commit**

```bash
git add apps/data-engine/eval/ apps/data-engine/app/tests/test_providers.py
git commit -m "feat: restore eval harness and add strong_match_distance to Phase 1 grid (81 combos)"
```

---

## Task 5: Final verification

- [ ] **Step 1: Confirm over-provisioning is wired end-to-end**

```bash
grep -n "overprovision" apps/data-engine/app/workflows/playlist_generator.py apps/data-engine/app/api/endpoints.py
```

Expected: `overprovision_factor` appears in constructor, both call sites, and endpoint.

- [ ] **Step 2: Confirm `strong_match_distance` flows end-to-end**

```bash
grep -rn "strong_match_distance" apps/data-engine/app/ apps/data-engine/eval/
```

Expected: present in `playlist_generator.py` (constructor + usage), `tuned_params.py` (DEFAULTS), `endpoints.py` (passed from tuned), `optimizer.py` (PARAM_GRID), `runner.py` (passed to builder).

- [ ] **Step 3: Confirm eval grid is 81 combos**

```bash
python -c "from eval.optimizer import grid_combinations; print(len(list(grid_combinations())))"
```

Expected: `81`

- [ ] **Step 4: Run full test suite one final time**

```bash
python -m pytest -q 2>&1 | tail -4
```

Expected: all pass, 0 failed.

- [ ] **Step 5: Confirm dry-run already passed in Task 4 Step 8** *(no action needed — this is a reminder checkpoint)*

- [ ] **Step 6: Update relevant READMEs**

Find READMEs that describe the playlist pipeline, eval harness, or parameter tuning:

```bash
find /home/jonatan5524/git/JamOn -name "README*" | xargs grep -l -i "playlist\|eval\|wildcard\|strong_match\|recommend" 2>/dev/null
```

Update each file that describes:
- **Inference pipeline parameters** (`strong_match_distance`, `n_results`, `max_distance`): document that these are now read from `eval/optimized/params.json` via `tuned_params.py`, with graceful fallback to defaults.
- **Wildcard generation**: document that `overprovision_factor=2.0` is applied at the endpoint so the LLM is asked for 2× candidates to absorb the ~50% rejection/under-delivery rate from the college model.
- **Eval harness** (`apps/data-engine/eval/`): document the two-phase flow — Phase 1 grid search (81 combos: `n_results × max_distance × target_wildcards × strong_match_distance`), Phase 2 prompt hill-climbing — and that running `python -m eval.eval_loop` writes `eval/optimized/params.json` which is automatically picked up by the `/recommend` endpoint.
