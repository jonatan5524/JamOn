import hashlib
import json
from pathlib import Path


class HyDECache:
    def __init__(self, cache_dir: Path):
        self._dir = Path(cache_dir)
        self._dir.mkdir(parents=True, exist_ok=True)

    def _key_path(self, event: str, prompt_hash: str) -> Path:
        key = hashlib.md5(f"{event}::{prompt_hash}".encode()).hexdigest()
        return self._dir / f"{key}.json"

    def get(self, event: str, prompt_hash: str) -> str | None:
        path = self._key_path(event, prompt_hash)
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text())["value"]
        except (json.JSONDecodeError, KeyError):
            return None

    def set(self, event: str, prompt_hash: str, value: str) -> None:
        target = self._key_path(event, prompt_hash)
        tmp = target.with_suffix(".tmp")
        tmp.write_text(json.dumps({"value": value}))
        tmp.rename(target)
