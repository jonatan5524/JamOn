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

        print(songs_with_features)
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

        return filtered if filtered else retrieved
