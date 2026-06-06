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
        logger.info(f"[gemini-tagging] tagging {len(songs)} songs: {[s.get('title', '?') for s in songs]}")
        prompt_template = _load_prompt("audio_features_prompt.txt")
        prompt = prompt_template.replace("{songs_list}", json.dumps(songs, indent=2))
        logger.debug(f"[gemini-tagging] prompt size: {len(prompt)} chars")
        try:
            response = self._client.models.generate_content(
                model=settings.AUDIO_FEATURES_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                ),
            )
            logger.debug(f"[gemini-tagging] raw response ({len(response.text)} chars): {response.text[:300]!r}{'...' if len(response.text) > 300 else ''}")
            parsed = json.loads(response.text)
            logger.info(f"[gemini-tagging] parsed {len(parsed)} song(s)")
            for item in parsed:
                logger.debug(
                    f"[gemini-tagging] tagged '{item.get('title', '?')}' by '{item.get('artist', '?')}' "
                    f"— vibe_tags={item.get('vibe_tags', [])} "
                    f"embedding_text={str(item.get('embedding_text', ''))[:80]!r}"
                )
            return parsed
        except Exception as e:
            if isinstance(e, (errors.APIError, AIServiceUnavailableError)):
                raise
            logger.error(f"[gemini-tagging] tag_songs failed: {e}")
            raise TaggingError(str(e)) from e
