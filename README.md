# JamOn

Personalized music recommendation engine. Uses RAG + LLMs to generate event-specific Spotify playlists from a user's music library.

## Quick Start

### 1. Data Engine (Python)

```bash
cd apps/data-engine/app
python3 -m venv .venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

Create `.env`:
```
GEMINI_API_KEY=your_key_here
GENIUS_ACCESS_TOKEN=your_genius_token_here
LLM_PROVIDER=gemini
VECTOR_DB_PROVIDER=chroma
```

Run:
```bash
# From apps/data-engine directory
uvicorn app.main:app --port 8000
```

Startup initializes the configured providers (Gemini/Chroma by default). Ready when you see `"Providers ready"`.

### 2. Orchestrator (NestJS)

```bash
cd apps/orchestrator
npm install
npm run start:dev
```

Runs on `http://localhost:3000`.

### 3. Test It

```bash
curl -X POST http://localhost:3000/playlists/generate \
  -H "Authorization: Bearer YOUR_SPOTIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"eventDescription": "Late night study session"}'
```

Returns a Spotify playlist URL with 20 songs.

## Getting a Spotify Token

1. Create an app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Add yourself in **User Management**
3. Authorize:
```
https://accounts.spotify.com/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=https://google.com&scope=playlist-modify-public%20playlist-modify-private%20user-read-private&show_dialog=true
```
4. Copy the `code` from the redirect URL
5. Exchange for token (use Basic Auth with client_id:client_secret):
```
POST https://accounts.spotify.com/api/token
grant_type=authorization_code
code=THE_CODE
redirect_uri=https://google.com
```

### Required Spotify Scopes

| Scope | Why |
|-------|-----|
| `playlist-modify-public` | Create public playlists and add tracks |
| `playlist-modify-private` | Create private playlists and add tracks |
| `user-read-private` | Validate user token |

## Project Structure

```
apps/
  data-engine/         Python — Modular RAG engine, LLM tagging, vector search
    app/
      main.py          FastAPI server (Lifespan-based provider initialization)
      providers/       Abstraction layer for LLM and VectorDB (Gemini, Chroma, etc.)
      services/rag.py  Provider-agnostic RAG engine
      data/mock_data.py  20 mock songs for testing

  orchestrator/        NestJS — Spotify integration, playlist creation
    src/
      modules/
        spotify/       Spotify API wrapper (search, create, add tracks)
        playlist/      Orchestration (data-engine -> Spotify -> playlist)
        data-engine/   HTTP client for the Python service
```
