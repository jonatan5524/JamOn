import os

class Settings:
    def __init__(self):
        self.GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
        self.AUDIO_FEATURES_MODEL = "gemini-2.0-flash"
        self.PLAYLIST_GENERATION_MODEL = "gemini-2.0-flash"
        self.EMBEDDING_MODEL = "gemini-embedding-2-preview"
        self.ORCHESTRATOR_URL = "http://localhost:3000"

settings = Settings()
