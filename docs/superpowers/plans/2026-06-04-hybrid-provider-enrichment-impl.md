# Hybrid Provider, Song Enrichment & Wildcard Anchor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add NVIDIA NIM as a third LLM provider (for tagging/HyDE), extract HyDE into its own protocol, enrich songs with Last.fm + Musixmatch before tagging, and anchor DJ wildcard suggestions to the group's known artist space.

**Architecture:** Three independent changes layered on top of the existing per-task provider infrastructure. Phase A wires NIM and extracts HyDE into a standalone protocol+container slot. Phase B adds an enrichment pipeline stage before tagging. Phase C adds anchor artist anchoring to DJ prompts via PlaylistState.

**Tech Stack:** Python/FastAPI (data-engine), `openai` SDK for NIM API, `httpx` for Last.fm/Musixmatch, NestJS/TypeScript (orchestrator), LangGraph (PlaylistGraphBuilder).

**Test command (run from `apps/data-engine/`):**
```
python -m pytest app/tests/test_providers.py -v
```

---

## File Map

### New files
- `apps/data-engine/app/providers/llm/nim/__init__.py`
- `apps/data-engine/app/providers/llm/nim/tagging.py`
- `apps/data-engine/app/providers/llm/nim/hyde.py`
- `apps/data-engine/app/providers/llm/gemini/hyde.py`
- `apps/data-engine/app/providers/llm/college/hyde.py`
- `apps/data-engine/app/services/lastfm.py`
- `apps/data-engine/app/services/enrichment.py`

### Modified files
| File | What changes |
|---|---|
| `app/providers/protocols.py` | Add `HyDEProvider`; remove `expand_query_hyde` from `DJProvider` (Task 9) |
| `app/providers/containers.py` | Add `hyde: HyDEProvider` to `LLMProviderContainer` |
| `app/providers/llm/factory.py` | Add `_make_hyde`, `nim` key, `hybrid` shortcut, `hyde` param to `create()` |
| `app/providers/llm/gemini/dj.py` | Remove `expand_query_hyde` (Task 9) |
| `app/providers/llm/college/dj.py` | Remove `expand_query_hyde` (Task 9) |
| `app/core/config.py` | Add `NVIDIA_API_KEY`, `NIM_BASE_URL`, `NIM_TAGGING_MODEL`, `NIM_HYDE_MODEL`, `HYDE_PROVIDER`, `LASTFM_API_KEY`, `MUSIXMATCH_API_KEY` |
| `app/main.py` | Add NIM credential validation, wire `hyde`, pass `HYDE_PROVIDER` |
| `app/services/rag.py` | Accept `hyde: HyDEProvider`, call `self._hyde.expand_query()` |
| `app/services/lyrics.py` | Add Musixmatch fallback |
| `app/models/song.py` | Add `EnrichedSong`; add `spotify_genres` to `Track` |
| `app/api/endpoints.py` | Enrich songs before tagging; pass `providers.llm.hyde` to `RagEngine` |
| `app/workflows/playlist_generator.py` | Compute `anchor_artists` from `db_songs`, thread through to `llm_generator` |
| `app/models/state.py` | Add `anchor_artists: List[str]` |
| `app/prompts/playlist_generation_prompt.txt` | Add `{anchor_artist_list}` section |
| `app/prompts/audio_features_prompt.txt` | Add enriched context fields |
| `app/.env.example` | Document new env vars |
| `apps/orchestrator/src/modules/spotify/spotify.types.ts` | Update `SimplifiedTrack` with `artistGenres` |
| `apps/orchestrator/src/modules/spotify/spotify.service.ts` | Expose `artistId` in `getTopTracks`, add `getArtistsBatch` |
| `apps/orchestrator/src/modules/playlist/playlist.service.ts` | Fetch genres and attach before calling `getRecommendations` |
| `apps/data-engine/requirements.txt` | Add `openai` |
| `apps/data-engine/app/tests/test_providers.py` | Tests for NIM providers, HyDE protocol, factory, updated container |

---

## Phase A — Hybrid Provider Mode (NIM + HyDE extraction)

---

### Task 1: NIM config variables

**Files:**
- Modify: `apps/data-engine/app/core/config.py`
- Modify: `apps/data-engine/app/.env.example`

- [ ] **Step 1: Write the failing test**

Add to `apps/data-engine/app/tests/test_providers.py`:

```python
def test_config_has_nim_settings():
    from app.core.config import settings
    assert hasattr(settings, "NVIDIA_API_KEY")
    assert hasattr(settings, "NIM_BASE_URL")
    assert hasattr(settings, "NIM_TAGGING_MODEL")
    assert hasattr(settings, "NIM_HYDE_MODEL")
    assert hasattr(settings, "HYDE_PROVIDER")
```

- [ ] **Step 2: Run test to verify it fails**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_config_has_nim_settings -v
```
Expected: FAIL with `AttributeError` or `AssertionError`

- [ ] **Step 3: Implement**

In `apps/data-engine/app/core/config.py`, add to the `Settings.__init__` body after the existing DJ_PROVIDER line:

```python
# NVIDIA NIM credentials
self.NVIDIA_API_KEY: str = os.environ.get("NVIDIA_API_KEY", "")
self.NIM_BASE_URL: str = os.environ.get("NIM_BASE_URL", "https://integrate.api.nvidia.com/v1")
self.NIM_TAGGING_MODEL: str = os.environ.get("NIM_TAGGING_MODEL", "meta/llama-3.3-70b-instruct")
self.NIM_HYDE_MODEL: str = os.environ.get("NIM_HYDE_MODEL", "meta/llama-3.3-70b-instruct")
self.HYDE_PROVIDER: str = os.environ.get("HYDE_PROVIDER", self.DJ_PROVIDER)
```

- [ ] **Step 4: Run test to verify it passes**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_config_has_nim_settings -v
```
Expected: PASS

- [ ] **Step 5: Update .env.example**

Append to `apps/data-engine/app/.env.example`:

```
# NVIDIA NIM (for tagging + HyDE in hybrid mode)
NVIDIA_API_KEY=
NIM_BASE_URL=https://integrate.api.nvidia.com/v1
NIM_TAGGING_MODEL=meta/llama-3.3-70b-instruct
NIM_HYDE_MODEL=meta/llama-3.3-70b-instruct

# Per-task provider for HyDE query expansion
# HYDE_PROVIDER=nim

# Song enrichment services
LASTFM_API_KEY=
MUSIXMATCH_API_KEY=
```

- [ ] **Step 6: Commit**

```bash
git add apps/data-engine/app/core/config.py apps/data-engine/app/.env.example apps/data-engine/app/tests/test_providers.py
git commit -m "feat(config): add NIM and enrichment env vars"
```

---

### Task 2: HyDEProvider protocol + LLMProviderContainer.hyde field

**Files:**
- Modify: `apps/data-engine/app/providers/protocols.py`
- Modify: `apps/data-engine/app/providers/containers.py`
- Modify: `apps/data-engine/app/tests/test_providers.py`

- [ ] **Step 1: Write failing tests**

Add to `apps/data-engine/app/tests/test_providers.py`:

```python
def test_hyde_provider_protocol_exists():
    from app.providers.protocols import HyDEProvider
    assert hasattr(HyDEProvider, "expand_query")


def test_llm_provider_container_has_hyde_field():
    from app.providers.containers import LLMProviderContainer
    mock_embed = MagicMock()
    mock_tag = MagicMock()
    mock_dj = MagicMock()
    mock_hyde = MagicMock()
    c = LLMProviderContainer(embedding=mock_embed, tagging=mock_tag, dj=mock_dj, hyde=mock_hyde)
    assert c.hyde is mock_hyde
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_hyde_provider_protocol_exists app/tests/test_providers.py::test_llm_provider_container_has_hyde_field -v
```
Expected: both FAIL

- [ ] **Step 3: Add HyDEProvider to protocols.py**

In `apps/data-engine/app/providers/protocols.py`, add after `TaggingProvider`:

```python
@runtime_checkable
class HyDEProvider(Protocol):
    def expand_query(self, event_description: str) -> str: ...
```

- [ ] **Step 4: Add hyde field to LLMProviderContainer**

Replace the full `LLMProviderContainer` dataclass in `apps/data-engine/app/providers/containers.py`:

```python
from dataclasses import dataclass
from app.providers.protocols import EmbeddingProvider, TaggingProvider, DJProvider, HyDEProvider, VectorStore


@dataclass
class EmbeddingConfig:
    provider_id: str
    dims: int


@dataclass
class LLMProviderContainer:
    embedding: EmbeddingProvider
    tagging: TaggingProvider
    dj: DJProvider
    hyde: HyDEProvider


@dataclass
class AppContainer:
    llm: LLMProviderContainer
    vector_store: VectorStore
```

- [ ] **Step 5: Fix the existing container test** (it now requires the `hyde` kwarg)

Update `test_llm_provider_container_fields` in `test_providers.py`:

```python
def test_llm_provider_container_fields():
    from app.providers.containers import LLMProviderContainer
    mock_embed = MagicMock()
    mock_tag = MagicMock()
    mock_dj = MagicMock()
    mock_hyde = MagicMock()
    c = LLMProviderContainer(embedding=mock_embed, tagging=mock_tag, dj=mock_dj, hyde=mock_hyde)
    assert c.embedding is mock_embed
    assert c.tagging is mock_tag
    assert c.dj is mock_dj
    assert c.hyde is mock_hyde
```

- [ ] **Step 6: Run new tests to verify they pass**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_hyde_provider_protocol_exists app/tests/test_providers.py::test_llm_provider_container_has_hyde_field app/tests/test_providers.py::test_llm_provider_container_fields -v
```
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add apps/data-engine/app/providers/protocols.py apps/data-engine/app/providers/containers.py apps/data-engine/app/tests/test_providers.py
git commit -m "feat(protocols): add HyDEProvider protocol and container field"
```

