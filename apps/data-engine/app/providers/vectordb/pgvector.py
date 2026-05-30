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
