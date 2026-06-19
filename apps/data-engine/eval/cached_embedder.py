import logging
from typing import List
from app.providers.protocols import EmbeddingProvider, HyDEProvider

logger = logging.getLogger(__name__)


class CachedEmbeddingProvider:
    """Wraps any EmbeddingProvider and caches embed_query results in memory.

    Effective only when paired with CachedHyDEProvider: HyDE is non-deterministic,
    so if raw HyDE text is the cache key the cache never hits across grid combos.
    With a stable HyDE expansion the same 8 embeddings cover all 81 combos.
    """

    def __init__(self, inner: EmbeddingProvider):
        self._inner = inner
        self._cache: dict[str, List[float]] = {}

    def embed_query(self, text: str) -> List[float]:
        if text not in self._cache:
            logger.debug("[cached-embedder] cache miss, calling inner embed_query")
            self._cache[text] = self._inner.embed_query(text)
        return self._cache[text]

    def embed_document(self, text: str) -> List[float]:
        return self._inner.embed_document(text)

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return self._inner.embed_documents(texts)


class CachedHyDEProvider:
    """Wraps any HyDEProvider and caches expansions by event description.

    HyDE is non-deterministic — without this cache, every grid-search iteration
    produces a different expansion for the same event, defeating the embedding
    cache and generating O(combos × events) API calls instead of O(events).
    With this cache, NIM is called once per unique event description per eval run.
    """

    def __init__(self, inner: HyDEProvider):
        self._inner = inner
        self._cache: dict[str, str] = {}

    def expand_query(self, event_description: str) -> str:
        if event_description not in self._cache:
            logger.debug("[cached-hyde] cache miss, calling inner expand_query")
            self._cache[event_description] = self._inner.expand_query(event_description)
        return self._cache[event_description]
