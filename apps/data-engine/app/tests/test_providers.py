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
    mock_hyde = MagicMock()
    c = LLMProviderContainer(embedding=mock_embed, tagging=mock_tag, dj=mock_dj, hyde=mock_hyde)
    assert c.embedding is mock_embed
    assert c.tagging is mock_tag
    assert c.dj is mock_dj
    assert c.hyde is mock_hyde


def test_llm_provider_container_has_hyde_field():
    from app.providers.containers import LLMProviderContainer
    mock_hyde = MagicMock()
    c = LLMProviderContainer(
        embedding=MagicMock(), tagging=MagicMock(), dj=MagicMock(), hyde=mock_hyde
    )
    assert c.hyde is mock_hyde


def test_hyde_provider_protocol_exists():
    from app.providers.protocols import HyDEProvider
    assert hasattr(HyDEProvider, "expand_query")


def test_config_has_nim_settings():
    from app.core.config import settings
    assert hasattr(settings, "NVIDIA_API_KEY")
    assert hasattr(settings, "NIM_BASE_URL")
    assert hasattr(settings, "NIM_TAGGING_MODEL")
    assert hasattr(settings, "NIM_HYDE_MODEL")
    assert hasattr(settings, "HYDE_PROVIDER")


def test_app_container_fields():
    from app.providers.containers import AppContainer, LLMProviderContainer
    llm = LLMProviderContainer(
        embedding=MagicMock(), tagging=MagicMock(), dj=MagicMock(), hyde=MagicMock()
    )
    container = AppContainer(llm=llm, vector_store=MagicMock())
    assert container.llm is llm
    assert container.vector_store is not None


# Task 2: Config settings
def test_config_has_provider_settings():
    from app.core.config import settings
    assert hasattr(settings, "LLM_PROVIDER")
    assert hasattr(settings, "VECTOR_DB_PROVIDER")
    assert settings.LLM_PROVIDER in ("gemini", "college", "nim")
    assert settings.VECTOR_DB_PROVIDER in ("chroma", "pgvector")
    assert hasattr(settings, "COLLEGE_BASE_URL")
    assert hasattr(settings, "COLLEGE_USERNAME")
    assert hasattr(settings, "COLLEGE_PASSWORD")


# Task 3: Gemini provider implementations
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
        result = provider.generate_playlist("party", [], 5, [], anchor_artists=[])
        assert isinstance(result, list)
        assert result[0]["title"] == "T1"


# Task 4: LLM Factory — Gemini branch only
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
        assert embed_config.dims == 3072


def test_llm_factory_raises_on_unknown_provider():
    from app.providers.llm.factory import LLMProviderFactory
    from app.providers.exceptions import ConfigurationError
    with pytest.raises(ConfigurationError, match="Unknown LLM_PROVIDER"):
        LLMProviderFactory.create("unknown_provider")


# Task 5: College provider implementations
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
        result = provider.generate_playlist("party", [], 5, [], anchor_artists=[])
        assert isinstance(result, list)
        assert result[0]["title"] == "T1"


# Task 6: Complete LLM Factory with College support
def test_llm_factory_creates_college_container():
    from app.providers.llm.factory import LLMProviderFactory
    from app.providers.containers import LLMProviderContainer, EmbeddingConfig
    from app.providers.llm.college.embedding import CollegeEmbeddingProvider
    container, embed_config = LLMProviderFactory.create("college")
    assert isinstance(container, LLMProviderContainer)
    assert isinstance(container.embedding, CollegeEmbeddingProvider)
    assert embed_config.provider_id == "college"
    assert embed_config.dims == 384


# Task 7: ChromaVectorStore and PgVectorStore stub
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
        mock_embedder.embed_documents.return_value = [[0.1] * 768]
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
        bad_embedder.embed_documents.return_value = [[0.1] * 384]  # wrong dims for this collection
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


# Task 8: VectorStore Factory
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


# Task 9: Refactor RagEngine
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


