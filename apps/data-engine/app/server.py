import os
import sys

from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))
sys.path.append(BASE_DIR)

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import List

import llm_service
from llm_service import AIServiceUnavailableError
from google.genai import errors
from lyrics_service import fetch_lyrics_batch, fetch_lyrics_map
from rag_engine import RagEngine, PlaylistGraphBuilder
from validators import validate_spotify_uri_via_nestjs
import asyncio
import logging

logger = logging.getLogger(__name__)

app = FastAPI(
    title="JamOn - Data Processing Service",
    description="""
    This service handles all AI and vector-based computations for the JamOn project:
    * **Vibe Analysis**: Analyzing natural language event descriptions.
    * **RAG Engine**: Indexing and querying musical context from lyrics and audio features.
    * **Playlist Generation**: Generating ranked recommendations using LLMs.
    """,
    version="1.0.0",
    openapi_url="/api/v1/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc"
)

@app.exception_handler(AIServiceUnavailableError)
async def ai_service_unavailable_handler(request, exc):
    return JSONResponse(
        status_code=503,
        content={"detail": "AI Service currently unavailable (Circuit Breaker OPEN)"},
    )

@app.exception_handler(errors.ClientError)
async def client_error_handler(request, exc):
    if exc.code == 429:
        return JSONResponse(
            status_code=429,
            content={"detail": "Gemini API Rate Limit Exceeded"},
        )
    return JSONResponse(
        status_code=exc.code or 400,
        content={"detail": exc.message or str(exc)},
    )

@app.exception_handler(errors.ServerError)
async def server_error_handler(request, exc):
    return JSONResponse(
        status_code=503,
        content={"detail": f"Gemini API Server Error: {exc.message or str(exc)}"},
    )


class Song(BaseModel):
    title: str = Field(..., example="Levitating")
    artist: str = Field(..., example="Dua Lipa")

class RecommendRequest(BaseModel):
    event_description: str = Field(..., example="A high-energy rooftop pool party with house music")
    songs: List[Song]

class RecommendedSong(BaseModel):
    title: str = Field(..., example="One Kiss")
    artist: str = Field(..., example="Calvin Harris")
    is_new: bool = Field(..., description="Indicates if the song was suggested by AI or existed in context")

class LyricsBatchRequest(BaseModel):
    songs: List[Song]

class LyricsResult(BaseModel):
    title: str
    artist: str
    found: bool
    lyrics: str
    genius_url: str | None = None
    error: str | None = None

class LyricsBatchResponse(BaseModel):
    songs: List[LyricsResult]


@app.on_event("startup")
async def startup():
    if not os.environ.get("GEMINI_API_KEY"):
        print("Warning: GEMINI_API_KEY not set. LLM calls will fail.")
    if not os.environ.get("GENIUS_ACCESS_TOKEN"):
        print("Warning: GENIUS_ACCESS_TOKEN not set. Lyrics lookup will be skipped.")
    print("Data engine ready.")


@app.post(
    "/recommend", 
    response_model=List[RecommendedSong],
    tags=["Playlist Generation"],
    summary="Generate a curated playlist based on event and user taste",
    response_description="A list of recommended songs with metadata"
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
    print(f"Generating audio features for {len(input_songs)} songs...")
    songs_with_features = llm_service.generate_audio_features(input_songs)
    if not songs_with_features:
        raise HTTPException(status_code=500, detail="Failed to generate audio features")

    # 3. Fetch lyrics
    print(f"Fetching lyrics for {len(input_songs)} songs...")
    lyrics_map = fetch_lyrics_map(input_songs)

    # 4. Index in temporary vector DB
    print("Indexing songs in RAG engine...")
    rag = RagEngine()
    rag.add_songs(songs_with_features, lyrics_map)

    # 5. Define wrappers for the Graph to bridge Sync/Async
    async def db_fetch_wrapper(query: str):
        # Retrieve top 10 context songs (Synchronous ChromaDB query)
        return await asyncio.to_thread(rag.query_songs, query, n_results=20)
        
    async def llm_gen_wrapper(prompt: str, count: int, rejected: List[str]):
        # We need context songs for the LLM prompt
        context = await asyncio.to_thread(rag.query_songs, prompt, n_results=10)
        # Call the updated llm_service.generate_playlist (Synchronous Google GenAI call)
        return await asyncio.to_thread(llm_service.generate_playlist, prompt, context, count, rejected)

    # 6. Compile and run Graph
    builder = PlaylistGraphBuilder(
        llm_generator=llm_gen_wrapper,
        db_fetcher=db_fetch_wrapper,
        uri_validator=validate_spotify_uri_via_nestjs,
        target_wildcards=5,
        max_attempts=3
    )
    
    workflow = builder.build()
    
    initial_state = {"event_description": request.event_description}
    
    try:
        final_state = await workflow.ainvoke(initial_state)
        playlist = final_state.get("final_playlist", [])
    except Exception as e:
        logger.error(f"Error during graph execution: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate playlist via LangGraph")

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


@app.post(
    "/lyrics/batch",
    response_model=LyricsBatchResponse,
    tags=["Lyrics"],
    summary="Fetch Genius lyrics for a batch of songs",
)
async def lyrics_batch(request: LyricsBatchRequest):
    """
    Fetch lyrics directly from Genius inside the Python data-engine service.
    This replaces the old separate Node lyrics server.
    """
    if not request.songs:
        raise HTTPException(status_code=400, detail="Request body must include a non-empty 'songs' array.")

    input_songs = [{"title": s.title, "artist": s.artist} for s in request.songs]
    return {"songs": fetch_lyrics_batch(input_songs)}