---

### Task 3: GeminiHyDEProvider

**Files:**
- Create: `apps/data-engine/app/providers/llm/gemini/hyde.py`
- Modify: `apps/data-engine/app/tests/test_providers.py`

- [ ] **Step 1: Write the failing test**

Add to `test_providers.py`:

```python
def test_gemini_hyde_provider_expand_query():
    from unittest.mock import patch, MagicMock
    with patch("google.genai.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.models.generate_content.return_value = MagicMock(text="hypothetical song doc")
        from app.providers.llm.gemini.hyde import GeminiHyDEProvider
        provider = GeminiHyDEProvider()
        result = provider.expand_query("late night study")
        assert result == "hypothetical song doc"


def test_gemini_hyde_provider_falls_back_on_error():
    from unittest.mock import patch, MagicMock
    with patch("google.genai.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.models.generate_content.side_effect = Exception("network error")
        from app.providers.llm.gemini.hyde import GeminiHyDEProvider
        provider = GeminiHyDEProvider()
        result = provider.expand_query("late night study")
        assert result == "late night study"
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_gemini_hyde_provider_expand_query app/tests/test_providers.py::test_gemini_hyde_provider_falls_back_on_error -v
```
Expected: both FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Create `apps/data-engine/app/providers/llm/gemini/hyde.py`**

```python
import logging
import os
from google import genai
from app.core.config import settings

logger = logging.getLogger(__name__)


def _load_prompt(filename: str) -> str:
    path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "prompts", filename)
    with open(path) as f:
        return f.read()


class GeminiHyDEProvider:
    def __init__(self):
        self._client = genai.Client(api_key=settings.GEMINI_API_KEY)

    def expand_query(self, event_description: str) -> str:
        prompt = _load_prompt("hyde_prompt.txt").replace("{event_description}", event_description)
        try:
            response = self._client.models.generate_content(
                model=settings.PLAYLIST_GENERATION_MODEL,
                contents=prompt,
            )
            return response.text or event_description
        except Exception as e:
            logger.error(f"Gemini HyDE expansion failed: {e}")
            return event_description
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_gemini_hyde_provider_expand_query app/tests/test_providers.py::test_gemini_hyde_provider_falls_back_on_error -v
```
Expected: both PASS

- [ ] **Step 5: Commit**

```bash
git add apps/data-engine/app/providers/llm/gemini/hyde.py apps/data-engine/app/tests/test_providers.py
git commit -m "feat(gemini): add GeminiHyDEProvider"
```

---

### Task 4: CollegeHyDEProvider

**Files:**
- Create: `apps/data-engine/app/providers/llm/college/hyde.py`
- Modify: `apps/data-engine/app/tests/test_providers.py`

- [ ] **Step 1: Write the failing test**

Add to `test_providers.py`:

```python
def test_college_hyde_provider_expand_query():
    from unittest.mock import patch, MagicMock
    with patch("httpx.Client") as mock_cls:
        mock_http = MagicMock()
        mock_cls.return_value.__enter__.return_value = mock_http
        mock_http.post.return_value = MagicMock(
            status_code=200,
            json=lambda: {"choices": [{"message": {"content": "hypothetical song doc"}}]},
        )
        mock_http.post.return_value.raise_for_status = MagicMock()
        from app.providers.llm.college.hyde import CollegeHyDEProvider
        provider = CollegeHyDEProvider()
        result = provider.expand_query("late night study")
        assert result == "hypothetical song doc"


def test_college_hyde_provider_falls_back_on_error():
    from unittest.mock import patch, MagicMock
    with patch("httpx.Client") as mock_cls:
        mock_http = MagicMock()
        mock_cls.return_value.__enter__.return_value = mock_http
        mock_http.post.side_effect = Exception("connection refused")
        from app.providers.llm.college.hyde import CollegeHyDEProvider
        provider = CollegeHyDEProvider()
        result = provider.expand_query("late night study")
        assert result == "late night study"
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_college_hyde_provider_expand_query app/tests/test_providers.py::test_college_hyde_provider_falls_back_on_error -v
```
Expected: both FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Create `apps/data-engine/app/providers/llm/college/hyde.py`**

```python
import logging
import os
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)


def _load_prompt(filename: str) -> str:
    path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "prompts", filename)
    with open(path) as f:
        return f.read()


class CollegeHyDEProvider:
    def expand_query(self, event_description: str) -> str:
        prompt = _load_prompt("hyde_prompt.txt").replace("{event_description}", event_description)
        try:
            with httpx.Client(
                auth=(settings.COLLEGE_USERNAME, settings.COLLEGE_PASSWORD),
                timeout=30.0,
            ) as client:
                response = client.post(
                    f"{settings.COLLEGE_BASE_URL}/v1/chat/completions",
                    json={"model": "gpt-oss-120b", "messages": [{"role": "user", "content": prompt}]},
                )
                response.raise_for_status()
                return response.json()["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error(f"College HyDE expansion failed: {e}")
            return event_description
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_college_hyde_provider_expand_query app/tests/test_providers.py::test_college_hyde_provider_falls_back_on_error -v
```
Expected: both PASS

- [ ] **Step 5: Commit**

```bash
git add apps/data-engine/app/providers/llm/college/hyde.py apps/data-engine/app/tests/test_providers.py
git commit -m "feat(college): add CollegeHyDEProvider"
```

---

### Task 5: NimTaggingProvider + openai dependency

**Files:**
- Create: `apps/data-engine/app/providers/llm/nim/__init__.py`
- Create: `apps/data-engine/app/providers/llm/nim/tagging.py`
- Modify: `apps/data-engine/requirements.txt`
- Modify: `apps/data-engine/app/tests/test_providers.py`

- [ ] **Step 1: Add openai to requirements**

Append to `apps/data-engine/requirements.txt`:
```
openai
```

Install it:
```
cd apps/data-engine && pip install openai
```

- [ ] **Step 2: Write the failing test**

Add to `test_providers.py`:

```python
def test_nim_tagging_provider_tag_songs():
    from unittest.mock import patch, MagicMock
    import json
    tagged = [{"title": "Song A", "artist": "Art", "energy_desc": "High",
               "mood_desc": "Happy", "vibe_tags": ["K-pop"], "embedding_text": "A K-pop song"}]
    with patch("openai.OpenAI") as mock_cls:
        mock_client = MagicMock()
        mock_cls.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content=json.dumps(tagged)))]
        )
        from app.providers.llm.nim.tagging import NimTaggingProvider
        provider = NimTaggingProvider()
        result = provider.tag_songs([{"title": "Song A", "artist": "Art"}])
        assert isinstance(result, list)
        assert result[0]["title"] == "Song A"


def test_nim_tagging_provider_batches_15_songs():
    from unittest.mock import patch, MagicMock
    import json
    songs = [{"title": f"Song {i}", "artist": "A"} for i in range(20)]
    batch_result = [{"title": f"Song {i}", "artist": "A", "energy_desc": "High",
                     "mood_desc": "Happy", "vibe_tags": [], "embedding_text": "..."}
                    for i in range(15)]
    with patch("openai.OpenAI") as mock_cls:
        mock_client = MagicMock()
        mock_cls.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content=json.dumps(batch_result)))]
        )
        from app.providers.llm.nim.tagging import NimTaggingProvider
        provider = NimTaggingProvider()
        provider.tag_songs(songs)
        # 20 songs / batch_size 15 = 2 HTTP calls
        assert mock_client.chat.completions.create.call_count == 2
```

- [ ] **Step 3: Run tests to verify they fail**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_nim_tagging_provider_tag_songs app/tests/test_providers.py::test_nim_tagging_provider_batches_15_songs -v
```
Expected: both FAIL with `ModuleNotFoundError`

- [ ] **Step 4: Create `apps/data-engine/app/providers/llm/nim/__init__.py`** (empty)

- [ ] **Step 5: Create `apps/data-engine/app/providers/llm/nim/tagging.py`**

```python
import json
import logging
import os
from typing import List
import openai
from app.core.config import settings
from app.providers.exceptions import TaggingError

logger = logging.getLogger(__name__)
_BATCH_SIZE = 15


def _load_prompt(filename: str) -> str:
    path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "prompts", filename)
    with open(path) as f:
        return f.read()


class NimTaggingProvider:
    def __init__(self):
        self._client = openai.OpenAI(
            base_url=settings.NIM_BASE_URL,
            api_key=settings.NVIDIA_API_KEY,
        )

    def tag_songs(self, songs: List[dict]) -> List[dict]:
        results = []
        for i in range(0, len(songs), _BATCH_SIZE):
            results.extend(self._tag_batch(songs[i: i + _BATCH_SIZE]))
        return results

    def _tag_batch(self, songs: List[dict]) -> List[dict]:
        prompt = _load_prompt("audio_features_prompt.txt").replace(
            "{songs_list}", json.dumps(songs, indent=2)
        )
        # NOTE: do NOT set response_format={"type":"json_object"} here. The prompt
        # instructs the model to return a top-level JSON ARRAY, but json_object mode
        # requires a top-level object and rejects/wraps arrays. Rely on the prompt
        # (same approach as the Ollama college tagger).
        try:
            response = self._client.chat.completions.create(
                model=settings.NIM_TAGGING_MODEL,
                messages=[{"role": "user", "content": prompt}],
            )
            content = response.choices[0].message.content
            parsed = json.loads(content)
            return parsed if isinstance(parsed, list) else [parsed]
        except Exception as e:
            logger.error(f"NIM tag_batch failed: {e}")
            raise TaggingError(str(e)) from e
