import json
import logging
import re
import time
from dataclasses import dataclass
from typing import List, Dict, Any

import openai

from app.core.config import settings
from eval.runner import RunResult

logger = logging.getLogger(__name__)

CALL_DELAY_SECONDS = 1

_JUDGE_PROMPT = """You are a music expert evaluating playlist quality.

Event: "{event_description}"

Playlist:
{playlist_str}

Rate how well this playlist fits the event on a scale of 0-10. Consider:
- Genre and mood match to the event
- Energy level appropriateness
- Cohesion of the tracklist

Return ONLY a JSON object with no extra text: {{"score": <number between 0 and 10>}}"""

_nim_client: openai.OpenAI | None = None


def _get_nim_client() -> openai.OpenAI:
    global _nim_client
    if _nim_client is None:
        _nim_client = openai.OpenAI(
            base_url=settings.NIM_BASE_URL,
            api_key=settings.NVIDIA_API_KEY,
            timeout=60.0,
        )
    return _nim_client


def _parse_score(text: str) -> float:
    try:
        return float(json.loads(text)["score"]) / 10.0
    except Exception:
        match = re.search(r'"score"\s*:\s*([0-9]+(?:\.[0-9]+)?)', text)
        if match:
            return float(match.group(1)) / 10.0
        raise ValueError(f"No score found in: {text!r}")


@dataclass
class ScoreResult:
    alignment: float
    acceptance_rate: float
    retrieval_relevance: float
    size_fulfillment: float
    composite: float


def compute_acceptance_rate(validated_count: int, target: int) -> float:
    if target == 0:
        return 0.0
    return min(validated_count / target, 1.0)


def compute_retrieval_relevance(library_songs: List[Dict[str, Any]], n_results_requested: int = 15) -> float:
    if not library_songs:
        return 0.0
    distances = [s.get("distance", 1.0) for s in library_songs]
    precision = 1.0 - (sum(distances) / len(distances))
    recall = min(len(library_songs) / max(1, n_results_requested), 1.0)
    return precision * recall


def compute_size_fulfillment(total_songs: int, target_size: int) -> float:
    """Fraction of the target playlist size actually delivered (capped at 1.0).

    Penalises parameter combinations that cannot fill the playlist to the
    desired length, ensuring the optimizer picks configs that produce
    target_playlist_size songs, not just high-quality small playlists.
    """
    if target_size <= 0:
        return 0.0
    return min(total_songs / target_size, 1.0)


def compute_composite(
    alignment: float,
    acceptance_rate: float,
    retrieval_relevance: float,
    size_fulfillment: float,
) -> float:
    return (
        0.45 * alignment
        + 0.25 * acceptance_rate
        + 0.15 * retrieval_relevance
        + 0.15 * size_fulfillment
    )


def judge_alignment(event_description: str, playlist: List[Dict[str, Any]]) -> float:
    playlist_str = "\n".join(
        f"- {s.get('title', 'Unknown')} by {s.get('artist', 'Unknown')}"
        for s in playlist
    )
    prompt = _JUDGE_PROMPT.format(
        event_description=event_description,
        playlist_str=playlist_str or "(empty playlist)",
    )
    try:
        client = _get_nim_client()
        response = client.chat.completions.create(
            model=settings.NIM_TAGGING_MODEL,  # meta/llama-3.3-70b-instruct
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.choices[0].message.content or ""
        return _parse_score(text)
    except Exception as e:
        logger.warning(f"Judge call failed for '{event_description}': {e}")
        return 0.5


def score_run(result: RunResult, sleep: bool = False) -> ScoreResult:
    if sleep:
        time.sleep(CALL_DELAY_SECONDS)
    alignment = judge_alignment(result.event_description, result.final_playlist)
    acceptance = compute_acceptance_rate(len(result.validated_wildcards), result.target_wildcards)
    relevance = compute_retrieval_relevance(result.library_songs, result.n_results_requested)
    size = compute_size_fulfillment(len(result.final_playlist), result.target_playlist_size)
    composite = compute_composite(alignment, acceptance, relevance, size)
    return ScoreResult(
        alignment=alignment,
        acceptance_rate=acceptance,
        retrieval_relevance=relevance,
        size_fulfillment=size,
        composite=composite,
    )