# Task 10: Lifespan and AppContainer wiring
@pytest.mark.asyncio
async def test_lifespan_sets_app_container_on_state():
    import importlib
    from unittest.mock import patch, MagicMock
    # Patch the config settings singleton at its source so the reload picks it up.
    from app.core import config as config_module
    original = config_module.settings
    mock_settings = MagicMock()
    mock_settings.LLM_PROVIDER = "gemini"
    mock_settings.VECTOR_DB_PROVIDER = "chroma"
    mock_settings.GEMINI_API_KEY = "fake"
    mock_settings.NVIDIA_API_KEY = ""
    mock_settings.COLLEGE_USERNAME = ""
    mock_settings.COLLEGE_PASSWORD = ""
    mock_settings.EMBEDDING_PROVIDER = "gemini"
    mock_settings.TAGGING_PROVIDER = "gemini"
    mock_settings.DJ_PROVIDER = "gemini"
    mock_settings.HYDE_PROVIDER = "gemini"
    config_module.settings = mock_settings
    try:
        with patch("google.genai.Client"), patch("chromadb.Client") as mock_chroma:
            mock_chroma.return_value.create_collection.return_value = MagicMock()
            import app.main as main_module
            importlib.reload(main_module)
            from app.main import app
            from app.providers.containers import AppContainer
            async with app.router.lifespan_context(app):
                assert hasattr(app.state, "providers")
                assert isinstance(app.state.providers, AppContainer)
    finally:
        config_module.settings = original


def test_config_has_nim_settings():
    from app.core.config import settings
    assert hasattr(settings, "NVIDIA_API_KEY")
    assert hasattr(settings, "NIM_BASE_URL")
    assert hasattr(settings, "NIM_TAGGING_MODEL")
    assert hasattr(settings, "NIM_HYDE_MODEL")
    assert hasattr(settings, "HYDE_PROVIDER")


# Point 4: per-task provider settings
def test_config_has_per_task_provider_settings():
    from app.core.config import settings
    assert hasattr(settings, "EMBEDDING_PROVIDER")
    assert hasattr(settings, "TAGGING_PROVIDER")
    assert hasattr(settings, "DJ_PROVIDER")
    # All default to the global LLM_PROVIDER when not overridden
    for p in (settings.EMBEDDING_PROVIDER, settings.TAGGING_PROVIDER, settings.DJ_PROVIDER):
        assert p in ("gemini", "college", "nim")


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
    assert container.hyde is not None


def test_factory_embedding_college_sets_384_dims():
    from app.providers.llm.factory import LLMProviderFactory
    container, cfg = LLMProviderFactory.create("gemini", embedding="college")
    assert cfg.provider_id == "college"
    assert cfg.dims == 384
    assert container.hyde is not None


def test_factory_unknown_provider_raises():
    import pytest
    from app.providers.llm.factory import LLMProviderFactory
    from app.providers.exceptions import ConfigurationError
    with pytest.raises(ConfigurationError):
        LLMProviderFactory.create("gemini", dj="banana")


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


# Point 5: College batch embedding (loop fallback)
def test_college_embed_documents_loops_and_returns_all():
    from unittest.mock import patch
    from app.providers.llm.college.embedding import CollegeEmbeddingProvider
    provider = CollegeEmbeddingProvider()
    with patch.object(provider, "_embed", side_effect=[[0.1], [0.2], [0.3]]) as m:
        vectors = provider.embed_documents(["a", "b", "c"])
    assert vectors == [[0.1], [0.2], [0.3]]
    assert m.call_count == 3


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


# ---------------------------------------------------------------------------
# Task 3: GeminiHyDEProvider
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# Task 4: CollegeHyDEProvider
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# Task 5: NimTaggingProvider
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# Task 6: NimHyDEProvider
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# Task 7: Factory — nim key, _make_hyde, nim mode
# ---------------------------------------------------------------------------
def test_factory_creates_nim_tagging():
    from unittest.mock import patch
    with patch("openai.OpenAI"):
        from app.providers.llm.factory import LLMProviderFactory
        with patch("google.genai.Client"):
            container, _ = LLMProviderFactory.create("gemini", tagging="nim")
        assert type(container.tagging).__name__ == "NimTaggingProvider"


