import json
import logging
from typing import List

logger = logging.getLogger(__name__)

_CATEGORIES = [
    "summer rooftop party with friends",
    "late night study session",
    "morning workout at the gym",
    "relaxed dinner at home",
    "long road trip on the highway",
    "romantic evening at home",
    "sad and introspective Sunday afternoon",
    "high-energy pregame before a night out",
]

# Held-out events: never used for grid search or prompt hill-climbing. Scored once at
# the end so a train-vs-holdout gap reveals overfitting to the training categories.
_HOLDOUT_CATEGORIES = [
    "intense gaming session with the squad",
    "calm rainy morning with coffee and a book",
    "beach bonfire as the sun goes down",
    "focused deep-work coding sprint",
]

_GENERATION_PROMPT = """Generate {n} diverse music event descriptions for testing a playlist recommendation system.
Each should be a short phrase describing a scene or mood (10-20 words).
Cover different energy levels, times of day, and emotional tones.
Return ONLY a raw JSON array of strings, no explanation."""


def get_default_events() -> List[str]:
    return list(_CATEGORIES)


def get_holdout_events() -> List[str]:
    return list(_HOLDOUT_CATEGORIES)


def generate_events(gemini_client, n: int = 8) -> List[str]:
    try:
        response = gemini_client.models.generate_content(
            model="gemini-3.5-flash",
            contents=_GENERATION_PROMPT.replace("{n}", str(n)),
        )
        events = json.loads(response.text)
        if isinstance(events, list) and len(events) >= n:
            return events[:n]
    except Exception as e:
        logger.warning(f"Event generation failed, using defaults: {e}")
    return get_default_events()[:n]
