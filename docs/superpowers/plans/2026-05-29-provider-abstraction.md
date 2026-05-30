# Provider Abstraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce Protocol-based abstractions for LLM providers (Gemini, College/Ollama) and vector DB backends (ChromaDB, pgvector), wired together via two independent factories at FastAPI startup.

**Architecture:** `LLMProviderFactory` and `VectorStoreFactory` are called during a FastAPI `lifespan` context and their products are combined into an `AppContainer` stored on `app.state.providers`. Protocol interfaces (`EmbeddingProvider`, `TaggingProvider`, `DJProvider`, `VectorStore`) decouple all service code from provider details. Switching providers requires changing only `core/config.py`.

**Tech Stack:** Python 3.11+, FastAPI lifespan, `typing.Protocol`, `dataclasses`, `chromadb`, `httpx` (College), `google-genai` (Gemini), `tenacity`

---

## File Map

**New files:**
- `app/providers/__init__.py`
- `app/providers/exceptions.py` — `ConfigurationError`, `EmbeddingError`, `TaggingError`, `GenerationError`, `CollectionMismatchError`
- `app/providers/protocols.py` — `EmbeddingProvider`, `TaggingProvider`, `DJProvider`, `VectorStore` Protocols
- `app/providers/containers.py` — `EmbeddingConfig`, `LLMProviderContainer`, `AppContainer` dataclasses
- `app/providers/llm/__init__.py`
- `app/providers/llm/factory.py` — `LLMProviderFactory`
- `app/providers/llm/gemini/__init__.py`
- `app/providers/llm/gemini/embedding.py` — `GeminiEmbeddingProvider`
- `app/providers/llm/gemini/tagging.py` — `GeminiTaggingProvider`
- `app/providers/llm/gemini/dj.py` — `GeminiDJProvider`
- `app/providers/llm/college/__init__.py`
- `app/providers/llm/college/embedding.py` — `CollegeEmbeddingProvider`
- `app/providers/llm/college/tagging.py` — `CollegeTaggingProvider` (batches 7 songs per call)
- `app/providers/llm/college/dj.py` — `CollegeDJProvider`
- `app/providers/vectordb/__init__.py`
- `app/providers/vectordb/factory.py` — `VectorStoreFactory`
- `app/providers/vectordb/chroma.py` — `ChromaVectorStore`
- `app/providers/vectordb/pgvector.py` — `PgVectorStore` (stub)
- `app/tests/__init__.py`
- `app/tests/test_providers.py` — all unit tests for the new layer

**Modified:**
- `app/core/config.py` — add `LLM_PROVIDER`, `VECTOR_DB_PROVIDER`, College credentials
- `app/services/rag.py` — constructor takes `VectorStore`, `EmbeddingProvider`, `DJProvider`
- `app/main.py` — add `lifespan`, exception handlers for typed provider errors
- `app/api/endpoints.py` — pull `AppContainer` from `http_request.app.state.providers`

**Deleted:**
- `app/services/llm.py` — replaced entirely by provider implementations

---

### Task 1: Custom exceptions, Protocols, Containers

**Files:**
- Create: `app/providers/__init__.py`
- Create: `app/providers/exceptions.py`
- Create: `app/providers/protocols.py`
- Create: `app/providers/containers.py`
- Create: `app/tests/__init__.py`
- Create: `app/tests/test_providers.py`

- [ ] **Step 1: Write failing tests**

Create `app/tests/__init__.py` (empty file).

Create `app/tests/test_providers.py`:

```python
import pytest
from unittest.mock import MagicMock


def test_exceptions_are_exception_subclasses():
    from app.providers.exceptions import (
        ConfigurationError, EmbeddingError, TaggingError,
        GenerationError, CollectionMismatchError,
    )
    for exc in (ConfigurationError, EmbeddingError, TaggingError,
                GenerationError, CollectionMismatchError):
        assert issubclass(exc, Exception)


def test_embedding_config_fields():
    from app.providers.containers import EmbeddingConfig
    cfg = EmbeddingConfig(provider_id="gemini", dims=768)
    assert cfg.provider_id == "gemini"
    assert cfg.dims == 768


def test_llm_provider_container_fields():
    from app.providers.containers import LLMProviderContainer
    mock_embed = MagicMock()
    mock_tag = MagicMock()
    mock_dj = MagicMock()
    c = LLMProviderContainer(embedding=mock_embed, tagging=mock_tag, dj=mock_dj)
    assert c.embedding is mock_embed
    assert c.tagging is mock_tag
    assert c.dj is mock_dj


def test_app_container_fields():
    from app.providers.containers import AppContainer, LLMProviderContainer
    llm = LLMProviderContainer(embedding=MagicMock(), tagging=MagicMock(), dj=MagicMock())
    container = AppContainer(llm=llm, vector_store=MagicMock())
    assert container.llm is llm
    assert container.vector_store is not None
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine && python -m pytest app/tests/test_providers.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.providers'`

- [ ] **Step 3: Implement**

Create `app/providers/__init__.py` (empty).

Create `app/providers/exceptions.py`:
```python
class ConfigurationError(Exception):
    pass

class EmbeddingError(Exception):
    pass

class TaggingError(Exception):
    pass

class GenerationError(Exception):
    pass

class CollectionMismatchError(Exception):
    pass
```

Create `app/providers/protocols.py`:
```python
from typing import Protocol, List, runtime_checkable


@runtime_checkable
class EmbeddingProvider(Protocol):
    provider_id: str

    def embed_document(self, text: str) -> List[float]: ...
    def embed_query(self, text: str) -> List[float]: ...


@runtime_checkable
class TaggingProvider(Protocol):
    def tag_songs(self, songs: List[dict]) -> List[dict]: ...


@runtime_checkable
class DJProvider(Protocol):
    def generate_playlist(
        self,
        event_description: str,
        context_songs: List[dict],
        count: int,
        rejected: List[str],
    ) -> List[dict]: ...

    def expand_query_hyde(self, event_description: str) -> str: ...


@runtime_checkable
class VectorStore(Protocol):
    collection_name: str

    def add_songs(
        self,
        songs_with_features: List[dict],
        lyrics_map: dict,
        embedder: EmbeddingProvider,
    ) -> None: ...

    def query_songs(
        self,
        query_text: str,
        embedder: EmbeddingProvider,
        n_results: int,
        max_distance: float,
    ) -> List[dict]: ...

    def song_exists(self, track_id: str) -> bool: ...
```

Create `app/providers/containers.py`:
```python
from dataclasses import dataclass
from app.providers.protocols import EmbeddingProvider, TaggingProvider, DJProvider, VectorStore


@dataclass
class EmbeddingConfig:
    provider_id: str
    dims: int


@dataclass
class LLMProviderContainer:
    embedding: EmbeddingProvider
    tagging: TaggingProvider
    dj: DJProvider


@dataclass
class AppContainer:
    llm: LLMProviderContainer
    vector_store: VectorStore
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine && python -m pytest app/tests/test_providers.py -v
```

