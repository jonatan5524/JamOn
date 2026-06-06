from typing import Optional, Tuple
from app.providers.containers import LLMProviderContainer, EmbeddingConfig
from app.providers.exceptions import ConfigurationError

# NIM mode preset: default provider for each task.
_NIM_DEFAULTS = {
    "embedding": "gemini",
    "tagging": "nim",
    "dj": "college",
    "hyde": "nim",
}

# Embedding dimensions per provider — drives the vector-store collection name.
# DO NOT change "gemini": nim mode keeps embeddings on the existing
# gemini-embedding-2-preview model (3072-dim) for vector-space consistency
# with the live songs_gemini_3072 collection. Changing this forces a re-index.
_EMBED_DIMS = {"gemini": 3072, "college": 384}


def _make_embedding(provider: str):
    if provider == "gemini":
        from app.providers.llm.gemini.embedding import GeminiEmbeddingProvider
        return GeminiEmbeddingProvider()
    if provider == "college":
        from app.providers.llm.college.embedding import CollegeEmbeddingProvider
        return CollegeEmbeddingProvider()
    raise ConfigurationError(
        f"Unknown EMBEDDING provider: '{provider}'. Valid options: 'gemini', 'college'"
    )


def _make_tagging(provider: str):
    if provider == "gemini":
        from app.providers.llm.gemini.tagging import GeminiTaggingProvider
        return GeminiTaggingProvider()
    if provider == "college":
        from app.providers.llm.college.tagging import CollegeTaggingProvider
        return CollegeTaggingProvider()
    if provider == "nim":
        from app.providers.llm.nim.tagging import NimTaggingProvider
        return NimTaggingProvider()
    raise ConfigurationError(
        f"Unknown TAGGING provider: '{provider}'. Valid options: 'gemini', 'college', 'nim'"
    )


def _make_dj(provider: str):
    if provider == "gemini":
        from app.providers.llm.gemini.dj import GeminiDJProvider
        return GeminiDJProvider()
    if provider == "college":
        from app.providers.llm.college.dj import CollegeDJProvider
        return CollegeDJProvider()
    raise ConfigurationError(
        f"Unknown DJ provider: '{provider}'. Valid options: 'gemini', 'college'"
    )


def _make_hyde(provider: str):
    if provider == "gemini":
        from app.providers.llm.gemini.hyde import GeminiHyDEProvider
        return GeminiHyDEProvider()
    if provider == "college":
        from app.providers.llm.college.hyde import CollegeHyDEProvider
        return CollegeHyDEProvider()
    if provider == "nim":
        from app.providers.llm.nim.hyde import NimHyDEProvider
        return NimHyDEProvider()
    raise ConfigurationError(
        f"Unknown HYDE provider: '{provider}'. Valid options: 'gemini', 'college', 'nim'"
    )


class LLMProviderFactory:
    @staticmethod
    def create(
        provider: str,
        embedding: Optional[str] = None,
        tagging: Optional[str] = None,
        dj: Optional[str] = None,
        hyde: Optional[str] = None,
    ) -> Tuple[LLMProviderContainer, EmbeddingConfig]:
        """Build a (possibly mixed) provider container.

        Pass provider='nim' to use the curated NIM defaults.
        Individual task overrides always take precedence.
        """
        if provider == "nim":
            embedding = embedding or _NIM_DEFAULTS["embedding"]
            tagging = tagging or _NIM_DEFAULTS["tagging"]
            dj = dj or _NIM_DEFAULTS["dj"]
            hyde = hyde or _NIM_DEFAULTS["hyde"]
        else:
            # Validate the global provider when used as a plain default.
            if provider not in _EMBED_DIMS:
                raise ConfigurationError(
                    f"Unknown LLM_PROVIDER: '{provider}'. Valid options: 'gemini', 'college', 'nim'"
                )
            embedding = embedding or provider
            tagging = tagging or provider
            dj = dj or provider
            hyde = hyde or provider

        if embedding not in _EMBED_DIMS:
            raise ConfigurationError(
                f"Unknown EMBEDDING provider: '{embedding}'. Valid options: 'gemini', 'college'"
            )

        container = LLMProviderContainer(
            embedding=_make_embedding(embedding),
            tagging=_make_tagging(tagging),
            dj=_make_dj(dj),
            hyde=_make_hyde(hyde),
        )
        embed_config = EmbeddingConfig(provider_id=embedding, dims=_EMBED_DIMS[embedding])
        return container, embed_config
