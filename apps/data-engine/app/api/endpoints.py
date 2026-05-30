import asyncio
import logging
from typing import List

from fastapi import APIRouter, HTTPException, Request

from app.models.api import (
    RecommendRequest,
    RecommendedSong,
    LyricsBatchRequest,
    LyricsBatchResponse,
)
from app.services.rag import RagEngine
from app.services import lyrics
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
async def recommend(http_request: Request, request: RecommendRequest):
    if not request.songs:
        raise HTTPException(status_code=400, detail="No songs provided for context")

    providers = http_request.app.state.providers
    input_songs = [{"title": s.title, "artist": s.artist} for s in request.songs]

    logger.info(f"Tagging {len(input_songs)} songs...")
    songs_with_features = await asyncio.to_thread(
        providers.llm.tagging.tag_songs, input_songs
    )
    if not songs_with_features:
        raise HTTPException(status_code=500, detail="Failed to tag songs")

    logger.info(f"Fetching lyrics for {len(input_songs)} songs...")
    lyrics_map = await asyncio.to_thread(lyrics.fetch_lyrics_map, input_songs)

    logger.info("Indexing songs in RAG engine...")
    rag = RagEngine(
        vector_store=providers.vector_store,
        embedder=providers.llm.embedding,
        dj=providers.llm.dj,
    )
    await asyncio.to_thread(rag.add_songs, songs_with_features, lyrics_map)

    async def db_fetch_wrapper(query: str):
        return await rag.query_songs(query, n_results=20)

    async def llm_gen_wrapper(prompt: str, count: int, rejected: List[str], context: List[dict]):
        return await asyncio.to_thread(
            providers.llm.dj.generate_playlist, prompt, context, count, rejected
        )

    builder = PlaylistGraphBuilder(
        llm_generator=llm_gen_wrapper,
        db_fetcher=db_fetch_wrapper,
        uri_validator=validate_spotify_uri_via_nestjs,
        target_wildcards=5,
        max_attempts=3,
    )
    workflow = builder.build()

    try:
        final_state = await workflow.ainvoke({"event_description": request.event_description})
        playlist = final_state.get("final_playlist", [])
    except Exception as e:
        logger.error(f"Graph execution error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate playlist via LangGraph")

    if not playlist:
        raise HTTPException(status_code=500, detail="Generated playlist was empty")

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
    if not request.songs:
        raise HTTPException(
            status_code=400,
            detail="Request body must include a non-empty 'songs' array.",
        )
    input_songs = [{"title": s.title, "artist": s.artist} for s in request.songs]
    results = await asyncio.to_thread(lyrics.fetch_lyrics_batch, input_songs)
    return LyricsBatchResponse(songs=results)
