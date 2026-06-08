from typing import Protocol, List, runtime_checkable


@runtime_checkable
class EmbeddingProvider(Protocol):
    provider_id: str

    def embed_document(self, text: str) -> List[float]: ...
    def embed_documents(self, texts: List[str]) -> List[List[float]]: ...
    def embed_query(self, text: str) -> List[float]: ...


@runtime_checkable
class TaggingProvider(Protocol):
    def tag_songs(self, songs: List[dict]) -> List[dict]: ...


@runtime_checkable
class HyDEProvider(Protocol):
    def expand_query(self, event_description: str) -> str: ...


@runtime_checkable
class DJProvider(Protocol):
    def generate_playlist(
        self,
        event_description: str,
        context_songs: List[dict],
        count: int,
        rejected: List[str],
        anchor_artists: List[str],
    ) -> List[dict]: ...


@runtime_checkable
class VectorStore(Protocol):
    collection_name: str

    def add_songs(
        self,
        songs_with_features: List[dict],
        lyrics_map: dict,
        embedder: EmbeddingProvider,
    ) -> None: ...

    def query_songs(
        self,
        query_text: str,
        embedder: EmbeddingProvider,
        n_results: int,
        max_distance: float,
    ) -> List[dict]: ...

    def song_exists(self, track_id: str) -> bool: ...
