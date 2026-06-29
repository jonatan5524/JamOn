from typing import Optional, Tuple
from app.core.config import settings
from app.providers.containers import LLMProviderContainer, EmbeddingConfig
from app.providers.exceptions import ConfigurationError
from app.providers.llm.failover import (
    FailoverDJProvider,
    FailoverHyDEProvider,
    FailoverTaggingProvider,
    ProviderEntry,
    get_provider_breaker,
)

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
    if provider == "nim":
        from app.providers.llm.nim.dj import NimDJProvider
        return NimDJProvider()
    if provider == "college":
        from app.providers.llm.college.dj import CollegeDJProvider
        return CollegeDJProvider()
    raise ConfigurationError(
        f"Unknown DJ provider: '{provider}'. Valid options: 'gemini', 'nim', 'college'"
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
    def _build_entries(task_name: str, chain: list[str], maker):
        entries = []
        for provider_id in chain:
            entries.append(
                ProviderEntry(
                    provider_id=provider_id,
                    provider=maker(provider_id),
                    breaker=get_provider_breaker(
                        f"{task_name}:{provider_id}",
                        failure_threshold=settings.PROVIDER_CIRCUIT_FAILURE_THRESHOLD,
                        window_seconds=settings.PROVIDER_CIRCUIT_WINDOW_SECONDS,
                        recovery_timeout=settings.PROVIDER_CIRCUIT_COOLDOWN_SECONDS,
                    ),
                )
            )
        return entries

    @staticmethod
    def create(
        provider: str,
        embedding: Optional[str] = None,
        tagging: Optional[str] = None,
        dj: Optional[str] = None,
        hyde: Optional[str] = None,
        enable_failover: bool = False,
        failover_chain: Optional[list[str]] = None,
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

        if enable_failover:
            chain = failover_chain or [
                item.strip() for item in settings.PROVIDER_FAILOVER_CHAIN.split(",") if item.strip()
            ]
            if not chain:
                raise ConfigurationError("PROVIDER_FAILOVER_CHAIN must include at least one provider")
            invalid = [item for item in chain if item not in ("gemini", "nim", "college")]
            if invalid:
                raise ConfigurationError(
                    f"Unknown provider(s) in PROVIDER_FAILOVER_CHAIN: {', '.join(invalid)}"
                )
            container = LLMProviderContainer(
                embedding=_make_embedding(embedding),
                tagging=FailoverTaggingProvider(
                    LLMProviderFactory._build_entries("tagging", chain, _make_tagging),
                    max_attempts_per_provider=settings.PROVIDER_FAILOVER_PROVIDER_ATTEMPTS,
                ),
                dj=FailoverDJProvider(
                    LLMProviderFactory._build_entries("dj", chain, _make_dj),
                    max_attempts_per_provider=settings.PROVIDER_FAILOVER_PROVIDER_ATTEMPTS,
                ),
                hyde=FailoverHyDEProvider(
                    LLMProviderFactory._build_entries("hyde", chain, _make_hyde),
                    max_attempts_per_provider=settings.PROVIDER_FAILOVER_PROVIDER_ATTEMPTS,
                ),
            )
            embed_config = EmbeddingConfig(provider_id=embedding, dims=_EMBED_DIMS[embedding])
            return container, embed_config

        container = LLMProviderContainer(
            embedding=_make_embedding(embedding),
            tagging=_make_tagging(tagging),
            dj=_make_dj(dj),
            hyde=_make_hyde(hyde),
        )
        embed_config = EmbeddingConfig(provider_id=embedding, dims=_EMBED_DIMS[embedding])
        return container, embed_config
