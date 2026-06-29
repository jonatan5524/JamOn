import logging
import os
from google import genai
from google.genai import types
from app.core.config import settings
from app.providers.exceptions import GenerationError

logger = logging.getLogger(__name__)


def _load_prompt(filename: str) -> str:
    path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "prompts", filename)
    with open(path) as f:
        return f.read()


class GeminiHyDEProvider:
    def __init__(self):
        self._client = genai.Client(
            api_key=settings.GEMINI_API_KEY,
            http_options=types.HttpOptions(timeout=30_000),
        )

    def expand_query(self, event_description: str) -> str:
        prompt = _load_prompt("hyde_prompt.txt").replace("{event_description}", event_description)
        try:
            response = self._client.models.generate_content(
                model=settings.PLAYLIST_GENERATION_MODEL,
                contents=prompt,
            )
            if not response.text:
                raise GenerationError("Gemini HyDE returned empty content")
            return response.text
        except Exception as e:
            logger.error(f"Gemini HyDE expansion failed: {e}")
            raise GenerationError(str(e)) from e
