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
    # Spine is capped to size - wildcards (17), not the full strong set (19),
    # so library + wildcards never overflows the target playlist size.
    assert len(result["db_songs"]) == 17


@pytest.mark.asyncio
async def test_spine_keeps_closest_songs_when_band_is_compressed():
    """With this embedding model every song clears the absolute 0.4 gate, so the
    spine must be chosen by *rank*, keeping the closest matches and dropping the
    worst-fitting tail — regardless of the order the store returned them in."""
    captured = {}

    # 30 songs, all "strong" (< 0.4), returned in arbitrary order. The worst
    # fits (distance ~0.34) must be the ones dropped from the 17-song spine.
    async def mock_db(query):
        far = [{"title": f"FAR{i}", "artist": "A", "distance": 0.30 + i * 0.01} for i in range(13)]
        near = [{"title": f"NEAR{i}", "artist": "A", "distance": 0.16 + i * 0.005} for i in range(17)]
        return far + near  # deliberately unsorted (far first)

    builder = PlaylistGraphBuilder(
        _capturing_llm(captured), mock_db, None,
        target_playlist_size=20, min_wildcards=3, strong_match_distance=0.4,
    )
    state = PlaylistState(event_description="chill evening", anchor_artists=["A"])
    result = await builder.initial_fetch(state)

    titles = {s["title"] for s in result["db_songs"]}
    assert len(result["db_songs"]) == 17
    assert titles == {f"NEAR{i}" for i in range(17)}  # all NEARs kept, all FARs dropped


@pytest.mark.asyncio
async def test_merge_never_exceeds_target_size():
    captured = {}

    async def mock_db(query):
        return [{"title": f"S{i}", "artist": "A", "distance": 0.1} for i in range(19)]

    async def always_valid(song):
        return True

    builder = PlaylistGraphBuilder(
        _capturing_llm(captured), mock_db, always_valid,
        target_playlist_size=20, min_wildcards=3, strong_match_distance=0.4,
    )
    state = PlaylistState(
        event_description="party", anchor_artists=["A"],
        db_songs=[{"title": f"S{i}", "artist": "A", "distance": 0.1} for i in range(17)],
        validated_wildcards=[
            {"title": f"W{i}", "artist": "AI", "source": "new_suggestion"} for i in range(3)
        ],
    )
    result = await builder.merge_and_shuffle(state)

    assert len(result["final_playlist"]) == 20


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
