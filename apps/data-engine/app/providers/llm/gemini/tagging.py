import json
import logging
import os
from typing import List
from google import genai
from google.genai import types, errors
from app.core.config import settings
from app.core.resilience import with_resilience, AIServiceUnavailableError
from app.providers.exceptions import TaggingError

logger = logging.getLogger(__name__)


def _load_prompt(filename: str) -> str:
    path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "prompts", filename)
    with open(path) as f:
        return f.read()


class GeminiTaggingProvider:
    def __init__(self):
        self._client = genai.Client(api_key=settings.GEMINI_API_KEY)

    @with_resilience
    def tag_songs(self, songs: List[dict]) -> List[dict]:
        prompt_template = _load_prompt("audio_features_prompt.txt")
        prompt = prompt_template.replace("{songs_list}", json.dumps(songs, indent=2))
        try:
            response = self._client.models.generate_content(
                model=settings.AUDIO_FEATURES_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                ),
            )
            return json.loads(response.text)
        except Exception as e:
            if isinstance(e, (errors.APIError, AIServiceUnavailableError)):
                raise
            logger.error(f"Gemini tag_songs failed: {e}")
            raise TaggingError(str(e)) from e
