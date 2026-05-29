import os
from dotenv import load_dotenv

# Resolve path to app/.env (one level up from core/config.py)
dotenv_path = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(dotenv_path)

class Settings:
    def __init__(self):
        self.GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
        self.AUDIO_FEATURES_MODEL = "gemini-2.5-flash"
        self.PLAYLIST_GENERATION_MODEL = "gemini-2.5-flash"
        self.EMBEDDING_MODEL = "gemini-embedding-2-preview"
        self.ORCHESTRATOR_URL = "http://localhost:3000"

settings = Settings()