```

- [ ] **Step 6: Run tests to verify they pass**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_nim_tagging_provider_tag_songs app/tests/test_providers.py::test_nim_tagging_provider_batches_15_songs -v
```
Expected: both PASS

- [ ] **Step 7: Commit**

```bash
git add apps/data-engine/requirements.txt apps/data-engine/app/providers/llm/nim/ apps/data-engine/app/tests/test_providers.py
git commit -m "feat(nim): add NimTaggingProvider with 15-song batching"
```

---

### Task 6: NimHyDEProvider

**Files:**
- Create: `apps/data-engine/app/providers/llm/nim/hyde.py`
- Modify: `apps/data-engine/app/tests/test_providers.py`

- [ ] **Step 1: Write the failing test**

Add to `test_providers.py`:

```python
def test_nim_hyde_provider_expand_query():
    from unittest.mock import patch, MagicMock
    with patch("openai.OpenAI") as mock_cls:
        mock_client = MagicMock()
        mock_cls.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="hypothetical song doc"))]
        )
        from app.providers.llm.nim.hyde import NimHyDEProvider
        provider = NimHyDEProvider()
        result = provider.expand_query("late night study")
        assert result == "hypothetical song doc"


def test_nim_hyde_provider_falls_back_on_error():
    from unittest.mock import patch, MagicMock
    with patch("openai.OpenAI") as mock_cls:
        mock_client = MagicMock()
        mock_cls.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception("rate limit")
        from app.providers.llm.nim.hyde import NimHyDEProvider
        provider = NimHyDEProvider()
        result = provider.expand_query("late night study")
        assert result == "late night study"
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_nim_hyde_provider_expand_query app/tests/test_providers.py::test_nim_hyde_provider_falls_back_on_error -v
```
Expected: both FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Create `apps/data-engine/app/providers/llm/nim/hyde.py`**

```python
import logging
import os
import openai
from app.core.config import settings

logger = logging.getLogger(__name__)


def _load_prompt(filename: str) -> str:
    path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "prompts", filename)
    with open(path) as f:
        return f.read()


class NimHyDEProvider:
    def __init__(self):
        self._client = openai.OpenAI(
            base_url=settings.NIM_BASE_URL,
            api_key=settings.NVIDIA_API_KEY,
        )

    def expand_query(self, event_description: str) -> str:
        prompt = _load_prompt("hyde_prompt.txt").replace("{event_description}", event_description)
        try:
            response = self._client.chat.completions.create(
                model=settings.NIM_HYDE_MODEL,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.choices[0].message.content or event_description
        except Exception as e:
            logger.error(f"NIM HyDE expansion failed: {e}")
            return event_description
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_nim_hyde_provider_expand_query app/tests/test_providers.py::test_nim_hyde_provider_falls_back_on_error -v
```
Expected: both PASS

- [ ] **Step 5: Commit**

```bash
git add apps/data-engine/app/providers/llm/nim/hyde.py apps/data-engine/app/tests/test_providers.py
git commit -m "feat(nim): add NimHyDEProvider"
```

---

### Task 7: Factory — _make_hyde, nim key, hybrid mode

**Files:**
- Modify: `apps/data-engine/app/providers/llm/factory.py`
- Modify: `apps/data-engine/app/tests/test_providers.py`

- [ ] **Step 1: Write the failing tests**

Add to `test_providers.py`:

```python
def test_factory_creates_nim_tagging():
    from unittest.mock import patch
    with patch("openai.OpenAI"):
        from app.providers.llm.factory import LLMProviderFactory
        from app.providers.llm.nim.tagging import NimTaggingProvider
        with patch("google.genai.Client"):
            container, _ = LLMProviderFactory.create("gemini", tagging="nim")
        assert type(container.tagging).__name__ == "NimTaggingProvider"


def test_factory_creates_nim_hyde():
    from unittest.mock import patch
    with patch("openai.OpenAI"), patch("google.genai.Client"):
        from app.providers.llm.factory import LLMProviderFactory
        from app.providers.llm.nim.hyde import NimHyDEProvider
        container, _ = LLMProviderFactory.create("gemini", hyde="nim")
        assert type(container.hyde).__name__ == "NimHyDEProvider"


def test_factory_hybrid_mode_assigns_correct_providers():
    from unittest.mock import patch
    with patch("openai.OpenAI"), patch("google.genai.Client"):
        from app.providers.llm.factory import LLMProviderFactory
        container, cfg = LLMProviderFactory.create("hybrid")
        assert cfg.provider_id == "gemini"
        # Embedding stays on Gemini UNCHANGED — same model (gemini-embedding-2-preview),
        # same 3072 dims, same collection (songs_gemini_3072). No re-index.
        assert cfg.dims == 3072
        assert type(container.embedding).__name__ == "GeminiEmbeddingProvider"
        assert type(container.tagging).__name__ == "NimTaggingProvider"
        assert type(container.dj).__name__ == "CollegeDJProvider"
        assert type(container.hyde).__name__ == "NimHyDEProvider"


def test_factory_default_gemini_creates_gemini_hyde():
    from unittest.mock import patch
    with patch("google.genai.Client"):
        from app.providers.llm.factory import LLMProviderFactory
        container, _ = LLMProviderFactory.create("gemini")
        assert type(container.hyde).__name__ == "GeminiHyDEProvider"
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_factory_creates_nim_tagging app/tests/test_providers.py::test_factory_creates_nim_hyde app/tests/test_providers.py::test_factory_hybrid_mode_assigns_correct_providers app/tests/test_providers.py::test_factory_default_gemini_creates_gemini_hyde -v
```
Expected: all FAIL

- [ ] **Step 3: Rewrite `apps/data-engine/app/providers/llm/factory.py`**

```python
from typing import Optional, Tuple
from app.providers.containers import LLMProviderContainer, EmbeddingConfig
from app.providers.exceptions import ConfigurationError

# Hybrid mode preset: default provider for each task.
_HYBRID_DEFAULTS = {
    "embedding": "gemini",
    "tagging": "nim",
    "dj": "college",
    "hyde": "nim",
}

# Embedding dimensions per provider — drives the vector-store collection name.
# DO NOT change "gemini": hybrid mode keeps embeddings on the existing
# gemini-embedding-2-preview model (3072-dim) for vector-space consistency
# with the live songs_gemini_3072 collection. Changing this forces a re-index.
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
    if provider == "nim":
        from app.providers.llm.nim.tagging import NimTaggingProvider
        return NimTaggingProvider()
    raise ConfigurationError(
        f"Unknown TAGGING provider: '{provider}'. Valid options: 'gemini', 'college', 'nim'"
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


def _make_hyde(provider: str):
    if provider == "gemini":
        from app.providers.llm.gemini.hyde import GeminiHyDEProvider
        return GeminiHyDEProvider()
    if provider == "college":
        from app.providers.llm.college.hyde import CollegeHyDEProvider
        return CollegeHyDEProvider()
    if provider == "nim":
        from app.providers.llm.nim.hyde import NimHyDEProvider
        return NimHyDEProvider()
    raise ConfigurationError(
        f"Unknown HYDE provider: '{provider}'. Valid options: 'gemini', 'college', 'nim'"
    )


class LLMProviderFactory:
    @staticmethod
    def create(
        provider: str,
        embedding: Optional[str] = None,
        tagging: Optional[str] = None,
        dj: Optional[str] = None,
        hyde: Optional[str] = None,
    ) -> Tuple[LLMProviderContainer, EmbeddingConfig]:
        """Build a (possibly mixed) provider container.

        Pass provider='hybrid' to use the curated hybrid defaults.
        Individual task overrides always take precedence.
        """
        if provider == "hybrid":
            embedding = embedding or _HYBRID_DEFAULTS["embedding"]
            tagging = tagging or _HYBRID_DEFAULTS["tagging"]
            dj = dj or _HYBRID_DEFAULTS["dj"]
            hyde = hyde or _HYBRID_DEFAULTS["hyde"]
        else:
            # Validate the global provider when used as a plain default.
            if provider not in _EMBED_DIMS:
                raise ConfigurationError(
                    f"Unknown LLM_PROVIDER: '{provider}'. Valid options: 'gemini', 'college', 'hybrid'"
                )
            embedding = embedding or provider
            tagging = tagging or provider
            dj = dj or provider
            hyde = hyde or provider

        if embedding not in _EMBED_DIMS:
            raise ConfigurationError(
                f"Unknown EMBEDDING provider: '{embedding}'. Valid options: 'gemini', 'college'"
            )

        container = LLMProviderContainer(
            embedding=_make_embedding(embedding),
            tagging=_make_tagging(tagging),
            dj=_make_dj(dj),
            hyde=_make_hyde(hyde),
        )
        embed_config = EmbeddingConfig(provider_id=embedding, dims=_EMBED_DIMS[embedding])
        return container, embed_config
```

> **IMPORTANT:** `_EMBED_DIMS["gemini"]` stays `3072`. Embeddings are NOT changed by hybrid mode — the live collection is `songs_gemini_3072` (model `gemini-embedding-2-preview`). Do not touch the existing `dims == 3072` assertions; changing them would force a needless re-index and break vector-space consistency.

- [ ] **Step 4: Add hyde assertion to existing mixed-provider tests**

In `test_providers.py`, in `test_factory_mixes_dj_college_embedding_gemini` and `test_factory_embedding_college_sets_384_dims`, add assertion `assert container.hyde is not None`. Leave all `dims` assertions unchanged (3072 for gemini, 384 for college).

- [ ] **Step 5: Run full test suite**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py -v
```
Expected: all previously passing tests still pass, plus 4 new tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/data-engine/app/providers/llm/factory.py apps/data-engine/app/tests/test_providers.py
git commit -m "feat(factory): add nim provider, _make_hyde, hybrid mode"
```

---

