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


# Task 2: Config settings
def test_config_has_provider_settings():
    from app.core.config import settings
    assert hasattr(settings, "LLM_PROVIDER")
    assert hasattr(settings, "VECTOR_DB_PROVIDER")
    assert settings.LLM_PROVIDER in ("gemini", "college")
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


# Task 10: Lifespan and AppContainer wiring
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
