# JamOn Orchestrator

NestJS service that takes LLM-generated song recommendations, resolves them to Spotify tracks, and creates playlists on behalf of users.

## How It Works

1. Receives a request with an event description and a Spotify access token
2. Calls the data-engine for song recommendations (currently mocked)
3. Searches Spotify for each song to get track URIs
4. Creates a playlist on the user's Spotify account
5. Adds the resolved tracks to the playlist
6. Returns the playlist URL and stats

## Setup

```bash
cd apps/orchestrator
npm install
```

## Running

```bash
npm run start:dev
```

The server starts on `http://localhost:3000`.

## Testing

```bash
npm test              # run all tests
npm run test:watch    # watch mode
```

## API

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

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `eventDescription` | string | Yes | Event description for song matching (max 200 chars) |
| `playlistName` | string | No | Custom playlist name (max 100 chars). Defaults to `"JamOn: {eventDescription}"` |

**Success Response (201):**
```json
{
  "playlistId": "abc123",
  "playlistUrl": "https://open.spotify.com/playlist/abc123",
  "tracksAdded": 18,
  "tracksNotFound": ["Song X by Artist Y"],
  "totalRequested": 20
}
```

**Error Responses:**

| Status | Error Code | When |
|--------|-----------|------|
| 400 | Validation error | Missing or invalid `eventDescription` |
| 401 | `SPOTIFY_AUTH_EXPIRED` | Missing Bearer token or Spotify rejected the token |
| 422 | `NO_TRACKS_RESOLVED` | No songs found on Spotify or data-engine returned empty |
| 500 | `PLAYLIST_CREATION_FAILED` | Spotify API error during playlist creation or track addition |

## Required Spotify OAuth Scopes

The access token passed in the `Authorization` header must have these scopes:

| Scope | Why |
|-------|-----|
| `playlist-modify-public` | Create public playlists and add tracks |
| `playlist-modify-private` | Create private playlists and add tracks |
| `user-read-private` | Read user profile (validates token) |

## Project Structure

```
src/
├── main.ts                              # App bootstrap
├── app.module.ts                        # Root module
├── utils/
│   └── auth.ts                          # extractBearerToken helper
└── modules/
    ├── spotify/
    │   ├── spotify.module.ts            # HttpModule + SpotifyService
    │   ├── spotify.service.ts           # Spotify API wrapper (search, create, add)
    │   └── spotify.types.ts             # Spotify response types
    ├── data-engine/
    │   ├── data-engine.module.ts
    │   └── data-engine.service.ts       # Mock — returns hardcoded songs
    └── playlist/
        ├── playlist.module.ts
        ├── playlist.controller.ts       # POST /playlists/generate
        ├── playlist.service.ts          # Orchestration logic
        └── dto/
            ├── create-playlist.dto.ts   # Request validation
            └── playlist-response.dto.ts # Response types + error enum
```

## Spotify API Notes

- **Search:** `GET /v1/search` — no special scope needed with user token
- **Create playlist:** `POST /v1/me/playlists` — uses `/me` instead of `/users/{id}` (dev mode restriction)
- **Add tracks:** `POST /v1/playlists/{id}/items` — uses `/items` not `/tracks` (endpoint changed Feb 2026)
- **HTTP client:** Uses `@nestjs/axios` (HttpModule) for all Spotify calls via a shared `spotifyRequest` base method

## Data-Engine Integration

Currently mocked with 20 hardcoded songs. When the Python data-engine gets a FastAPI wrapper, replace `DataEngineService.getRecommendations()` with an HTTP call to:

```
POST http://data-engine:8000/recommend
Body: { "event_description": "..." }
Response: [{ "title": "...", "artist": "...", "is_new": true/false }]
```
