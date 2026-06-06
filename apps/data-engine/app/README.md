# JamOn Data Engine

FastAPI service that powers JamOn's music intelligence: enriches songs with external signals, tags them with LLM-generated semantic metadata, indexes them in a vector store, and retrieves the best matches for any event description using a LangGraph agentic workflow.

## Features

- **Song Enrichment**: Genius lyrics + Last.fm community tags + Spotify genres, all fetched concurrently before tagging.
- **Text-ification RAG**: Replaces raw Spotify audio features with LLM-generated vibe tags and embedding text for semantic search.
- **Multi-Provider / Hybrid Mode**: Plug in Gemini, NVIDIA NIM, or a local Ollama stack per task (embedding, tagging, DJ generation, HyDE). Mix and match to cut API costs.
- **Agentic Workflow**: LangGraph manages retrieval → wildcard generation → Spotify URI validation → regeneration loop.
- **Resilient**: Circuit breaker + exponential-backoff retries for all AI operations.

## Quick Start

### Prerequisites

- Python 3.10+
- One of: Google Gemini API key, NVIDIA NIM API key, or a local [Ollama](https://ollama.ai) instance

### Setup

```bash
cd apps/data-engine
python3 -m venv app/.venv
source app/.venv/bin/activate
pip install -r requirements.txt
```

Create `apps/data-engine/app/.env` — see the [Environment Variables](#environment-variables) section below.

### Run

```bash
cd apps/data-engine
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Swagger UI: `http://localhost:8000/docs`

### Test

```bash
cd apps/data-engine
python -m pytest app/ -q
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LLM_PROVIDER` | Yes | — | Global provider: `gemini`, `college`, or `nim` |
| `VECTOR_DB_PROVIDER` | Yes | — | `chroma` (default) or `pgvector` |
| `GEMINI_API_KEY` | If using Gemini | — | Google Gemini API key |
| `EMBEDDING_PROVIDER` | No | `LLM_PROVIDER` | Override embedding provider only |
| `TAGGING_PROVIDER` | No | `LLM_PROVIDER` | Override tagging provider only |
| `DJ_PROVIDER` | No | `LLM_PROVIDER` | Override playlist generation provider |
| `HYDE_PROVIDER` | No | `LLM_PROVIDER` | Override HyDE query expansion provider |
| `NVIDIA_API_KEY` | If using NIM | — | NVIDIA NIM API key |
| `NIM_BASE_URL` | No | `https://integrate.api.nvidia.com/v1` | NIM API base URL |
| `NIM_TAGGING_MODEL` | No | `meta/llama-3.3-70b-instruct` | Model for NIM tagging |
| `NIM_HYDE_MODEL` | No | `meta/llama-3.3-70b-instruct` | Model for NIM HyDE expansion |
| `COLLEGE_BASE_URL` | If using College | — | Ollama base URL |
| `COLLEGE_USERNAME` | No | — | Ollama auth username |
| `COLLEGE_PASSWORD` | No | — | Ollama auth password |
| `GENIUS_ACCESS_TOKEN` | No | — | Genius API token for song lyrics |

| `LASTFM_API_KEY` | No | — | Last.fm API key for community tags |

### Minimal `.env` (Gemini only)

```env
LLM_PROVIDER=gemini
VECTOR_DB_PROVIDER=chroma
GEMINI_API_KEY=your_key_here
GENIUS_ACCESS_TOKEN=your_genius_token  # optional
```

### NIM `.env` (Gemini embedding + NIM tagging/HyDE + College DJ)

```env
LLM_PROVIDER=nim
VECTOR_DB_PROVIDER=chroma
GEMINI_API_KEY=your_gemini_key        # required for embedding
NVIDIA_API_KEY=your_nim_key           # required for tagging + HyDE
COLLEGE_BASE_URL=http://localhost:11434
LASTFM_API_KEY=your_lastfm_key
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/recommend` | Generate a ranked song list for an event description |
| `POST` | `/lyrics/batch` | Fetch lyrics for a batch of songs (Genius → Musixmatch) |

### `POST /recommend`

**Request:**
```json
{
  "event_description": "Late night study session",
  "songs": [
    { "title": "Song Name", "artist": "Artist", "artistGenres": ["k-pop", "pop"] }
  ]
}
```

**Response:**
```json
[
  { "title": "Song Name", "artist": "Artist", "is_new": false },
  { "title": "Wildcard Song", "artist": "Other Artist", "is_new": true }
]
```

`is_new: true` means the song was suggested by the AI (not from the user's library).

## Architecture

### Indexing Pipeline (called per `/recommend`)

```
Input songs (title, artist, Spotify genres)
        │
        ▼
┌─────────────────────────────────────┐
│            Enrichment               │
│  ① Genius lyrics                   │
│  ② Last.fm top 8 community tags     │
│  (all run concurrently via          │
│   asyncio.gather + to_thread)       │
└──────────────┬──────────────────────┘
               │  EnrichedSong(title, artist, genres,
               │               lastfm_tags, lyrics_snippet)
               ▼
┌─────────────────────────────────────┐
│          LLM Tagging                │
│  TaggingProvider (Gemini/NIM)       │
│  → energy_desc, mood_desc,          │
│    vibe_tags, embedding_text        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│          Embedding + Storage        │
│  EmbeddingProvider → vector         │
│  ChromaDB (collection per dims)     │
└─────────────────────────────────────┘
```

### Inference Pipeline (LangGraph agent)

```
Event description
        │
        ▼
HyDEProvider.expand_query()          ← hypothetical document embedding
        │  expanded query
        ▼
VectorStore.query() → top 20 songs
        │  db_songs + anchor_artists
        ▼
┌────────────────────────────────────────────────────┐
│               LangGraph Workflow                    │
│                                                    │
│  initial_fetch                                     │
│  ├── db_fetcher(event_description) → db_songs      │
│  └── llm_generator(event, 5, [], db_songs,         │
│                     anchor_artists) → wildcards    │
│         │                                          │
│         ▼                                          │
│  validate                                          │
│  └── uri_validator(song) in parallel               │
│       ├── PASS → validated_wildcards               │
│       └── FAIL → rejected_wildcards                │
│         │                                          │
│         ▼                                          │
│  should_finalize?                                  │
│  ├── enough wildcards OR max attempts → finalize   │
│  └── not enough → regenerate → validate (loop)    │
│         │                                          │
│         ▼                                          │
│  merge_and_shuffle                                 │
│  └── db_songs + validated_wildcards → dedup        │
│       → shuffle → final_playlist                   │
└────────────────────────────────────────────────────┘
```

### Provider System

```
LLMProviderContainer
├── embedding: EmbeddingProvider   (Gemini 3072-dim | College 384-dim)
├── tagging:   TaggingProvider     (Gemini Flash | NIM Llama 70b | gemma3:12b)
├── dj:        DJProvider          (Gemini Flash | gemma3:12b)
└── hyde:      HyDEProvider        (Gemini Flash | NIM Llama 70b | gemma3:12b)
```

Provider presets (`LLM_PROVIDER`):

| Provider | embedding | tagging | dj | hyde |
|----------|-----------|---------|-----|------|
| `gemini` | Gemini | Gemini Flash | Gemini Flash | Gemini Flash |
| `college` | all-minilm | gemma3:12b | gemma3:12b | gemma3:12b |
| `nim` | **Gemini** (3072) | NIM Llama 70b | gemma3:12b | NIM Llama 70b |

Individual task overrides (`EMBEDDING_PROVIDER`, `TAGGING_PROVIDER`, `DJ_PROVIDER`, `HYDE_PROVIDER`) always take precedence over the global `LLM_PROVIDER`.

> **Important:** Never change the embedding provider after songs have been indexed. Gemini uses 3072-dim vectors, College uses 384-dim. Switching forces a full re-index.

## Resilience

Implemented in `app/core/resilience.py` via the `@with_resilience` decorator:

1. **Retries**: `tenacity` with exponential backoff + jitter — catches transient 429 and 5xx errors.
2. **Circuit Breaker**: Thread-safe singleton. Trips after 3 consecutive failures; blocks calls for 60 seconds before half-opening.
3. **Error Mapping**: Provider exceptions map to typed errors (`EmbeddingError`, `TaggingError`, `GenerationError`) handled by FastAPI exception handlers.

## Project Structure

```
app/
├── main.py                    FastAPI app + lifespan provider initialization
├── core/
│   ├── config.py              Settings (pydantic-settings, reads .env)
│   └── resilience.py          Circuit breaker + retry decorator
├── models/
│   ├── song.py                Track, EnrichedSong Pydantic models
│   ├── state.py               PlaylistState (LangGraph state schema)
│   └── api.py                 Request/response DTOs
├── providers/
│   ├── protocols.py           EmbeddingProvider, TaggingProvider, DJProvider, HyDEProvider
│   ├── containers.py          LLMProviderContainer, AppContainer
│   ├── llm/
│   │   ├── factory.py         LLM provider factory (creates containers by config)
│   │   ├── gemini/            GeminiEmbeddingProvider, GeminiDJProvider, GeminiHyDEProvider
│   │   ├── college/           CollegeEmbeddingProvider, CollegeDJProvider, CollegeHyDEProvider
│   │   └── nim/               NimTaggingProvider, NimHyDEProvider
│   └── vectordb/
│       ├── factory.py         Vector store factory
│       └── chroma.py          ChromaVectorStore
├── services/
│   ├── rag.py                 RagEngine (add_songs, query_songs)
│   ├── enrichment.py          enrich_song() orchestrator
│   ├── lyrics.py              Genius + Musixmatch lyrics fetching
│   └── lastfm.py              Last.fm top tag fetching
├── workflows/
│   └── playlist_generator.py  PlaylistGraphBuilder (LangGraph nodes + edges)
├── prompts/
│   ├── audio_features_prompt.txt   Tagging prompt
│   ├── playlist_generation_prompt.txt  DJ/wildcard prompt
│   └── hyde_prompt.txt             HyDE query expansion prompt
└── api/
    └── endpoints.py           FastAPI route handlers
```