Expected: 4 PASSED

- [ ] **Step 5: Commit**

```bash
git add apps/data-engine/app/providers/ apps/data-engine/app/tests/
git commit -m "feat: add provider protocol interfaces, containers, and custom exceptions"
```

---

### Task 2: Update config.py

**Files:**
- Modify: `app/core/config.py`

- [ ] **Step 1: Write failing test** (append to `app/tests/test_providers.py`):

```python
def test_config_has_provider_settings():
    from app.core.config import settings
    assert hasattr(settings, "LLM_PROVIDER")
    assert hasattr(settings, "VECTOR_DB_PROVIDER")
    assert settings.LLM_PROVIDER in ("gemini", "college")
    assert settings.VECTOR_DB_PROVIDER in ("chroma", "pgvector")
    assert hasattr(settings, "COLLEGE_BASE_URL")
    assert hasattr(settings, "COLLEGE_USERNAME")
    assert hasattr(settings, "COLLEGE_PASSWORD")
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine && python -m pytest app/tests/test_providers.py::test_config_has_provider_settings -v
```

Expected: `FAILED — AttributeError: 'Settings' object has no attribute 'LLM_PROVIDER'`

- [ ] **Step 3: Implement**

In `app/core/config.py`, add these lines inside `Settings.__init__` after the existing assignments:

```python
# Provider selection — architectural choices, override via env var if needed
self.LLM_PROVIDER: str = os.environ.get("LLM_PROVIDER", "gemini")        # "gemini" | "college"
self.VECTOR_DB_PROVIDER: str = os.environ.get("VECTOR_DB_PROVIDER", "chroma")  # "chroma" | "pgvector"
# College/Ollama credentials — secrets, load from .env
self.COLLEGE_BASE_URL: str = os.environ.get("COLLEGE_BASE_URL", "http://llm.cs.colman.ac.il")
self.COLLEGE_USERNAME: str = os.environ.get("COLLEGE_USERNAME", "")
self.COLLEGE_PASSWORD: str = os.environ.get("COLLEGE_PASSWORD", "")
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine && python -m pytest app/tests/test_providers.py::test_config_has_provider_settings -v
```

Expected: PASSED

- [ ] **Step 5: Commit**

```bash
git add apps/data-engine/app/core/config.py
git commit -m "feat: add LLM_PROVIDER, VECTOR_DB_PROVIDER, and College credentials to config"
```

---

### Task 3: Gemini provider implementations

**Files:**
- Create: `app/providers/llm/__init__.py`
- Create: `app/providers/llm/gemini/__init__.py`
- Create: `app/providers/llm/gemini/embedding.py`
- Create: `app/providers/llm/gemini/tagging.py`
- Create: `app/providers/llm/gemini/dj.py`

- [ ] **Step 1: Write failing tests** (append to `app/tests/test_providers.py`):

```python
def test_gemini_embedding_provider_embed_document():
    from unittest.mock import patch, MagicMock
    with patch("google.genai.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.models.embed_content.return_value = MagicMock(
            embeddings=[MagicMock(values=[0.1, 0.2, 0.3])]
        )
        from app.providers.llm.gemini.embedding import GeminiEmbeddingProvider
        provider = GeminiEmbeddingProvider()
        assert provider.provider_id == "gemini"
        assert provider.embed_document("test text") == [0.1, 0.2, 0.3]
        assert provider.embed_query("test query") == [0.1, 0.2, 0.3]


def test_gemini_tagging_provider_tag_songs():
    from unittest.mock import patch, MagicMock
    import json
    tagged = [{"title": "Song A", "artist": "Art", "energy_desc": "High",
               "mood_desc": "Happy", "vibe_tags": ["Pop"], "embedding_text": "A pop song"}]
    with patch("google.genai.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.models.generate_content.return_value = MagicMock(text=json.dumps(tagged))
        from app.providers.llm.gemini.tagging import GeminiTaggingProvider
        provider = GeminiTaggingProvider()
        result = provider.tag_songs([{"title": "Song A", "artist": "Art"}])
        assert isinstance(result, list)
        assert result[0]["title"] == "Song A"


def test_gemini_dj_provider_generate_playlist():
    from unittest.mock import patch, MagicMock
    import json
    with patch("google.genai.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.models.generate_content.return_value = MagicMock(
            text=json.dumps([{"title": "T1", "artist": "A1", "source": "user_library"}])
        )
        from app.providers.llm.gemini.dj import GeminiDJProvider
        provider = GeminiDJProvider()
        result = provider.generate_playlist("party", [], 5, [])
        assert isinstance(result, list)
        assert result[0]["title"] == "T1"


def test_gemini_dj_provider_expand_query_hyde():
    from unittest.mock import patch, MagicMock
    with patch("google.genai.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.models.generate_content.return_value = MagicMock(text="expanded text")
        from app.providers.llm.gemini.dj import GeminiDJProvider
        provider = GeminiDJProvider()
        result = provider.expand_query_hyde("party vibes")
        assert result == "expanded text"


def test_gemini_dj_provider_hyde_falls_back_on_error():
    from unittest.mock import patch, MagicMock
    with patch("google.genai.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.models.generate_content.side_effect = Exception("network error")
        from app.providers.llm.gemini.dj import GeminiDJProvider
        provider = GeminiDJProvider()
        result = provider.expand_query_hyde("party vibes")
        assert result == "party vibes"  # fallback to original
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine && python -m pytest app/tests/test_providers.py::test_gemini_embedding_provider_embed_document app/tests/test_providers.py::test_gemini_tagging_provider_tag_songs app/tests/test_providers.py::test_gemini_dj_provider_generate_playlist -v
```

Expected: `ModuleNotFoundError: No module named 'app.providers.llm'`

- [ ] **Step 3: Implement**

Create `app/providers/llm/__init__.py` (empty).
Create `app/providers/llm/gemini/__init__.py` (empty).

