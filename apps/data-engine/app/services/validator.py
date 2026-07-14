import httpx
import logging
from enum import Enum
from app.core.config import settings

logger = logging.getLogger(__name__)


class ValidationResult(str, Enum):
    VALID = "valid"
    INVALID = "invalid"
    ERROR = "error"


async def validate_spotify_uri_via_nestjs(song: dict) -> ValidationResult:
    """
    Makes an HTTP call to the NestJS orchestrator to validate if a song exists on Spotify.

    Returns ERROR (not INVALID) when the call itself fails — a timeout, a
    non-200 response, or an auth failure means we don't know whether the song
    is real, so it must not be treated the same as Spotify saying "not found".
    """
    orchestrator_url = settings.ORCHESTRATOR_URL
    title = song.get("title", "")
    artist = song.get("artist", "")

    if not title or not artist:
        return ValidationResult.INVALID

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{orchestrator_url}/internal/spotify/validate",
                json={"title": title, "artist": artist},
                timeout=5.0
            )
            if response.status_code == 200:
                data = response.json()
                return ValidationResult.VALID if data.get("is_valid", False) else ValidationResult.INVALID
            logger.error(f"Validator returned unexpected status {response.status_code} for {title} by {artist}")
            return ValidationResult.ERROR
    except Exception as e:
        logger.error(f"Error validating URI with NestJS: {e}")
        return ValidationResult.ERROR
