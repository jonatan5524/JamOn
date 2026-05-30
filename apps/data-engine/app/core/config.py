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
        # Provider selection — architectural choices, override via env var if needed
        self.LLM_PROVIDER: str = os.environ.get("LLM_PROVIDER", "gemini")        # "gemini" | "college"
        self.VECTOR_DB_PROVIDER: str = os.environ.get("VECTOR_DB_PROVIDER", "chroma")  # "chroma" | "pgvector"
        # College/Ollama credentials — secrets, load from .env
        self.COLLEGE_BASE_URL: str = os.environ.get("COLLEGE_BASE_URL", "http://llm.cs.colman.ac.il")
        self.COLLEGE_USERNAME: str = os.environ.get("COLLEGE_USERNAME", "")
        self.COLLEGE_PASSWORD: str = os.environ.get("COLLEGE_PASSWORD", "")

settings = Settings()