Create `app/providers/llm/gemini/embedding.py`:
```python
import logging
import os
from typing import List
from google import genai
from google.genai import types
from app.core.config import settings
from app.core.resilience import with_resilience
from app.providers.exceptions import EmbeddingError

logger = logging.getLogger(__name__)


class GeminiEmbeddingProvider:
    provider_id = "gemini"

    def __init__(self):
        self._client = genai.Client(api_key=settings.GEMINI_API_KEY)

    @with_resilience
    def embed_document(self, text: str) -> List[float]:
        try:
            response = self._client.models.embed_content(
                model=settings.EMBEDDING_MODEL,
                contents=text,
                config=types.EmbedContentConfig(
                    task_type="RETRIEVAL_DOCUMENT",
                    title="Song Embedding",
                ),
            )
            return response.embeddings[0].values
        except Exception as e:
            logger.error(f"Gemini embed_document failed: {e}")
            raise EmbeddingError(str(e)) from e

    @with_resilience
    def embed_query(self, text: str) -> List[float]:
        try:
            response = self._client.models.embed_content(
                model=settings.EMBEDDING_MODEL,
                contents=text,
                config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY"),
            )
            return response.embeddings[0].values
        except Exception as e:
            logger.error(f"Gemini embed_query failed: {e}")
            raise EmbeddingError(str(e)) from e
```

Create `app/providers/llm/gemini/tagging.py`:
```python
import json
import logging
import os
from typing import List
from google import genai
from google.genai import types
from app.core.config import settings
from app.core.resilience import with_resilience
from app.providers.exceptions import TaggingError

logger = logging.getLogger(__name__)


def _load_prompt(filename: str) -> str:
    path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "prompts", filename)
    with open(path) as f:
        return f.read()


class GeminiTaggingProvider:
    def __init__(self):
        self._client = genai.Client(api_key=settings.GEMINI_API_KEY)

    @with_resilience
    def tag_songs(self, songs: List[dict]) -> List[dict]:
        prompt_template = _load_prompt("audio_features_prompt.txt")
        prompt = prompt_template.replace("{songs_list}", json.dumps(songs, indent=2))
        try:
            response = self._client.models.generate_content(
                model=settings.AUDIO_FEATURES_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                ),
            )
            return json.loads(response.text)
        except Exception as e:
            logger.error(f"Gemini tag_songs failed: {e}")
            raise TaggingError(str(e)) from e
```

Create `app/providers/llm/gemini/dj.py`:
```python
import json
import logging
import os
from typing import List
from google import genai
from google.genai import types
from app.core.config import settings
from app.core.resilience import with_resilience
from app.providers.exceptions import GenerationError

logger = logging.getLogger(__name__)


def _load_prompt(filename: str) -> str:
    path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "prompts", filename)
    with open(path) as f:
        return f.read()


class GeminiDJProvider:
    def __init__(self):
        self._client = genai.Client(api_key=settings.GEMINI_API_KEY)

    def expand_query_hyde(self, event_description: str) -> str:
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

    @with_resilience
    def generate_playlist(
        self,
        event_description: str,
        context_songs: List[dict],
        count: int,
        rejected: List[str],
    ) -> List[dict]:
        if rejected is None:
            rejected = []
        prompt_template = _load_prompt("playlist_generation_prompt.txt")
        context_str = json.dumps(
            [{k: v for k, v in s.items() if k in ("title", "artist", "vibe_tags", "energy_desc", "mood_desc")}
             for s in context_songs],
            indent=2,
        )
        rejected_str = json.dumps(rejected, indent=2) if rejected else "None"
        prompt = (
            prompt_template
            .replace("{event_description}", event_description)
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

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine && python -m pytest app/tests/test_providers.py::test_gemini_embedding_provider_embed_document app/tests/test_providers.py::test_gemini_tagging_provider_tag_songs app/tests/test_providers.py::test_gemini_dj_provider_generate_playlist app/tests/test_providers.py::test_gemini_dj_provider_expand_query_hyde app/tests/test_providers.py::test_gemini_dj_provider_hyde_falls_back_on_error -v
```

Expected: 5 PASSED

- [ ] **Step 5: Commit**

```bash
git add apps/data-engine/app/providers/llm/
git commit -m "feat: add Gemini embedding, tagging, and DJ provider implementations"
```

---

### Task 4: LLM Factory — Gemini branch only

**Files:**
- Create: `app/providers/llm/factory.py`

- [ ] **Step 1: Write failing tests** (append to `app/tests/test_providers.py`):

```python
def test_llm_factory_creates_gemini_container():
    from unittest.mock import patch
    with patch("google.genai.Client"):
        from app.providers.llm.factory import LLMProviderFactory
        from app.providers.containers import LLMProviderContainer, EmbeddingConfig
        from app.providers.llm.gemini.embedding import GeminiEmbeddingProvider
        container, embed_config = LLMProviderFactory.create("gemini")
        assert isinstance(container, LLMProviderContainer)
        assert isinstance(container.embedding, GeminiEmbeddingProvider)
        assert embed_config.provider_id == "gemini"
        assert embed_config.dims == 768


def test_llm_factory_raises_on_unknown_provider():
    from app.providers.llm.factory import LLMProviderFactory
    from app.providers.exceptions import ConfigurationError
    with pytest.raises(ConfigurationError, match="Unknown LLM_PROVIDER"):
        LLMProviderFactory.create("unknown_provider")
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine && python -m pytest app/tests/test_providers.py::test_llm_factory_creates_gemini_container app/tests/test_providers.py::test_llm_factory_raises_on_unknown_provider -v
```

Expected: `ModuleNotFoundError: No module named 'app.providers.llm.factory'`

- [ ] **Step 3: Implement**

Create `app/providers/llm/factory.py`:
```python
from typing import Tuple
from app.providers.containers import LLMProviderContainer, EmbeddingConfig
from app.providers.exceptions import ConfigurationError


class LLMProviderFactory:
    @staticmethod
    def create(provider: str) -> Tuple[LLMProviderContainer, EmbeddingConfig]:
        if provider == "gemini":
            from app.providers.llm.gemini.embedding import GeminiEmbeddingProvider
            from app.providers.llm.gemini.tagging import GeminiTaggingProvider
            from app.providers.llm.gemini.dj import GeminiDJProvider
            return (
                LLMProviderContainer(
                    embedding=GeminiEmbeddingProvider(),
                    tagging=GeminiTaggingProvider(),
                    dj=GeminiDJProvider(),
                ),
                EmbeddingConfig(provider_id="gemini", dims=768),
            )

        raise ConfigurationError(
            f"Unknown LLM_PROVIDER: '{provider}'. Valid options: 'gemini', 'college'"
        )
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine && python -m pytest app/tests/test_providers.py::test_llm_factory_creates_gemini_container app/tests/test_providers.py::test_llm_factory_raises_on_unknown_provider -v
```

Expected: 2 PASSED

- [ ] **Step 5: Commit**

```bash
git add apps/data-engine/app/providers/llm/factory.py
git commit -m "feat: add LLM provider factory (Gemini support)"
```

---

### Task 5: College provider implementations

**Files:**
- Create: `app/providers/llm/college/__init__.py`
- Create: `app/providers/llm/college/embedding.py`
- Create: `app/providers/llm/college/tagging.py`
- Create: `app/providers/llm/college/dj.py`

