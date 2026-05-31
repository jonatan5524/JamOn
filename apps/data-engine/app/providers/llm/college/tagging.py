import json
import logging
import os
from typing import List
import httpx
from app.core.config import settings
from app.providers.exceptions import TaggingError

logger = logging.getLogger(__name__)
_BATCH_SIZE = 7


def _load_prompt(filename: str) -> str:
    path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "prompts", filename)
    with open(path) as f:
        return f.read()


class CollegeTaggingProvider:
    def tag_songs(self, songs: List[dict]) -> List[dict]:
        results = []
        for i in range(0, len(songs), _BATCH_SIZE):
            results.extend(self._tag_batch(songs[i: i + _BATCH_SIZE]))
        return results

    def _tag_batch(self, songs: List[dict]) -> List[dict]:
        prompt = _load_prompt("audio_features_prompt.txt").replace(
            "{songs_list}", json.dumps(songs, indent=2)
        )
        
        try:
            with httpx.Client(
                auth=(settings.COLLEGE_USERNAME, settings.COLLEGE_PASSWORD),
                timeout=60.0,
            ) as client:
                response = client.post(
                    f"{settings.COLLEGE_BASE_URL}/api/generate",
                    json={"model": "llama3.1:8b", "prompt": prompt, "format": "json", "stream": False},
                )
                response.raise_for_status()
                
                parsed = json.loads(response.json()["response"])
                return parsed if isinstance(parsed, list) else [parsed]
        except Exception as e:
            logger.error(f"College tag_batch failed: {e}")
            raise TaggingError(str(e)) from e
