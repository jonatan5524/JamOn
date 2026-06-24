from app.providers.vectordb.chroma import ChromaVectorStore


class FakeEmbedder:
    """Maps known embedding-text / query strings to fixed 2-D vectors so we can
    control exact cosine distances. Collection names end in `_2` so the store's
    expected-dims check (parsed from the name) matches our 2-D vectors."""

    provider_id = "fake"

    def __init__(self, mapping):
        self._mapping = mapping

    def embed_documents(self, texts):
        return [self._mapping[t] for t in texts]

    def embed_query(self, text):
        return self._mapping[text]


def test_query_songs_excludes_songs_beyond_max_distance():
    songs = [
        {"title": "Chill Song", "artist": "A", "embedding_text": "a calm acoustic ballad"},
        {"title": "Hype Song", "artist": "B", "embedding_text": "a high energy banger"},
    ]
    mapping = {
        "a calm acoustic ballad": [1.0, 0.0],   # cosine_dist 0.0 from query
        "a high energy banger": [0.0, 1.0],     # cosine_dist 1.0 from query
        "chill query": [1.0, 0.0],
    }
    embedder = FakeEmbedder(mapping)
    store = ChromaVectorStore("vibe_excludes_2")
    store.add_songs(songs, {}, embedder)

    results = store.query_songs("chill query", embedder, n_results=5, max_distance=0.7, event_id="")
    titles = [r["title"] for r in results]
    assert "Chill Song" in titles
    assert "Hype Song" not in titles  # 1.0 > 0.7 -> dropped, not fallback-returned


def test_query_songs_returns_empty_when_nothing_matches():
    songs = [{"title": "Hype Song", "artist": "B", "embedding_text": "a high energy banger"}]
    mapping = {"a high energy banger": [0.0, 1.0], "chill query": [1.0, 0.0]}
    embedder = FakeEmbedder(mapping)
    store = ChromaVectorStore("vibe_empty_2")
    store.add_songs(songs, {}, embedder)

    results = store.query_songs("chill query", embedder, n_results=5, max_distance=0.7, event_id="")
    assert results == []  # no silent fallback to mismatched library


def test_query_songs_attaches_distance():
    songs = [{"title": "Chill Song", "artist": "A", "embedding_text": "a calm acoustic ballad"}]
    mapping = {"a calm acoustic ballad": [1.0, 0.0], "chill query": [1.0, 0.0]}
    embedder = FakeEmbedder(mapping)
    store = ChromaVectorStore("vibe_distance_2")
    store.add_songs(songs, {}, embedder)

    results = store.query_songs("chill query", embedder, n_results=5, max_distance=0.7, event_id="")
    assert results[0]["distance"] < 0.01  # near-zero cosine distance


def test_pgvector_documents_cosine_and_no_fallback_contract():
    import app.providers.vectordb.pgvector as pg
    doc = (pg.PgVectorStore.__doc__ or "") + (pg.PgVectorStore.query_songs.__doc__ or "")
    assert "cosine" in doc.lower()
    assert "no fallback" in doc.lower()
