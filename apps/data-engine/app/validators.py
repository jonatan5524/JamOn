import httpx
import os
import logging

logger = logging.getLogger(__name__)

async def validate_spotify_uri_via_nestjs(song: dict) -> bool:
    """
    Makes an HTTP call to the NestJS orchestrator to validate if a song exists on Spotify.
    """
    orchestrator_url = os.environ.get("ORCHESTRATOR_URL", "http://localhost:3000")
    title = song.get("title", "")
    artist = song.get("artist", "")
    
    if not title or not artist:
        return False

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{orchestrator_url}/internal/spotify/validate",
                json={"title": title, "artist": artist},
                timeout=5.0
            )
            if response.status_code == 200:
                data = response.json()
                return data.get("is_valid", False)
            return False
    except Exception as e:
        logger.error(f"Error validating URI with NestJS: {e}")
        return False
