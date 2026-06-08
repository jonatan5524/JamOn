import json
import logging
from typing import Any, Dict, List
from urllib import parse, request, error
from app.core.config import settings

logger = logging.getLogger(__name__)

_BASE_URL = "https://ws.audioscrobbler.com/2.0/"
_MAX_TAGS = 8


def _request_json(url: str) -> Dict[str, Any]:
    req = request.Request(url, method="GET")
    try:
        with request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except (error.URLError, error.HTTPError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Last.fm request failed: {exc}") from exc


def fetch_lastfm_tags(title: str, artist: str) -> List[str]:
    if not settings.LASTFM_API_KEY:
        logger.debug("[lastfm] LASTFM_API_KEY not set — skipping tag fetch")
        return []
    logger.info(f"[lastfm] fetching tags for '{title}' by '{artist}'")
    params = parse.urlencode({
        "method": "track.getTopTags",
        "artist": artist,
        "track": title,
        "api_key": settings.LASTFM_API_KEY,
        "format": "json",
        "autocorrect": 1,
    })
    try:
        data = _request_json(f"{_BASE_URL}?{params}")
        tags = data.get("toptags", {}).get("tag", [])
        result = [t["name"] for t in tags[:_MAX_TAGS] if isinstance(t, dict) and t.get("name")]
        logger.debug(f"[lastfm] tags for '{title}': {result}")
        return result
    except Exception as exc:
        logger.warning(f"[lastfm] tag fetch failed for '{title}' by '{artist}': {exc}")
        return []
