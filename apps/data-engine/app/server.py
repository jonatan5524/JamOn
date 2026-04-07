import os
import sys

from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))
sys.path.append(BASE_DIR)

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List

import llm_service
from llm_service import AIServiceUnavailableError
from google.genai import errors
from lyrics_service import fetch_lyrics_map
from rag_engine import RagEngine

app = FastAPI(title="JamOn Data Engine")

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
        status_code=502,
        content={"detail": f"Gemini API Server Error: {exc.message or str(exc)}"},
    )


class Song(BaseModel):
    title: str
    artist: str


class RecommendRequest(BaseModel):
    event_description: str
    songs: List[Song]


class RecommendedSong(BaseModel):
    title: str
    artist: str
    is_new: bool


@app.on_event("startup")
async def startup():
    if not os.environ.get("GEMINI_API_KEY"):
        print("Warning: GEMINI_API_KEY not set. LLM calls will fail.")
        return
    print("Data engine ready.")


@app.post("/recommend", response_model=List[RecommendedSong])
async def recommend(request: RecommendRequest):
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

    # 5. Query vector DB for matching songs
    context_songs = rag.query_songs(request.event_description, n_results=10)

    if not context_songs:
        raise HTTPException(status_code=404, detail="No matching songs found in provided context")

    # 6. Generate playlist via LLM
    print("Generating final playlist recommendation...")
    playlist = llm_service.generate_playlist(request.event_description, context_songs)

    if not playlist:
        raise HTTPException(status_code=500, detail="Failed to generate playlist")

    # 7. Transform source field to is_new boolean
    return [
        RecommendedSong(
            title=song["title"],
            artist=song["artist"],
            is_new=song.get("source") == "new_suggestion",
        )
        for song in playlist
    ]
