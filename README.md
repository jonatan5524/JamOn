# JamOn

Personalized music recommendation engine. Generates event-specific Spotify playlists by analyzing a user's library with RAG + LLMs — no raw audio features, just semantic "text-ification."

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Client  (React/Vite :5173)              │
│  Login → Spotify OAuth → Events → Generate Playlist     │
└────────────────────────┬────────────────────────────────┘
                         │  REST (Bearer token + event description)
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Orchestrator  (NestJS :3000)                │
│                                                         │
│  1. Fetch user's top 50 tracks + artist genres          │
│     from Spotify API                                    │
│  2. POST /recommend → Data Engine                       │
│  3. Resolve LLM suggestions to Spotify track URIs       │
│  4. Create playlist + add tracks on user's account      │
└────────────────────────┬────────────────────────────────┘
                         │  POST /recommend (songs + event description)
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Data Engine  (FastAPI :8000)                │
│                                                         │
│  Enrichment:  Genius lyrics + Last.fm community tags    │
│               + Spotify artist genres                   │
│                                                         │
│  Tagging:     LLM (Gemini / NIM) estimates energy,      │
│               mood, vibe tags → embedding text          │
│                                                         │
│  Indexing:    Embed → ChromaDB vector store             │
│                                                         │
│  Retrieval:   HyDE expand query → vector search         │
│               → LangGraph agent (generate → validate    │
│                 → regenerate loop) → ranked song list   │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- A [Spotify Developer app](https://developer.spotify.com/dashboard) with `playlist-modify-public`, `playlist-modify-private`, and `user-read-private` scopes
- A Google Gemini API key (minimum viable setup)

### 1. Data Engine (Python)

```bash
cd apps/data-engine
python3 -m venv app/.venv
source app/.venv/bin/activate
pip install -r requirements.txt
```

Create `apps/data-engine/app/.env` (minimal setup):
```env
GEMINI_API_KEY=your_gemini_key
GENIUS_ACCESS_TOKEN=your_genius_token   # optional — lyrics enrich tagging
LLM_PROVIDER=gemini
VECTOR_DB_PROVIDER=chroma
```

Start:
```bash
cd apps/data-engine
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Ready when you see `Providers ready` in the logs. Swagger UI at `http://localhost:8000/docs`.

### 2. Orchestrator (NestJS)

```bash
cd apps/orchestrator
npm install
```

Create `apps/orchestrator/.env`:
```env
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:5173/callback
DATA_ENGINE_URL=http://localhost:8000
```

Start:
```bash
npm run start:dev
```

Runs on `http://localhost:3000`.

### 3. Client (React)

```bash
cd apps/client
npm install
```

Create `apps/client/.env`:
```env
VITE_API_URL=http://localhost:3000
```

Start:
```bash
npm run dev
```

Runs on `http://localhost:5173`.

### 4. Generate a Playlist

Open `http://localhost:5173`, log in with Spotify, create an event, and hit **Generate Playlist**. Or call the API directly:

```bash
curl -X POST http://localhost:3000/playlists/generate \
  -H "Authorization: Bearer YOUR_SPOTIFY_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"eventDescription": "Late night study session"}'
```

Returns a Spotify playlist URL with up to 20 songs.

## Getting a Spotify Access Token (manual / dev)

1. Authorize — paste this URL into your browser (replace values):
```
https://accounts.spotify.com/authorize?client_id=CLIENT_ID&response_type=code&redirect_uri=https://google.com&scope=playlist-modify-public%20playlist-modify-private%20user-read-private%20user-top-read&show_dialog=true
```
2. Copy the `code` from the redirect URL query string.
3. Exchange for a token (Basic Auth = `base64(client_id:client_secret)`):
```bash
curl -X POST https://accounts.spotify.com/api/token \
  -H "Authorization: Basic BASE64_CLIENT_CREDS" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=THE_CODE&redirect_uri=https://google.com"
```

## Provider Modes (Data Engine)

The data engine supports mixing LLM providers per task to reduce API costs:

| Mode | Embedding | Tagging | DJ/Generation | HyDE |
|------|-----------|---------|---------------|------|
| `gemini` (default) | Gemini 3072-dim | Gemini Flash | Gemini Flash | Gemini Flash |
| `college` | all-minilm 384-dim | gemma3:12b | gemma3:12b | gemma3:12b |
| `nim` | Gemini 3072-dim | NIM (Llama 70b) | College gemma3 | NIM (Llama 70b) |

> **Note:** Never change the embedding provider once songs are indexed — it changes vector dimensions and forces a full re-index.

See [`apps/data-engine/app/README.md`](apps/data-engine/app/README.md) for full environment variable reference.

## Project Structure

```
apps/
├── client/              React + Vite frontend
│   └── src/
│       ├── pages/       Login, Home, Event, MyEvents, JoinByCode
│       ├── components/  Shared UI (Radix + Tailwind)
│       └── hooks/       TanStack Query data fetching hooks
│
├── orchestrator/        NestJS — Spotify integration + playlist orchestration
│   └── src/modules/
│       ├── auth/        Spotify OAuth flow
│       ├── spotify/     Spotify API wrapper (search, create, add tracks, genres)
│       ├── playlist/    Orchestration (top tracks → data-engine → Spotify)
│       ├── event/       Event entity management
│       ├── user/        User management
│       └── data-engine/ HTTP client for Python service
│
└── data-engine/         FastAPI — RAG engine, LLM tagging, vector search
    └── app/
        ├── providers/   Abstraction layer (Gemini, College/Ollama, NIM, Chroma)
        ├── services/    rag.py, lyrics.py, lastfm.py, enrichment.py
        ├── workflows/   LangGraph playlist generation agent
        └── prompts/     LLM prompt templates
```
