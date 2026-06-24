# Multi-Client Spotify Routing — Design

**Date:** 2026-06-24
**Status:** Approved (pending user spec review)
**Area:** `apps/orchestrator` (NestJS)

## Problem

Each Spotify developer app in test mode allows only a small fixed number of
allowlisted test users. This is a university final project, so it cannot be
promoted to production mode. The team has 6 Spotify apps (6 team members ×
their per-app test-user slots), giving roughly 30 usable testers in total.

We need to pool those 6 apps behind the single orchestrator so any of the ~30
testers can log in, with the system transparently routing each user to the app
where their email is an allowlisted test user.

## Key Constraints (discovered from code + Spotify OAuth)

1. **Allowlist is per-app.** A user can only complete OAuth on the specific app
   where their email is a registered test user. The authorize URL embeds one
   `client_id`, so the email→client decision must happen **before** the
   `/authorize` redirect — not at callback.
2. **Token exchange must reuse the same client** (`client_id` + `client_secret`
   + `redirect_uri`) that initiated the flow. Client identity must survive the
   round trip; we carry it inside the OAuth `state` parameter.
3. **Shared redirect URI is allowed.** Multiple Spotify apps can register the
   same `redirect_uri`, so one callback route serves all 6 apps. No per-client
   routes.
4. **Adding a test user is a manual dashboard action.** The email→client map
   cannot be fully automated; a human adds each email in some app's dashboard
   and records the pairing.
5. **Client-credential touch points are few.** In the current code, `client_id`
   / `client_secret` are used in exactly three places:
   - `getAuthorizationUrl` (authorize URL) — resolve client **by email**
   - `exchangeCodeForToken` (callback) — resolve client **by state**
   - `getAppToken` (chart fetch, `client_credentials`) — any client → **default**
   There is **no Spotify access-token refresh** anywhere today (pre-existing gap,
   out of scope). Per-user Spotify calls (search, create playlist) use the
   user's bearer token and need no client creds.

## Decisions

- **Client credentials live in env** (`SPOTIFY_CLIENTS` JSON). Secrets stay out
  of the DB. The registry is static (6 fixed apps, set once).
- **Email→client assignment lives in a DB table**, populated by hand. This is
  the only part that changes per tester.
- **Abstraction = a resolver service + thin middleware** on the auth routes.
  No AsyncLocalStorage / no new dependencies — only 3 touch points need creds.

## Architecture

### 1. Client registry (env config)

New env var `SPOTIFY_CLIENTS`, a JSON array:

```json
[
  { "key": "app1", "id": "<client_id_1>", "secret": "<client_secret_1>" },
  { "key": "app2", "id": "<client_id_2>", "secret": "<client_secret_2>" }
]
```

- Redirect URI stays a single shared value: existing `SPOTIFY_REDIRECT_URI`.
- Optional `SPOTIFY_DEFAULT_CLIENT_KEY` selects the client used for app-level
  calls (`getAppToken`); defaults to the first entry.
- **Backward compatibility:** if `SPOTIFY_CLIENTS` is unset, build a
  single-entry registry from the existing `SPOTIFY_CLIENT_ID` /
  `SPOTIFY_CLIENT_SECRET` so current `.env` files keep working.
- Parsed and validated **once at boot**. Malformed JSON or missing fields →
  fail fast with a clear error.

Typed shape:

```ts
interface SpotifyClient {
  key: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string; // shared SPOTIFY_REDIRECT_URI
}
```

### 2. Email→client assignment (DB table, manual)

New entity `SpotifyClientAssignment`:

| column      | type        | notes                          |
|-------------|-------------|--------------------------------|
| `email`     | varchar PK  | stored lowercased              |
| `clientKey` | varchar     | must match a registry `key`    |
| `createdAt` | timestamptz | default now                    |

- Standalone table — lookup at `/authorize` happens before any `User` row
  exists for first-time testers.
- Populated by hand (`INSERT`) as testers are added to each app's dashboard.
- Registered in the TypeORM entities array in `app.module.ts`.

### 3. Resolver service — `SpotifyClientResolver`

The single source of truth over the registry. Lives in `SpotifyModule`
(so `SpotifyService.getAppToken` can use it) and is exported for `AuthModule`
and the middleware.

```ts
resolveByEmail(email: string): Promise<SpotifyClient>  // throws 400 if unregistered
resolveByState(state: string): SpotifyClient           // parse clientKey out of state
getByKey(key: string): SpotifyClient                   // for stored user.spotifyClientKey
getDefault(): SpotifyClient                            // app-level calls / charts
```

- Injects the assignment repository (`TypeOrmModule.forFeature`).
- `resolveByEmail`: lowercase → query assignment → map `clientKey` to registry.
  No assignment → `HttpException(400, "email not registered for testing,
  contact admin")`. Unknown key (config drift) → `500`, logged.

### 4. State carries client identity

- `state = randomHex(16) + ":" + client.key`
- CSRF cookie stores the **full** state (current behavior, unchanged) — both
  the URL `state` and the cookie hold `rand:clientKey`.
- Callback CSRF check stays exact equality: `state === cookie` (existing logic,
  untouched). Then `clientKey = state.split(":")[1]` for routing.
- The `clientKey` half is not a secret; the `randomHex` half is what makes the
  state unforgeable. Only change to the existing flow: build `rand:key` instead
  of `rand`.

### 5. Middleware — `SpotifyClientMiddleware`

