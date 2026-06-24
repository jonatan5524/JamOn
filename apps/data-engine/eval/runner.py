import hashlib
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

# `lyrics` holds a short, original mood-matched snippet per track (not the real
# copyrighted lyrics). Production embeds "LLM tags + lyrics snippet", so the eval
# corpus must include lyric-like text or the embedding distance distribution it
# tunes thresholds against won't match production's.
MOCK_SONGS = [
    {"title": "Blinding Lights", "artist": "The Weeknd", "genres": ["synth-pop"], "vibe_tags": ["energetic", "night drive", "nostalgic"], "energy_desc": "High energy", "mood_desc": "Nostalgic excitement", "lyrics": "Neon racing past the windshield, city glowing cold and bright, I can't sleep until I find you out here in the night."},
    {"title": "Chill Study Beats", "artist": "ChilledCow", "genres": ["lo-fi", "hip-hop"], "vibe_tags": ["chill", "focus", "calm"], "energy_desc": "Low energy", "mood_desc": "Peaceful focus", "lyrics": "Soft rain on the window, a warm lamp and turning pages, a quiet mind settling into its slow steady flow."},
    {"title": "Power Hour", "artist": "DJ Motivation", "genres": ["electronic", "edm"], "vibe_tags": ["pump up", "workout", "intense"], "energy_desc": "Very high energy", "mood_desc": "Aggressive motivation", "lyrics": "Push it harder, one more rep, the bass won't let you stop, sweat and thunder, break your limit, climbing to the top."},
    {"title": "Sunday Morning", "artist": "Maroon 5", "genres": ["pop", "soul"], "vibe_tags": ["relaxed", "warm", "romantic"], "energy_desc": "Low energy", "mood_desc": "Gentle warmth", "lyrics": "Lazy light through the curtains, coffee warm between our hands, let's stay tangled up in bed a little longer, love."},
    {"title": "Highway to Hell", "artist": "AC/DC", "genres": ["rock", "hard rock"], "vibe_tags": ["rebellious", "driving", "loud"], "energy_desc": "High energy", "mood_desc": "Wild freedom", "lyrics": "Engine roaring down the open road, no brakes and no rules tonight, just the rumble and the freedom of the ride."},
    {"title": "Lullaby", "artist": "Sigala", "genres": ["dance", "pop"], "vibe_tags": ["dreamy", "romantic", "soft"], "energy_desc": "Medium energy", "mood_desc": "Warm romance", "lyrics": "Close your eyes and drift along a gentle glowing wave, dreaming soft and weightless till the morning calls your name."},
    {"title": "The Night We Met", "artist": "Lord Huron", "genres": ["indie", "folk"], "vibe_tags": ["melancholic", "nostalgic", "sad"], "energy_desc": "Low energy", "mood_desc": "Bittersweet longing", "lyrics": "I still remember the quiet night we met, and I keep wishing I could turn the years back and start again."},
    {"title": "HUMBLE.", "artist": "Kendrick Lamar", "genres": ["hip-hop", "rap"], "vibe_tags": ["confident", "hype", "urban"], "energy_desc": "High energy", "mood_desc": "Assertive power", "lyrics": "Stay grounded, keep it honest, let the work speak for the name, the block remembers everyone who came up through the flame."},
    {"title": "Bad Guy", "artist": "Billie Eilish", "genres": ["pop", "electropop"], "vibe_tags": ["dark", "quirky", "edgy"], "energy_desc": "Medium energy", "mood_desc": "Playful darkness", "lyrics": "Creeping in the shadows with a sly and crooked smile, not the kind of trouble that you ever saw a mile."},
    {"title": "Sunset Lover", "artist": "Petit Biscuit", "genres": ["electronic", "indie"], "vibe_tags": ["dreamy", "chill", "sunset"], "energy_desc": "Low energy", "mood_desc": "Dreamy warmth", "lyrics": "Golden waves are rolling slow, the sky is melting into sea, and the warm light wraps around us soft and free."},
    {"title": "Eye of the Tiger", "artist": "Survivor", "genres": ["rock", "classic rock"], "vibe_tags": ["motivational", "workout", "classic"], "energy_desc": "High energy", "mood_desc": "Determined grit", "lyrics": "Rising up with my back against the wall, the fire in my chest will never fade, hungry and ready for it all."},
    {"title": "Retrograde", "artist": "James Blake", "genres": ["electronic", "r&b"], "vibe_tags": ["introspective", "ambient", "emotional"], "energy_desc": "Low energy", "mood_desc": "Deep contemplation", "lyrics": "Suddenly I'm falling and the whole world goes quiet, just hold on through the dark and we'll be alright tonight."},
    {"title": "Levitating", "artist": "Dua Lipa", "genres": ["disco", "pop"], "vibe_tags": ["fun", "danceable", "uplifting"], "energy_desc": "High energy", "mood_desc": "Joyful euphoria", "lyrics": "Floating up among the stars with you, dancing weightless and bright, spinning through a glittering endless disco night."},
    {"title": "Comptine d'un autre été", "artist": "Yann Tiersen", "genres": ["classical", "film score"], "vibe_tags": ["melancholic", "piano", "cinematic"], "energy_desc": "Low energy", "mood_desc": "Delicate sadness", "lyrics": "Instrumental piano, delicate and wistful, the soft ache of a remembered summer long ago."},
    {"title": "God's Plan", "artist": "Drake", "genres": ["hip-hop", "r&b"], "vibe_tags": ["chill", "confident", "soulful"], "energy_desc": "Medium energy", "mood_desc": "Reflective confidence", "lyrics": "They keep wishing bad on me but I just follow the plan, blessings on my people, doing all the good I can."},
    {"title": "Sandstorm", "artist": "Darude", "genres": ["trance", "edm"], "vibe_tags": ["euphoric", "rave", "classic"], "energy_desc": "Very high energy", "mood_desc": "Pure euphoria", "lyrics": "Instrumental rave anthem, lights flashing, the crowd surging, the drop hits and we lose ourselves in pure euphoria."},
    {"title": "The Less I Know the Better", "artist": "Tame Impala", "genres": ["psychedelic", "indie"], "vibe_tags": ["groovy", "dreamy", "bittersweet"], "energy_desc": "Medium energy", "mood_desc": "Wistful groove", "lyrics": "She said something and I lost my mind, spinning in a groove I can't escape, sweet and aching all the time."},
    {"title": "Outro", "artist": "M83", "genres": ["electronic", "shoegaze"], "vibe_tags": ["epic", "cinematic", "emotional"], "energy_desc": "High energy", "mood_desc": "Overwhelming beauty", "lyrics": "I am the ruler of my own quiet land, rising slowly into an endless shimmering sky."},
    {"title": "Numb", "artist": "Linkin Park", "genres": ["rock", "nu-metal"], "vibe_tags": ["angry", "emotional", "powerful"], "energy_desc": "High energy", "mood_desc": "Raw frustration", "lyrics": "So tired of being everything you want me to be, suffocating slowly underneath the weight you put on me."},
    {"title": "Coffee", "artist": "beabadoobee", "genres": ["indie", "bedroom pop"], "vibe_tags": ["lazy", "romantic", "soft"], "energy_desc": "Low energy", "mood_desc": "Hazy morning warmth", "lyrics": "A lazy hazy afternoon, your hand resting soft in mine, the smell of coffee and the rain against the blinds."},
]

