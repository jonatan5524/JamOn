import os
from dotenv import load_dotenv

# Resolve path to app/.env (one level up from core/config.py)
dotenv_path = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(dotenv_path)

class Settings:
    def __init__(self):
        self.GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
        self.AUDIO_FEATURES_MODEL = "gemini-3.5-flash"
        self.PLAYLIST_GENERATION_MODEL = "gemini-3.5-flash"
        self.EMBEDDING_MODEL = "gemini-embedding-2-preview"
        self.ORCHESTRATOR_URL = os.environ.get("ORCHESTRATOR_URL", "http://localhost:3000")
        # Provider selection — architectural choices, override via env var if needed
        self.LLM_PROVIDER: str = os.environ.get("LLM_PROVIDER", "gemini")        # "gemini" | "college"
        # Per-task provider overrides — default to the global LLM_PROVIDER.
        # Lets e.g. DJ/HyDE run on the free college model while embedding/tagging stay on Gemini.
        self.EMBEDDING_PROVIDER: str = os.environ.get("EMBEDDING_PROVIDER", self.LLM_PROVIDER)
        self.TAGGING_PROVIDER: str = os.environ.get("TAGGING_PROVIDER", self.LLM_PROVIDER)
        self.DJ_PROVIDER: str = os.environ.get("DJ_PROVIDER", self.LLM_PROVIDER)
        self.VECTOR_DB_PROVIDER: str = os.environ.get("VECTOR_DB_PROVIDER", "chroma")  # "chroma" | "pgvector"
        # College/Ollama credentials — secrets, load from .env
        self.COLLEGE_BASE_URL: str = os.environ.get("COLLEGE_BASE_URL", "http://llm.cs.colman.ac.il")
        self.COLLEGE_USERNAME: str = os.environ.get("COLLEGE_USERNAME", "")
        self.COLLEGE_PASSWORD: str = os.environ.get("COLLEGE_PASSWORD", "")
        # NVIDIA NIM credentials (for tagging + HyDE in hybrid mode)
        self.NVIDIA_API_KEY: str = os.environ.get("NVIDIA_API_KEY", "")
        self.NIM_BASE_URL: str = os.environ.get("NIM_BASE_URL", "https://integrate.api.nvidia.com/v1")
        self.NIM_TAGGING_MODEL: str = os.environ.get("NIM_TAGGING_MODEL", "meta/llama-3.3-70b-instruct")
        self.NIM_HYDE_MODEL: str = os.environ.get("NIM_HYDE_MODEL", "meta/llama-3.1-8b-instruct")
        self.HYDE_PROVIDER: str = os.environ.get("HYDE_PROVIDER", self.DJ_PROVIDER)
        # Song enrichment API keys
        self.LASTFM_API_KEY: str = os.environ.get("LASTFM_API_KEY", "")
        # Shared PostgreSQL database (same instance as the orchestrator)
        self.DB_HOST: str = os.environ.get("DB_HOST", "localhost")
        self.DB_PORT: str = os.environ.get("DB_PORT", "5432")
        self.DB_NAME: str = os.environ.get("DB_NAME", "")
        self.DB_USERNAME: str = os.environ.get("DB_USERNAME", "")
        self.DB_PASSWORD: str = os.environ.get("DB_PASSWORD", "")

settings = Settings()
