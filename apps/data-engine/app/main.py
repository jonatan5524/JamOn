import os
import sys
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.resilience import AIServiceUnavailableError
from app.providers.containers import AppContainer
from app.providers.exceptions import ConfigurationError, EmbeddingError, TaggingError, GenerationError
from app.providers.llm.factory import LLMProviderFactory
from app.providers.vectordb.factory import VectorStoreFactory

_log_level = getattr(logging, os.environ.get("LOG_LEVEL", "INFO").upper(), logging.INFO)
logging.basicConfig(
    level=_log_level,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logging.getLogger().setLevel(_log_level)  # override even if uvicorn pre-configured handlers
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    failover_chain = [
        item.strip() for item in settings.PROVIDER_FAILOVER_CHAIN.split(",") if item.strip()
    ]
    tasks = {
        "embedding": settings.EMBEDDING_PROVIDER,
        "tagging": settings.TAGGING_PROVIDER,
        "dj": settings.DJ_PROVIDER,
        "hyde": settings.HYDE_PROVIDER,
    }
    provider_set = set(failover_chain) if settings.PROVIDER_FAILOVER_ENABLED else set(tasks.values())
    uses_gemini = any(p == "gemini" for p in tasks.values()) or settings.LLM_PROVIDER == "gemini"
    uses_college = any(p == "college" for p in tasks.values()) or settings.LLM_PROVIDER == "college"
    uses_nim = any(p == "nim" for p in tasks.values()) or settings.LLM_PROVIDER == "nim"
    if settings.PROVIDER_FAILOVER_ENABLED:
        uses_gemini = uses_gemini or "gemini" in provider_set
        uses_college = uses_college or "college" in provider_set
        uses_nim = uses_nim or "nim" in provider_set

    if uses_gemini and not settings.GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY not set but a task uses gemini. Exiting.")
        sys.exit(1)
    if uses_college and not (settings.COLLEGE_USERNAME and settings.COLLEGE_PASSWORD):
        logger.error("COLLEGE_USERNAME/COLLEGE_PASSWORD not set but a task uses college. Exiting.")
        sys.exit(1)
    if uses_nim and not settings.NVIDIA_API_KEY:
        logger.error("NVIDIA_API_KEY not set but a task uses nim. Exiting.")
        sys.exit(1)
    if not os.environ.get("GENIUS_ACCESS_TOKEN"):
        logger.error("GENIUS_ACCESS_TOKEN not set. Exiting.")
        sys.exit(1)

    try:
        llm_container, embed_config = LLMProviderFactory.create(
            settings.LLM_PROVIDER,
            embedding=settings.EMBEDDING_PROVIDER,
            tagging=settings.TAGGING_PROVIDER,
            dj=settings.DJ_PROVIDER,
            hyde=settings.HYDE_PROVIDER,
            enable_failover=settings.PROVIDER_FAILOVER_ENABLED,
            failover_chain=failover_chain,
        )
        vector_store = VectorStoreFactory.create(settings.VECTOR_DB_PROVIDER, embed_config)
        app.state.providers = AppContainer(llm=llm_container, vector_store=vector_store)
        logger.info(
            f"Providers ready — embedding: {settings.EMBEDDING_PROVIDER}, "
            f"tagging: {settings.TAGGING_PROVIDER}, dj: {settings.DJ_PROVIDER}, "
            f"hyde: {settings.HYDE_PROVIDER}, "
            f"failover: {settings.PROVIDER_FAILOVER_ENABLED} "
            f"({settings.PROVIDER_FAILOVER_CHAIN}), "
            f"VectorDB: {settings.VECTOR_DB_PROVIDER}, "
            f"Collection: {vector_store.collection_name}"
        )
    except ConfigurationError as e:
        logger.error(f"Provider configuration error: {e}")
        sys.exit(1)

    yield


app = FastAPI(
    title="JamOn - Data Processing Service",
    description="""
    This service handles all AI and vector-based computations for the JamOn project:
    * **Vibe Analysis**: Analyzing natural language event descriptions.
    * **RAG Engine**: Indexing and querying musical context from lyrics and audio features.
    * **Playlist Generation**: Generating ranked recommendations using LLMs.
    """,
    version="2.0.0",
    openapi_url="/api/v1/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)


@app.exception_handler(AIServiceUnavailableError)
async def ai_service_unavailable_handler(request, exc):
    return JSONResponse(status_code=503, content={"detail": "AI Service unavailable (Circuit Breaker OPEN)"})


@app.exception_handler(EmbeddingError)
async def embedding_error_handler(request, exc):
    return JSONResponse(status_code=503, content={"detail": f"Embedding service error: {exc}"})


@app.exception_handler(TaggingError)
async def tagging_error_handler(request, exc):
    return JSONResponse(status_code=503, content={"detail": f"Tagging service error: {exc}"})


@app.exception_handler(GenerationError)
async def generation_error_handler(request, exc):
    return JSONResponse(status_code=503, content={"detail": f"Generation service error: {exc}"})


from app.api.endpoints import router
app.include_router(router)
