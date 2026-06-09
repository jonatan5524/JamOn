import logging
from typing import List
import httpx
from app.core.config import settings
from app.providers.exceptions import EmbeddingError

logger = logging.getLogger(__name__)


class CollegeEmbeddingProvider:
    provider_id = "college"

    def embed_document(self, text: str) -> List[float]:
        return self._embed(text)

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [self._embed(text) for text in texts]

    def embed_query(self, text: str) -> List[float]:
        return self._embed(text)

    def _embed(self, text: str) -> List[float]:
        try:
            with httpx.Client(
                auth=(settings.COLLEGE_USERNAME, settings.COLLEGE_PASSWORD),
                timeout=30.0,
            ) as client:
                response = client.post(
                    f"{settings.COLLEGE_BASE_URL}/api/embed",
                    json={"model": "all-minilm:latest", "input": text},
                )
                response.raise_for_status()
                return response.json()["embeddings"][0]
        except Exception as e:
            logger.error(f"College embed failed: {e}")
            raise EmbeddingError(str(e)) from e
