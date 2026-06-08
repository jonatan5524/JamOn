import logging
from typing import List
from google import genai
from google.genai import types, errors
from app.core.config import settings
from app.core.resilience import with_resilience, AIServiceUnavailableError
from app.providers.exceptions import EmbeddingError

logger = logging.getLogger(__name__)


class GeminiEmbeddingProvider:
    provider_id = "gemini"

    def __init__(self):
        self._client = genai.Client(api_key=settings.GEMINI_API_KEY)

    @with_resilience
    def embed_document(self, text: str) -> List[float]:
        try:
            response = self._client.models.embed_content(
                model=settings.EMBEDDING_MODEL,
                contents=text,
                config=types.EmbedContentConfig(
                    task_type="RETRIEVAL_DOCUMENT",
                    title="Song Embedding",
                ),
            )
            return response.embeddings[0].values
        except Exception as e:
            if isinstance(e, (errors.APIError, AIServiceUnavailableError)):
                raise
            logger.error(f"Gemini embed_document failed: {e}")
            raise EmbeddingError(str(e)) from e

    @with_resilience
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        logger.info(f"[gemini-embedding] batch embedding {len(texts)} documents")
        try:
            # Wrapping each text in types.Content gives one embedding per item.
            # Passing raw strings gives a single aggregated embedding (gemini-embedding-2 behaviour).
            contents = [
                types.Content(parts=[types.Part.from_text(text=text)])
                for text in texts
            ]
            response = self._client.models.embed_content(
                model=settings.EMBEDDING_MODEL,
                contents=contents,
                config=types.EmbedContentConfig(task_type="RETRIEVAL_DOCUMENT"),
            )
            vectors = [e.values for e in response.embeddings]
            logger.info(f"[gemini-embedding] got {len(vectors)} vectors (expected {len(texts)})")
            return vectors
        except Exception as e:
            if isinstance(e, (errors.APIError, AIServiceUnavailableError)):
                raise
            logger.error(f"[gemini-embedding] embed_documents failed: {e}")
            raise EmbeddingError(str(e)) from e

    @with_resilience
    def embed_query(self, text: str) -> List[float]:
        try:
            response = self._client.models.embed_content(
                model=settings.EMBEDDING_MODEL,
                contents=text,
                config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY"),
            )
            return response.embeddings[0].values
        except Exception as e:
            if isinstance(e, (errors.APIError, AIServiceUnavailableError)):
                raise
            logger.error(f"Gemini embed_query failed: {e}")
            raise EmbeddingError(str(e)) from e
