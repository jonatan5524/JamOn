import asyncio
import logging
import re
from typing import List, Dict, Any
from app.providers.protocols import EmbeddingProvider, DJProvider, HyDEProvider, VectorStore

logger = logging.getLogger(__name__)

_MAX_HYDE_SENTENCES = 2


def _clean_hyde_output(text: str) -> str:
    """Strip chat preamble/markdown from a HyDE expansion before embedding it.

    Document-side vectors are built from tight 1-2 sentence vibe strings
    (`build_embedding_text`). A raw chat response — greeting, headers, numbered
    factor lists — is a structurally different shape of text feeding the same
    embedding space, which dilutes the query vector. This keeps only the
    prose content, trimmed to roughly the same length as the document side.
    """
    lines = text.strip().splitlines()
    kept = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        # Drop markdown headings/bullets/numbered-list markers and chat preamble lines.
        if re.match(r"^(#{1,6}\s|[-*•]\s|\d+[.)]\s)", stripped):
            continue
        kept.append(stripped)
    cleaned = " ".join(kept) if kept else text.strip()

    sentences = re.split(r"(?<=[.!?])\s+", cleaned)
    return " ".join(sentences[:_MAX_HYDE_SENTENCES]).strip()


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
        raw_expanded_query = await asyncio.to_thread(
            self._hyde.expand_query, event_description
        )
        expanded_query = _clean_hyde_output(raw_expanded_query)
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