- [ ] **Step 1: Write failing tests** (append to `app/tests/test_providers.py`):

```python
def test_college_embedding_provider_embed_document():
    from unittest.mock import patch, MagicMock
    with patch("httpx.Client") as mock_cls:
        mock_http = MagicMock()
        mock_cls.return_value.__enter__.return_value = mock_http
        mock_http.post.return_value = MagicMock(
            status_code=200,
            json=lambda: {"embedding": [0.1, 0.2, 0.3]},
        )
        mock_http.post.return_value.raise_for_status = MagicMock()
        from app.providers.llm.college.embedding import CollegeEmbeddingProvider
        provider = CollegeEmbeddingProvider()
        assert provider.provider_id == "college"
        assert provider.embed_document("test") == [0.1, 0.2, 0.3]
        assert provider.embed_query("test") == [0.1, 0.2, 0.3]


def test_college_tagging_provider_batches_7_songs():
    from unittest.mock import patch, MagicMock
    import json
    songs = [{"title": f"Song {i}", "artist": "A"} for i in range(10)]
    batch_result = [{"title": f"Song {i}", "artist": "A", "energy_desc": "High",
                     "mood_desc": "Happy", "vibe_tags": ["Pop"], "embedding_text": "..."}
                    for i in range(7)]

    with patch("httpx.Client") as mock_cls:
        mock_http = MagicMock()
        mock_cls.return_value.__enter__.return_value = mock_http
        mock_http.post.return_value = MagicMock(
            status_code=200,
            json=lambda: {"response": json.dumps(batch_result)},
        )
        mock_http.post.return_value.raise_for_status = MagicMock()
        from app.providers.llm.college.tagging import CollegeTaggingProvider
        provider = CollegeTaggingProvider()
        provider.tag_songs(songs)
        # 10 songs split into batches of 7 → 2 HTTP calls
        assert mock_http.post.call_count == 2


def test_college_dj_provider_generate_playlist():
    from unittest.mock import patch, MagicMock
    import json
    playlist = [{"title": "T1", "artist": "A1", "source": "user_library"}]
    with patch("httpx.Client") as mock_cls:
        mock_http = MagicMock()
        mock_cls.return_value.__enter__.return_value = mock_http
        mock_http.post.return_value = MagicMock(
            status_code=200,
            json=lambda: {"choices": [{"message": {"content": json.dumps(playlist)}}]},
        )
        mock_http.post.return_value.raise_for_status = MagicMock()
        from app.providers.llm.college.dj import CollegeDJProvider
        provider = CollegeDJProvider()
        result = provider.generate_playlist("party", [], 5, [])
        assert isinstance(result, list)
        assert result[0]["title"] == "T1"


def test_college_dj_provider_hyde_falls_back_on_error():
    from unittest.mock import patch, MagicMock
    with patch("httpx.Client") as mock_cls:
        mock_http = MagicMock()
        mock_cls.return_value.__enter__.return_value = mock_http
        mock_http.post.side_effect = Exception("connection refused")
        from app.providers.llm.college.dj import CollegeDJProvider
        provider = CollegeDJProvider()
        result = provider.expand_query_hyde("study session")
        assert result == "study session"  # fallback to original
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine && python -m pytest app/tests/test_providers.py::test_college_embedding_provider_embed_document app/tests/test_providers.py::test_college_tagging_provider_batches_7_songs app/tests/test_providers.py::test_college_dj_provider_generate_playlist -v
```

Expected: `ModuleNotFoundError: No module named 'app.providers.llm.college'`

- [ ] **Step 3: Implement**

Create `app/providers/llm/college/__init__.py` (empty).

Create `app/providers/llm/college/embedding.py`:
```python
import logging
from typing import List
import httpx
from app.core.config import settings
from app.providers.exceptions import EmbeddingError

logger = logging.getLogger(__name__)


class CollegeEmbeddingProvider:
    provider_id = "college"

    def embed_document(self, text: str) -> List[float]:
        return self._embed(text)

    def embed_query(self, text: str) -> List[float]:
        return self._embed(text)

    def _embed(self, text: str) -> List[float]:
        try:
            with httpx.Client(
                auth=(settings.COLLEGE_USERNAME, settings.COLLEGE_PASSWORD),
                timeout=30.0,
            ) as client:
                response = client.post(
                    f"{settings.COLLEGE_BASE_URL}/api/embeddings",
                    json={"model": "all-minilm:latest", "prompt": text},
                )
                response.raise_for_status()
                return response.json()["embedding"]
        except Exception as e:
            logger.error(f"College embed failed: {e}")
            raise EmbeddingError(str(e)) from e
```

Create `app/providers/llm/college/tagging.py`:
```python
import json
import logging
import os
from typing import List
import httpx
from app.core.config import settings
from app.providers.exceptions import TaggingError

logger = logging.getLogger(__name__)
_BATCH_SIZE = 7


def _load_prompt(filename: str) -> str:
    path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "prompts", filename)
    with open(path) as f:
        return f.read()


class CollegeTaggingProvider:
    def tag_songs(self, songs: List[dict]) -> List[dict]:
        results = []
        for i in range(0, len(songs), _BATCH_SIZE):
            results.extend(self._tag_batch(songs[i: i + _BATCH_SIZE]))
        return results

    def _tag_batch(self, songs: List[dict]) -> List[dict]:
        prompt = _load_prompt("audio_features_prompt.txt").replace(
            "{songs_list}", json.dumps(songs, indent=2)
        )
        try:
            with httpx.Client(
                auth=(settings.COLLEGE_USERNAME, settings.COLLEGE_PASSWORD),
                timeout=60.0,
            ) as client:
                response = client.post(
                    f"{settings.COLLEGE_BASE_URL}/api/generate",
                    json={"model": "llama3.1:8b", "prompt": prompt, "format": "json", "stream": False},
                )
                response.raise_for_status()
                return json.loads(response.json()["response"])
        except Exception as e:
            logger.error(f"College tag_batch failed: {e}")
            raise TaggingError(str(e)) from e
```

