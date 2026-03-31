import os
import sys

from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))
sys.path.append(BASE_DIR)

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List

import llm_service
from data.mock_data import MOCK_SONGS
from lyrics_service import fetch_lyrics_map
from rag_engine import RagEngine

app = FastAPI(title="JamOn Data Engine")
rag: RagEngine | None = None


class RecommendRequest(BaseModel):
    event_description: str


class RecommendedSong(BaseModel):
    title: str
    artist: str
    is_new: bool


@app.on_event("startup")
async def startup():
    global rag

    if not os.environ.get("GEMINI_API_KEY"):
        print("Warning: GEMINI_API_KEY not set. LLM calls will fail.")
        return

    print("Indexing mock songs on startup...")

    # 1. Generate audio features
    songs_with_features = llm_service.generate_audio_features(MOCK_SONGS)
    if not songs_with_features:
        print("Failed to generate audio features.")
        return

    # 2. Fetch lyrics
    lyrics_map = fetch_lyrics_map(MOCK_SONGS)
    lyrics_found = sum(1 for lyrics in lyrics_map.values() if lyrics)
    print(f"Fetched lyrics for {lyrics_found}/{len(MOCK_SONGS)} songs.")

    # 3. Index in vector DB
    rag = RagEngine()
    rag.add_songs(songs_with_features, lyrics_map)
    print(f"Startup complete. {len(songs_with_features)} songs indexed.")


@app.post("/recommend", response_model=List[RecommendedSong])
async def recommend(request: RecommendRequest):
    if rag is None:
        raise HTTPException(status_code=503, detail="Data engine not initialized")

    # 1. Query vector DB for matching songs
    context_songs = rag.query_songs(request.event_description, n_results=10)

    if not context_songs:
        raise HTTPException(status_code=404, detail="No matching songs found")

    # 2. Generate playlist via LLM
    playlist = llm_service.generate_playlist(request.event_description, context_songs)

    if not playlist:
        raise HTTPException(status_code=500, detail="Failed to generate playlist")

    # 3. Transform source field to is_new boolean
    return [
        RecommendedSong(
            title=song["title"],
            artist=song["artist"],
            is_new=song.get("source") == "new_suggestion",
        )
        for song in playlist
    ]
