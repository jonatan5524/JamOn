from typing import Tuple
from app.providers.containers import LLMProviderContainer, EmbeddingConfig
from app.providers.exceptions import ConfigurationError


class LLMProviderFactory:
    @staticmethod
    def create(provider: str) -> Tuple[LLMProviderContainer, EmbeddingConfig]:
        if provider == "gemini":
            from app.providers.llm.gemini.embedding import GeminiEmbeddingProvider
            from app.providers.llm.gemini.tagging import GeminiTaggingProvider
            from app.providers.llm.gemini.dj import GeminiDJProvider
            return (
                LLMProviderContainer(
                    embedding=GeminiEmbeddingProvider(),
                    tagging=GeminiTaggingProvider(),
                    dj=GeminiDJProvider(),
                ),
                EmbeddingConfig(provider_id="gemini", dims=3072),
            )

        if provider == "college":
            from app.providers.llm.college.embedding import CollegeEmbeddingProvider
            from app.providers.llm.college.tagging import CollegeTaggingProvider
            from app.providers.llm.college.dj import CollegeDJProvider
            return (
                LLMProviderContainer(
                    embedding=CollegeEmbeddingProvider(),
                    tagging=CollegeTaggingProvider(),
                    dj=CollegeDJProvider(),
                ),
                EmbeddingConfig(provider_id="college", dims=384),
            )

        raise ConfigurationError(
            f"Unknown LLM_PROVIDER: '{provider}'. Valid options: 'gemini', 'college'"
        )
