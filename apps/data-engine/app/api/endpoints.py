import asyncio
import logging
from typing import List

from fastapi import APIRouter, HTTPException

from app.models.api import (
    RecommendRequest,
    RecommendedSong,
    LyricsBatchRequest,
    LyricsBatchResponse,
)
from app.services.rag import RagEngine
from app.services import llm, lyrics
from app.services.validator import validate_spotify_uri_via_nestjs
from app.workflows.playlist_generator import PlaylistGraphBuilder

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post(
    "/recommend",
    response_model=List[RecommendedSong],
    tags=["Playlist Generation"],
    summary="Generate a curated playlist based on event and user taste",
    response_description="A list of recommended songs with metadata",
)
async def recommend(request: RecommendRequest):
    """
    This endpoint performs the following steps:
    1. **Audio Feature Generation**: Analyzes input songs for musical characteristics.
    2. **Lyrics Retrieval**: Fetches lyrics for deeper context.
    3. **RAG Indexing**: Stores songs in a temporary vector database.
    4. **AI Generation**: Uses Gemini to produce a final, vibe-aligned playlist.
    """
    if not request.songs:
        raise HTTPException(status_code=400, detail="No songs provided for context")

    # 1. Prepare songs for processing (convert Pydantic to dict)
    input_songs = [{"title": s.title, "artist": s.artist} for s in request.songs]

    # 2. Generate audio features
    logger.info(f"Generating audio features for {len(input_songs)} songs...")
    songs_with_features = await asyncio.to_thread(llm.generate_audio_features, input_songs)
    if not songs_with_features:
        raise HTTPException(status_code=500, detail="Failed to generate audio features")

    # 3. Fetch lyrics
    logger.info(f"Fetching lyrics for {len(input_songs)} songs...")
    lyrics_map = await asyncio.to_thread(lyrics.fetch_lyrics_map, input_songs)

    # 4. Index in temporary vector DB
    logger.info("Indexing songs in RAG engine...")
    rag = RagEngine()
    await asyncio.to_thread(rag.add_songs, songs_with_features, lyrics_map)

    # 5. Define wrappers for the Graph to bridge Sync/Async
    async def db_fetch_wrapper(query: str):
        # Retrieve top 20 context songs (Asynchronous ChromaDB query with HyDE)
        return await rag.query_songs(query, n_results=20)

    async def llm_gen_wrapper(prompt: str, count: int, rejected: List[str], context: List[dict]):
        # Call the llm.generate_playlist (Synchronous Google GenAI call)
        return await asyncio.to_thread(
            llm.generate_playlist, prompt, context, count, rejected
        )

    # 6. Compile and run Graph
    builder = PlaylistGraphBuilder(
        llm_generator=llm_gen_wrapper,
        db_fetcher=db_fetch_wrapper,
        uri_validator=validate_spotify_uri_via_nestjs,
        target_wildcards=5,
        max_attempts=3,
    )

    workflow = builder.build()

    initial_state = {"event_description": request.event_description}

    try:
        final_state = await workflow.ainvoke(initial_state)
        playlist = final_state.get("final_playlist", [])
    except Exception as e:
        logger.error(f"Error during graph execution: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to generate playlist via LangGraph"
        )

    if not playlist:
        raise HTTPException(status_code=500, detail="Generated playlist was empty")

    # 7. Transform source field to is_new boolean
    return [
        RecommendedSong(
            title=song["title"],
            artist=song["artist"],
            is_new=song.get("source", "user_library") == "new_suggestion",
        )
        for song in playlist
    ]

@router.post(
    "/lyrics/batch",
    response_model=LyricsBatchResponse,
    tags=["Lyrics"],
    summary="Fetch Genius lyrics for a batch of songs",
)
async def lyrics_batch(request: LyricsBatchRequest):
    """
    Fetch lyrics directly from Genius inside the Python data-engine service.
    """
    if not request.songs:
        raise HTTPException(
            status_code=400,
            detail="Request body must include a non-empty 'songs' array.",
        )

    input_songs = [{"title": s.title, "artist": s.artist} for s in request.songs]
    results = await asyncio.to_thread(lyrics.fetch_lyrics_batch, input_songs)
    return LyricsBatchResponse(songs=results)
