import logging
from typing import List
import chromadb
from app.providers.protocols import EmbeddingProvider
from app.providers.exceptions import CollectionMismatchError
from app.services.embedding_text import build_embedding_text

logger = logging.getLogger(__name__)


class ChromaVectorStore:
    def __init__(self, collection_name: str):
        self.collection_name = collection_name
        self._client = chromadb.Client()
        self._collection = self._client.create_collection(
            name=collection_name, metadata={"hnsw:space": "cosine"}
        )
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
        ids, documents, metadatas = [], [], []
        prepared = []  # (text, song) pairs, one per input song

        logger.info(f"[chroma] preparing {len(songs_with_features)} songs for embedding")
        for song in songs_with_features:
            title = song.get("title", "")
            artist = song.get("artist", "")
            text = build_embedding_text(song)
            logger.debug(
                f"[chroma] embedding text for '{title}' by '{artist}' "
                f"({len(text)} chars): {text[:150]!r}..."
            )
            prepared.append((text, song))

        if not prepared:
            logger.warning("[chroma] no songs to embed — aborting add_songs")
            return

        logger.info(f"[chroma] calling embedder.embed_documents for {len(prepared)} songs")
        # Single batched embedding call for the whole library.
        vectors = embedder.embed_documents([text for text, _ in prepared])
        logger.info(f"[chroma] got {len(vectors)} vectors back from embedder")

        embeddings = []
        for i, ((text, song), vector) in enumerate(zip(prepared, vectors)):
            title = song.get("title", "")
            if not vector:
                logger.warning(f"[chroma] empty vector for '{title}' at index {i} — skipping")
                continue
            logger.debug(f"[chroma] vector for '{title}': dims={len(vector)}")
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

    def query_songs(
        self,
        query_text: str,
        embedder: EmbeddingProvider,
        n_results: int,
        max_distance: float,
        event_id: str = "",
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

        logger.info(
            f"Vector search: {len(retrieved)} candidates, "
            f"{len(filtered)} passed max_distance={max_distance}"
        )
        for meta, distance in zip(metadatas, distances):
            status = "PASS" if distance <= max_distance else "FAIL"
            logger.info(
                f"  [{status}] {meta.get('title')} — {meta.get('artist')} "
                f"| cosine_dist={distance:.4f}"
            )

        # No fallback: if nothing clears max_distance, return [] so the caller
        # can treat a weak pool as the trigger for vibe-carrying generation,
        # rather than silently surfacing mismatched library songs.
        return filtered
