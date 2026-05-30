import json
import logging
import os
from typing import List
from google import genai
from google.genai import types
from app.core.config import settings
from app.core.resilience import with_resilience
from app.providers.exceptions import GenerationError

logger = logging.getLogger(__name__)


def _load_prompt(filename: str) -> str:
    path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "prompts", filename)
    with open(path) as f:
        return f.read()


class GeminiDJProvider:
    def __init__(self):
        self._client = genai.Client(api_key=settings.GEMINI_API_KEY)

    def expand_query_hyde(self, event_description: str) -> str:
        prompt = _load_prompt("hyde_prompt.txt").replace("{event_description}", event_description)
        try:
            response = self._client.models.generate_content(
                model=settings.PLAYLIST_GENERATION_MODEL,
                contents=prompt,
            )
            return response.text or event_description
        except Exception as e:
            logger.error(f"Gemini HyDE expansion failed: {e}")
            return event_description

    @with_resilience
    def generate_playlist(
        self,
        event_description: str,
        context_songs: List[dict],
        count: int,
        rejected: List[str],
    ) -> List[dict]:
        if rejected is None:
            rejected = []
        prompt_template = _load_prompt("playlist_generation_prompt.txt")
        context_str = json.dumps(
            [{k: v for k, v in s.items() if k in ("title", "artist", "vibe_tags", "energy_desc", "mood_desc")}
             for s in context_songs],
            indent=2,
        )
        rejected_str = json.dumps(rejected, indent=2) if rejected else "None"
        prompt = (
            prompt_template
            .replace("{event_description}", event_description)
            .replace("{context_str}", context_str)
            .replace("{rejected_str}", rejected_str)
            .replace("{count}", str(count))
        )
        try:
            response = self._client.models.generate_content(
                model=settings.PLAYLIST_GENERATION_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(response_mime_type="application/json"),
            )
            return json.loads(response.text)
        except Exception as e:
            logger.error(f"Gemini generate_playlist failed: {e}")
            raise GenerationError(str(e)) from e
