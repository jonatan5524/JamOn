import os
import json
import logging
from google import genai
from google.genai import types, errors
from typing import List, Dict, Any
from app.core.config import settings
from app.core.resilience import with_resilience, AIServiceUnavailableError

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure Gemini API
client = genai.Client(api_key=settings.GEMINI_API_KEY)

def load_prompt(filename: str) -> str:
    # Adjust path because this file is in app/services/
    prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", filename)
    with open(prompt_path, "r") as f:
        return f.read()

@with_resilience
def generate_audio_features(songs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    prompt_template = load_prompt("audio_features_prompt.txt")
    
    # Format songs list for the prompt
    songs_str = json.dumps(songs, indent=2)
    prompt = prompt_template.replace("{songs_list}", songs_str)
    
    try:
        response = client.models.generate_content(
            model=settings.AUDIO_FEATURES_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        return json.loads(response.text)
    except Exception as e:
        if isinstance(e, (errors.APIError, AIServiceUnavailableError)):
            raise
        logger.error(f"Error generating audio features: {e}")
        return []

@with_resilience
def generate_playlist(event_description: str, context_songs: List[Dict[str, Any]], count: int = 5, rejected: List[str] = None) -> List[Dict[str, Any]]:
    if rejected is None:
        rejected = []
        
    prompt_template = load_prompt("playlist_generation_prompt.txt")
    
    # Format context songs for the prompt
    # We only need relevant fields for the context
    context_str = json.dumps([
        {k: v for k, v in song.items() if k in ["title", "artist", "vibe_tags", "energy_desc", "mood_desc"]} 
        for song in context_songs
    ], indent=2)
    
    rejected_str = json.dumps(rejected, indent=2) if rejected else "None"
    
    prompt = prompt_template.replace("{event_description}", event_description)\
                            .replace("{context_str}", context_str)\
                            .replace("{rejected_str}", rejected_str)\
                            .replace("{count}", str(count))
    
    try:
        response = client.models.generate_content(
            model=settings.PLAYLIST_GENERATION_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                # Use json_object for reliability if supported, otherwise application/json is fine
                response_mime_type="application/json"
            )
        )
        return json.loads(response.text)
    except Exception as e:
        if isinstance(e, (errors.APIError, AIServiceUnavailableError)):
            raise
        logger.error(f"Error generating playlist: {e}")
        return []

@with_resilience
def get_embedding(text: str) -> List[float]:
    try:
        response = client.models.embed_content(
            model=settings.EMBEDDING_MODEL,
            contents=text,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT",
                title="Song Embedding"
            )
        )
        return response.embeddings[0].values
    except Exception as e:
        if isinstance(e, (errors.APIError, AIServiceUnavailableError)):
            raise
        logger.error(f"Error generating embedding: {e}")
        return []

@with_resilience
def get_query_embedding(text: str) -> List[float]:
    try:
        response = client.models.embed_content(
            model=settings.EMBEDDING_MODEL,
            contents=text,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_QUERY"
            )
        )
        return response.embeddings[0].values
    except Exception as e:
        if isinstance(e, (errors.APIError, AIServiceUnavailableError)):
            raise
        logger.error(f"Error generating query embedding: {e}")
        return []
