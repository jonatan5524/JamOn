# Gemini Flash Quota Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `gemini-2.5-flash` and `gemini-embedding` API consumption per `/recommend` request by (4) allowing each LLM task to use a different provider so HyDE can run on the free local "college" model, and (5) batching per-song embedding calls into a single request.

**Architecture:** Two independent changes, both in `apps/data-engine`.
- **Point 4 (per-task providers):** Today `LLMProviderFactory.create()` builds an all-or-nothing container (all Gemini *or* all college). We split provider selection per task (`EMBEDDING_PROVIDER`, `TAGGING_PROVIDER`, `DJ_PROVIDER`), each defaulting to the existing global `LLM_PROVIDER` for backward compatibility. This lets HyDE + playlist generation (the DJ) run on college's `gemma3:12b` (zero Gemini cost) while embedding and tagging stay on Gemini. The vector-store collection name is derived strictly from the **embedding** provider so dimensions never mismatch.
- **Point 5 (batch embeddings):** `ChromaVectorStore.add_songs` currently calls `embedder.embed_document(text)` once per song (N HTTP calls). We add `embed_documents(texts)` to the embedding contract, implement it as one batched `embed_content(contents=[...])` call for Gemini (one looped fallback for college's single-prompt Ollama endpoint), and have `add_songs` call it once.

**Tech Stack:** Python 3.14, FastAPI, `google-genai` SDK, ChromaDB, `httpx`, `pytest` + `unittest.mock`, `tenacity` (resilience decorator).

**Test command (run from `apps/data-engine`, venv at `app/.venv` active):**
`python -m pytest app/tests/test_providers.py -v`

> **Decision log (from design discussion):**
> - Tagging stays on Gemini — it requires recall of the specific song to estimate audio features, and its output *is* the embedding text; an 8B/12B local model would hallucinate vibes for non-mainstream/Hebrew tracks and poison retrieval.
> - Embedding stays on Gemini — switching providers changes dims (3072 → 384) and forces a full re-index into a new collection.
> - **HyDE + playlist generation (DJ) are the safe offload targets** — HyDE rewrites the *event description* (no song knowledge needed). DJ is moved by config but defaults to Gemini; the operator chooses via `.env`.
> - Point 5 relieves the **embedding** quota, not the flash quota. Included because it is cheap and reduces RPM pressure / 429 risk during indexing.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `apps/data-engine/app/core/config.py` | Settings | Add `EMBEDDING_PROVIDER`, `TAGGING_PROVIDER`, `DJ_PROVIDER` (default to `LLM_PROVIDER`) |
| `apps/data-engine/app/providers/llm/factory.py` | LLM provider assembly | Extract per-task builders; `create()` accepts optional per-task overrides; mix providers; derive `embed_config` from embedding provider |
| `apps/data-engine/app/main.py` | Startup wiring + credential guards | Pass per-task providers into factory; guard Gemini key / college creds based on *which* tasks use them |
| `apps/data-engine/app/providers/protocols.py` | Contracts | Add `embed_documents(texts) -> List[List[float]]` to `EmbeddingProvider` |
| `apps/data-engine/app/providers/llm/gemini/embedding.py` | Gemini embeddings | Add batched `embed_documents` (single `embed_content` call) |
| `apps/data-engine/app/providers/llm/college/embedding.py` | College embeddings | Add `embed_documents` (loop fallback — Ollama is single-prompt) |
| `apps/data-engine/app/providers/vectordb/chroma.py` | Indexing | `add_songs` collects texts then calls `embed_documents` once |
| `apps/data-engine/app/tests/test_providers.py` | Tests | New tests for all of the above |

---

# POINT 4 — Per-Task Provider Selection

### Task 1: Add per-task provider settings to config

**Files:**
- Modify: `apps/data-engine/app/core/config.py:16`
- Test: `apps/data-engine/app/tests/test_providers.py`

- [ ] **Step 1: Write the failing test**

Append to `apps/data-engine/app/tests/test_providers.py`:

```python
# Point 4: per-task provider settings
def test_config_has_per_task_provider_settings():
    from app.core.config import settings
    assert hasattr(settings, "EMBEDDING_PROVIDER")
    assert hasattr(settings, "TAGGING_PROVIDER")
    assert hasattr(settings, "DJ_PROVIDER")
    # All default to the global LLM_PROVIDER when not overridden
    for p in (settings.EMBEDDING_PROVIDER, settings.TAGGING_PROVIDER, settings.DJ_PROVIDER):
        assert p in ("gemini", "college")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest app/tests/test_providers.py::test_config_has_per_task_provider_settings -v`
Expected: FAIL with `AttributeError: 'Settings' object has no attribute 'EMBEDDING_PROVIDER'`

- [ ] **Step 3: Write minimal implementation**

In `apps/data-engine/app/core/config.py`, immediately after the `self.LLM_PROVIDER` line (line 16), add:

```python
        # Per-task provider overrides — default to the global LLM_PROVIDER.
        # Lets e.g. DJ/HyDE run on the free college model while embedding/tagging stay on Gemini.
        self.EMBEDDING_PROVIDER: str = os.environ.get("EMBEDDING_PROVIDER", self.LLM_PROVIDER)
        self.TAGGING_PROVIDER: str = os.environ.get("TAGGING_PROVIDER", self.LLM_PROVIDER)
        self.DJ_PROVIDER: str = os.environ.get("DJ_PROVIDER", self.LLM_PROVIDER)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest app/tests/test_providers.py::test_config_has_per_task_provider_settings -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/data-engine/app/core/config.py apps/data-engine/app/tests/test_providers.py
git commit -m "feat(config): add per-task LLM provider overrides"
```

---

### Task 2: Refactor factory to build providers per task

**Files:**
- Modify: `apps/data-engine/app/providers/llm/factory.py:1-37` (full rewrite)
- Test: `apps/data-engine/app/tests/test_providers.py`

- [ ] **Step 1: Write the failing tests**

Append to `apps/data-engine/app/tests/test_providers.py`:

```python
# Point 4: mixed-provider factory
def test_factory_default_all_gemini_unchanged():
    from app.providers.llm.factory import LLMProviderFactory
    container, cfg = LLMProviderFactory.create("gemini")
    assert cfg.provider_id == "gemini"
    assert cfg.dims == 3072
    assert type(container.embedding).__name__ == "GeminiEmbeddingProvider"
    assert type(container.tagging).__name__ == "GeminiTaggingProvider"
    assert type(container.dj).__name__ == "GeminiDJProvider"


def test_factory_mixes_dj_college_embedding_gemini():
    from app.providers.llm.factory import LLMProviderFactory
    container, cfg = LLMProviderFactory.create(
        "gemini", embedding="gemini", tagging="gemini", dj="college"
    )
    # Collection dims follow the EMBEDDING provider, not the DJ provider
    assert cfg.provider_id == "gemini"
    assert cfg.dims == 3072
    assert type(container.embedding).__name__ == "GeminiEmbeddingProvider"
    assert type(container.tagging).__name__ == "GeminiTaggingProvider"
    assert type(container.dj).__name__ == "CollegeDJProvider"


def test_factory_embedding_college_sets_384_dims():
    from app.providers.llm.factory import LLMProviderFactory
    _, cfg = LLMProviderFactory.create("gemini", embedding="college")
    assert cfg.provider_id == "college"
    assert cfg.dims == 384


def test_factory_unknown_provider_raises():
    import pytest
    from app.providers.llm.factory import LLMProviderFactory
    from app.providers.exceptions import ConfigurationError
    with pytest.raises(ConfigurationError):
        LLMProviderFactory.create("gemini", dj="banana")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest app/tests/test_providers.py -k factory -v`
Expected: FAIL — `create()` does not accept `embedding`/`tagging`/`dj` keyword args (`TypeError`).

- [ ] **Step 3: Rewrite the factory**

Replace the entire contents of `apps/data-engine/app/providers/llm/factory.py` with:

```python
from typing import Optional, Tuple
from app.providers.containers import LLMProviderContainer, EmbeddingConfig
from app.providers.exceptions import ConfigurationError

# Embedding dimensions per provider — drives the vector-store collection name.
_EMBED_DIMS = {"gemini": 3072, "college": 384}


def _make_embedding(provider: str):
    if provider == "gemini":
        from app.providers.llm.gemini.embedding import GeminiEmbeddingProvider
        return GeminiEmbeddingProvider()
    if provider == "college":
        from app.providers.llm.college.embedding import CollegeEmbeddingProvider
        return CollegeEmbeddingProvider()
    raise ConfigurationError(
        f"Unknown EMBEDDING provider: '{provider}'. Valid options: 'gemini', 'college'"
    )


def _make_tagging(provider: str):
    if provider == "gemini":
        from app.providers.llm.gemini.tagging import GeminiTaggingProvider
        return GeminiTaggingProvider()
    if provider == "college":
        from app.providers.llm.college.tagging import CollegeTaggingProvider
        return CollegeTaggingProvider()
    raise ConfigurationError(
        f"Unknown TAGGING provider: '{provider}'. Valid options: 'gemini', 'college'"
    )


def _make_dj(provider: str):
    if provider == "gemini":
        from app.providers.llm.gemini.dj import GeminiDJProvider
        return GeminiDJProvider()
    if provider == "college":
        from app.providers.llm.college.dj import CollegeDJProvider
        return CollegeDJProvider()
    raise ConfigurationError(
        f"Unknown DJ provider: '{provider}'. Valid options: 'gemini', 'college'"
    )


class LLMProviderFactory:
    @staticmethod
    def create(
        provider: str,
        embedding: Optional[str] = None,
        tagging: Optional[str] = None,
        dj: Optional[str] = None,
    ) -> Tuple[LLMProviderContainer, EmbeddingConfig]:
        """Build a (possibly mixed) provider container.

        `provider` is the global default; `embedding`/`tagging`/`dj` override
        individual tasks. The EmbeddingConfig (and therefore the vector-store
        collection name) is derived solely from the embedding provider.
        """
        embedding = embedding or provider
        tagging = tagging or provider
        dj = dj or provider

        if embedding not in _EMBED_DIMS:
            raise ConfigurationError(
                f"Unknown EMBEDDING provider: '{embedding}'. Valid options: 'gemini', 'college'"
            )

        container = LLMProviderContainer(
            embedding=_make_embedding(embedding),
            tagging=_make_tagging(tagging),
            dj=_make_dj(dj),
        )
        embed_config = EmbeddingConfig(provider_id=embedding, dims=_EMBED_DIMS[embedding])
        return container, embed_config
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest app/tests/test_providers.py -k factory -v`
Expected: PASS (all 4)

- [ ] **Step 5: Run the full provider suite for regressions**

Run: `python -m pytest app/tests/test_providers.py -v`
Expected: PASS (existing factory/dims tests still green)

- [ ] **Step 6: Commit**

```bash
git add apps/data-engine/app/providers/llm/factory.py apps/data-engine/app/tests/test_providers.py
git commit -m "feat(factory): support per-task provider mixing"
```

---

### Task 3: Wire per-task providers + correct credential guards in main.py

**Files:**
- Modify: `apps/data-engine/app/main.py:24-33`

- [ ] **Step 1: Replace the credential guard**

In `apps/data-engine/app/main.py`, replace the current block (lines 24-26):

```python
    if settings.LLM_PROVIDER == "gemini" and not settings.GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY not set. Exiting.")
        sys.exit(1)
```

with one that checks whichever tasks actually use each provider:

```python
    tasks = {
        "embedding": settings.EMBEDDING_PROVIDER,
        "tagging": settings.TAGGING_PROVIDER,
        "dj": settings.DJ_PROVIDER,
    }
    uses_gemini = any(p == "gemini" for p in tasks.values())
    uses_college = any(p == "college" for p in tasks.values())
    if uses_gemini and not settings.GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY not set but a task uses gemini. Exiting.")
        sys.exit(1)
    if uses_college and not (settings.COLLEGE_USERNAME and settings.COLLEGE_PASSWORD):
        logger.error("COLLEGE_USERNAME/COLLEGE_PASSWORD not set but a task uses college. Exiting.")
        sys.exit(1)
```

- [ ] **Step 2: Pass per-task providers into the factory**

In `apps/data-engine/app/main.py`, replace line 32:

```python
        llm_container, embed_config = LLMProviderFactory.create(settings.LLM_PROVIDER)
```

with:

```python
        llm_container, embed_config = LLMProviderFactory.create(
            settings.LLM_PROVIDER,
            embedding=settings.EMBEDDING_PROVIDER,
            tagging=settings.TAGGING_PROVIDER,
            dj=settings.DJ_PROVIDER,
        )
```

- [ ] **Step 3: Update the startup log line**

In `apps/data-engine/app/main.py`, replace the `logger.info("Providers ready ...")` call (lines 35-39) with:

```python
        logger.info(
            f"Providers ready — embedding: {settings.EMBEDDING_PROVIDER}, "
            f"tagging: {settings.TAGGING_PROVIDER}, dj: {settings.DJ_PROVIDER}, "
            f"VectorDB: {settings.VECTOR_DB_PROVIDER}, "
            f"Collection: {vector_store.collection_name}"
        )
```

- [ ] **Step 4: Smoke-test startup (DJ on college, rest on Gemini)**

Run from `apps/data-engine`:
```bash
EMBEDDING_PROVIDER=gemini TAGGING_PROVIDER=gemini DJ_PROVIDER=college \
  python -c "import app.main; print('import ok')"
```
Expected: `import ok` with no exception (module imports; lifespan not triggered on import).

- [ ] **Step 5: Commit**

```bash
git add apps/data-engine/app/main.py
git commit -m "feat(startup): wire per-task providers and per-provider credential guards"
```

---

### Task 4: Document the new env vars

**Files:**
- Modify: `apps/data-engine/app/.env` (or `.env.example` if one exists — check first)

- [ ] **Step 1: Add documented defaults**

Add to the data-engine env file (commented so defaults are unchanged):

```bash
# Per-task LLM provider overrides (default = LLM_PROVIDER).
# Offload only HyDE + playlist generation to the free college model:
#   DJ_PROVIDER=college
# Keep embedding/tagging on Gemini (do NOT move embedding — it changes vector dims).
# EMBEDDING_PROVIDER=gemini
# TAGGING_PROVIDER=gemini
# DJ_PROVIDER=gemini
```

- [ ] **Step 2: Commit**

```bash
git add apps/data-engine/app/.env
git commit -m "docs(env): document per-task provider overrides"
```

---

# POINT 5 — Batch Embedding Calls

### Task 5: Add `embed_documents` to the EmbeddingProvider contract

**Files:**
- Modify: `apps/data-engine/app/providers/protocols.py:5-9`

- [ ] **Step 1: Extend the protocol**

In `apps/data-engine/app/providers/protocols.py`, update the `EmbeddingProvider` protocol to add the batch method:

```python
@runtime_checkable
class EmbeddingProvider(Protocol):
    provider_id: str

    def embed_document(self, text: str) -> List[float]: ...
    def embed_documents(self, texts: List[str]) -> List[List[float]]: ...
    def embed_query(self, text: str) -> List[float]: ...
```

- [ ] **Step 2: Commit**

```bash
git add apps/data-engine/app/providers/protocols.py
git commit -m "feat(protocols): add embed_documents batch method"
```

---

### Task 6: Implement batched `embed_documents` for Gemini

**Files:**
- Modify: `apps/data-engine/app/providers/llm/gemini/embedding.py`
- Test: `apps/data-engine/app/tests/test_providers.py`

- [ ] **Step 1: Write the failing test**

Append to `apps/data-engine/app/tests/test_providers.py`:

```python
# Point 5: Gemini batch embedding
def test_gemini_embed_documents_single_call_returns_all_vectors():
    from unittest.mock import patch, MagicMock
    with patch("google.genai.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.models.embed_content.return_value = MagicMock(
            embeddings=[
                MagicMock(values=[0.1, 0.2]),
                MagicMock(values=[0.3, 0.4]),
            ]
        )
        from app.providers.llm.gemini.embedding import GeminiEmbeddingProvider
        provider = GeminiEmbeddingProvider()
        vectors = provider.embed_documents(["song one text", "song two text"])

        assert vectors == [[0.1, 0.2], [0.3, 0.4]]
        # Exactly ONE API call for the whole batch
        assert mock_client.models.embed_content.call_count == 1
        _, kwargs = mock_client.models.embed_content.call_args
        assert kwargs["contents"] == ["song one text", "song two text"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest app/tests/test_providers.py::test_gemini_embed_documents_single_call_returns_all_vectors -v`
Expected: FAIL with `AttributeError: 'GeminiEmbeddingProvider' object has no attribute 'embed_documents'`

- [ ] **Step 3: Implement the batched method**

In `apps/data-engine/app/providers/llm/gemini/embedding.py`, add this method to `GeminiEmbeddingProvider`, immediately after `embed_document` (after line 34):

```python
    @with_resilience
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        try:
            response = self._client.models.embed_content(
                model=settings.EMBEDDING_MODEL,
                contents=texts,
                config=types.EmbedContentConfig(
                    task_type="RETRIEVAL_DOCUMENT",
                    title="Song Embedding",
                ),
            )
            return [e.values for e in response.embeddings]
        except Exception as e:
            if isinstance(e, (errors.APIError, AIServiceUnavailableError)):
                raise
            logger.error(f"Gemini embed_documents failed: {e}")
            raise EmbeddingError(str(e)) from e
```

> Note: the Gemini Developer API (`genai.Client(api_key=...)`) accepts a list for `contents` and returns one embedding per item in order. The "one content at a time" restriction in the SDK applies only to Vertex AI models, which this project does not use.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest app/tests/test_providers.py::test_gemini_embed_documents_single_call_returns_all_vectors -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/data-engine/app/providers/llm/gemini/embedding.py apps/data-engine/app/tests/test_providers.py
git commit -m "feat(gemini): batch embed_documents into one API call"
```

---

### Task 7: Implement `embed_documents` fallback for College

**Files:**
- Modify: `apps/data-engine/app/providers/llm/college/embedding.py`
- Test: `apps/data-engine/app/tests/test_providers.py`

- [ ] **Step 1: Write the failing test**

Append to `apps/data-engine/app/tests/test_providers.py`:

```python
# Point 5: College batch embedding (loop fallback)
def test_college_embed_documents_loops_and_returns_all():
    from unittest.mock import patch
    from app.providers.llm.college.embedding import CollegeEmbeddingProvider
    provider = CollegeEmbeddingProvider()
    with patch.object(provider, "_embed", side_effect=[[0.1], [0.2], [0.3]]) as m:
        vectors = provider.embed_documents(["a", "b", "c"])
    assert vectors == [[0.1], [0.2], [0.3]]
    assert m.call_count == 3
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest app/tests/test_providers.py::test_college_embed_documents_loops_and_returns_all -v`
Expected: FAIL with `AttributeError: 'CollegeEmbeddingProvider' object has no attribute 'embed_documents'`

- [ ] **Step 3: Implement the loop fallback**

In `apps/data-engine/app/providers/llm/college/embedding.py`, add this method to `CollegeEmbeddingProvider`, immediately after `embed_document` (after line 14):

```python
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        # Ollama /api/embeddings accepts a single prompt only — loop per text.
        return [self._embed(text) for text in texts]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest app/tests/test_providers.py::test_college_embed_documents_loops_and_returns_all -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/data-engine/app/providers/llm/college/embedding.py apps/data-engine/app/tests/test_providers.py
git commit -m "feat(college): add embed_documents loop fallback"
```

---

### Task 8: Use `embed_documents` in ChromaVectorStore.add_songs

**Files:**
- Modify: `apps/data-engine/app/providers/vectordb/chroma.py:23-77`
- Test: `apps/data-engine/app/tests/test_providers.py`

- [ ] **Step 1: Write the failing test**

Append to `apps/data-engine/app/tests/test_providers.py`:

```python
# Point 5: add_songs uses a single batched embed call
def test_add_songs_calls_embed_documents_once():
    from unittest.mock import MagicMock, patch
    from app.providers.vectordb.chroma import ChromaVectorStore

    with patch("app.providers.vectordb.chroma.chromadb"):
        store = ChromaVectorStore(collection_name="songs_gemini_3072")
    store._collection = MagicMock()
    store._expected_dims = 3                       # match vector length below

    embedder = MagicMock()
    embedder.provider_id = "gemini"
    embedder.embed_documents.return_value = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]

    songs = [
        {"title": "A", "artist": "X", "embedding_text": "vibe a"},
        {"title": "B", "artist": "Y", "embedding_text": "vibe b"},
    ]
    store.add_songs(songs, lyrics_map={}, embedder=embedder)

    embedder.embed_documents.assert_called_once()
    embedder.embed_document.assert_not_called()
    # Collection received both songs in one add()
    store._collection.add.assert_called_once()
    _, kwargs = store._collection.add.call_args
    assert len(kwargs["embeddings"]) == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest app/tests/test_providers.py::test_add_songs_calls_embed_documents_once -v`
Expected: FAIL — `embed_documents` is never called (current loop calls `embed_document`), so `assert_called_once()` fails.

- [ ] **Step 3: Rewrite the add_songs body to batch**

In `apps/data-engine/app/providers/vectordb/chroma.py`, replace the loop body (lines 29-76, from `ids, documents, ... = [], [], [], []` through the closing `self._collection.add(...)` block) with:

```python
        ids, documents, metadatas = [], [], []
        prepared = []  # (text, song) pairs, one per input song

        for song in songs_with_features:
            title = song.get("title", "")
            artist = song.get("artist", "")
            lyrics = lyrics_map.get(title, "")

            if "embedding_text" in song:
                text = f"{song['embedding_text']}\n\nLyrics Snippet:\n{lyrics[:500]}..."
            else:
                text = (
                    f"Title: {title}\nArtist: {artist}\n"
                    f"Energy: {song.get('energy_desc', '')}\n"
                    f"Mood: {song.get('mood_desc', '')}\n"
                    f"Tags: {', '.join(song.get('vibe_tags', []))}\n"
                    f"Lyrics: {lyrics[:500]}..."
                )
            prepared.append((text, song))

        if not prepared:
            return

        # Single batched embedding call for the whole library.
        vectors = embedder.embed_documents([text for text, _ in prepared])

        embeddings = []
        for i, ((text, song), vector) in enumerate(zip(prepared, vectors)):
            if not vector:
                continue
            if self._expected_dims and len(vector) != self._expected_dims:
                raise CollectionMismatchError(
                    f"Expected {self._expected_dims}-dim vector for collection "
                    f"'{self.collection_name}', got {len(vector)}-dim from "
                    f"provider '{embedder.provider_id}'"
                )
            title = song.get("title", "")
            artist = song.get("artist", "")
            ids.append(str(i))
            documents.append(text)
            metadatas.append({
                "title": title,
                "artist": artist,
                "energy_desc": song.get("energy_desc", ""),
                "mood_desc": song.get("mood_desc", ""),
                "embedding_text": song.get("embedding_text", ""),
                "vibe_tags": ", ".join(song.get("vibe_tags", [])),
                "embedding_provider_id": embedder.provider_id,
                "embedding_dims": len(vector),
            })
            embeddings.append(vector)

        if ids:
            self._collection.add(
                ids=ids, documents=documents, metadatas=metadatas, embeddings=embeddings
            )
            logger.info(f"Indexed {len(ids)} songs in '{self.collection_name}'.")
