import pytest
from app.workflows.playlist_generator import PlaylistGraphBuilder
from app.models.state import PlaylistState


def _capturing_llm(captured):
    async def mock_llm(event, count, rejected, context, anchors):
        captured["count"] = count
        captured["anchors"] = list(anchors)
        captured["context_len"] = len(context)
        return [
            {"title": f"W{i}", "artist": "AI", "source": "new_suggestion"}
            for i in range(count)
        ]
    return mock_llm


@pytest.mark.asyncio
async def test_zero_strong_matches_fills_playlist_with_wildcards():
    captured = {}

    async def mock_db(query):
        # Weak match only: distance 0.9 > strong threshold 0.4
        return [{"title": "Lose Yourself", "artist": "Eminem", "distance": 0.9}]

    builder = PlaylistGraphBuilder(
        _capturing_llm(captured), mock_db, None,
        target_playlist_size=20, min_wildcards=3, strong_match_distance=0.4,
    )
    state = PlaylistState(
        event_description="chill evening",
        anchor_artists=["Eminem", "Imagine Dragons"],
    )
    result = await builder.initial_fetch(state)

    assert captured["count"] == 20            # 20 - 0 strong
    assert result["target_wildcards"] == 20
    assert result["db_songs"] == []           # weak song dropped from spine
    assert captured["context_len"] == 0
    assert captured["anchors"] == ["Eminem", "Imagine Dragons"]  # full library, not retrieval


@pytest.mark.asyncio
async def test_many_strong_matches_hits_wildcard_floor():
    captured = {}

    async def mock_db(query):
        return [{"title": f"S{i}", "artist": "A", "distance": 0.1} for i in range(19)]

    builder = PlaylistGraphBuilder(
        _capturing_llm(captured), mock_db, None,
        target_playlist_size=20, min_wildcards=3, strong_match_distance=0.4,
    )
    state = PlaylistState(event_description="party", anchor_artists=["A"])
    result = await builder.initial_fetch(state)

    assert captured["count"] == 3             # max(3, 20 - 19)
    assert len(result["db_songs"]) == 19


@pytest.mark.asyncio
async def test_partial_strong_matches_balance_ratio():
    captured = {}

    async def mock_db(query):
        return [{"title": f"S{i}", "artist": "A", "distance": 0.2} for i in range(5)]

    builder = PlaylistGraphBuilder(
        _capturing_llm(captured), mock_db, None,
        target_playlist_size=20, min_wildcards=3, strong_match_distance=0.4,
    )
    state = PlaylistState(event_description="party", anchor_artists=["A"])
    result = await builder.initial_fetch(state)

    assert captured["count"] == 15            # 20 - 5
    assert len(result["db_songs"]) == 5


@pytest.mark.asyncio
async def test_anchors_fall_back_to_retrieval_when_state_unset():
    captured = {}

    async def mock_db(query):
        return [{"title": "S1", "artist": "Drake", "distance": 0.1}]

    builder = PlaylistGraphBuilder(
        _capturing_llm(captured), mock_db, None,
        target_playlist_size=20, min_wildcards=3, strong_match_distance=0.4,
    )
    state = PlaylistState(event_description="party")  # no anchors seeded
    await builder.initial_fetch(state)

    assert captured["anchors"] == ["Drake"]   # derived from retrieval
