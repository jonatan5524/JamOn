import pytest
from app.models.state import PlaylistState
from typing import get_type_hints

def test_playlist_state_definition():
    hints = get_type_hints(PlaylistState)
    assert 'event_description' in hints
    assert 'db_songs' in hints
    assert 'candidate_wildcards' in hints
    assert 'validated_wildcards' in hints
    assert 'rejected_wildcards' in hints
    assert 'attempts' in hints
    assert 'final_playlist' in hints

import asyncio
from app.workflows.playlist_generator import PlaylistGraphBuilder

@pytest.mark.asyncio
async def test_initial_fetch():
    async def mock_db(query): return [{"title": "DB1", "artist": "A1"}]
    async def mock_llm(prompt, count, rejected, context, anchor_artists):
        assert len(context) == 1
        assert context[0]["title"] == "DB1"
        assert anchor_artists == ["A1"]
        return [{"title": "L1", "artist": "A2"}] * count
    
    # Testing with parameterized wildcards
    builder = PlaylistGraphBuilder(mock_llm, mock_db, None, target_wildcards=3)
    state = PlaylistState(event_description="test event")
    
    result = await builder.initial_fetch(state)
    
    assert len(result["db_songs"]) == 1
    assert len(result["candidate_wildcards"]) == 3
    assert result["attempts"] == 1

@pytest.mark.asyncio
async def test_validate():
    # Only "Valid Song" passes validator, now async
    async def mock_validator(song): 
        await asyncio.sleep(0.01)
        return song["title"] == "Valid Song"
    
    builder = PlaylistGraphBuilder(None, None, mock_validator)
    
    state = PlaylistState(
        event_description="test event",
        candidate_wildcards=[
            {"title": "Valid Song", "artist": "Artist 1"},
            {"title": "Invalid Song", "artist": "Artist 2"}
        ],
        validated_wildcards=[],
        rejected_wildcards=[]
    )
    
    result = await builder.validate(state)
    
    assert len(result["validated_wildcards"]) == 1
    assert result["validated_wildcards"][0]["title"] == "Valid Song"
    assert len(result["rejected_wildcards"]) == 1
    assert result["rejected_wildcards"][0] == "Invalid Song by Artist 2"
    assert result["candidate_wildcards"] == []

@pytest.mark.asyncio
async def test_regenerate():
    async def mock_llm(prompt, count, rejected, context, anchor_artists):
        assert count == 2 # 3 target - 1 validated
        assert "Bad Song by Bad Artist" in rejected
        assert context == []
        return [{"title": "New L1", "artist": "A1"}] * count

    builder = PlaylistGraphBuilder(mock_llm, None, None, target_wildcards=3)
    state = PlaylistState(
        event_description="event",
        validated_wildcards=[{"title": "V1", "artist": "A1"}],
        rejected_wildcards=["Bad Song by Bad Artist"],
        attempts=1
    )
    
    result = await builder.regenerate(state)
    assert len(result["candidate_wildcards"]) == 2
    assert result["attempts"] == 2

def test_should_finalize():
    builder = PlaylistGraphBuilder(None, None, None, target_wildcards=5, max_attempts=3)
    assert builder.should_finalize(PlaylistState(event_description="x", validated_wildcards=[{"x":1}]*5, attempts=1)) == "merge_and_shuffle"
    assert builder.should_finalize(PlaylistState(event_description="x", validated_wildcards=[{"x":1}]*2, attempts=3)) == "merge_and_shuffle"
    assert builder.should_finalize(PlaylistState(event_description="x", validated_wildcards=[{"x":1}]*2, attempts=2)) == "regenerate"

@pytest.mark.asyncio
async def test_merge_and_shuffle():
    import random
    random.seed(42) # Deterministic
    builder = PlaylistGraphBuilder(None, None, None)
    state = PlaylistState(
        event_description="x",
        db_songs=[{"title": "A", "artist": "B"}, {"title": "C", "artist": "D"}],
        validated_wildcards=[{"title": "a", "artist": "b"}, {"title": "E", "artist": "F"}]
    )
    result = await builder.merge_and_shuffle(state)
    # Total unique should be 3 (A/B duplicates)
    assert len(result["final_playlist"]) == 3

@pytest.mark.asyncio
async def test_build_graph():
    # This requires langgraph. Verify it compiles.
    from langgraph.graph import StateGraph
    builder = PlaylistGraphBuilder(None, None, None)
    graph = builder.build()
    assert graph is not None
