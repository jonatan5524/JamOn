import os
import json
import time
from google import genai
from google.genai import types, errors
from typing import List, Dict, Any
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception

# Configure Gemini API
# Ensure GEMINI_API_KEY is set in your environment variables
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

AUDIO_FEATURES_MODEL_NAME = "gemini-2.5-flash"
PLAYLIST_GENERATION_MODEL_NAME = "gemini-2.5-flash"
EMBEDDING_MODEL_NAME = "gemini-embedding-2-preview"

class CircuitBreaker:
    _instance = None
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(CircuitBreaker, cls).__new__(cls)
            cls._instance.state = "CLOSED"
            cls._instance.failure_count = 0
            cls._instance.last_failure_time = 0
            cls._instance.recovery_timeout = 60 # seconds
        return cls._instance

    def record_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= 3:
            self.state = "OPEN"
            print("Circuit Breaker OPENed!")

    def record_success(self):
        self.failure_count = 0
        self.state = "CLOSED"

    def is_open(self):
        if self.state == "OPEN":
            if time.time() - self.last_failure_time > self.recovery_timeout:
                self.state = "HALF-OPEN"
                return False
            return True
        return False

cb = CircuitBreaker()

class AIServiceUnavailableError(Exception):
    pass

def is_retryable_exception(e):
    if isinstance(e, errors.ServerError):
        return True
    if isinstance(e, errors.ClientError) and e.code == 429:
        return True
    return False

def with_resilience(func):
    @retry(
        wait=wait_exponential(multiplier=1, min=2, max=10),
        stop=stop_after_attempt(3),
        retry=retry_if_exception(is_retryable_exception),
        reraise=True
    )
    def decorated_func(*args, **kwargs):
        return func(*args, **kwargs)

    def wrapper(*args, **kwargs):
        if cb.is_open():
            raise AIServiceUnavailableError("Circuit Breaker is OPEN")
        try:
            result = decorated_func(*args, **kwargs)
            cb.record_success()
            return result
        except Exception:
            cb.record_failure()
            raise
    return wrapper

def load_prompt(filename: str) -> str:
    prompt_path = os.path.join(os.path.dirname(__file__), "prompts", filename)
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
            model=AUDIO_FEATURES_MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        return json.loads(response.text)
    except Exception as e:
        if isinstance(e, (errors.APIError, AIServiceUnavailableError)):
            raise
        print(f"Error generating audio features: {e}")
        return []

@with_resilience
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
        if isinstance(e, (errors.APIError, AIServiceUnavailableError)):
            raise
        print(f"Error generating playlist: {e}")
        return []

@with_resilience
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
        if isinstance(e, (errors.APIError, AIServiceUnavailableError)):
            raise
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
