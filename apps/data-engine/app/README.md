# JamOn Data Engine

The JamOn Data Engine is a modular RAG-based music recommendation service. It uses LLMs to "text-ify" songs and perform semantic search to generate event-specific playlists.

## Features

- **Provider Abstraction**: Support for multiple LLM providers (Gemini, Ollama/Local) and Vector DBs (ChromaDB, pgvector).
- **Text-ification RAG**: Replaces raw audio features with semantic LLM-generated tags and lyrics.
- **Agentic Workflow**: Uses LangGraph to manage retrieval, wildcard generation, and validation.
- **Resilient**: Built-in circuit breakers and retries for all AI operations.

## Prerequisites

- Python 3.10+
- An LLM provider API key (e.g., Google Gemini)
- Optional: a Genius API access token for lyrics lookup

## Setup

1. Navigate to the data-engine directory:
   ```bash
   cd apps/data-engine/app
   ```

2. Create a virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure environment:
   Create a `.env` file in `apps/data-engine/app/.env`:
   ```
   GEMINI_API_KEY=your_actual_api_key_here
   GENIUS_ACCESS_TOKEN=your_actual_genius_token_here
   LLM_PROVIDER=gemini        # "gemini" or "college" (ollama)
   VECTOR_DB_PROVIDER=chroma  # "chroma" or "pgvector"
   ```

## Running the Service

Start the server from the `apps/data-engine` directory:
```bash
cd apps/data-engine
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

The API will be available at `http://127.0.0.1:8000`.
Open `http://127.0.0.1:8000/docs` for the Swagger UI.

### Available Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/recommend` | Generate a playlist recommendation for an event description |
| `POST` | `/lyrics/batch` | Fetch Genius lyrics for a batch of songs |

## Architecture: Provider Abstraction

The engine is designed to be provider-agnostic. All AI and storage operations are handled via protocols defined in `app/providers/protocols.py`.

### LLM Providers
- **Gemini**: Uses Google's Gemini 1.5 Flash for tagging/generation and Gemini Embedding 2 for vectors.
- **College**: A local/private stack using Ollama (llama3.1, gemma3, all-minilm).

### Vector Stores
- **ChromaDB**: Default local vector database.
- **pgvector**: Support for PostgreSQL-based vector storage.

Providers are initialized during the FastAPI **lifespan** startup phase and injected into the service layer.

## RAG Flow Architecture

### 1. Indexing (The "Text-ification" Pipeline)
For each song, the system uses the configured **TaggingProvider** to "hallucinate" descriptive metadata (Energy, Mood, Vibe Tags) and the **Genius API** for lyrics. This creates a rich text document that is then vectorized by the **EmbeddingProvider** and stored.

### 2. Retrieval (HyDE + Vector Search)
The **DJProvider** expands the user's event description using **Hypothetical Document Embeddings (HyDE)**. The expansion is embedded and used to query the **VectorStore**.

### 3. Generation (Agentic LangGraph Workflow)
A **LangGraph**-based agent manages the final playlist creation:
1. **Initial Fetch**: Retrieves matching songs from the database.
2. **Wildcard Generation**: Suggests new songs to complement the library matches.
3. **Validation Loop**: Verifies new suggestions (via the NestJS orchestrator).
4. **Final Shuffle**: Produces the cohesive playlist.

## Resilience & Stability

The service implements a multi-layer resilience strategy via `app/core/resilience.py`:

1. **Smart Retries**: Uses `tenacity` with exponential backoff and jitter for transient API errors (429, 5xx).
2. **Circuit Breaker**: A thread-safe singleton that "trips" after 3 consecutive failures, preventing further calls to a failing provider for 60 seconds.
3. **Error Mapping**: Provider-specific errors are mapped to generic `EmbeddingError`, `TaggingError`, or `GenerationError` and handled by FastAPI exception handlers.
