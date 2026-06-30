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
                         │  POST /recommend (event_id)
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

## RAG Pipeline (Inference Flow)

How a single "Generate Playlist" request flows through the data engine:

```
User: "Late night melancholic study session"
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 1 — HyDE Query Expansion                          │
│                                                         │
│  The raw event description is a SHORT, VAGUE phrase.    │
│  Cosine similarity works best when document and query   │
│  are in the SAME semantic space. A short phrase is NOT  │
│  in the same space as a rich tag+lyrics embedding.      │
│                                                         │
│  HyDE = Hypothetical Document Embeddings                │
│  LLM rewrites the query into a FAKE SONG DESCRIPTION:   │
│  "Slow tempo, acoustic, introspective lyrics, low       │
│   energy, sad mood, lo-fi, rainy night vibe…"           │
│                                                         │
│  This synthetic "document" is now in the same space     │
│  as the real song embeddings in the vector store.       │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 2 — Vector Store Query (max_distance gate)        │
│                                                         │
│  Embed the expanded query → query pgvector with         │
│  cosine distance (<=>), fetch top-N candidates          │
│  scoped to THIS EVENT's participants' libraries.        │
│                                                         │
│  Each song gets a cosine distance in range [0.0, 2.0]   │
│  (practically ~0.05–0.80 for real text embeddings).     │
│                                                         │
│  max_distance = 0.7  ← absolute quality gate            │
│                                                         │
│  Song A:  dist=0.22  ✅ PASS                            │
│  Song B:  dist=0.31  ✅ PASS                            │
│  Song C:  dist=0.45  ✅ PASS                            │
│  Song D:  dist=0.71  ❌ FAIL → dropped                  │
│  Song E:  dist=0.85  ❌ FAIL → dropped                  │
│                                                         │
│  WHY max_distance? Without it, songs that are           │
│  semantically UNRELATED to the event still return       │
│  because the DB always returns the top-N closest,       │
│  even if "closest" is still very far away.              │
└─────────────────────────┬───────────────────────────────┘
                          │  (e.g. Songs A, B, C returned)
                          ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 3 — Strong Spine Identification (strong_margin)   │
│                                                         │
│  Songs that passed max_distance are sorted by distance  │
│  (ascending = best fit first). Now we cut a "spine"     │
│  of truly excellent matches.                            │
│                                                         │
│  best_distance = 0.22 (Song A, the closest)             │
│  strong_match_margin = 0.10                             │
│  cutoff = 0.22 + 0.10 = 0.32                           │
│                                                         │
│  Song A: dist=0.22  ≤ 0.32  → STRONG ✅                │
│  Song B: dist=0.31  ≤ 0.32  → STRONG ✅                │
│  Song C: dist=0.45  > 0.32  → weak, excluded           │
│                                                         │
│  WHY relative margin (not another absolute threshold)?  │
│                                                         │
│  Cosine distances for text embeddings cluster in a      │
│  NARROW BAND (roughly 0.20–0.35 for real matches).      │
│  A fixed absolute gate like "< 0.30" is brittle:        │
│  - Too low  → empty spine (all songs excluded)          │
│  - Too high → entire library qualifies = no signal      │
│                                                         │
│  A RELATIVE gate (best + margin) always picks the       │
│  best-fitting CLUSTER for this specific query,          │
│  adapting to where results land on any given day.       │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 4 — Dynamic Wildcard Target                       │
│                                                         │
│  target = playlist_size (20) - len(strong_songs)        │
│  (but at least min_wildcards=3)                         │
│                                                         │
│  Strong songs: 2  →  wildcards = max(3, 20-2) = 18      │
│  Strong songs: 17 →  wildcards = max(3, 20-17) = 3      │
│                                                         │
│  WHY? If your library is a perfect fit, the LLM         │
│  barely needs to invent anything. If it's a weak fit,   │
│  the LLM carries most of the playlist. The system       │
│  self-balances instead of always asking for 10 LLM      │
│  songs regardless of library match quality.             │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 5 — LLM DJ Generation + Overprovision             │
│                                                         │
│  The DJ (Gemini) is asked for:                          │
│  requested = round(target_wildcards × overprovision)    │
│                                                         │
│  overprovision_factor > 1.0 means ask for MORE than     │
│  needed — because some wildcards will fail Spotify       │
│  URI validation (song doesn't exist on Spotify).        │
│                                                         │
│  e.g. need 5, overprovision=1.4 → ask for 7            │
│  → 2 fail Spotify validation → still get 5 good ones   │
│                                                         │
│  Anchor artists (from the FULL library, not just the    │
│  strong spine) are passed to the DJ so wildcards        │
│  respect the user's taste fingerprint.                  │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 6 — Validate → Retry Loop (LangGraph)             │
│                                                         │
│  validate: hit Spotify search for each wildcard.        │
│  should_finalize:                                       │
│    - enough validated AND                               │
│    - OR max_attempts reached → merge_and_shuffle        │
│    - else → regenerate (pass rejected list so LLM       │
│      doesn't suggest the same bad songs again)          │
│                                                         │
│                 ┌──────────────────┐                    │
│  initial_fetch─►│    validate      │                    │
│                 └────────┬─────────┘                    │
│                          │ should_finalize               │
│                    ┌─────┴──────┐                       │
│                  needs        done                       │
│                  more          │                         │
│                    │           ▼                         │
│               regenerate  merge_and_shuffle ──► END      │
│                    │                                     │
│                    └──────► validate (loop)              │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 7 — Merge & Shuffle                               │
│                                                         │
│  spine_songs (library) + validated_wildcards (AI)       │
│  → deduplicate → trim to target_playlist_size           │
│  → shuffle (hide the seam between library/AI songs)     │
└─────────────────────────────────────────────────────────┘
```