Create `app/providers/llm/college/dj.py`:
```python
import json
import logging
import os
from typing import List
import httpx
from app.core.config import settings
from app.providers.exceptions import GenerationError

logger = logging.getLogger(__name__)


def _load_prompt(filename: str) -> str:
    path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "prompts", filename)
    with open(path) as f:
        return f.read()


class CollegeDJProvider:
    def expand_query_hyde(self, event_description: str) -> str:
        prompt = _load_prompt("hyde_prompt.txt").replace("{event_description}", event_description)
        try:
            with httpx.Client(
                auth=(settings.COLLEGE_USERNAME, settings.COLLEGE_PASSWORD),
                timeout=30.0,
            ) as client:
                response = client.post(
                    f"{settings.COLLEGE_BASE_URL}/v1/chat/completions",
                    json={"model": "gemma3:12b", "messages": [{"role": "user", "content": prompt}]},
                )
                response.raise_for_status()
                return response.json()["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error(f"College HyDE expansion failed: {e}")
            return event_description

    def generate_playlist(
        self,
        event_description: str,
        context_songs: List[dict],
        count: int,
        rejected: List[str],
    ) -> List[dict]:
        if rejected is None:
            rejected = []
        prompt_template = _load_prompt("playlist_generation_prompt.txt")
        context_str = json.dumps(
            [{k: v for k, v in s.items() if k in ("title", "artist", "vibe_tags", "energy_desc", "mood_desc")}
             for s in context_songs],
            indent=2,
        )
        rejected_str = json.dumps(rejected, indent=2) if rejected else "None"
        prompt = (
            prompt_template
            .replace("{event_description}", event_description)
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
                    json={"model": "gemma3:12b", "messages": [{"role": "user", "content": prompt}]},
                )
                response.raise_for_status()
                return json.loads(response.json()["choices"][0]["message"]["content"])
        except Exception as e:
            logger.error(f"College generate_playlist failed: {e}")
            raise GenerationError(str(e)) from e
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine && python -m pytest app/tests/test_providers.py::test_college_embedding_provider_embed_document app/tests/test_providers.py::test_college_tagging_provider_batches_7_songs app/tests/test_providers.py::test_college_dj_provider_generate_playlist app/tests/test_providers.py::test_college_dj_provider_hyde_falls_back_on_error -v
```

Expected: 4 PASSED

- [ ] **Step 5: Commit**

```bash
git add apps/data-engine/app/providers/llm/college/
git commit -m "feat: add College/Ollama embedding, tagging (batch=7), and DJ provider implementations"
```

---

### Task 6: Complete LLM Factory with College support

**Files:**
- Modify: `app/providers/llm/factory.py`

- [ ] **Step 1: Write failing test** (append to `app/tests/test_providers.py`):

```python
def test_llm_factory_creates_college_container():
    from app.providers.llm.factory import LLMProviderFactory
    from app.providers.containers import LLMProviderContainer, EmbeddingConfig
    from app.providers.llm.college.embedding import CollegeEmbeddingProvider
    container, embed_config = LLMProviderFactory.create("college")
    assert isinstance(container, LLMProviderContainer)
    assert isinstance(container.embedding, CollegeEmbeddingProvider)
    assert embed_config.provider_id == "college"
    assert embed_config.dims == 384
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine && python -m pytest app/tests/test_providers.py::test_llm_factory_creates_college_container -v
```

Expected: `FAILED — ConfigurationError: Unknown LLM_PROVIDER: 'college'`

- [ ] **Step 3: Implement**

Replace the body of `app/providers/llm/factory.py` with:

```python
from typing import Tuple
from app.providers.containers import LLMProviderContainer, EmbeddingConfig
from app.providers.exceptions import ConfigurationError


class LLMProviderFactory:
    @staticmethod
    def create(provider: str) -> Tuple[LLMProviderContainer, EmbeddingConfig]:
        if provider == "gemini":
            from app.providers.llm.gemini.embedding import GeminiEmbeddingProvider
            from app.providers.llm.gemini.tagging import GeminiTaggingProvider
            from app.providers.llm.gemini.dj import GeminiDJProvider
            return (
                LLMProviderContainer(
                    embedding=GeminiEmbeddingProvider(),
                    tagging=GeminiTaggingProvider(),
                    dj=GeminiDJProvider(),
                ),
                EmbeddingConfig(provider_id="gemini", dims=768),
            )

        if provider == "college":
            from app.providers.llm.college.embedding import CollegeEmbeddingProvider
            from app.providers.llm.college.tagging import CollegeTaggingProvider
            from app.providers.llm.college.dj import CollegeDJProvider
            return (
                LLMProviderContainer(
                    embedding=CollegeEmbeddingProvider(),
                    tagging=CollegeTaggingProvider(),
                    dj=CollegeDJProvider(),
                ),
                EmbeddingConfig(provider_id="college", dims=384),
            )

        raise ConfigurationError(
            f"Unknown LLM_PROVIDER: '{provider}'. Valid options: 'gemini', 'college'"
        )
```

- [ ] **Step 4: Run all LLM factory tests — expect pass**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine && python -m pytest app/tests/test_providers.py::test_llm_factory_creates_gemini_container app/tests/test_providers.py::test_llm_factory_creates_college_container app/tests/test_providers.py::test_llm_factory_raises_on_unknown_provider -v
```

Expected: 3 PASSED

- [ ] **Step 5: Commit**

```bash
git add apps/data-engine/app/providers/llm/factory.py
git commit -m "feat: add College provider support to LLM factory"
```

---

### Task 7: ChromaVectorStore and PgVectorStore stub

**Files:**
- Create: `app/providers/vectordb/__init__.py`
- Create: `app/providers/vectordb/chroma.py`
- Create: `app/providers/vectordb/pgvector.py`

- [ ] **Step 1: Write failing tests** (append to `app/tests/test_providers.py`):

```python
def test_chroma_vector_store_collection_name():
    from unittest.mock import patch, MagicMock
    with patch("chromadb.Client") as mock_chroma:
        mock_chroma.return_value.create_collection.return_value = MagicMock()
        from app.providers.vectordb.chroma import ChromaVectorStore
        store = ChromaVectorStore(collection_name="songs_gemini_768")
        assert store.collection_name == "songs_gemini_768"


def test_chroma_vector_store_song_exists_returns_false():
    from unittest.mock import patch, MagicMock
    with patch("chromadb.Client") as mock_chroma:
        mock_chroma.return_value.create_collection.return_value = MagicMock()
        from app.providers.vectordb.chroma import ChromaVectorStore
        store = ChromaVectorStore(collection_name="songs_gemini_768")
        assert store.song_exists("any_track_id") is False


def test_chroma_vector_store_add_songs_stores_provider_metadata():
    from unittest.mock import patch, MagicMock
    mock_collection = MagicMock()
    with patch("chromadb.Client") as mock_chroma:
        mock_chroma.return_value.create_collection.return_value = mock_collection
        from app.providers.vectordb.chroma import ChromaVectorStore
        store = ChromaVectorStore(collection_name="songs_gemini_768")
        mock_embedder = MagicMock()
        mock_embedder.provider_id = "gemini"
        mock_embedder.embed_document.return_value = [0.1] * 768
        songs = [{"title": "Song A", "artist": "Artist X", "energy_desc": "High",
                  "mood_desc": "Happy", "vibe_tags": ["Pop"], "embedding_text": "A pop song"}]
        store.add_songs(songs, {"Song A": "some lyrics"}, mock_embedder)
        assert mock_collection.add.called
        meta = mock_collection.add.call_args[1]["metadatas"][0]
        assert meta["embedding_provider_id"] == "gemini"
        assert meta["embedding_dims"] == 768


