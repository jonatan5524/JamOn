from pydantic import BaseModel, Field
from typing import List, Optional
from .song import Track

class RecommendRequest(BaseModel):
    event_id: str = Field(..., example="42")

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

class IngestedSong(BaseModel):
    name: str = Field(..., example="Levitating")
    artist_name: str = Field(..., serialization_alias="artistName", example="Dua Lipa")
    embedding: List[float] = Field(..., description="Vector embedding produced for the song")
