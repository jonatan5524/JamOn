import logging
import os
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)


def _load_prompt(filename: str) -> str:
    path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "prompts", filename)
    with open(path) as f:
        return f.read()


class CollegeHyDEProvider:
    def expand_query(self, event_description: str) -> str:
        prompt = _load_prompt("hyde_prompt.txt").replace("{event_description}", event_description)
        try:
            with httpx.Client(
                auth=(settings.COLLEGE_USERNAME, settings.COLLEGE_PASSWORD),
                timeout=30.0,
            ) as client:
                response = client.post(
                    f"{settings.COLLEGE_BASE_URL}/v1/chat/completions",
                    json={"model": "gemma3:12b", "messages": [{"role": "user", "content": prompt}]},
                )
                response.raise_for_status()
                return response.json()["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error(f"College HyDE expansion failed: {e}")
            return event_description
