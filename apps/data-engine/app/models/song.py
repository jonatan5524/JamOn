from pydantic import BaseModel, Field
from typing import List, Optional

class AudioFeatures(BaseModel):
    energy_desc: str = Field(..., description="Description of the song's energy level")
    mood_desc: str = Field(..., description="Description of the song's mood")
    vibe_tags: List[str] = Field(default_factory=list, description="List of descriptive vibe tags")
    embedding_text: Optional[str] = Field(None, description="The combined text used for vector embedding")

class Track(BaseModel):
    title: str = Field(..., example="Levitating")
    artist: str = Field(..., example="Dua Lipa")

class Song(Track, AudioFeatures):
    """
    A complete song model combining track metadata and AI-generated audio features.
    """
    pass
