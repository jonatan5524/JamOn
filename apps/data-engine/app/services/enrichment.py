import logging
from app.models.song import EnrichedSong
from app.services.lyrics import fetch_lyrics_for_song
from app.services.lastfm import fetch_lastfm_tags

logger = logging.getLogger(__name__)

_LYRICS_SNIPPET_MAX_CHARS = 800


def enrich_song(song: dict) -> EnrichedSong:
    title = song.get("title", "")
    artist = song.get("artist", "")
    track_id = song.get("track_id", f"{title}-{artist}")

    logger.info(f"[enrich] '{title}' by '{artist}'")

    lyrics_result = fetch_lyrics_for_song(title, artist)
    raw_lyrics = lyrics_result.get("lyrics") or ""
    lyrics_snippet = raw_lyrics[:_LYRICS_SNIPPET_MAX_CHARS] if raw_lyrics else None
    lyrics_source = lyrics_result.get("lyrics_source") if lyrics_result.get("found") else None

    if lyrics_snippet:
        logger.debug(
            f"[enrich] lyrics OK for '{title}' — {len(raw_lyrics)} chars total, "
            f"snippet={len(lyrics_snippet)} chars, source={lyrics_source}"
        )
    else:
        logger.info(f"[enrich] no lyrics for '{title}' by '{artist}'")

    lastfm_tags = fetch_lastfm_tags(title, artist)
    if lastfm_tags:
        logger.debug(f"[enrich] Last.fm tags for '{title}': {lastfm_tags}")
    else:
        logger.info(f"[enrich] no Last.fm tags for '{title}' by '{artist}'")

    result = EnrichedSong(
        track_id=track_id,
        title=title,
        artist=artist,
        lastfm_tags=lastfm_tags,
        lyrics_snippet=lyrics_snippet,
        lyrics_source=lyrics_source,
    )
    logger.info(
        f"[enrich] done '{title}' — lyrics={'yes' if lyrics_snippet else 'no'}, "
        f"lastfm_tags={len(lastfm_tags)}"
    )
    return result
