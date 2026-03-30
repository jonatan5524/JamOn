import json
import os
from typing import Dict, List
from urllib import error, request


def fetch_lyrics_map(songs: List[Dict[str, str]]) -> Dict[str, str]:
    # Default every song to an empty lyrics string so downstream code can safely
    # continue without hardcoded lyric fallbacks when the service misses a track.
    lyrics_map = {
        song["title"]: ""
        for song in songs
        if song.get("title")
    }

    lyrics_service_url = os.environ.get("LYRICS_SERVICE_URL")
    if not lyrics_service_url:
        return lyrics_map

    timeout_seconds = int(os.environ.get("LYRICS_SERVICE_TIMEOUT_SECONDS", "90"))

    payload = json.dumps({"songs": songs}).encode("utf-8")
    req = request.Request(
        f"{lyrics_service_url.rstrip('/')}/lyrics/batch",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=timeout_seconds) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"Failed to fetch lyrics from lyrics service: {exc}")
        return lyrics_map

    for song in data.get("songs", []):
        title = song.get("title")
        lyrics = song.get("lyrics") or ""
        if title:
            lyrics_map[title] = lyrics

    return lyrics_map