`NestMiddleware`, applied (via `AuthModule implements NestModule`) to exactly:
`auth/spotify/authorize` and `auth/spotify/callback`.

- Injects `SpotifyClientResolver`.
- authorize request (has `?email=`) → `resolveByEmail` → set `req.spotifyClient`.
- callback request (has `?state=`) → `resolveByState` → set `req.spotifyClient`.
- Resolver throws (e.g. unregistered email) → caught, passed to `next(err)` →
  standard Nest exception filter returns the HTTP error.
- Express `Request` augmented with `spotifyClient?: SpotifyClient` via
  declaration merging in a small `*.d.ts`.

`getAppToken` calls `resolver.getDefault()` directly (no request context).

### 6. Consuming the resolved client

- `AuthService.getAuthorizationUrl(client)` — builds URL from `client.id` +
  `client.redirectUri`; returns `{ url, state }` where `state` is the full
  `random:key`. Controller sets the CSRF cookie to that same `state`.
- `AuthService.exchangeCodeForToken(code, client)` — uses `client.id/secret/
  redirectUri`.
- `AuthService.handleLogin(code, client)` — threads the client through; stores
  `spotifyClientKey = client.key` on the user.
- `User` entity gains `spotifyClientKey` (nullable, `select: false`). Set at
  login. Enables a future Spotify token-refresh to resolve the right client
  via `getByKey`.

### 7. Authorize query DTO + frontend

- New `AuthorizeQueryDto { email: string }` with `@IsEmail()`. Missing/invalid
  → 400 before any redirect.
- Frontend login (served at `CLIENT_URL`, e.g. `localhost:5173`): email input +
  "Continue with Spotify" button → `GET /api/auth/spotify/authorize?email=...`.
  The button carries the typed email; it is no longer a static link. Handle 400
  ("not registered for testing") inline. Exact frontend file located during
  planning.

## End-to-end flow

```
[email input] → GET /authorize?email
    → middleware: resolveByEmail → req.spotifyClient
    → controller: build auth URL (that client_id), state = rand:key,
      set CSRF cookie = state (full rand:key)
    → 302 Spotify consent
        → GET /callback?code&state
        → middleware: resolveByState → req.spotifyClient
        → controller: CSRF check (state === cookie)
        → exchangeCodeForToken(code, client) [same app]
        → store user + spotifyClientKey → issue app JWT → redirect to client
```

## Error handling

| Case                              | Behavior                                  |
|-----------------------------------|-------------------------------------------|
| Email not in assignment table     | 400 "not registered for testing, contact admin" |
| Missing/invalid email at authorize| 400 (DTO validation)                      |
| `clientKey` not in registry       | 500, logged (config drift)                |
| Malformed `SPOTIFY_CLIENTS`       | Fail fast at boot                         |
| CSRF mismatch at callback         | 400 "Invalid OAuth state" (existing)      |

## Testing

- **Registry parse:** valid JSON, missing fields, malformed JSON, single-client
  env fallback.
- **Resolver:** `resolveByEmail` (found / not found / unknown key),
  `resolveByState` round-trip, `getDefault`, `getByKey`.
- **State:** encode/decode round-trip; CSRF compares the full state (the random
  half is the unforgeable part; the clientKey half is non-secret payload).
- **Middleware:** sets `req.spotifyClient` for email and for state; 400 on
  unregistered email.
- **Integration:** `/authorize?email=<registered>` → 302 to
  `accounts.spotify.com` with correct `client_id` + `state` format;
  `<unregistered>` → 400. `/callback` with a given `state` → token exchange
  uses the matching client (mocked HTTP).
- **Regression:** existing single-client flow still works when `SPOTIFY_CLIENTS`
  is unset.

## Touch points

| File | Change |
|------|--------|
| `modules/spotify/spotify-client.types.ts` *(new)* | `SpotifyClient` interface |
| `modules/spotify/spotify-client.registry.ts` *(new)* | parse `SPOTIFY_CLIENTS` env |
| `modules/spotify/spotify-client.resolver.ts` *(new)* | resolver service |
| `modules/spotify/spotify-client-assignment.entity.ts` *(new)* | DB table |
| `modules/spotify/spotify-client.middleware.ts` *(new)* | request-time entry |
| `types/express.d.ts` *(new)* | augment `Request.spotifyClient` |
| `modules/spotify/spotify.module.ts` | register resolver, entity, export |
| `modules/spotify/spotify.service.ts` | `getAppToken` → `resolver.getDefault()` |
| `modules/auth/auth.service.ts` | thread client through authorize/exchange/login |
| `modules/auth/auth.controller.ts` | read `req.spotifyClient`, email DTO, cookie=csrf |
| `modules/auth/auth.module.ts` | apply middleware (`NestModule`) |
| `modules/auth/dto/authorize-query.dto.ts` *(new)* | `{ email }` |
| `modules/user/user.entity.ts` | `+ spotifyClientKey` column |
| `modules/user/user.service.ts` | persist `spotifyClientKey` at login |
| `app.module.ts` | add assignment entity |
| frontend login page | email input → authorize with email |
| `.env.example` | document `SPOTIFY_CLIENTS`, `SPOTIFY_DEFAULT_CLIENT_KEY` |

## Out of scope

- Spotify access-token refresh (already missing today).
- Auto-assignment / round-robin / capacity tracking UI.
- Promoting any app to Spotify production mode.