### Task 8: main.py — NIM validation + hyde wiring

**Files:**
- Modify: `apps/data-engine/app/main.py`
- Modify: `apps/data-engine/app/core/config.py` (add LASTFM_API_KEY, MUSIXMATCH_API_KEY here too)

- [ ] **Step 1: Update config.py with enrichment keys**

Add to `Settings.__init__` in `apps/data-engine/app/core/config.py`:

```python
# Song enrichment API keys
self.LASTFM_API_KEY: str = os.environ.get("LASTFM_API_KEY", "")
self.MUSIXMATCH_API_KEY: str = os.environ.get("MUSIXMATCH_API_KEY", "")
```

- [ ] **Step 2: Update `apps/data-engine/app/main.py` lifespan**

Replace the `lifespan` function's validation block and factory call:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    tasks = {
        "embedding": settings.EMBEDDING_PROVIDER,
        "tagging": settings.TAGGING_PROVIDER,
        "dj": settings.DJ_PROVIDER,
        "hyde": settings.HYDE_PROVIDER,
    }
    uses_gemini = any(p == "gemini" for p in tasks.values()) or settings.LLM_PROVIDER == "gemini"
    uses_college = any(p == "college" for p in tasks.values()) or settings.LLM_PROVIDER == "college"
    uses_nim = any(p == "nim" for p in tasks.values()) or settings.LLM_PROVIDER == "hybrid"

    if uses_gemini and not settings.GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY not set but a task uses gemini. Exiting.")
        sys.exit(1)
    if uses_college and not (settings.COLLEGE_USERNAME and settings.COLLEGE_PASSWORD):
        logger.error("COLLEGE_USERNAME/COLLEGE_PASSWORD not set but a task uses college. Exiting.")
        sys.exit(1)
    if uses_nim and not settings.NVIDIA_API_KEY:
        logger.error("NVIDIA_API_KEY not set but a task uses nim. Exiting.")
        sys.exit(1)
    if not os.environ.get("GENIUS_ACCESS_TOKEN"):
        logger.error("GENIUS_ACCESS_TOKEN not set. Exiting.")
        sys.exit(1)

    try:
        llm_container, embed_config = LLMProviderFactory.create(
            settings.LLM_PROVIDER,
            embedding=settings.EMBEDDING_PROVIDER,
            tagging=settings.TAGGING_PROVIDER,
            dj=settings.DJ_PROVIDER,
            hyde=settings.HYDE_PROVIDER,
        )
        vector_store = VectorStoreFactory.create(settings.VECTOR_DB_PROVIDER, embed_config)
        app.state.providers = AppContainer(llm=llm_container, vector_store=vector_store)
        logger.info(
            f"Providers ready — embedding: {settings.EMBEDDING_PROVIDER}, "
            f"tagging: {settings.TAGGING_PROVIDER}, dj: {settings.DJ_PROVIDER}, "
            f"hyde: {settings.HYDE_PROVIDER}, "
            f"VectorDB: {settings.VECTOR_DB_PROVIDER}, "
            f"Collection: {vector_store.collection_name}"
        )
    except ConfigurationError as e:
        logger.error(f"Provider configuration error: {e}")
        sys.exit(1)

    yield
```

- [ ] **Step 3: Update the lifespan test**

The existing `test_lifespan_sets_app_container_on_state` test patches `google.genai.Client` and `chromadb.Client`. After the factory change, the container now requires a `hyde` provider too. With `LLM_PROVIDER=gemini` (default), the `hyde` defaults to `gemini`, so the existing patch is sufficient. Verify the test still passes:

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_lifespan_sets_app_container_on_state -v
```
Expected: PASS (no changes needed to this test)

- [ ] **Step 4: Commit**

```bash
git add apps/data-engine/app/main.py apps/data-engine/app/core/config.py
git commit -m "feat(main): wire hyde provider, add NIM credential validation"
```

---

### Task 9: RagEngine — use HyDEProvider, remove expand_query_hyde from DJProvider

**Files:**
- Modify: `apps/data-engine/app/services/rag.py`
- Modify: `apps/data-engine/app/api/endpoints.py`
- Modify: `apps/data-engine/app/providers/protocols.py`
- Modify: `apps/data-engine/app/providers/llm/gemini/dj.py`
- Modify: `apps/data-engine/app/providers/llm/college/dj.py`
- Modify: `apps/data-engine/app/tests/test_providers.py`

- [ ] **Step 1: Write failing test for RagEngine using HyDEProvider**

Add to `test_providers.py`:

```python
@pytest.mark.asyncio
async def test_rag_engine_query_songs_uses_hyde_provider():
    from unittest.mock import MagicMock
    from app.services.rag import RagEngine
    mock_store = MagicMock()
    mock_store.query_songs.return_value = [{"title": "Song A", "artist": "A1"}]
    mock_embedder = MagicMock()
    mock_dj = MagicMock()
    mock_hyde = MagicMock()
    mock_hyde.expand_query.return_value = "expanded query"
    rag = RagEngine(vector_store=mock_store, embedder=mock_embedder, dj=mock_dj, hyde=mock_hyde)
    result = await rag.query_songs("party vibes", n_results=5, max_distance=0.7)
    mock_hyde.expand_query.assert_called_once_with("party vibes")
    mock_dj.expand_query_hyde.assert_not_called()
    mock_store.query_songs.assert_called_once_with("expanded query", mock_embedder, 5, 0.7)
    assert result == [{"title": "Song A", "artist": "A1"}]
```

- [ ] **Step 2: Run test to verify it fails**

