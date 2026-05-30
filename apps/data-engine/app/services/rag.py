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
