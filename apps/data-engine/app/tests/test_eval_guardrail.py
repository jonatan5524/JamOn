import pytest
from eval.runner import RunResult


def test_empty_spine_guardrail_predicate():
    """The guardrail condition: all events with an empty library spine."""
    empty = [
        RunResult(event_description="e1", library_songs=[], validated_wildcards=[],
                  target_wildcards=5, final_playlist=[], n_results_requested=15),
        RunResult(event_description="e2", library_songs=[], validated_wildcards=[],
                  target_wildcards=5, final_playlist=[], n_results_requested=15),
    ]
    assert all(len(r.library_songs) == 0 for r in empty) is True

    mixed = empty[:1] + [
        RunResult(event_description="e3", library_songs=[{"title": "x", "distance": 0.2}],
                  validated_wildcards=[], target_wildcards=5, final_playlist=[], n_results_requested=15),
    ]
    assert all(len(r.library_songs) == 0 for r in mixed) is False
