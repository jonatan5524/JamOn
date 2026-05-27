from pydantic import BaseModel, Field
from typing import List, Optional
from .song import Track

class RecommendRequest(BaseModel):
    event_description: str = Field(..., example="A high-energy rooftop pool party with house music")
    songs: List[Track]

class RecommendedSong(BaseModel):
    title: str = Field(..., example="One Kiss")
    artist: str = Field(..., example="Calvin Harris")
    is_new: bool = Field(..., description="Indicates if the song was suggested by AI or existed in context")

class LyricsBatchRequest(BaseModel):
    songs: List[Track]

class LyricsResult(BaseModel):
    title: str
    artist: str
    found: bool
    lyrics: str
    genius_url: Optional[str] = None
    error: Optional[str] = None

class LyricsBatchResponse(BaseModel):
    songs: List[LyricsResult]
