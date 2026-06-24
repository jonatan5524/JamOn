import json
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

TARGET_PLAYLIST_SIZE = 20

DEFAULTS = {
    "n_results": 20,
    "max_distance": 0.7,
    "target_wildcards": 5,
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
    """Scale n_results and target_wildcards proportionally to hit target_size songs.

    The eval finds the optimal quality ratio (e.g. 5 library : 3 wildcard). This
    function preserves that ratio while scaling the absolute counts to produce a
    playlist of target_size songs.
    """
    base_total = params["n_results"] + params["target_wildcards"]
    if base_total == 0:
        return params
    scale = target_size / base_total
    n_results = max(1, round(params["n_results"] * scale))
    target_wildcards = max(0, target_size - n_results)
    scaled = dict(params)
    scaled["n_results"] = n_results
    scaled["target_wildcards"] = target_wildcards
    return scaled
