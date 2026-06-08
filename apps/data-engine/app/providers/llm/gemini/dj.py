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

    @with_resilience
    def generate_playlist(
        self,
        event_description: str,
        context_songs: List[dict],
        count: int,
        rejected: List[str],
        anchor_artists: List[str] = None,
    ) -> List[dict]:
        if rejected is None:
            rejected = []
        if anchor_artists is None:
            anchor_artists = []
        prompt_template = _load_prompt("playlist_generation_prompt.txt")
        context_str = json.dumps(
            [{k: v for k, v in s.items() if k in ("title", "artist", "vibe_tags", "energy_desc", "mood_desc")}
             for s in context_songs],
            indent=2,
        )
        rejected_str = json.dumps(rejected, indent=2) if rejected else "None"
        anchor_str = ", ".join(anchor_artists) if anchor_artists else "Not specified"
        prompt = (
            prompt_template
            .replace("{event_description}", event_description)
            .replace("{anchor_artist_list}", anchor_str)
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
