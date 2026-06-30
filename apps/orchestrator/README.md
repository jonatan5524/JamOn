# JamOn Orchestrator

NestJS service that acts as the central hub of JamOn: authenticates users with Spotify, fetches their listening history, coordinates with the Python data engine for AI recommendations, and creates the final playlist on Spotify.

## Architecture & Flow

```
POST /playlists/generate  (Authorization: Bearer <spotify_token>)
            │
            ▼
    PlaylistController
            │
            ▼
    PlaylistService
    │
    ├── 1. SpotifyService.getTopTracks()
    │        └── GET /v1/me/top/tracks (top 30)
    │             → List<{ title, artist }>
    │
    ├── 2. DataEngineService.getRecommendations()
    │        └── POST http://data-engine:8000/recommend
    │             body: { event_id: string }
    │             → List<{ title, artist, is_new }>
    │
    ├── 3. SpotifyService.searchTracks() (parallel)
    │        └── GET /v1/search per song → Spotify URI
    │             (only for is_new: true songs)
    │
    ├── 4. SpotifyService.createPlaylist()
    │        └── POST /v1/me/playlists
    │
    └── 5. SpotifyService.addTracksToPlaylist()
             └── POST /v1/playlists/{id}/items
                  → PlaylistResponseDto
```

## Quick Start

### Prerequisites

- Node.js 18+
- A running [data-engine](../data-engine/app/README.md) instance
- A Spotify Developer app with the required OAuth scopes

### Setup

```bash
cd apps/orchestrator
npm install
```

Create `.env` in `apps/orchestrator/`:

```env
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:5173/callback
DATA_ENGINE_URL=http://localhost:8000
```

### Run

```bash
npm run start:dev    # development with hot-reload
npm run start:prod   # production build
```

Server starts on `http://localhost:3000`. Swagger UI at `http://localhost:3000/api`.

### Test

```bash
npm test              # unit tests
npm run test:watch    # watch mode
npm run test:e2e      # end-to-end tests
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SPOTIFY_CLIENT_ID` | Yes | Spotify app client ID |
| `SPOTIFY_CLIENT_SECRET` | Yes | Spotify app client secret |
| `SPOTIFY_REDIRECT_URI` | Yes | OAuth redirect URI (must match Spotify dashboard) |
| `DATA_ENGINE_URL` | Yes | Base URL of the Python data-engine (e.g. `http://localhost:8000`) |

## API Reference

### `POST /playlists/generate`

Creates a Spotify playlist from AI-recommended songs.

**Headers:**
```
Authorization: Bearer <spotify_access_token>
Content-Type: application/json
```

**Body:**
```json
{
  "eventDescription": "Late night study session",
  "playlistName": "Study Vibes"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `eventDescription` | string | Yes | Passed to the AI engine (max 200 chars) |
| `playlistName` | string | No | Defaults to `"JamOn: {eventDescription}"` (max 100 chars) |

**Success (201):**
```json
{
  "playlistId": "abc123",
  "playlistUrl": "https://open.spotify.com/playlist/abc123",
  "tracksAdded": 18,
  "tracksNotFound": ["Rare Song by Obscure Artist"],
  "totalRequested": 20
}
```

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 400 | Validation error | Missing or invalid `eventDescription` |
| 401 | `SPOTIFY_AUTH_EXPIRED` | Missing or rejected Bearer token |
| 422 | `NO_TRACKS_RESOLVED` | Data engine returned empty or no Spotify URIs resolved |
| 429 | `AI_SERVICE_BUSY` | Data engine rate-limited |
| 500 | `PLAYLIST_CREATION_FAILED` | Spotify API error |

### Required Spotify OAuth Scopes

| Scope | Why |
|-------|-----|
| `playlist-modify-public` | Create public playlists and add tracks |
| `playlist-modify-private` | Create private playlists and add tracks |
| `user-read-private` | Validate token and read user profile |
| `user-top-read` | Fetch user's top tracks for personalization |

## Project Structure

```
src/
├── main.ts                              App bootstrap (port 3000, Swagger, ValidationPipe)
├── app.module.ts                        Root module
├── utils/
│   └── auth.ts                          extractBearerToken helper
└── modules/
    ├── auth/                            Spotify OAuth flow
    ├── user/                            User entity + management
    ├── event/                           Event entity (user-created events)
    ├── spotify/
    │   ├── spotify.module.ts
    │   ├── spotify.service.ts           Spotify API wrapper: search, create playlist,
    │   │                                add tracks, getTopTracks, getArtistsBatch
    │   └── spotify.types.ts             Typed Spotify API response shapes
    ├── data-engine/
    │   ├── data-engine.module.ts
    │   └── data-engine.service.ts       HTTP client: POST /recommend to Python service
    └── playlist/
        ├── playlist.module.ts
        ├── playlist.controller.ts       POST /playlists/generate
        ├── playlist.service.ts          Orchestration: top tracks → data-engine → Spotify
        └── dto/
            ├── create-playlist.dto.ts
            └── playlist-response.dto.ts
```

## Spotify API Notes

- **Top tracks:** `GET /v1/me/top/tracks` — requires `user-top-read` scope.
- **Search:** `GET /v1/search` — no special scope needed with a user token.
- **Create playlist:** `POST /v1/me/playlists` — uses `/me` (dev mode restriction prevents `/users/{id}`).
- **Add tracks:** `POST /v1/playlists/{id}/items` — use `/items`, not `/tracks` (endpoint changed Feb 2026).
- **HTTP client:** `@nestjs/axios` via a shared `spotifyRequest` base method with automatic auth header injection.