```

> Also remove the stray `print(songs_with_features)` debug line that was at the top of the old loop (line 31).

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest app/tests/test_providers.py::test_add_songs_calls_embed_documents_once -v`
Expected: PASS

- [ ] **Step 5: Run the full suite for regressions**

Run: `python -m pytest app/tests/ -v`
Expected: PASS (all tests, including the prior 40). Investigate any failure before continuing.

- [ ] **Step 6: Commit**

```bash
git add apps/data-engine/app/providers/vectordb/chroma.py apps/data-engine/app/tests/test_providers.py
git commit -m "perf(chroma): batch song embeddings into one API call in add_songs"
```

---

## Manual End-to-End Verification (after all tasks)

- [ ] Start the data-engine with DJ offloaded to college:
  ```bash
  cd apps/data-engine
  EMBEDDING_PROVIDER=gemini TAGGING_PROVIDER=gemini DJ_PROVIDER=college \
    python -m uvicorn app.main:app --reload --log-level info
  ```
- [ ] Confirm the startup log shows: `embedding: gemini, tagging: gemini, dj: college`.
- [ ] Trigger one `/recommend` and confirm in the logs:
  - HyDE expansion runs via the college endpoint (no Gemini flash call for HyDE).
  - `add_songs` logs `Indexed N songs` after a single embedding round-trip (not N).
- [ ] Sanity-check playlist quality is acceptable with `gemma3:12b` doing generation; if not, set `DJ_PROVIDER=gemini` to revert that half while keeping the batching win.

---

## Notes / Out of Scope

- **Caching tags/embeddings in Postgres** (point 1) is deliberately a separate future mission and is NOT in this plan.
- **Lowering `max_attempts`** (point 2) and **dropping HyDE** (point 3) were rejected by the user.
- `pgvector.py` `add_songs` is currently unused (the vector-store factory always falls back to Chroma), so it is left untouched. If pgvector is implemented later, mirror the batching change there.
- Expected flash savings from point 4: with `DJ_PROVIDER=college`, both HyDE and `generate_playlist` (up to 3 attempts) move off flash — leaving only `tag_songs` (1 flash call) per `/recommend`. Point 5 reduces embedding-quota requests from N to 1 per request.
