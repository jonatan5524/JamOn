import json
import logging
import os
from typing import List
import httpx
from app.core.config import settings
from app.providers.exceptions import GenerationError

logger = logging.getLogger(__name__)


def _load_prompt(filename: str) -> str:
    path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "prompts", filename)
    with open(path) as f:
        return f.read()


class CollegeDJProvider:
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
            with httpx.Client(
                auth=(settings.COLLEGE_USERNAME, settings.COLLEGE_PASSWORD),
                timeout=60.0,
            ) as client:
                response = client.post(
                    f"{settings.COLLEGE_BASE_URL}/v1/chat/completions",
                    json={"model": "gemma3:12b", "messages": [{"role": "user", "content": prompt}]},
                )
                response.raise_for_status()
                return json.loads(response.json()["choices"][0]["message"]["content"])
        except Exception as e:
            logger.error(f"College generate_playlist failed: {e}")
            raise GenerationError(str(e)) from e