def test_factory_creates_nim_hyde():
    from unittest.mock import patch
    with patch("openai.OpenAI"), patch("google.genai.Client"):
        from app.providers.llm.factory import LLMProviderFactory
        container, _ = LLMProviderFactory.create("gemini", hyde="nim")
        assert type(container.hyde).__name__ == "NimHyDEProvider"


def test_factory_nim_mode_assigns_correct_providers():
    from unittest.mock import patch
    with patch("openai.OpenAI"), patch("google.genai.Client"):
        from app.providers.llm.factory import LLMProviderFactory
        container, cfg = LLMProviderFactory.create("nim")
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


# ---------------------------------------------------------------------------
# Task 10: EnrichedSong model
# ---------------------------------------------------------------------------
def test_track_model_has_title_and_artist():
    from app.models.song import Track
    t = Track(title="Song A", artist="Artist X")
    assert t.title == "Song A"
    assert t.artist == "Artist X"


def test_enriched_song_model_fields():
    from app.models.song import EnrichedSong
    s = EnrichedSong(
        track_id="abc123",
        title="Song A",
        artist="Artist X",
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


# ---------------------------------------------------------------------------
# Task 11: Last.fm enrichment service
# ---------------------------------------------------------------------------
def test_lastfm_fetch_tags_returns_top_8():
    from unittest.mock import patch
    tags = [{"name": f"tag{i}", "count": 100 - i} for i in range(12)]
    api_response = {"toptags": {"tag": tags}}
    with patch("app.services.lastfm._request_json", return_value=api_response), \
         patch("app.services.lastfm.settings") as mock_settings:
        mock_settings.LASTFM_API_KEY = "fake_key"
        from app.services.lastfm import fetch_lastfm_tags
        result = fetch_lastfm_tags("Gangnam Style", "PSY")
    assert len(result) == 8
    assert result[0] == "tag0"


def test_lastfm_fetch_tags_returns_empty_on_failure():
    from unittest.mock import patch
    with patch("app.services.lastfm._request_json", side_effect=Exception("timeout")), \
         patch("app.services.lastfm.settings") as mock_settings:
        mock_settings.LASTFM_API_KEY = "fake_key"
        from app.services.lastfm import fetch_lastfm_tags
        result = fetch_lastfm_tags("Song", "Artist")
    assert result == []


def test_lastfm_fetch_tags_returns_empty_when_no_api_key():
    from unittest.mock import patch
    from app.services import lastfm
    with patch.object(lastfm.settings, "LASTFM_API_KEY", ""):
        result = lastfm.fetch_lastfm_tags("Song", "Artist")
    assert result == []


# ---------------------------------------------------------------------------
# Task 12: lyrics — Genius only
# ---------------------------------------------------------------------------
def test_fetch_lyrics_for_song_returns_not_found_when_genius_misses():
    from unittest.mock import patch
    with patch("app.services.lyrics.search_song_on_genius", return_value=None):
        from app.services.lyrics import fetch_lyrics_for_song
        result = fetch_lyrics_for_song("Song", "Artist")
    assert result["found"] is False
    assert result["lyrics"] == ""
    assert result["lyrics_source"] is None


# ---------------------------------------------------------------------------
# Task 13: enrichment orchestrator
# ---------------------------------------------------------------------------
def test_enrich_song_collects_all_signals():
    from unittest.mock import patch
    from app.services.enrichment import enrich_song
    song = {"track_id": "t1", "title": "FAKE LOVE", "artist": "BTS"}
    with patch("app.services.enrichment.fetch_lyrics_for_song",
               return_value={"found": True, "lyrics": "I was sad", "lyrics_source": "genius"}), \
         patch("app.services.enrichment.fetch_lastfm_tags", return_value=["K-pop", "melancholic"]):
        result = enrich_song(song)
    assert result.track_id == "t1"
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


# ---------------------------------------------------------------------------
# Task 16: DJ provider anchor_artists in prompt
# ---------------------------------------------------------------------------
def test_college_dj_provider_passes_anchor_artists_in_prompt():
    from unittest.mock import patch, MagicMock
    import json as json_module
    playlist = [{"title": "T1", "artist": "A1", "source": "new_suggestion"}]
    captured_payload = {}

    def fake_post(url, json=None, **kwargs):
        captured_payload.update(json or {})
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"choices": [{"message": {"content": json_module.dumps(playlist)}}]}
        return mock_resp

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


