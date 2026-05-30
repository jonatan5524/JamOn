from dataclasses import dataclass
from app.providers.protocols import EmbeddingProvider, TaggingProvider, DJProvider, VectorStore


@dataclass
class EmbeddingConfig:
    provider_id: str
    dims: int


@dataclass
class LLMProviderContainer:
    embedding: EmbeddingProvider
    tagging: TaggingProvider
    dj: DJProvider


@dataclass
class AppContainer:
    llm: LLMProviderContainer
    vector_store: VectorStore
