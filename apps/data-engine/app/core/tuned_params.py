import json
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

TARGET_PLAYLIST_SIZE = 20

DEFAULTS = {
    "max_distance": 0.7,
    "strong_match_margin": 0.10,
}


def load_tuned_params() -> dict:
    """Load eval-tuned retrieval/generation params, falling back to defaults.

    The eval loop writes the best config to settings.TUNED_PARAMS_PATH. Production
    reads it here so improvements found by the optimizer actually take effect, while
    a missing or malformed file degrades gracefully to the original defaults.

    Only keys present in DEFAULTS are merged from the file; extra keys in the JSON
    are silently ignored, preventing typos in eval output from injecting unknown params.
    """
    params = dict(DEFAULTS)
    path = settings.TUNED_PARAMS_PATH
    try:
        with open(path) as f:
            loaded = json.load(f)
        for key in DEFAULTS:
            if key in loaded:
                params[key] = loaded[key]
        logger.info(f"Loaded tuned params from {path}: {params}")
    except FileNotFoundError:
        logger.info(f"No tuned params file at {path}; using defaults: {params}")
    except Exception as e:
        logger.warning(f"Failed to load tuned params from {path} ({e}); using defaults: {params}")
    return params


def scale_params_to_target(params: dict, target_size: int = TARGET_PLAYLIST_SIZE) -> dict:
    """Set a generous retrieval pool size, independent of the tuned ratio.

    The eval loop used to tune n_results/target_wildcards at a 12-song scale (e.g.
    n_results=5). Proportionally scaling that up to a 20-song target used to cap
    retrieval at ~8 candidates regardless of library quality, forcing >=60%
    AI-generated wildcards even when the group's library was a great match.
    Retrieval sizing is now just a generous multiple of the target; the
    strong-match margin and spine cap in initial_fetch() do the real selection,
    so a bigger pool only gives them more to choose from.
    """
    scaled = dict(params)
    scaled["n_results"] = max(30, 2 * target_size)
    return scaled