_FIXTURES_DIR = Path(__file__).parent / "fixtures"
_LIBRARY_FIXTURE = _FIXTURES_DIR / "user_library.json"


def load_library() -> List[Dict[str, Any]]:
    """Load the eval song library.

    Returns the seeded real-user library from eval/fixtures/user_library.json if
    available (generated by eval/seed_library.py), otherwise falls back to the
    built-in MOCK_SONGS with a warning so the eval still runs without seeding.
    """
    if _LIBRARY_FIXTURE.exists():
        try:
            songs = json.loads(_LIBRARY_FIXTURE.read_text())
            logger.info(f"[library] loaded {len(songs)} songs from {_LIBRARY_FIXTURE}")
            return songs
        except Exception as e:
            logger.warning(f"[library] failed to read {_LIBRARY_FIXTURE}: {e} — falling back to MOCK_SONGS")
    else:
        logger.warning(
            f"[library] {_LIBRARY_FIXTURE} not found — using built-in MOCK_SONGS. "
            "Run `python -m eval.seed_library --user-id <id>` to seed a real library."
        )
    return list(MOCK_SONGS)


# Fraction of AI-suggested wildcards that fail Spotify resolution in production.
# The eval mimics this deterministically so acceptance_rate carries real signal.
WILDCARD_REJECT_RATE = 0.3


@dataclass
class RunConfig:
    n_results: int = 15
    max_distance: float = 0.65
    target_wildcards: int = 5
    strong_match_margin: float = 0.10
    max_attempts: int = 3
    target_playlist_size: int = 20
    hyde_prompt: str = ""
    dj_prompt: str = ""


@dataclass
class RunResult:
    event_description: str
    library_songs: List[Dict[str, Any]]
    validated_wildcards: List[Dict[str, Any]]
    target_wildcards: int
    final_playlist: List[Dict[str, Any]]
    n_results_requested: int = 15
    target_playlist_size: int = 20


def stub_validator(song: Dict[str, Any], reject_rate: float = WILDCARD_REJECT_RATE) -> bool:
    """Approximate Spotify URI resolution for AI-suggested wildcards.

    Real production resolves each new suggestion against the Spotify Search API and
    a fraction fail (hallucinated or unavailable tracks), triggering regeneration.
    A flat "always accept" stub made acceptance_rate a dead constant, so we reject a
    deterministic ~reject_rate fraction (hash-based, reproducible across runs).
    """
    title = song.get("title", "").strip()
    artist = song.get("artist", "").strip()
    if not title or not artist:
        return False
    bucket = int(hashlib.md5(f"{title}::{artist}".encode()).hexdigest(), 16) % 100
    return bucket >= int(reject_rate * 100)


async def run_pipeline(
    event_description: str,
    compiled_graph,
    target_wildcards: int,
    n_results_requested: int = 15,
    target_playlist_size: int = 20,
) -> RunResult:
    state = await compiled_graph.ainvoke({"event_description": event_description})
    return RunResult(
        event_description=event_description,
        library_songs=state.get("db_songs", []),
        validated_wildcards=state.get("validated_wildcards", []),
        # Use the graph's actual computed target (max(min_wildcards, playlist_size - spine)),
        # not the config minimum — acceptance_rate must reflect the real fill goal.
        target_wildcards=state.get("target_wildcards", target_wildcards),
        final_playlist=state.get("final_playlist", []),
        n_results_requested=n_results_requested,
        target_playlist_size=target_playlist_size,
    )
