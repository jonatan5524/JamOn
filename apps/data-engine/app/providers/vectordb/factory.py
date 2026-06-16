import logging

from app.providers.containers import EmbeddingConfig
from app.providers.protocols import VectorStore
from app.providers.exceptions import ConfigurationError


logger = logging.getLogger(__name__)


class VectorStoreFactory:
    @staticmethod
    def create(provider: str, embedding_config: EmbeddingConfig) -> VectorStore:
        collection_name = f"songs_{embedding_config.provider_id}_{embedding_config.dims}"

        if provider == "chroma":
            from app.providers.vectordb.chroma import ChromaVectorStore
            return ChromaVectorStore(collection_name=collection_name)

        if provider == "pgvector":
            from app.providers.vectordb.pgvector import PgVectorStore
            return PgVectorStore(collection_name=collection_name)

        raise ConfigurationError(
            f"Unknown VECTOR_DB_PROVIDER: '{provider}'. Valid options: 'chroma', 'pgvector'"
        )