def test_chroma_vector_store_raises_on_dimension_mismatch():
    from unittest.mock import patch, MagicMock
    from app.providers.exceptions import CollectionMismatchError
    mock_collection = MagicMock()
    with patch("chromadb.Client") as mock_chroma:
        mock_chroma.return_value.create_collection.return_value = mock_collection
        from app.providers.vectordb.chroma import ChromaVectorStore
        store = ChromaVectorStore(collection_name="songs_gemini_768")
        bad_embedder = MagicMock()
        bad_embedder.provider_id = "college"
        bad_embedder.embed_document.return_value = [0.1] * 384  # wrong dims for this collection
        songs = [{"title": "S", "artist": "A", "embedding_text": "text"}]
        with pytest.raises(CollectionMismatchError):
            store.add_songs(songs, {}, bad_embedder)


def test_pgvector_store_raises_not_implemented():
    from app.providers.vectordb.pgvector import PgVectorStore
    from unittest.mock import MagicMock
    store = PgVectorStore(collection_name="songs_gemini_768")
    with pytest.raises(NotImplementedError):
        store.add_songs([], {}, MagicMock())
    with pytest.raises(NotImplementedError):
        store.query_songs("test", MagicMock(), 5, 0.7)
    assert store.song_exists("any") is False
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine && python -m pytest app/tests/test_providers.py::test_chroma_vector_store_collection_name app/tests/test_providers.py::test_pgvector_store_raises_not_implemented -v
```

Expected: `ModuleNotFoundError: No module named 'app.providers.vectordb'`

- [ ] **Step 3: Implement**

Create `app/providers/vectordb/__init__.py` (empty).

Create `app/providers/vectordb/chroma.py`:
```python
import logging
from typing import List
import chromadb
from app.providers.protocols import EmbeddingProvider
from app.providers.exceptions import CollectionMismatchError

logger = logging.getLogger(__name__)


class ChromaVectorStore:
    def __init__(self, collection_name: str):
        self.collection_name = collection_name
        self._client = chromadb.Client()
        self._collection = self._client.create_collection(name=collection_name)
        try:
            self._expected_dims = int(collection_name.rsplit("_", 1)[-1])
        except ValueError:
            self._expected_dims = None

    def song_exists(self, track_id: str) -> bool:
        return False  # ephemeral store — always re-embed

    def add_songs(
        self,
        songs_with_features: List[dict],
        lyrics_map: dict,
        embedder: EmbeddingProvider,
    ) -> None:
        ids, documents, metadatas, embeddings = [], [], [], []

        for i, song in enumerate(songs_with_features):
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

            vector = embedder.embed_document(text)
            if not vector:
                continue

            if self._expected_dims and len(vector) != self._expected_dims:
                raise CollectionMismatchError(
                    f"Expected {self._expected_dims}-dim vector for collection "
                    f"'{self.collection_name}', got {len(vector)}-dim from "
                    f"provider '{embedder.provider_id}'"
                )

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

    def query_songs(
        self,
        query_text: str,
        embedder: EmbeddingProvider,
        n_results: int,
        max_distance: float,
    ) -> List[dict]:
        query_embedding = embedder.embed_query(query_text)
        if not query_embedding:
            return []

        results = self._collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            include=["metadatas", "distances", "documents"],
        )

        if not results["metadatas"] or not results["metadatas"][0]:
            return []

        metadatas = results["metadatas"][0]
        distances = (results.get("distances") or [[]])[0] or [max_distance] * len(metadatas)

        retrieved, filtered = [], []
        for meta, distance in zip(metadatas, distances):
            if isinstance(meta.get("vibe_tags"), str):
                meta["vibe_tags"] = meta["vibe_tags"].split(", ") if meta["vibe_tags"] else []
            meta["distance"] = distance
            retrieved.append(meta)
            if distance <= max_distance:
                filtered.append(meta)

        return filtered if filtered else retrieved
```

Create `app/providers/vectordb/pgvector.py`:
```python
from typing import List
from app.providers.protocols import EmbeddingProvider


class PgVectorStore:
    """Stub — raises NotImplementedError. Exists only to verify factory wiring."""

    def __init__(self, collection_name: str):
        self.collection_name = collection_name

    def song_exists(self, track_id: str) -> bool:
        return False

    def add_songs(
        self, songs_with_features: List[dict], lyrics_map: dict, embedder: EmbeddingProvider
    ) -> None:
        raise NotImplementedError("PgVectorStore is not yet implemented")

    def query_songs(
        self, query_text: str, embedder: EmbeddingProvider, n_results: int, max_distance: float
    ) -> List[dict]:
        raise NotImplementedError("PgVectorStore is not yet implemented")
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine && python -m pytest app/tests/test_providers.py::test_chroma_vector_store_collection_name app/tests/test_providers.py::test_chroma_vector_store_song_exists_returns_false app/tests/test_providers.py::test_chroma_vector_store_add_songs_stores_provider_metadata app/tests/test_providers.py::test_chroma_vector_store_raises_on_dimension_mismatch app/tests/test_providers.py::test_pgvector_store_raises_not_implemented -v
```

Expected: 5 PASSED

- [ ] **Step 5: Commit**

```bash
git add apps/data-engine/app/providers/vectordb/
git commit -m "feat: add ChromaVectorStore (with dimension guard + provider metadata) and PgVectorStore stub"
```

---

### Task 8: VectorStore Factory

**Files:**
- Create: `app/providers/vectordb/factory.py`

- [ ] **Step 1: Write failing tests** (append to `app/tests/test_providers.py`):

```python
def test_vectorstore_factory_creates_chroma_with_correct_name():
    from unittest.mock import patch
    with patch("chromadb.Client"):
        from app.providers.vectordb.factory import VectorStoreFactory
        from app.providers.containers import EmbeddingConfig
        from app.providers.vectordb.chroma import ChromaVectorStore
        store = VectorStoreFactory.create("chroma", EmbeddingConfig(provider_id="gemini", dims=768))
        assert isinstance(store, ChromaVectorStore)
        assert store.collection_name == "songs_gemini_768"


def test_vectorstore_factory_creates_pgvector_stub():
    from app.providers.vectordb.factory import VectorStoreFactory
    from app.providers.containers import EmbeddingConfig
    from app.providers.vectordb.pgvector import PgVectorStore
    store = VectorStoreFactory.create("pgvector", EmbeddingConfig(provider_id="college", dims=384))
    assert isinstance(store, PgVectorStore)
    assert store.collection_name == "songs_college_384"


