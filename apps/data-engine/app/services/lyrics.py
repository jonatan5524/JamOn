import json
import os
import re
from html import unescape
from html.parser import HTMLParser
from typing import Any, Dict, List, Optional
from urllib import error, parse, request


GENIUS_API_BASE_URL = "https://api.genius.com"
LYRICS_SECTION_REGEX = re.compile(
    r"\[(Verse|Chorus|Pre-Chorus|Post-Chorus|Bridge|Outro|Intro|Refrain|Hook|Interlude|Instrumental)[^\]]*\]",
    re.IGNORECASE,
)
BRACKETED_SECTION_LABEL_REGEX = re.compile(r"(^|\n)\s*\[[^\]\n]{1,80}\]\s*(?=\n|$)")
UNICODE_SPACE_REGEX = re.compile(r"[\u00a0\u1680\u180e\u2000-\u200d\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]")


class GeniusLyricsError(Exception):
    """Raised when Genius cannot be queried or parsed for a track."""


class GeniusLyricsParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self._capture_depth = 0
        self._sections: List[str] = []
        self._current: List[str] = []

    def handle_starttag(self, tag: str, attrs: List[tuple[str, Optional[str]]]):
        attrs_dict = dict(attrs)
        is_lyrics_container = attrs_dict.get("data-lyrics-container") == "true"

        if is_lyrics_container:
            self._capture_depth = 1
            self._current = []
            return

        if self._capture_depth:
            if tag.lower() == "br":
                self._current.append("\n")
                return
            self._capture_depth += 1

    def handle_startendtag(self, tag: str, attrs: List[tuple[str, Optional[str]]]):
        if self._capture_depth and tag.lower() == "br":
            self._current.append("\n")

    def handle_endtag(self, tag: str):
        if not self._capture_depth:
            return

        self._capture_depth -= 1
        if self._capture_depth == 0:
            section = "".join(self._current).strip()
            if section:
                self._sections.append(section)
            self._current = []

    def handle_data(self, data: str):
        if self._capture_depth:
            self._current.append(data)

    @property
    def lyrics(self) -> str:
        return "\n".join(self._sections).strip()


def _get_timeout_seconds() -> int:
    return int(os.environ.get("GENIUS_TIMEOUT_SECONDS", "90"))


def _request_json(url: str, headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    req = request.Request(url, headers=headers or {}, method="GET")

    try:
        with request.urlopen(req, timeout=_get_timeout_seconds()) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        raise GeniusLyricsError(f"Genius request failed with status {exc.code}") from exc
    except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise GeniusLyricsError(f"Genius request failed: {exc}") from exc


def _request_text(url: str) -> str:
    req = request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
            )
        },
        method="GET",
    )

    try:
        with request.urlopen(req, timeout=_get_timeout_seconds()) as response:
            return response.read().decode("utf-8", errors="replace")
    except error.HTTPError as exc:
        raise GeniusLyricsError(f"Failed to fetch Genius song page with status {exc.code}") from exc
    except (error.URLError, TimeoutError) as exc:
        raise GeniusLyricsError(f"Failed to fetch Genius song page: {exc}") from exc


def cleanup_lyrics(lyrics: str) -> str:
    if not lyrics:
        return ""

    cleaned = unescape(lyrics).strip()
    cleaned = UNICODE_SPACE_REGEX.sub(" ", cleaned)
    cleaned = re.sub(r"^\d+\s+Contributors?", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^.*?Lyrics", "", cleaned, flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(r"Translations.*?(?=\[|[A-Za-z])", "", cleaned, flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(r"See .*? Live.*?(?=\[|[A-Za-z])", "", cleaned, flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(r"You might also like", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"Read More\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"&nbsp;", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^\s*\d*\s*Embed\s*$", "", cleaned, flags=re.IGNORECASE | re.MULTILINE)
    cleaned = re.sub(r"\s*\d+\s*Embed\s*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()

    first_bracketed_section = LYRICS_SECTION_REGEX.search(cleaned)
    if first_bracketed_section and first_bracketed_section.start() > 0:
        cleaned = cleaned[first_bracketed_section.start():].strip()

    cleaned = BRACKETED_SECTION_LABEL_REGEX.sub("\n", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    cleaned = re.sub(r"\n[ \t]+", "\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()

    return cleaned


def extract_lyrics_from_html(html: str) -> str:
    parser = GeniusLyricsParser()
    parser.feed(html)
    parser.close()
    return parser.lyrics


def search_song_on_genius(title: str, artist: str) -> Optional[Dict[str, Any]]:
    access_token = os.environ.get("GENIUS_ACCESS_TOKEN")
    if not access_token:
        raise GeniusLyricsError("GENIUS_ACCESS_TOKEN is not configured")

    search_url = f"{GENIUS_API_BASE_URL}/search?{parse.urlencode({'q': f'{title} {artist}'.strip()})}"
    data = _request_json(search_url, headers={"Authorization": f"Bearer {access_token}"})
    hits = data.get("response", {}).get("hits", [])
    requested_artist = artist.lower()

    for hit in hits:
        result = hit.get("result", {})
        if hit.get("type") != "song" or not result.get("url"):
            continue

        primary_artist = result.get("primary_artist", {}).get("name", "").lower()
        if primary_artist and (primary_artist in requested_artist or requested_artist in primary_artist):
            return result

    for hit in hits:
        result = hit.get("result", {})
        if hit.get("type") == "song" and result.get("url"):
            return result

    return None


def fetch_lyrics_for_song(title: str, artist: str) -> Dict[str, Any]:
    song = search_song_on_genius(title, artist)
    if not song:
        return {
            "title": title,
            "artist": artist,
            "found": False,
            "lyrics": "",
        }

    html = _request_text(song["url"])
    lyrics = cleanup_lyrics(extract_lyrics_from_html(html))

    return {
        "title": title,
        "artist": artist,
        "found": bool(lyrics),
        "genius_url": song["url"],
        "lyrics": lyrics,
    }


def fetch_lyrics_batch(songs: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    results = []

    for song in songs:
        title = str(song.get("title") or "").strip()
        artist = str(song.get("artist") or "").strip()

        if not title or not artist:
            results.append(
                {
                    "title": title,
                    "artist": artist,
                    "found": False,
                    "lyrics": "",
                    "error": "Song must include both title and artist.",
                }
            )
            continue

        try:
            results.append(fetch_lyrics_for_song(title, artist))
        except GeniusLyricsError as exc:
            results.append(
                {
                    "title": title,
                    "artist": artist,
                    "found": False,
                    "lyrics": "",
                    "error": str(exc),
                }
            )

    return results


def fetch_lyrics_map(songs: List[Dict[str, str]]) -> Dict[str, str]:
    # Default every song to an empty lyrics string so downstream code can safely
    # continue when Genius is unavailable or has no result for a track.
    lyrics_map = {song["title"]: "" for song in songs if song.get("title")}

    if not os.environ.get("GENIUS_ACCESS_TOKEN"):
        return lyrics_map

    for song in fetch_lyrics_batch(songs):
        title = song.get("title")
        lyrics = song.get("lyrics") or ""
        if title:
            lyrics_map[title] = lyrics

    return lyrics_map
