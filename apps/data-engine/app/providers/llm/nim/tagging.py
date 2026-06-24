import json
import logging
import os
import re
from typing import List
import openai
from app.core.config import settings
from app.providers.exceptions import TaggingError

logger = logging.getLogger(__name__)
_BATCH_SIZE = 5


def _load_prompt(filename: str) -> str:
    path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "prompts", filename)
    with open(path) as f:
        return f.read()


def _build_messages(songs: list) -> list:
    songs_json = json.dumps(songs, indent=2)
    system_text = _load_prompt("audio_features_system.txt")
    user_text = _load_prompt("audio_features_user.txt").replace("{songs_list}", songs_json)
    return [
        {"role": "system", "content": system_text},
        {"role": "user", "content": user_text},
    ]


class NimTaggingProvider:
    def __init__(self):
        self._client = openai.OpenAI(
            base_url=settings.NIM_BASE_URL,
            api_key=settings.NVIDIA_API_KEY,
            timeout=120.0,
        )

    def tag_songs(self, songs: List[dict]) -> List[dict]:
        n_batches = (len(songs) + _BATCH_SIZE - 1) // _BATCH_SIZE
        logger.info(f"[nim-tagging] tagging {len(songs)} songs in {n_batches} batch(es) of {_BATCH_SIZE}")
        results = []
        for i in range(0, len(songs), _BATCH_SIZE):
            results.extend(self._tag_batch(songs[i: i + _BATCH_SIZE]))
        logger.info(f"[nim-tagging] all batches done — {len(results)} songs tagged total")
        return results

    def _tag_batch(self, songs: List[dict]) -> List[dict]:
        logger.info(f"[nim-tagging] batch of {len(songs)} songs: {[s.get('title', '?') for s in songs]}")
        messages = _build_messages(songs)
        # NOTE: do NOT set response_format={"type":"json_object"} here. The prompt
        # instructs the model to return a top-level JSON ARRAY, but json_object mode
        # requires a top-level object and rejects/wraps arrays. Rely on the prompt
        # (same approach as the Ollama college tagger).
        try:
            response = self._client.chat.completions.create(
                model=settings.NIM_TAGGING_MODEL,
                messages=messages,
            )
            
            choice = response.choices[0]
            content = choice.message.content or ""
            logger.debug(f"[nim-tagging] finish_reason={choice.finish_reason!r} usage=prompt:{response.usage.prompt_tokens} completion:{response.usage.completion_tokens}")
            logger.debug(f"[nim-tagging] raw response ({len(content)} chars): {content[:400]!r}{'...' if len(content) > 400 else ''}")
            if not content.strip():
                raise TaggingError("NIM returned empty content")
            # Prefer ```json fences; fall back to any fence, then raw content
            fence_match = re.search(r"```json\s*([\s\S]*?)```", content)
            if not fence_match:
                fence_match = re.search(r"```\s*([\s\S]*?)```", content)
            if fence_match:
                logger.debug(f"[nim-tagging] extracted JSON from {'```json' if 'json' in content[fence_match.start():fence_match.start()+7] else '```'} fence")
            json_str = fence_match.group(1).strip() if fence_match else content.strip()
            if not json_str:
                logger.error(f"[nim-tagging] empty json_str after extraction; raw content ({len(content)} chars): {content!r}")
                raise TaggingError("NIM returned empty JSON body after fence extraction")
            try:
                parsed = json.loads(json_str)
            except json.JSONDecodeError as parse_err:
                logger.error(f"[nim-tagging] JSON parse failed ({parse_err}); raw content ({len(content)} chars): {content!r}")
                raise TaggingError(f"NIM JSON parse error: {parse_err}") from parse_err
            result = parsed if isinstance(parsed, list) else [parsed]
            logger.info(f"[nim-tagging] parsed {len(result)} song(s) from response")
            for item in result:
                logger.debug(
                    f"[nim-tagging] tagged '{item.get('title', '?')}' by '{item.get('artist', '?')}' "
                    f"— vibe_tags={item.get('vibe_tags', [])} "
                    f"embedding_text={str(item.get('embedding_text', ''))[:80]!r}"
                )
            return result
        except TaggingError:
            raise
        except Exception as e:
            logger.error(f"NIM tag_batch failed: {e}")
            raise TaggingError(str(e)) from e