```
cd apps/data-engine && python -m pytest "app/tests/test_providers.py::test_rag_engine_query_songs_uses_hyde_provider" -v
```
Expected: FAIL (RagEngine doesn't accept `hyde` yet)

- [ ] **Step 3: Update `apps/data-engine/app/services/rag.py`**

```python
import asyncio
import logging
from typing import List, Dict, Any
from app.providers.protocols import EmbeddingProvider, DJProvider, HyDEProvider, VectorStore

logger = logging.getLogger(__name__)


class RagEngine:
    def __init__(
        self,
        vector_store: VectorStore,
        embedder: EmbeddingProvider,
        dj: DJProvider,
        hyde: HyDEProvider,
    ):
        self._store = vector_store
        self._embedder = embedder
        self._dj = dj
        self._hyde = hyde

    def add_songs(
        self,
        songs_with_features: List[Dict[str, Any]],
        lyrics_map: Dict[str, str],
    ) -> None:
        self._store.add_songs(songs_with_features, lyrics_map, self._embedder)

    async def query_songs(
        self,
        event_description: str,
        n_results: int = 5,
        max_distance: float = 0.7,
    ) -> List[Dict[str, Any]]:
        expanded_query = await asyncio.to_thread(
            self._hyde.expand_query, event_description
        )
        logger.debug(f"HyDE expanded query: {expanded_query}")
        return await asyncio.to_thread(
            self._store.query_songs,
            expanded_query,
            self._embedder,
            n_results,
            max_distance,
        )
```

- [ ] **Step 4: Update `apps/data-engine/app/api/endpoints.py`**

In the `recommend` handler, update the `RagEngine` construction to pass `hyde`:

```python
rag = RagEngine(
    vector_store=providers.vector_store,
    embedder=providers.llm.embedding,
    dj=providers.llm.dj,
    hyde=providers.llm.hyde,
)
```

- [ ] **Step 5: Update existing RagEngine test** (`test_rag_engine_query_songs_expands_then_queries`)

Replace the old test with one that passes a `mock_hyde`:

```python
@pytest.mark.asyncio
async def test_rag_engine_query_songs_expands_then_queries():
    from unittest.mock import MagicMock
    from app.services.rag import RagEngine
    mock_store = MagicMock()
    mock_store.query_songs.return_value = [{"title": "Song A", "artist": "A1"}]
    mock_embedder = MagicMock()
    mock_dj = MagicMock()
    mock_hyde = MagicMock()
    mock_hyde.expand_query.return_value = "expanded query"
    rag = RagEngine(vector_store=mock_store, embedder=mock_embedder, dj=mock_dj, hyde=mock_hyde)
    result = await rag.query_songs("party vibes", n_results=5, max_distance=0.7)
    mock_hyde.expand_query.assert_called_once_with("party vibes")
    mock_store.query_songs.assert_called_once_with("expanded query", mock_embedder, 5, 0.7)
    assert result == [{"title": "Song A", "artist": "A1"}]
```

Also update `test_rag_engine_add_songs_delegates_to_vector_store`:

```python
def test_rag_engine_add_songs_delegates_to_vector_store():
    from unittest.mock import MagicMock
    from app.services.rag import RagEngine
    mock_store = MagicMock()
    mock_embedder = MagicMock()
    mock_dj = MagicMock()
    mock_hyde = MagicMock()
    rag = RagEngine(vector_store=mock_store, embedder=mock_embedder, dj=mock_dj, hyde=mock_hyde)
    songs = [{"title": "T", "artist": "A"}]
    lyrics = {"T": "lyrics"}
    rag.add_songs(songs, lyrics)
    mock_store.add_songs.assert_called_once_with(songs, lyrics, mock_embedder)
```

- [ ] **Step 6: Remove `expand_query_hyde` from DJProvider protocol and implementations**

In `apps/data-engine/app/providers/protocols.py`, remove the `expand_query_hyde` method from `DJProvider`:

```python
@runtime_checkable
class DJProvider(Protocol):
    def generate_playlist(
        self,
        event_description: str,
        context_songs: List[dict],
        count: int,
        rejected: List[str],
    ) -> List[dict]: ...
```

In `apps/data-engine/app/providers/llm/gemini/dj.py`, delete the `expand_query_hyde` method entirely.

In `apps/data-engine/app/providers/llm/college/dj.py`, delete the `expand_query_hyde` method entirely.

- [ ] **Step 7: Remove stale HyDE tests from DJProvider section**

Delete these four tests from `test_providers.py` (they tested DJProvider.expand_query_hyde, now moved to HyDE providers):
- `test_gemini_dj_provider_expand_query_hyde`
- `test_gemini_dj_provider_hyde_falls_back_on_error`
- `test_college_dj_provider_hyde_falls_back_on_error`

- [ ] **Step 8: Run full test suite**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py -v
```
Expected: all tests pass

- [ ] **Step 9: Commit**

```bash
git add apps/data-engine/app/services/rag.py apps/data-engine/app/api/endpoints.py apps/data-engine/app/providers/protocols.py apps/data-engine/app/providers/llm/gemini/dj.py apps/data-engine/app/providers/llm/college/dj.py apps/data-engine/app/tests/test_providers.py
git commit -m "feat(rag): wire HyDEProvider into RagEngine, remove from DJProvider"
```

---

## Phase B — Song Enrichment Pipeline

---

### Task 10: EnrichedSong model + spotify_genres on Track

**Files:**
- Modify: `apps/data-engine/app/models/song.py`

- [ ] **Step 1: Write failing test**

Add to `test_providers.py`:

```python
def test_track_has_spotify_genres_field():
    from app.models.song import Track
    t = Track(title="Song A", artist="Artist X", spotify_genres=["K-pop", "pop"])
    assert t.spotify_genres == ["K-pop", "pop"]


def test_track_accepts_artistGenres_alias_from_nestjs():
    # NestJS sends camelCase `artistGenres`; the model must map it to spotify_genres.
    from app.models.song import Track
    t = Track(**{"title": "Song A", "artist": "Artist X", "artistGenres": ["K-pop"]})
    assert t.spotify_genres == ["K-pop"]


def test_track_spotify_genres_defaults_empty():
    from app.models.song import Track
    t = Track(title="Song A", artist="Artist X")
    assert t.spotify_genres == []


def test_enriched_song_model_fields():
    from app.models.song import EnrichedSong
    s = EnrichedSong(
        track_id="abc123",
        title="Song A",
        artist="Artist X",
        spotify_genres=["K-pop"],
        lastfm_tags=["melancholic", "female vocalist"],
        lyrics_snippet="I walk this empty street",
        lyrics_source="genius",
    )
    assert s.track_id == "abc123"
    assert s.lastfm_tags == ["melancholic", "female vocalist"]
    assert s.lyrics_source == "genius"


def test_enriched_song_optional_fields_default_none():
    from app.models.song import EnrichedSong
    s = EnrichedSong(track_id="abc", title="T", artist="A")
    assert s.lyrics_snippet is None
    assert s.lyrics_source is None
    assert s.lastfm_tags == []
    assert s.spotify_genres == []
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_track_has_spotify_genres_field app/tests/test_providers.py::test_track_spotify_genres_defaults_empty app/tests/test_providers.py::test_enriched_song_model_fields app/tests/test_providers.py::test_enriched_song_optional_fields_default_none -v
```
Expected: all FAIL

- [ ] **Step 3: Update `apps/data-engine/app/models/song.py`**

```python
from pydantic import BaseModel, ConfigDict, Field
from typing import List, Optional, Literal


class AudioFeatures(BaseModel):
    energy_desc: str = Field(..., description="Description of the song's energy level")
    mood_desc: str = Field(..., description="Description of the song's mood")
    vibe_tags: List[str] = Field(default_factory=list, description="List of descriptive vibe tags")
    embedding_text: Optional[str] = Field(None, description="The combined text used for vector embedding")


class Track(BaseModel):
    # populate_by_name lets us accept BOTH the camelCase `artistGenres` payload
    # from NestJS and the snake_case `spotify_genres` field name internally.
    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(..., example="Levitating")
    artist: str = Field(..., example="Dua Lipa")
    spotify_genres: List[str] = Field(
        default_factory=list, alias="artistGenres", description="Artist genres from Spotify"
    )


class Song(Track, AudioFeatures):
    pass


class EnrichedSong(BaseModel):
    track_id: str
    title: str
    artist: str
    spotify_genres: List[str] = Field(default_factory=list)
    lastfm_tags: List[str] = Field(default_factory=list)
    lyrics_snippet: Optional[str] = None
    lyrics_source: Optional[Literal["genius", "musixmatch"]] = None
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_track_has_spotify_genres_field app/tests/test_providers.py::test_track_spotify_genres_defaults_empty app/tests/test_providers.py::test_enriched_song_model_fields app/tests/test_providers.py::test_enriched_song_optional_fields_default_none -v
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add apps/data-engine/app/models/song.py apps/data-engine/app/tests/test_providers.py
git commit -m "feat(models): add EnrichedSong, spotify_genres on Track"
```

---

### Task 11: Last.fm enrichment service

**Files:**
- Create: `apps/data-engine/app/services/lastfm.py`
- Modify: `apps/data-engine/app/tests/test_providers.py`

- [ ] **Step 1: Write failing tests**

Add to `test_providers.py`:

```python
def test_lastfm_fetch_tags_returns_top_8():
    from unittest.mock import patch, MagicMock
    import json
    tags = [{"name": f"tag{i}", "count": 100 - i} for i in range(12)]
    api_response = {"toptags": {"tag": tags}}

    with patch("app.services.lastfm._request_json", return_value=api_response):
        from app.services.lastfm import fetch_lastfm_tags
        result = fetch_lastfm_tags("Gangnam Style", "PSY")
    assert len(result) == 8
    assert result[0] == "tag0"


def test_lastfm_fetch_tags_returns_empty_on_failure():
    from unittest.mock import patch
    with patch("app.services.lastfm._request_json", side_effect=Exception("timeout")):
        from app.services.lastfm import fetch_lastfm_tags
        result = fetch_lastfm_tags("Song", "Artist")
    assert result == []


def test_lastfm_fetch_tags_returns_empty_when_no_api_key():
    from unittest.mock import patch
    from app.services import lastfm
    # settings is a cached singleton; patch the attribute the function actually reads.
    with patch.object(lastfm.settings, "LASTFM_API_KEY", ""):
        result = lastfm.fetch_lastfm_tags("Song", "Artist")
    assert result == []
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_lastfm_fetch_tags_returns_top_8 app/tests/test_providers.py::test_lastfm_fetch_tags_returns_empty_on_failure app/tests/test_providers.py::test_lastfm_fetch_tags_returns_empty_when_no_api_key -v
```
Expected: all FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Create `apps/data-engine/app/services/lastfm.py`**

```python
import json
import logging
from typing import Any, Dict, List
from urllib import parse, request, error
from app.core.config import settings

logger = logging.getLogger(__name__)

_BASE_URL = "https://ws.audioscrobbler.com/2.0/"
_MAX_TAGS = 8


def _request_json(url: str) -> Dict[str, Any]:
    req = request.Request(url, method="GET")
    try:
        with request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except (error.URLError, error.HTTPError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Last.fm request failed: {exc}") from exc


def fetch_lastfm_tags(title: str, artist: str) -> List[str]:
    if not settings.LASTFM_API_KEY:
        return []
    params = parse.urlencode({
        "method": "track.getTopTags",
        "artist": artist,
        "track": title,
        "api_key": settings.LASTFM_API_KEY,
        "format": "json",
        "autocorrect": 1,
    })
    try:
        data = _request_json(f"{_BASE_URL}?{params}")
        tags = data.get("toptags", {}).get("tag", [])
        return [t["name"] for t in tags[:_MAX_TAGS] if isinstance(t, dict) and t.get("name")]
    except Exception as exc:
        logger.warning(f"Last.fm tag fetch failed for '{title}' by '{artist}': {exc}")
        return []
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_lastfm_fetch_tags_returns_top_8 app/tests/test_providers.py::test_lastfm_fetch_tags_returns_empty_on_failure app/tests/test_providers.py::test_lastfm_fetch_tags_returns_empty_when_no_api_key -v
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add apps/data-engine/app/services/lastfm.py apps/data-engine/app/tests/test_providers.py
git commit -m "feat(enrichment): add Last.fm community tag fetcher"
```

---

### Task 12: Musixmatch lyrics fallback

**Files:**
- Modify: `apps/data-engine/app/services/lyrics.py`
- Modify: `apps/data-engine/app/tests/test_providers.py`

Musixmatch's free API returns the first 30% of lyrics. That is sufficient for embedding.

- [ ] **Step 1: Write failing tests**

Add to `test_providers.py`:

```python
def test_musixmatch_fetch_returns_snippet_on_success():
    from unittest.mock import patch
    api_response = {
        "message": {
            "header": {"status_code": 200},
            "body": {
                "lyrics": {"lyrics_body": "I walk this empty street\nOn the boulevard of broken dreams"}
            }
        }
    }
    with patch("app.services.lyrics._request_json", return_value=api_response):
        from app.services.lyrics import fetch_musixmatch_lyrics
        result = fetch_musixmatch_lyrics("Boulevard of Broken Dreams", "Green Day")
    assert result == "I walk this empty street\nOn the boulevard of broken dreams"


def test_musixmatch_returns_none_on_failure():
    from unittest.mock import patch
    with patch("app.services.lyrics._request_json", side_effect=Exception("timeout")):
        from app.services.lyrics import fetch_musixmatch_lyrics
        result = fetch_musixmatch_lyrics("Song", "Artist")
    assert result is None


def test_fetch_lyrics_for_song_falls_back_to_musixmatch():
    from unittest.mock import patch
    with patch("app.services.lyrics.search_song_on_genius", return_value=None), \
         patch("app.services.lyrics.fetch_musixmatch_lyrics", return_value="some lyrics") as mock_mx:
        from app.services.lyrics import fetch_lyrics_for_song
        result = fetch_lyrics_for_song("Song", "Artist")
    mock_mx.assert_called_once_with("Song", "Artist")
    assert result["found"] is True
    assert result["lyrics"] == "some lyrics"
    assert result["lyrics_source"] == "musixmatch"
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_musixmatch_fetch_returns_snippet_on_success app/tests/test_providers.py::test_musixmatch_returns_none_on_failure app/tests/test_providers.py::test_fetch_lyrics_for_song_falls_back_to_musixmatch -v
```
Expected: all FAIL

- [ ] **Step 3: Add Musixmatch to `apps/data-engine/app/services/lyrics.py`**

Add after the existing imports and constants, before `GeniusLyricsParser`:

```python
MUSIXMATCH_API_BASE_URL = "https://api.musixmatch.com/ws/1.1"
```

Add this new function before `fetch_lyrics_for_song`:

```python
def fetch_musixmatch_lyrics(title: str, artist: str) -> Optional[str]:
    api_key = os.environ.get("MUSIXMATCH_API_KEY", "")
    if not api_key:
        return None
    params = parse.urlencode({
        "q_track": title,
        "q_artist": artist,
        "apikey": api_key,
        "format": "json",
    })
    try:
        data = _request_json(f"{MUSIXMATCH_API_BASE_URL}/matcher.lyrics.get?{params}")
        message = data.get("message", {})
        if message.get("header", {}).get("status_code") != 200:
            return None
        return message.get("body", {}).get("lyrics", {}).get("lyrics_body") or None
    except Exception as exc:
        logger.warning(f"Musixmatch failed for '{title}' by '{artist}': {exc}")
        return None
```

Update `fetch_lyrics_for_song` to try Musixmatch when Genius returns nothing:

```python
def fetch_lyrics_for_song(title: str, artist: str) -> Dict[str, Any]:
    song = search_song_on_genius(title, artist)
    if song:
        html = _request_text(song["url"])
        lyrics = cleanup_lyrics(extract_lyrics_from_html(html))
        if lyrics:
            return {
                "title": title,
                "artist": artist,
                "found": True,
                "genius_url": song["url"],
                "lyrics": lyrics,
                "lyrics_source": "genius",
            }

    # Genius miss — try Musixmatch
    mx_lyrics = fetch_musixmatch_lyrics(title, artist)
    if mx_lyrics:
        return {
            "title": title,
            "artist": artist,
            "found": True,
            "lyrics": mx_lyrics,
            "lyrics_source": "musixmatch",
        }

    return {"title": title, "artist": artist, "found": False, "lyrics": "", "lyrics_source": None}
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_musixmatch_fetch_returns_snippet_on_success app/tests/test_providers.py::test_musixmatch_returns_none_on_failure app/tests/test_providers.py::test_fetch_lyrics_for_song_falls_back_to_musixmatch -v
```
Expected: all PASS

- [ ] **Step 5: Run full suite to confirm no regressions**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py -v
```
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add apps/data-engine/app/services/lyrics.py apps/data-engine/app/tests/test_providers.py
git commit -m "feat(lyrics): add Musixmatch fallback after Genius miss"
```

---

### Task 13: enrichment.py orchestrator

**Files:**
- Create: `apps/data-engine/app/services/enrichment.py`
- Modify: `apps/data-engine/app/tests/test_providers.py`

- [ ] **Step 1: Write failing tests**

Add to `test_providers.py`:

```python
def test_enrich_song_collects_all_signals():
    from unittest.mock import patch
    from app.services.enrichment import enrich_song
    song = {"track_id": "t1", "title": "FAKE LOVE", "artist": "BTS", "spotify_genres": ["K-pop", "pop"]}
    with patch("app.services.enrichment.fetch_lyrics_for_song",
               return_value={"found": True, "lyrics": "I was sad", "lyrics_source": "genius"}), \
         patch("app.services.enrichment.fetch_lastfm_tags", return_value=["K-pop", "melancholic"]):
        result = enrich_song(song)
    assert result.track_id == "t1"
    assert result.spotify_genres == ["K-pop", "pop"]
    assert result.lastfm_tags == ["K-pop", "melancholic"]
    assert result.lyrics_snippet == "I was sad"
    assert result.lyrics_source == "genius"


def test_enrich_song_graceful_on_all_failures():
    from unittest.mock import patch
    from app.services.enrichment import enrich_song
    song = {"track_id": "t2", "title": "Unknown Song", "artist": "Unknown Artist"}
    with patch("app.services.enrichment.fetch_lyrics_for_song",
               return_value={"found": False, "lyrics": "", "lyrics_source": None}), \
         patch("app.services.enrichment.fetch_lastfm_tags", return_value=[]):
        result = enrich_song(song)
    assert result.lyrics_snippet is None
    assert result.lastfm_tags == []
    assert result.spotify_genres == []
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_enrich_song_collects_all_signals app/tests/test_providers.py::test_enrich_song_graceful_on_all_failures -v
```
Expected: both FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Create `apps/data-engine/app/services/enrichment.py`**

```python
import logging
from app.models.song import EnrichedSong
from app.services.lyrics import fetch_lyrics_for_song
from app.services.lastfm import fetch_lastfm_tags

logger = logging.getLogger(__name__)

_LYRICS_SNIPPET_MAX_CHARS = 800


def enrich_song(song: dict) -> EnrichedSong:
    title = song.get("title", "")
    artist = song.get("artist", "")
    track_id = song.get("track_id", f"{title}-{artist}")

    lyrics_result = fetch_lyrics_for_song(title, artist)
    raw_lyrics = lyrics_result.get("lyrics") or ""
    lyrics_snippet = raw_lyrics[:_LYRICS_SNIPPET_MAX_CHARS] if raw_lyrics else None
    lyrics_source = lyrics_result.get("lyrics_source") if lyrics_result.get("found") else None

    lastfm_tags = fetch_lastfm_tags(title, artist)

    return EnrichedSong(
        track_id=track_id,
        title=title,
        artist=artist,
        spotify_genres=song.get("spotify_genres", []),
        lastfm_tags=lastfm_tags,
        lyrics_snippet=lyrics_snippet,
        lyrics_source=lyrics_source,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_enrich_song_collects_all_signals app/tests/test_providers.py::test_enrich_song_graceful_on_all_failures -v
```
Expected: both PASS

- [ ] **Step 5: Commit**

```bash
git add apps/data-engine/app/services/enrichment.py apps/data-engine/app/tests/test_providers.py
git commit -m "feat(enrichment): add enrich_song orchestrator (lyrics + Last.fm)"
```

---

### Task 14: Wire enrichment into endpoint + update tagging prompt

**Files:**
- Modify: `apps/data-engine/app/api/endpoints.py`
- Modify: `apps/data-engine/app/prompts/audio_features_prompt.txt`

This task has no unit test (it is endpoint wiring). The change is straightforward: before calling `tagging.tag_songs(input_songs)`, run each song through `enrich_song` and pass the enriched context.

- [ ] **Step 1: Update `apps/data-engine/app/api/endpoints.py`**

Add the import at the top of the file:

```python
from app.services.enrichment import enrich_song
```

In the `recommend` handler, replace the block that builds `input_songs` and calls `tag_songs`:

```python
# Before tagging: enrich each song with lyrics, Last.fm tags, and Spotify genres.
# Track has no track_id field, so derive a stable id from title+artist.
raw_songs = [
    {"track_id": f"{s.title}-{s.artist}",
     "title": s.title,
     "artist": s.artist,
     "spotify_genres": s.spotify_genres}
    for s in request.songs
]
logger.info(f"Enriching {len(raw_songs)} songs...")
# enrich_song does blocking HTTP (Genius/Musixmatch/Last.fm). Run each in a worker
# thread and fan out concurrently so we don't block the event loop or serialize I/O.
enriched_songs = await asyncio.gather(
    *(asyncio.to_thread(enrich_song, s) for s in raw_songs)
)
logger.info(f"Enrichment complete — {sum(1 for e in enriched_songs if e.lyrics_snippet)} with lyrics")

input_songs = [
    {
        "title": e.title,
        "artist": e.artist,
        "spotify_genres": e.spotify_genres,
        "lastfm_tags": e.lastfm_tags,
        "lyrics_snippet": e.lyrics_snippet,
    }
    for e in enriched_songs
]

logger.info(f"Tagging {len(input_songs)} songs...")
songs_with_features = await asyncio.to_thread(
    providers.llm.tagging.tag_songs, input_songs
)
```

Also, the `lyrics_map` build for `rag.add_songs` should use the enriched lyrics:

```python
lyrics_map = {e.title: e.lyrics_snippet or "" for e in enriched_songs}
```

Remove the separate `lyrics.fetch_lyrics_map` call (enrichment already fetched lyrics).

- [ ] **Step 2: Update `apps/data-engine/app/prompts/audio_features_prompt.txt`**

Replace the `**Input Data:**` section:

```
**Input Data:**
{songs_list}

Each song entry may include:
- `spotify_genres`: Official Spotify artist genres (authoritative signal for genre classification)
- `lastfm_tags`: Community-generated tags from Last.fm (use for mood, era, regional style)
- `lyrics_snippet`: A short excerpt of lyrics (use for mood, language, thematic content)

Use whichever signals are present. If a field is null or empty, rely on your musicological knowledge of the artist and title.
```

- [ ] **Step 3: Run full test suite to confirm nothing is broken**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py -v
```
Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/data-engine/app/api/endpoints.py apps/data-engine/app/prompts/audio_features_prompt.txt
git commit -m "feat(enrichment): wire enrich_song into /recommend before tagging"
```

---

## Phase C — NestJS Artist Genres + Wildcard Anchor Strategy

---

### Task 15: NestJS — fetch artist genres, update SimplifiedTrack

**Files:**
- Modify: `apps/orchestrator/src/modules/spotify/spotify.types.ts`
- Modify: `apps/orchestrator/src/modules/spotify/spotify.service.ts`
- Modify: `apps/orchestrator/src/modules/playlist/playlist.service.ts`

There are no unit tests for the NestJS layer in this codebase. Verify via TypeScript compilation.

- [ ] **Step 1: Update `spotify.types.ts` — add artistGenres to SimplifiedTrack**

```typescript
export interface SimplifiedTrack {
  title: string;
  artist: string;
  artistId: string;
  artistGenres: string[];
}
```

- [ ] **Step 2: Add `getArtistsBatch` to `spotify.service.ts`**

Add this method to `SpotifyService` class:

```typescript
getArtistsBatch = async (accessToken: string, artistIds: string[]): Promise<Map<string, string[]>> => {
  if (!artistIds.length) return new Map();
  // Spotify allows up to 50 artist IDs per request
  const chunks: string[][] = [];
  for (let i = 0; i < artistIds.length; i += 50) {
    chunks.push(artistIds.slice(i, i + 50));
  }
  const genreMap = new Map<string, string[]>();
  for (const chunk of chunks) {
    const ids = chunk.join(',');
    const data = await this.spotifyRequest<{ artists: SpotifyArtist[] }>(
      accessToken,
      'get',
      `/artists?ids=${ids}`,
    );
    for (const artist of data.artists) {
      genreMap.set(artist.id, artist.genres ?? []);
    }
  }
  return genreMap;
};
```

- [ ] **Step 3: Update `getTopTracks` to expose `artistId`**

Replace the current `getTopTracks` implementation:

```typescript
getTopTracks = async (accessToken: string, limit: number = 50): Promise<SimplifiedTrack[]> => {
  this.logger.log(`Fetching user's top ${limit} tracks`);
  const data = await this.spotifyRequest<SpotifyTopTracksResponse>(
    accessToken,
    'get',
    `/me/top/tracks?limit=${limit}`,
  );
  return data.items.map((track) => ({
    title: track.name,
    artist: track.artists[0]?.name || '',
    artistId: track.artists[0]?.id || '',
    artistGenres: [],  // filled in by caller after getArtistsBatch
  }));
};
```

- [ ] **Step 4: Update `playlist.service.ts` — fetch genres before calling data-engine**

In `generatePlaylist`, between `getTopTracks` and `getRecommendations`:

```typescript
this.logger.log("[generatePlaylist] Fetching artist genres...");
const artistIds = [...new Set(topTracks.map((t) => t.artistId).filter(Boolean))];
const genreMap = await this.spotifyService.getArtistsBatch(accessToken, artistIds);
const tracksWithGenres = topTracks.map((t) => ({
  ...t,
  artistGenres: genreMap.get(t.artistId) ?? [],
}));
this.logger.log(`[generatePlaylist] Got genres for ${genreMap.size} artists`);

this.logger.log("[generatePlaylist] Calling data-engine /recommend...");
const songs = await this.dataEngineService.getRecommendations(
  dto.eventDescription,
  tracksWithGenres,
);
```

- [ ] **Step 5: Verify TypeScript compiles**

```
cd apps/orchestrator && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/orchestrator/src/modules/spotify/spotify.types.ts apps/orchestrator/src/modules/spotify/spotify.service.ts apps/orchestrator/src/modules/playlist/playlist.service.ts
git commit -m "feat(orchestrator): fetch artist genres via /artists batch before /recommend"
```

---

### Task 16: DJProvider.generate_playlist adds anchor_artists + prompt + both implementations

**Files:**
- Modify: `apps/data-engine/app/providers/protocols.py`
- Modify: `apps/data-engine/app/providers/llm/gemini/dj.py`
- Modify: `apps/data-engine/app/providers/llm/college/dj.py`
- Modify: `apps/data-engine/app/prompts/playlist_generation_prompt.txt`
- Modify: `apps/data-engine/app/tests/test_providers.py`

- [ ] **Step 1: Write failing test**

Add to `test_providers.py`:

```python
def test_college_dj_provider_passes_anchor_artists_in_prompt():
    from unittest.mock import patch, MagicMock
    import json
    playlist = [{"title": "T1", "artist": "A1", "source": "new_suggestion"}]
    captured_payload = {}
    def fake_post(url, json=None, **kwargs):
        captured_payload.update(json or {})
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"choices": [{"message": {"content": json_module.dumps(playlist)}}]}
        return mock_resp

    import json as json_module
    with patch("httpx.Client") as mock_cls:
        mock_http = MagicMock()
        mock_cls.return_value.__enter__.return_value = mock_http
        mock_http.post.side_effect = fake_post
        from app.providers.llm.college.dj import CollegeDJProvider
        provider = CollegeDJProvider()
        provider.generate_playlist("party", [], 5, [], anchor_artists=["BTS", "BLACKPINK"])

    prompt_sent = captured_payload["messages"][0]["content"]
    assert "BTS" in prompt_sent
    assert "BLACKPINK" in prompt_sent
```

- [ ] **Step 2: Run test to verify it fails**

```
cd apps/data-engine && python -m pytest "app/tests/test_providers.py::test_college_dj_provider_passes_anchor_artists_in_prompt" -v
```
Expected: FAIL (signature mismatch)

- [ ] **Step 3: Update DJProvider protocol in `protocols.py`**

```python
@runtime_checkable
class DJProvider(Protocol):
    def generate_playlist(
        self,
        event_description: str,
        context_songs: List[dict],
        count: int,
        rejected: List[str],
        anchor_artists: List[str],
    ) -> List[dict]: ...
```

- [ ] **Step 4: Update `apps/data-engine/app/prompts/playlist_generation_prompt.txt`**

```
I need a playlist for a specific event. I have performed a semantic search on the user's library and retrieved relevant songs.

**The Event:**
"{event_description}"

**Artist Space (from group's listening history — anchor wildcard suggestions to these artists and similar ones):**
{anchor_artist_list}

**User's Matching Library (Context):**
{context_str}

**Rejected Songs to Avoid:**
{rejected_str}

**Instructions:**
1. Generate exactly **{count}** NEW songs that perfectly fit the vibe.
2. DO NOT include any songs from the "User's Matching Library (Context)".
3. DO NOT include any songs from the "Rejected Songs to Avoid".
4. Wildcard suggestions MUST be by artists similar to those in the "Artist Space" list above, or by the same artists. Do not default to mainstream Western artists if the group's taste is clearly in a different genre.
5. Ensure the songs are real and exist on Spotify.

RETURN ONLY A RAW JSON LIST.

**Required Output Schema (JSON):**
[
  {
    "title": "Song Name",
    "artist": "Artist Name",
    "source": "new_suggestion"
  }
]
```

- [ ] **Step 5: Update `CollegeDJProvider.generate_playlist`**

Replace the `generate_playlist` method in `apps/data-engine/app/providers/llm/college/dj.py`:

```python
def generate_playlist(
    self,
    event_description: str,
    context_songs: List[dict],
    count: int,
    rejected: List[str],
    anchor_artists: List[str] = None,
) -> List[dict]:
    if rejected is None:
        rejected = []
    if anchor_artists is None:
        anchor_artists = []
    prompt_template = _load_prompt("playlist_generation_prompt.txt")
    context_str = json.dumps(
        [{k: v for k, v in s.items() if k in ("title", "artist", "vibe_tags", "energy_desc", "mood_desc")}
         for s in context_songs],
        indent=2,
    )
    rejected_str = json.dumps(rejected, indent=2) if rejected else "None"
    anchor_str = ", ".join(anchor_artists) if anchor_artists else "Not specified"
    prompt = (
        prompt_template
        .replace("{event_description}", event_description)
        .replace("{anchor_artist_list}", anchor_str)
        .replace("{context_str}", context_str)
        .replace("{rejected_str}", rejected_str)
        .replace("{count}", str(count))
    )
    try:
        with httpx.Client(
            auth=(settings.COLLEGE_USERNAME, settings.COLLEGE_PASSWORD),
            timeout=60.0,
        ) as client:
            response = client.post(
                f"{settings.COLLEGE_BASE_URL}/v1/chat/completions",
                json={"model": "gpt-oss-120b", "messages": [{"role": "user", "content": prompt}]},
            )
            response.raise_for_status()
            return json.loads(response.json()["choices"][0]["message"]["content"])
    except Exception as e:
        logger.error(f"College generate_playlist failed: {e}")
        raise GenerationError(str(e)) from e
```

- [ ] **Step 6: Update `GeminiDJProvider.generate_playlist`**

Replace the `generate_playlist` method in `apps/data-engine/app/providers/llm/gemini/dj.py`:

```python
@with_resilience
def generate_playlist(
    self,
    event_description: str,
    context_songs: List[dict],
    count: int,
    rejected: List[str],
    anchor_artists: List[str] = None,
) -> List[dict]:
    if rejected is None:
        rejected = []
    if anchor_artists is None:
        anchor_artists = []
    prompt_template = _load_prompt("playlist_generation_prompt.txt")
    context_str = json.dumps(
        [{k: v for k, v in s.items() if k in ("title", "artist", "vibe_tags", "energy_desc", "mood_desc")}
         for s in context_songs],
        indent=2,
    )
    rejected_str = json.dumps(rejected, indent=2) if rejected else "None"
    anchor_str = ", ".join(anchor_artists) if anchor_artists else "Not specified"
    prompt = (
        prompt_template
        .replace("{event_description}", event_description)
        .replace("{anchor_artist_list}", anchor_str)
        .replace("{context_str}", context_str)
        .replace("{rejected_str}", rejected_str)
        .replace("{count}", str(count))
    )
    try:
        response = self._client.models.generate_content(
            model=settings.PLAYLIST_GENERATION_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        return json.loads(response.text)
    except Exception as e:
        logger.error(f"Gemini generate_playlist failed: {e}")
        raise GenerationError(str(e)) from e
```

- [ ] **Step 7: Fix existing generate_playlist tests** — add `anchor_artists=[]` to all calls

In `test_providers.py`, update:
- `test_gemini_dj_provider_generate_playlist`: change `provider.generate_playlist("party", [], 5, [])` → `provider.generate_playlist("party", [], 5, [], anchor_artists=[])`
- `test_college_dj_provider_generate_playlist`: same change

- [ ] **Step 8: Run full test suite**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py -v
```
Expected: all pass

- [ ] **Step 9: Commit**

```bash
git add apps/data-engine/app/providers/protocols.py apps/data-engine/app/providers/llm/gemini/dj.py apps/data-engine/app/providers/llm/college/dj.py apps/data-engine/app/prompts/playlist_generation_prompt.txt apps/data-engine/app/tests/test_providers.py
git commit -m "feat(dj): add anchor_artists param to generate_playlist and prompt"
```

---

### Task 17: PlaylistState + PlaylistGraphBuilder anchor_artists

**Files:**
- Modify: `apps/data-engine/app/models/state.py`
- Modify: `apps/data-engine/app/workflows/playlist_generator.py`

- [ ] **Step 1: Write failing test**

Add to `test_providers.py`:

```python
@pytest.mark.asyncio
async def test_playlist_graph_builder_passes_anchor_artists_to_llm():
    from unittest.mock import MagicMock, AsyncMock
    from app.workflows.playlist_generator import PlaylistGraphBuilder

    captured_anchor_artists = []

    async def fake_llm_gen(event_desc, count, rejected, context, anchor_artists):
        captured_anchor_artists.extend(anchor_artists)
        return [{"title": "T1", "artist": "A1", "source": "new_suggestion"}]

    db_songs = [
        {"title": "Song A", "artist": "BTS", "source": "user_library"},
        {"title": "Song B", "artist": "BLACKPINK", "source": "user_library"},
        {"title": "Song C", "artist": "BTS", "source": "user_library"},
    ]

    async def fake_db_fetch(query):
        return db_songs

    async def fake_validator(song):
        return True

    builder = PlaylistGraphBuilder(
        llm_generator=fake_llm_gen,
        db_fetcher=fake_db_fetch,
        uri_validator=fake_validator,
        target_wildcards=1,
        max_attempts=1,
    )
    workflow = builder.build()
    await workflow.ainvoke({"event_description": "K-pop night"})

    assert "BTS" in captured_anchor_artists
    assert "BLACKPINK" in captured_anchor_artists
    # Deduplicated: BTS appears twice in db_songs but once in anchor list
    assert captured_anchor_artists.count("BTS") == 1
```

- [ ] **Step 2: Run test to verify it fails**

```
cd apps/data-engine && python -m pytest "app/tests/test_providers.py::test_playlist_graph_builder_passes_anchor_artists_to_llm" -v
```
Expected: FAIL (signature mismatch on `llm_generator`)

- [ ] **Step 3: Update `apps/data-engine/app/models/state.py`**

```python
from pydantic import BaseModel, Field
from typing import List, Dict, Any

class PlaylistState(BaseModel):
    event_description: str = Field(..., description="The user's description of the event")
    db_songs: List[Dict[str, Any]] = Field(default_factory=list)
    anchor_artists: List[str] = Field(default_factory=list, description="Deduplicated artist list from db_songs for wildcard anchoring")
    candidate_wildcards: List[Dict[str, Any]] = Field(default_factory=list)
    validated_wildcards: List[Dict[str, Any]] = Field(default_factory=list)
    rejected_wildcards: List[str] = Field(default_factory=list)
    attempts: int = Field(default=0)
    final_playlist: List[Dict[str, Any]] = Field(default_factory=list)
```

- [ ] **Step 4: Update `apps/data-engine/app/workflows/playlist_generator.py`**

Change the `llm_generator` type annotation in `__init__`:

```python
llm_generator: Callable[[str, int, List[str], List[Dict[str, Any]], List[str]], Awaitable[List[Dict[str, Any]]]]
```
(signature: `event_description, count, rejected, context, anchor_artists`)

Update `initial_fetch`:

```python
async def initial_fetch(self, state: PlaylistState) -> Dict[str, Any]:
    logger.info(f"Starting initial fetch for event: {state.event_description}")
    db_songs = await self.db_fetcher(state.event_description)
    anchor_artists = list({s["artist"] for s in db_songs if s.get("artist")})
    candidate_wildcards = await self.llm_generator(
        state.event_description,
        self.target_wildcards,
        [],
        db_songs,
        anchor_artists,
    )
    return {
        "db_songs": db_songs,
        "anchor_artists": anchor_artists,
        "candidate_wildcards": candidate_wildcards,
        "attempts": 1,
    }
```

Update `regenerate`:

```python
async def regenerate(self, state: PlaylistState) -> Dict[str, Any]:
    missing = self.target_wildcards - len(state.validated_wildcards)
    logger.info(f"Regenerating {missing} missing wildcards (Attempt {state.attempts + 1})")
    new_candidates = await self.llm_generator(
        state.event_description,
        missing,
        state.rejected_wildcards,
        state.db_songs,
        state.anchor_artists,
    )
    return {
        "candidate_wildcards": new_candidates,
        "attempts": state.attempts + 1,
    }
```

- [ ] **Step 5: Run the new test**

```
cd apps/data-engine && python -m pytest "app/tests/test_providers.py::test_playlist_graph_builder_passes_anchor_artists_to_llm" -v
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/data-engine/app/models/state.py apps/data-engine/app/workflows/playlist_generator.py apps/data-engine/app/tests/test_providers.py
git commit -m "feat(workflow): thread anchor_artists through PlaylistState and graph builder"
```

---

### Task 18: Endpoint wiring — llm_gen_wrapper gets anchor_artists

**Files:**
- Modify: `apps/data-engine/app/api/endpoints.py`

- [ ] **Step 1: Update `llm_gen_wrapper` in `apps/data-engine/app/api/endpoints.py`**

The `llm_gen_wrapper` now needs to accept and forward `anchor_artists`:

```python
async def llm_gen_wrapper(prompt: str, count: int, rejected: List[str], context: List[dict], anchor_artists: List[str]):
    return await asyncio.to_thread(
        providers.llm.dj.generate_playlist, prompt, context, count, rejected, anchor_artists
    )
```

- [ ] **Step 2: Run full test suite**

```
cd apps/data-engine && python -m pytest app/tests/test_providers.py -v
```
Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add apps/data-engine/app/api/endpoints.py
git commit -m "feat(endpoint): forward anchor_artists from graph builder to generate_playlist"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| Hybrid mode: Gemini embedding (unchanged, 3072-dim) | Task 7 `_HYBRID_DEFAULTS`; `_EMBED_DIMS["gemini"]` stays 3072 — embedding model/collection untouched |
| Hybrid mode: NIM tagging (batched 15 songs) | Task 5 |
| Hybrid mode: NIM HyDE | Task 6 |
| Hybrid mode: College DJ | Task 7 |
| HyDE as standalone `HyDEProvider` protocol | Task 2 |
| `LLMProviderContainer.hyde` field | Task 2 |
| `RagEngine` uses `HyDEProvider.expand_query` | Task 9 |
| Remove `expand_query_hyde` from `DJProvider` | Task 9 |
| Lyrics fallback: Musixmatch | Task 12 |
| Last.fm community tags (top 8) | Task 11 |
| `EnrichedSong` model | Task 10 |
| Enrichment pipeline before tagging | Task 14 |
| Cache check (skip already-indexed songs) | Not addressed — `ChromaVectorStore.song_exists` always returns `False` (ephemeral in-memory store). The cache gate described in the HLD requires a persistent store; out of scope until Postgres/pgvector is wired. |
| `Track.spotify_genres` | Task 10 |
| NestJS fetch artist genres via `/artists?ids=` | Task 15 |
| Updated tagging prompt for enriched context | Task 14 |
| Anchor artist list in DJ prompt | Tasks 16–18 |
| `PlaylistState.anchor_artists` | Task 17 |
| Anchor derived from db_songs (no new API calls) | Task 17 |
| NIM env vars: `NVIDIA_API_KEY`, `NIM_BASE_URL`, etc. | Task 1 |
| Enrichment env vars: `LASTFM_API_KEY`, `MUSIXMATCH_API_KEY` | Tasks 1, 8 |

### Placeholder scan

No TBDs or placeholders found.

### Type consistency

- `HyDEProvider.expand_query(event_description: str) -> str` — consistent across Tasks 2, 3, 4, 6, 9
- `DJProvider.generate_playlist(..., anchor_artists: List[str])` — consistent across Tasks 16, 17, 18
- `EnrichedSong` fields — consistent across Tasks 10, 13, 14
- `llm_generator` callable type: `(str, int, List[str], List[dict], List[str]) -> Awaitable[List[dict]]` — consistent across Tasks 17, 18
- `_EMBED_DIMS["gemini"]` stays `3072` — embeddings are NOT changed by hybrid mode. Existing `dims == 3072` tests are untouched. The HLD's "768/text-embedding-004" figure was inaccurate vs. the codebase (`gemini-embedding-2-preview`, 3072-dim, collection `songs_gemini_3072`).
- `Track.spotify_genres` uses `alias="artistGenres"` + `populate_by_name=True` so the NestJS camelCase payload maps correctly — consistent across Tasks 10, 14, 15.
- Enrichment runs via `asyncio.gather(asyncio.to_thread(...))` to avoid blocking the event loop — Task 14.
