"""
Seed the eval library fixture from a real user's Spotify library.

Calls POST /internal/spotify/top-tracks on the running NestJS orchestrator
to pull the user's Top-N tracks, then enriches each one with lyrics and
LLM-generated vibe tags (the same pipeline production uses at ingest time),
and writes the result to eval/fixtures/user_library.json.

Run once before using the eval loop on a real library:
    cd apps/data-engine
    python -m eval.seed_library --user-id <your-user-id>
    python -m eval.seed_library --user-id <id> --limit 30 --orchestrator-url http://localhost:3000

The fixture is loaded automatically by the eval loop when present; missing file
falls back to the built-in MOCK_SONGS.
"""
import argparse
import asyncio
import json
import logging
from pathlib import Path

import httpx

from app.core.config import settings
from app.services.enrichment import enrich_song
from app.providers.llm.gemini.tagging import GeminiTaggingProvider

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

FIXTURES_DIR = Path(__file__).parent / "fixtures"
LIBRARY_FIXTURE = FIXTURES_DIR / "user_library.json"


async def fetch_top_tracks(spotify_id: str, limit: int, orchestrator_url: str) -> list[dict]:
    url = f"{orchestrator_url}/internal/spotify/top-tracks"
    logger.info(f"Fetching top {limit} tracks for Spotify user '{spotify_id}' from {url}")
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json={"spotify_id": spotify_id, "limit": limit})
        if response.status_code == 404:
            detail = response.json().get("message", response.text)
            raise RuntimeError(f"404 from orchestrator: {detail}")
        response.raise_for_status()
        data = response.json()
    tracks = data["tracks"]
    logger.info(f"Got {len(tracks)} tracks from orchestrator")
    return tracks


async def enrich_and_tag(tracks: list[dict]) -> list[dict]:
    logger.info(f"Enriching {len(tracks)} tracks (lyrics + last.fm tags)...")
    enriched = await asyncio.gather(
        *(asyncio.to_thread(enrich_song, {"track_id": f"{t['title']}-{t['artist']}", **t}) for t in tracks)
    )
    logger.info(f"Enrichment done — {sum(1 for e in enriched if e.lyrics_snippet)} tracks have lyrics")

    input_songs = [
        {
            "title": e.title,
            "artist": e.artist,
            "lastfm_tags": e.lastfm_tags,
            "lyrics_snippet": e.lyrics_snippet,
        }
        for e in enriched
    ]

    logger.info("Tagging songs with LLM (energy, mood, vibe_tags)...")
    tagger = GeminiTaggingProvider()
    songs_with_features = await asyncio.to_thread(tagger.tag_songs, input_songs)
    logger.info(f"Tagging done — {len(songs_with_features)} songs tagged")

    # Attach lyrics snippets so the eval embeds tags+lyrics, matching production.
    lyrics_by_title = {e.title: e.lyrics_snippet or "" for e in enriched}
    for song in songs_with_features:
        song["lyrics"] = lyrics_by_title.get(song.get("title", ""), "")

    return songs_with_features


async def main():
    parser = argparse.ArgumentParser(description="Seed eval library from user's Spotify Top-N")
    parser.add_argument(
        "--spotify-id", required=True,
        help="Your Spotify user ID (visible at open.spotify.com/user/<id> or via GET /me on the Spotify API)",
    )
    parser.add_argument("--limit", type=int, default=50, help="Number of top tracks to fetch (default: 50)")
    parser.add_argument(
        "--orchestrator-url",
        default=settings.ORCHESTRATOR_URL,
        help=f"NestJS orchestrator base URL (default: {settings.ORCHESTRATOR_URL})",
    )
    args = parser.parse_args()

    tracks = await fetch_top_tracks(args.spotify_id, args.limit, args.orchestrator_url)
    if not tracks:
        logger.error("No tracks returned — is the user logged in and has a saved Spotify token?")
        return

    songs_with_features = await enrich_and_tag(tracks)
    if not songs_with_features:
        logger.error("Tagging returned empty result — check Gemini API key")
        return

    FIXTURES_DIR.mkdir(exist_ok=True)
    LIBRARY_FIXTURE.write_text(json.dumps(songs_with_features, indent=2, ensure_ascii=False))
    logger.info(f"Saved {len(songs_with_features)} songs to {LIBRARY_FIXTURE}")
    print(f"\nLibrary fixture written: {LIBRARY_FIXTURE}")
    print(f"Songs: {len(songs_with_features)}")
    print("Run the eval loop to score and optimize against your real library.")


if __name__ == "__main__":
    asyncio.run(main())