### Key Parameters

| Concept | Value | Why |
|---|---|---|
| **HyDE** | rewrites short query → rich synthetic doc | Short event phrases are not in the same embedding space as tag+lyrics docs; HyDE bridges the semantic gap |
| **`max_distance`** | `0.7` (absolute) | Vector stores always return top-N even when the pool is irrelevant; this is the hard floor — "don't return garbage" |
| **`strong_match_margin`** | `0.10` (relative) | Embedding distances cluster in a narrow band (~0.20–0.35); a fixed absolute threshold is fragile, a relative one always picks the best cluster for this query |
| **Strong spine** | songs within margin of best match | The songs that actually carry the event's vibe — they become guaranteed slots in the final playlist |
| **Dynamic wildcard target** | `max(min_wildcards, playlist_size - spine_size)` | Library quality drives how much AI fills in; weak library match → AI does heavy lifting, strong match → AI barely appears |
| **`overprovision_factor`** | `> 1.0` | Ask the DJ for more wildcards than needed to absorb Spotify validation failures without falling short of the target |
| **Retry loop** | max 3 attempts | Wildcards that fail Spotify URI lookup are fed back to the DJ so it doesn't repeat the same hallucinations |

## Eval & Auto-Improvement Loop

How the eval loop tunes the RAG pipeline's numeric parameters and LLM prompts automatically:

