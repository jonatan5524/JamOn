import os
import logging
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from google.genai import errors

from app.api.endpoints import router
from app.core.config import settings
from app.core.resilience import AIServiceUnavailableError

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="JamOn - Data Processing Service",
    description="""
    This service handles all AI and vector-based computations for the JamOn project:
    * **Vibe Analysis**: Analyzing natural language event descriptions.
    * **RAG Engine**: Indexing and querying musical context from lyrics and audio features.
    * **Playlist Generation**: Generating ranked recommendations using LLMs.
    """,
    version="1.1.0",
    openapi_url="/api/v1/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc"
)

@app.exception_handler(AIServiceUnavailableError)
async def ai_service_unavailable_handler(request, exc):
    return JSONResponse(
        status_code=503,
        content={"detail": "AI Service currently unavailable (Circuit Breaker OPEN)"},
    )

@app.exception_handler(errors.ClientError)
async def client_error_handler(request, exc):
    if hasattr(exc, 'code') and exc.code == 429:
        return JSONResponse(
            status_code=429,
            content={"detail": "Gemini API Rate Limit Exceeded"},
        )
    return JSONResponse(
        status_code=getattr(exc, 'code', 400) or 400,
        content={"detail": getattr(exc, 'message', str(exc))},
    )

@app.exception_handler(errors.ServerError)
async def server_error_handler(request, exc):
    return JSONResponse(
        status_code=503,
        content={"detail": f"Gemini API Server Error: {getattr(exc, 'message', str(exc))}"},
    )

@app.on_event("startup")
async def startup():
    if not settings.GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not set. LLM calls will fail.")
    if not os.environ.get("GENIUS_ACCESS_TOKEN"):
        logger.warning("GENIUS_ACCESS_TOKEN not set. Lyrics lookup will be skipped.")
    logger.info("Data engine ready.")

app.include_router(router)
