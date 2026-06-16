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

    async def query_songs(
        self,
        event_description: str,
        event_id: str,
        n_results: int = 5,
        max_distance: float = 0.7,
    ) -> List[Dict[str, Any]]:
        logger.info(f"[rag] HyDE expanding: '{event_description}'")
        expanded_query = await asyncio.to_thread(
            self._hyde.expand_query, event_description
        )
        logger.info(f"[rag] HyDE result ({len(expanded_query)} chars): '{expanded_query[:200]}{'...' if len(expanded_query) > 200 else ''}'")
        logger.info(f"[rag] querying vector store — n_results={n_results}, max_distance={max_distance}")
        results = await asyncio.to_thread(
            self._store.query_songs,
            expanded_query,
            self._embedder,
            n_results,
            max_distance,
            event_id,
        )
        logger.info(f"[rag] vector store returned {len(results)} songs")
        return results
