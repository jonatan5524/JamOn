import os
import json
from google import genai
from google.genai import types
from typing import List, Dict, Any

# Configure Gemini API
# Ensure GEMINI_API_KEY is set in your environment variables
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

AUDIO_FEATURES_MODEL_NAME = "gemini-2.5-flash"
PLAYLIST_GENERATION_MODEL_NAME = "gemini-2.5-flash"
EMBEDDING_MODEL_NAME = "gemini-embedding-2-preview"

def load_prompt(filename: str) -> str:
    prompt_path = os.path.join(os.path.dirname(__file__), "prompts", filename)
    with open(prompt_path, "r") as f:
        return f.read()

def generate_audio_features(songs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    prompt_template = load_prompt("audio_features_prompt.txt")
    
    # Format songs list for the prompt
    songs_str = json.dumps(songs, indent=2)
    prompt = prompt_template.replace("{songs_list}", songs_str)
    
    try:
        response = client.models.generate_content(
            model=AUDIO_FEATURES_MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"Error generating audio features: {e}")
        return []

def generate_playlist(event_description: str, context_songs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    prompt_template = load_prompt("playlist_generation_prompt.txt")
    
    # Format context songs for the prompt
    # We only need relevant fields for the context
    context_str = json.dumps([
        {k: v for k, v in song.items() if k in ["title", "artist", "vibe_tags", "energy_desc", "mood_desc"]} 
        for song in context_songs
    ], indent=2)
    
    prompt = prompt_template.replace("{event_description}", event_description).replace("{context_str}", context_str)
    
    try:
        response = client.models.generate_content(
            model=PLAYLIST_GENERATION_MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"Error generating playlist: {e}")
        return []

def get_embedding(text: str) -> List[float]:
    try:
        response = client.models.embed_content(
            model=EMBEDDING_MODEL_NAME,
            contents=text,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT",
                title="Song Embedding"
            )
        )
        return response.embeddings[0].values
    except Exception as e:
        print(f"Error generating embedding: {e}")
        return []

def get_query_embedding(text: str) -> List[float]:
    try:
        response = client.models.embed_content(
            model=EMBEDDING_MODEL_NAME,
            contents=text,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_QUERY"
            )
        )
        return response.embeddings[0].values
    except Exception as e:
        print(f"Error generating query embedding: {e}")
        return []
