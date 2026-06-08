from dataclasses import dataclass
from app.providers.protocols import EmbeddingProvider, TaggingProvider, DJProvider, HyDEProvider, VectorStore


@dataclass
class EmbeddingConfig:
    provider_id: str
    dims: int


@dataclass
class LLMProviderContainer:
    embedding: EmbeddingProvider
    tagging: TaggingProvider
    dj: DJProvider
    hyde: HyDEProvider


@dataclass
class AppContainer:
    llm: LLMProviderContainer
    vector_store: VectorStore