```
                  ┌─────────────────────────────────────────┐
                  │  Inputs                                  │
                  │  - mock song library (20 songs with      │
                  │    lyrics + vibe tags, or real user       │
                  │    library via --event-id)               │
                  │  - hardcoded training events             │
                  │  - held-out events (never seen by        │
                  │    optimizer)                            │
                  └────────────────┬────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────┐
│  PHASE 1 — Parameter Grid Search  (no LLM judge, cheap)      │
│                                                              │
│  Exhaustively try every combination of:                      │
│    n_results:           [5, 15, 30]                          │
│    max_distance:        [0.5, 0.65, 0.8]                     │
│    target_wildcards:    [3, 5, 7]                            │
│    strong_match_margin: [0.06, 0.10, 0.14]                   │
│  → 81 combinations total                                     │
│                                                              │
│  Each combo runs ALL training events through the full        │
│  RAG pipeline (HyDE → vector search → DJ → validate).       │
│  No LLM judge yet — scored on three cheap metrics only:      │
│                                                              │
│    acceptance_rate   = validated_wildcards / target          │
│    retrieval_relevance = precision × recall of spine         │
│       precision = 1 − mean_cosine_distance of spine songs    │
│       recall    = spine_size / n_results_requested           │
│    size_fulfillment  = final_playlist_size / target_size     │
│                                                              │
│    partial = 0.20×acceptance + 0.15×relevance + 0.15×size   │
│                                                              │
│  GUARDRAIL: if EVERY event returns an empty spine            │
│  (library contributes nothing), score is forced to 0.0 —    │
│  mistuned absolute thresholds can hit 0.67 composite         │
│  while retrieval_relevance is secretly 0.00.                 │
│                                                              │
│  Saves best_params.json after each improvement.             │
│                 ↓                                            │
│           best_params ★                                      │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  PHASE 2 — Prompt Hill-Climbing  (with LLM judge, expensive) │
│                                                              │
│  Params are now frozen at best_params from Phase 1.          │
│  The loop alternates between mutating HyDE and DJ prompts:   │
│                                                              │
│   iteration 0: optimize HyDE prompt                          │
│   iteration 1: optimize DJ prompt                            │
│   iteration 2: optimize HyDE prompt  … (N iterations)       │
│                                                              │
│  Each iteration:                                             │
│                                                              │
│  1. Run all training events → collect failures               │
│     (events where alignment < 0.6 OR acceptance < 0.6)      │
│                                                              │
│  2. Full composite score (now includes LLM judge):           │
│       composite = 0.45×alignment                            │
│                 + 0.25×acceptance_rate                       │
│                 + 0.15×retrieval_relevance                   │
│                 + 0.15×size_fulfillment                      │
│       alignment = NIM Llama-70b rates playlist 0–10          │
│                   ("does this tracklist fit the event?")     │
│                                                              │
│  3. Meta-prompt sends current prompt + failure list to       │
│     Llama-70b: "rewrite this prompt to fix these failures"   │
│     → mutated prompt candidate                               │
│                                                              │
│  4. Re-run all events with mutated prompt → new score        │
│     score > best?  → accept, update failures list            │
│     score ≤ best?  → revert, keep current                    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  score(hyde, dj)                                    │    │
│  │       │                                             │    │
│  │  mutate(hyde)──►score(hyde', dj)──►accept/revert   │    │
│  │       │                                             │    │
│  │  mutate(dj)────►score(hyde, dj')──►accept/revert   │    │
│  │       │                    … N times                │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Prompt repair: if the LLM drops a required placeholder      │
│  (e.g. {event_description}) it re-appends it rather than    │
│  discarding the whole mutation.                              │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  HOLDOUT VALIDATION                                          │
│                                                              │
│  Run the winning (params + prompts) on held-out events the   │
│  optimizer NEVER saw.                                        │
│                                                              │
│  Reports train−holdout gap.                                  │
│  gap > 0.10 → ⚠ possible overfitting warning                │
│                                                              │
│  Writes to eval/optimized/:                                  │
│    params.json                ← best numeric params          │
│    hyde_prompt.txt            ← best HyDE prompt             │
│    playlist_generation_prompt.txt ← best DJ prompt           │
└──────────────────────────────────────────────────────────────┘
```

### Scoring Metrics Explained

| Metric | Weight | Formula | What it catches |
|---|---|---|---|
| **alignment** | 45% | NIM Llama-70b rates playlist 0–10 | Wrong vibe — energetic songs for a quiet event |
| **acceptance_rate** | 25% | `validated / target` wildcards | DJ hallucinating songs Spotify can't find |
| **retrieval_relevance** | 15% | `(1 − mean_dist) × (spine_size / n_results)` | max_distance / margin set so tight the library contributes nothing |
| **size_fulfillment** | 15% | `final_size / target_size` | Configs that produce tiny but "high quality" playlists |

**Partial score** (Phase 1, no judge): `0.20×acceptance + 0.15×relevance + 0.15×size` — cheap enough to run 81 grid combos.  
**Full composite** (Phase 2, with judge): adds `0.45×alignment` — expensive, only runs once params are locked.

### Stub Validator

In eval, Spotify URI resolution is replaced by a deterministic hash-based stub that rejects ~30% of wildcards (matching observed production failure rate). This keeps `acceptance_rate` meaningful instead of a flat constant.

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
PROVIDER_FAILOVER_ENABLED=false
```

For automatic model failover, set `PROVIDER_FAILOVER_ENABLED=true` and configure the full
`gemini,nim,college` chain credentials (`GEMINI_API_KEY`, `NVIDIA_API_KEY`, and college model access).

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