# ---------------------------------------------------------------------------
# Task 17: PlaylistGraphBuilder threads anchor_artists
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_playlist_graph_builder_passes_anchor_artists_to_llm():
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


# ---------------------------------------------------------------------------
# Task 1: ingest_batch must enrich before tagging, use lastfm_tags, batch embed
# ---------------------------------------------------------------------------
def _make_enriched_song(title: str, artist: str):
    from app.models.song import EnrichedSong
    return EnrichedSong(
        track_id=f"{title}-{artist}",
        title=title,
        artist=artist,
        lastfm_tags=["pop", "dance"],
        lyrics_snippet="Some lyrics snippet here",
        lyrics_source="genius",
    )


@pytest.mark.asyncio
async def test_ingest_batch_enriches_before_tagging_and_batch_embeds():
    """
    ingest_batch must:
    - call enrich_song per track (not fetch_lyrics_map)
    - pass lastfm_tags + lyrics_snippet to tag_songs
    - call embed_documents once with all texts (not embed_document in a loop)
    """
    from unittest.mock import MagicMock, patch
    from fastapi.testclient import TestClient

    tracks_payload = [
        {"title": "Song A", "artist": "Artist A"},
        {"title": "Song B", "artist": "Artist B"},
    ]

    fake_tagged = [
        {"title": "Song A", "artist": "Artist A", "embedding_text": "Song A vibe tags text"},
        {"title": "Song B", "artist": "Artist B", "embedding_text": "Song B vibe tags text"},
    ]
    fake_vectors = [[0.1] * 10, [0.2] * 10]

    mock_tagging = MagicMock()
    mock_tagging.tag_songs.return_value = fake_tagged

    mock_embedding = MagicMock()
    mock_embedding.embed_documents.return_value = fake_vectors

    mock_providers = MagicMock()
    mock_providers.llm.tagging = mock_tagging
    mock_providers.llm.embedding = mock_embedding

    from app.main import app as fastapi_app

    with patch("app.api.endpoints.enrich_song", side_effect=lambda s: _make_enriched_song(s["title"], s["artist"])) as mock_enrich, \
         patch("app.api.endpoints.lyrics") as mock_lyrics_mod:

        client = TestClient(fastapi_app)
        fastapi_app.state.providers = mock_providers
        resp = client.post("/ingest-batch", json=tracks_payload)

        # enrich_song called for each track, fetch_lyrics_map not called
        assert mock_enrich.call_count == 2, f"Expected enrich_song called 2 times, got {mock_enrich.call_count}"
        mock_lyrics_mod.fetch_lyrics_map.assert_not_called()

        # tag_songs received input with lastfm_tags and lyrics_snippet
        tagged_input = mock_tagging.tag_songs.call_args.args[0]
        assert "lastfm_tags" in tagged_input[0], "tag_songs input missing lastfm_tags"
        assert "lyrics_snippet" in tagged_input[0], "tag_songs input missing lyrics_snippet"

        # embed_documents called once (not embed_document in a loop)
        mock_embedding.embed_documents.assert_called_once()
        mock_embedding.embed_document.assert_not_called()

        # Response contains one IngestedSong per successfully embedded track
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        body = resp.json()
        assert len(body) == 2
        assert body[0]["name"] == "Song A"
        assert body[0]["embedding"] == [0.1] * 10
