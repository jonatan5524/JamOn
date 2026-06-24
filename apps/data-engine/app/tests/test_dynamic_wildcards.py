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
async def test_single_retrieved_song_becomes_spine():
    """Relative gate: a song that cleared retrieval is the best match for this
    query, so it joins the spine. Absolute weak-pool rejection is now max_distance's
    job (applied upstream at the store), not the spine margin's."""
    captured = {}

    async def mock_db(query):
        return [{"title": "Lose Yourself", "artist": "Eminem", "distance": 0.9}]

    builder = PlaylistGraphBuilder(
        _capturing_llm(captured), mock_db, None,
        target_playlist_size=20, min_wildcards=3, strong_match_margin=0.10,
    )
    state = PlaylistState(
        event_description="chill evening",
        anchor_artists=["Eminem", "Imagine Dragons"],
    )
    result = await builder.initial_fetch(state)

    assert len(result["db_songs"]) == 1               # the lone match is the spine
    assert result["target_wildcards"] == 19           # max(3, 20 - 1)
    assert captured["count"] == 19
    assert captured["anchors"] == ["Eminem", "Imagine Dragons"]


@pytest.mark.asyncio
async def test_many_strong_matches_hits_wildcard_floor():
    captured = {}

    async def mock_db(query):
        return [{"title": f"S{i}", "artist": "A", "distance": 0.1} for i in range(19)]

    builder = PlaylistGraphBuilder(
        _capturing_llm(captured), mock_db, None,
        target_playlist_size=20, min_wildcards=3, strong_match_margin=0.10,
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

    # 30 songs, all within margin of the closest (0.16), returned in arbitrary order.
    # The worst fits (distance ~0.34) are outside a 0.10 margin of best=0.16 (cutoff=0.26),
    # so the FAR songs (0.30-0.42) must be dropped.
    async def mock_db(query):
        far = [{"title": f"FAR{i}", "artist": "A", "distance": 0.30 + i * 0.01} for i in range(13)]
        near = [{"title": f"NEAR{i}", "artist": "A", "distance": 0.16 + i * 0.005} for i in range(17)]
        return far + near  # deliberately unsorted (far first)

    builder = PlaylistGraphBuilder(
        _capturing_llm(captured), mock_db, None,
        target_playlist_size=20, min_wildcards=3, strong_match_margin=0.10,
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
        target_playlist_size=20, min_wildcards=3, strong_match_margin=0.10,
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
        target_playlist_size=20, min_wildcards=3, strong_match_margin=0.10,
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
        target_playlist_size=20, min_wildcards=3, strong_match_margin=0.10,
    )
    state = PlaylistState(event_description="party")  # no anchors seeded
    await builder.initial_fetch(state)

    assert captured["anchors"] == ["Drake"]   # derived from retrieval


@pytest.mark.asyncio
async def test_initial_fetch_overprovisions_llm_call():
    """llm_generator receives 2x target_wildcards candidates on first call."""
    captured = {}

    async def mock_db(query):
        return []  # empty pool → target_wildcards = 20

    builder = PlaylistGraphBuilder(
        _capturing_llm(captured), mock_db, None,
        target_playlist_size=20, min_wildcards=3,
        strong_match_margin=0.10, overprovision_factor=2.0,
    )
    state = PlaylistState(event_description="chill evening", anchor_artists=["A"])
    await builder.initial_fetch(state)

    assert captured["count"] == 40  # 20 × 2.0


@pytest.mark.asyncio
async def test_regenerate_overprovisions_llm_call():
    """regenerate requests missing × overprovision_factor candidates."""
    captured = {}

    async def mock_db(query):
        return []

    builder = PlaylistGraphBuilder(
        _capturing_llm(captured), mock_db, None,
        target_playlist_size=20, min_wildcards=3,
        strong_match_margin=0.10, overprovision_factor=2.0,
    )
    # missing = 2 → should request 4
    state = PlaylistState(
        event_description="chill evening",
        anchor_artists=["A"],
        db_songs=[],
        target_wildcards=5,
        validated_wildcards=[
            {"title": f"V{i}", "artist": "AI", "source": "new_suggestion"}
            for i in range(3)
        ],
        attempts=1,
    )
    await builder.regenerate(state)

    assert captured["count"] == 4  # (5 - 3) × 2.0


@pytest.mark.asyncio
async def test_relative_gate_is_invariant_to_band_location():
    """The same relative cluster structure selects the same spine whether the
    distance band sits at 0.16-0.42 or is shifted up to 0.46-0.72. An absolute
    gate would break under the shift; the margin does not."""
    captured_low, captured_high = {}, {}

    async def db_low(query):
        near = [{"title": f"N{i}", "artist": "A", "distance": 0.16 + i * 0.005} for i in range(17)]
        far = [{"title": f"F{i}", "artist": "A", "distance": 0.30 + i * 0.01} for i in range(13)]
        return near + far

    async def db_high(query):
        near = [{"title": f"N{i}", "artist": "A", "distance": 0.46 + i * 0.005} for i in range(17)]
        far = [{"title": f"F{i}", "artist": "A", "distance": 0.60 + i * 0.01} for i in range(13)]
        return near + far

    for mock_db, captured in ((db_low, captured_low), (db_high, captured_high)):
        builder = PlaylistGraphBuilder(
            _capturing_llm(captured), mock_db, None,
            target_playlist_size=20, min_wildcards=3, strong_match_margin=0.10,
        )
        state = PlaylistState(event_description="chill evening", anchor_artists=["A"])
        result = await builder.initial_fetch(state)
        captured["db_songs"] = result["db_songs"]

    # Both bands select exactly the 17 NEAR songs as the spine.
    assert {s["title"] for s in captured_low["db_songs"]} == {f"N{i}" for i in range(17)}
    assert {s["title"] for s in captured_high["db_songs"]} == {f"N{i}" for i in range(17)}
