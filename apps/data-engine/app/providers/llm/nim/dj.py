import json
import logging
import os
import re
from typing import List

import openai

from app.core.config import settings
from app.providers.exceptions import GenerationError

logger = logging.getLogger(__name__)


def _load_prompt(filename: str) -> str:
    path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "prompts", filename)
    with open(path) as f:
        return f.read()


def _parse_json_response(text: str):
    if not text.strip():
        raise GenerationError("NIM DJ returned empty content")
    fence_match = re.search(r"```json\s*([\s\S]*?)```", text)
    if not fence_match:
        fence_match = re.search(r"```\s*([\s\S]*?)```", text)
    json_str = fence_match.group(1).strip() if fence_match else text.strip()
    try:
        parsed = json.loads(json_str)
    except json.JSONDecodeError:
        for pattern in (r"\[[\s\S]*\]", r"\{[\s\S]*\}"):
            match = re.search(pattern, json_str)
            if match:
                parsed = json.loads(match.group())
                break
        else:
            raise
    if isinstance(parsed, list):
        return parsed
    for key in ("playlist", "songs", "tracks"):
        value = parsed.get(key) if isinstance(parsed, dict) else None
        if isinstance(value, list):
            return value
    return [parsed]


class NimDJProvider:
    def __init__(self):
        self._client = openai.OpenAI(
            base_url=settings.NIM_BASE_URL,
            api_key=settings.NVIDIA_API_KEY,
            timeout=120.0,
        )

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
            [
                {k: v for k, v in s.items() if k in ("title", "artist", "vibe_tags", "energy_desc", "mood_desc")}
                for s in context_songs
            ],
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
            response = self._client.chat.completions.create(
                model=settings.NIM_TAGGING_MODEL,
                messages=[{"role": "user", "content": prompt}],
            )
            content = response.choices[0].message.content or ""
            return _parse_json_response(content)
        except GenerationError:
            raise
        except Exception as e:
            logger.error(f"NIM generate_playlist failed: {e}")
            raise GenerationError(str(e)) from e