def test_vectorstore_factory_raises_on_unknown():
    from app.providers.vectordb.factory import VectorStoreFactory
    from app.providers.containers import EmbeddingConfig
    from app.providers.exceptions import ConfigurationError
    with pytest.raises(ConfigurationError, match="Unknown VECTOR_DB_PROVIDER"):
        VectorStoreFactory.create("redis", EmbeddingConfig(provider_id="gemini", dims=768))
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine && python -m pytest app/tests/test_providers.py::test_vectorstore_factory_creates_chroma_with_correct_name app/tests/test_providers.py::test_vectorstore_factory_creates_pgvector_stub app/tests/test_providers.py::test_vectorstore_factory_raises_on_unknown -v
```

Expected: `ModuleNotFoundError: No module named 'app.providers.vectordb.factory'`

- [ ] **Step 3: Implement**

Create `app/providers/vectordb/factory.py`:
```python
from app.providers.containers import EmbeddingConfig
from app.providers.protocols import VectorStore
from app.providers.exceptions import ConfigurationError


class VectorStoreFactory:
    @staticmethod
    def create(provider: str, embedding_config: EmbeddingConfig) -> VectorStore:
        collection_name = f"songs_{embedding_config.provider_id}_{embedding_config.dims}"

        if provider == "chroma":
            from app.providers.vectordb.chroma import ChromaVectorStore
            return ChromaVectorStore(collection_name=collection_name)

        if provider == "pgvector":
            from app.providers.vectordb.pgvector import PgVectorStore
            return PgVectorStore(collection_name=collection_name)

        raise ConfigurationError(
            f"Unknown VECTOR_DB_PROVIDER: '{provider}'. Valid options: 'chroma', 'pgvector'"
        )
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine && python -m pytest app/tests/test_providers.py::test_vectorstore_factory_creates_chroma_with_correct_name app/tests/test_providers.py::test_vectorstore_factory_creates_pgvector_stub app/tests/test_providers.py::test_vectorstore_factory_raises_on_unknown -v
```

Expected: 3 PASSED

- [ ] **Step 5: Commit**

```bash
git add apps/data-engine/app/providers/vectordb/factory.py
git commit -m "feat: add VectorStore factory with provider-aware collection naming"
```

---

### Task 9: Refactor RagEngine

**Files:**
- Modify: `app/services/rag.py`

- [ ] **Step 1: Write failing tests** (append to `app/tests/test_providers.py`):

```python
def test_rag_engine_add_songs_delegates_to_vector_store():
    from unittest.mock import MagicMock
    from app.services.rag import RagEngine
    mock_store = MagicMock()
    mock_embedder = MagicMock()
    mock_dj = MagicMock()
    rag = RagEngine(vector_store=mock_store, embedder=mock_embedder, dj=mock_dj)
    songs = [{"title": "T", "artist": "A"}]
    lyrics = {"T": "lyrics"}
    rag.add_songs(songs, lyrics)
    mock_store.add_songs.assert_called_once_with(songs, lyrics, mock_embedder)


@pytest.mark.asyncio
async def test_rag_engine_query_songs_expands_then_queries():
    from unittest.mock import MagicMock
    from app.services.rag import RagEngine
    mock_store = MagicMock()
    mock_store.query_songs.return_value = [{"title": "Song A", "artist": "A1"}]
    mock_embedder = MagicMock()
    mock_dj = MagicMock()
    mock_dj.expand_query_hyde.return_value = "expanded query"
    rag = RagEngine(vector_store=mock_store, embedder=mock_embedder, dj=mock_dj)
    result = await rag.query_songs("party vibes", n_results=5, max_distance=0.7)
    mock_dj.expand_query_hyde.assert_called_once_with("party vibes")
    mock_store.query_songs.assert_called_once_with("expanded query", mock_embedder, 5, 0.7)
    assert result == [{"title": "Song A", "artist": "A1"}]
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine && python -m pytest app/tests/test_providers.py::test_rag_engine_add_songs_delegates_to_vector_store app/tests/test_providers.py::test_rag_engine_query_songs_expands_then_queries -v
```

Expected: `FAILED — TypeError: RagEngine.__init__() takes 1 positional argument but 4 were given`

- [ ] **Step 3: Implement**

Replace the entire contents of `app/services/rag.py` with:

```python
import asyncio
import logging
from typing import List, Dict, Any
from app.providers.protocols import EmbeddingProvider, DJProvider, VectorStore

logger = logging.getLogger(__name__)


class RagEngine:
    def __init__(
        self,
        vector_store: VectorStore,
        embedder: EmbeddingProvider,
        dj: DJProvider,
    ):
        self._store = vector_store
        self._embedder = embedder
        self._dj = dj

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
            self._dj.expand_query_hyde, event_description
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

- [ ] **Step 4: Run new tests — expect pass**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine && python -m pytest app/tests/test_providers.py::test_rag_engine_add_songs_delegates_to_vector_store app/tests/test_providers.py::test_rag_engine_query_songs_expands_then_queries -v
```

Expected: 2 PASSED

- [ ] **Step 5: Run existing test suite — check for regressions**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine && python -m pytest app/test_rag_engine.py app/test_resilience.py -v
```

Expected: all PASSED (workflow tests mock their callables; they do not instantiate RagEngine)

- [ ] **Step 6: Commit**

```bash
git add apps/data-engine/app/services/rag.py
git commit -m "refactor: RagEngine receives VectorStore, EmbeddingProvider, DJProvider via constructor"
```

---

### Task 10: Wire lifespan, update endpoint, delete services/llm.py

**Files:**
- Modify: `app/main.py`
- Modify: `app/api/endpoints.py`
- Delete: `app/services/llm.py`

- [ ] **Step 1: Write failing test** (append to `app/tests/test_providers.py`):

```python
@pytest.mark.asyncio
async def test_lifespan_sets_app_container_on_state():
    import importlib
    from unittest.mock import patch, MagicMock
    with patch("google.genai.Client"), patch("chromadb.Client") as mock_chroma:
        mock_chroma.return_value.create_collection.return_value = MagicMock()
        import app.main as main_module
        importlib.reload(main_module)
        from app.main import app
        from app.providers.containers import AppContainer
        async with app.router.lifespan_context(app):
            assert hasattr(app.state, "providers")
            assert isinstance(app.state.providers, AppContainer)
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine && python -m pytest app/tests/test_providers.py::test_lifespan_sets_app_container_on_state -v
```

Expected: `FAILED — app.main has no lifespan / AttributeError`

- [ ] **Step 3: Replace main.py**

Replace the entire contents of `app/main.py` with:

