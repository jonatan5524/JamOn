import logging
import os
import openai
from app.core.config import settings
from app.providers.exceptions import GenerationError

logger = logging.getLogger(__name__)


def _load_prompt(filename: str) -> str:
    path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "prompts", filename)
    with open(path) as f:
        return f.read()


class NimHyDEProvider:
    def __init__(self):
        self._client = openai.OpenAI(
            base_url=settings.NIM_BASE_URL,
            api_key=settings.NVIDIA_API_KEY,
            timeout=60.0,
        )

    def expand_query(self, event_description: str) -> str:
        prompt = _load_prompt("hyde_prompt.txt").replace("{event_description}", event_description)
        try:
            response = self._client.chat.completions.create(
                model=settings.NIM_HYDE_MODEL,
                messages=[{"role": "user", "content": prompt}],
            )
            content = response.choices[0].message.content or ""
            if not content.strip():
                raise GenerationError("NIM HyDE returned empty content")
            return content
        except Exception as e:
            logger.error(f"NIM HyDE expansion failed: {e}")
            raise GenerationError(str(e)) from e