```python
import os
import sys
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.resilience import AIServiceUnavailableError
from app.providers.containers import AppContainer
from app.providers.exceptions import ConfigurationError, EmbeddingError, TaggingError, GenerationError
from app.providers.llm.factory import LLMProviderFactory
from app.providers.vectordb.factory import VectorStoreFactory

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.LLM_PROVIDER == "gemini" and not settings.GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY not set. Exiting.")
        sys.exit(1)
    if not os.environ.get("GENIUS_ACCESS_TOKEN"):
        logger.error("GENIUS_ACCESS_TOKEN not set. Exiting.")
        sys.exit(1)

    try:
        llm_container, embed_config = LLMProviderFactory.create(settings.LLM_PROVIDER)
        vector_store = VectorStoreFactory.create(settings.VECTOR_DB_PROVIDER, embed_config)
        app.state.providers = AppContainer(llm=llm_container, vector_store=vector_store)
        logger.info(
            f"Providers ready — LLM: {settings.LLM_PROVIDER}, "
            f"VectorDB: {settings.VECTOR_DB_PROVIDER}, "
            f"Collection: {vector_store.collection_name}"
        )
    except ConfigurationError as e:
        logger.error(f"Provider configuration error: {e}")
        sys.exit(1)

    yield


app = FastAPI(
    title="JamOn - Data Processing Service",
    description="""
    This service handles all AI and vector-based computations for the JamOn project:
    * **Vibe Analysis**: Analyzing natural language event descriptions.
    * **RAG Engine**: Indexing and querying musical context from lyrics and audio features.
    * **Playlist Generation**: Generating ranked recommendations using LLMs.
    """,
    version="2.0.0",
    openapi_url="/api/v1/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)


@app.exception_handler(AIServiceUnavailableError)
async def ai_service_unavailable_handler(request, exc):
    return JSONResponse(status_code=503, content={"detail": "AI Service unavailable (Circuit Breaker OPEN)"})


@app.exception_handler(EmbeddingError)
async def embedding_error_handler(request, exc):
    return JSONResponse(status_code=503, content={"detail": f"Embedding service error: {exc}"})


@app.exception_handler(TaggingError)
async def tagging_error_handler(request, exc):
    return JSONResponse(status_code=503, content={"detail": f"Tagging service error: {exc}"})


@app.exception_handler(GenerationError)
async def generation_error_handler(request, exc):
    return JSONResponse(status_code=503, content={"detail": f"Generation service error: {exc}"})


from app.api.endpoints import router
app.include_router(router)
```

- [ ] **Step 4: Replace endpoints.py**

Replace the entire contents of `app/api/endpoints.py` with:

```python
import asyncio
import logging
from typing import List

from fastapi import APIRouter, HTTPException, Request

from app.models.api import (
    RecommendRequest,
    RecommendedSong,
    LyricsBatchRequest,
    LyricsBatchResponse,
)
from app.services.rag import RagEngine
from app.services import lyrics
from app.services.validator import validate_spotify_uri_via_nestjs
from app.workflows.playlist_generator import PlaylistGraphBuilder

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post(
    "/recommend",
    response_model=List[RecommendedSong],
    tags=["Playlist Generation"],
    summary="Generate a curated playlist based on event and user taste",
    response_description="A list of recommended songs with metadata",
)
async def recommend(http_request: Request, request: RecommendRequest):
    if not request.songs:
        raise HTTPException(status_code=400, detail="No songs provided for context")

    providers = http_request.app.state.providers
    input_songs = [{"title": s.title, "artist": s.artist} for s in request.songs]

    logger.info(f"Tagging {len(input_songs)} songs...")
    songs_with_features = await asyncio.to_thread(
        providers.llm.tagging.tag_songs, input_songs
    )
    if not songs_with_features:
        raise HTTPException(status_code=500, detail="Failed to tag songs")

    logger.info(f"Fetching lyrics for {len(input_songs)} songs...")
    lyrics_map = await asyncio.to_thread(lyrics.fetch_lyrics_map, input_songs)

    logger.info("Indexing songs in RAG engine...")
    rag = RagEngine(
        vector_store=providers.vector_store,
        embedder=providers.llm.embedding,
        dj=providers.llm.dj,
    )
    await asyncio.to_thread(rag.add_songs, songs_with_features, lyrics_map)

    async def db_fetch_wrapper(query: str):
        return await rag.query_songs(query, n_results=20)

    async def llm_gen_wrapper(prompt: str, count: int, rejected: List[str], context: List[dict]):
        return await asyncio.to_thread(
            providers.llm.dj.generate_playlist, prompt, context, count, rejected
        )

    builder = PlaylistGraphBuilder(
        llm_generator=llm_gen_wrapper,
        db_fetcher=db_fetch_wrapper,
        uri_validator=validate_spotify_uri_via_nestjs,
        target_wildcards=5,
        max_attempts=3,
    )
    workflow = builder.build()

    try:
        final_state = await workflow.ainvoke({"event_description": request.event_description})
        playlist = final_state.get("final_playlist", [])
    except Exception as e:
        logger.error(f"Graph execution error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate playlist via LangGraph")

    if not playlist:
        raise HTTPException(status_code=500, detail="Generated playlist was empty")

    return [
        RecommendedSong(
            title=song["title"],
            artist=song["artist"],
            is_new=song.get("source", "user_library") == "new_suggestion",
        )
        for song in playlist
    ]


@router.post(
    "/lyrics/batch",
    response_model=LyricsBatchResponse,
    tags=["Lyrics"],
    summary="Fetch Genius lyrics for a batch of songs",
)
async def lyrics_batch(request: LyricsBatchRequest):
    if not request.songs:
        raise HTTPException(
            status_code=400,
            detail="Request body must include a non-empty 'songs' array.",
        )
    input_songs = [{"title": s.title, "artist": s.artist} for s in request.songs]
    results = await asyncio.to_thread(lyrics.fetch_lyrics_batch, input_songs)
    return LyricsBatchResponse(songs=results)
```

- [ ] **Step 5: Delete services/llm.py**

```bash
rm apps/data-engine/app/services/llm.py
```

- [ ] **Step 6: Run full test suite**

```bash
cd /home/jonatan5524/git/JamOn/apps/data-engine && python -m pytest app/ -v --ignore=app/.venv
```

Expected: all tests PASS. If any import error references `app.services.llm`, search for it and update to use the provider container.

```bash
grep -r "from app.services import llm\|from app.services.llm import\|import app.services.llm" apps/data-engine/app/ --include="*.py"
```

Expected: no results (all usages removed).

- [ ] **Step 7: Commit**

```bash
git add apps/data-engine/app/main.py apps/data-engine/app/api/endpoints.py
git rm apps/data-engine/app/services/llm.py
git commit -m "feat: wire AppContainer in FastAPI lifespan, update endpoint to use provider DI, remove services/llm.py"
```
