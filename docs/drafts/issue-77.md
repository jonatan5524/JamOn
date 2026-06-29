# 3. System Design

## 3.1. System Architecture

JamOn is designed as a three-tier distributed system comprising three distinct services: a React/Vite client, a NestJS orchestrator, and a FastAPI data engine. Each tier encapsulates a well-defined set of responsibilities and communicates exclusively through REST over HTTP. The client interacts solely with the orchestrator; it has no direct communication channel to the data engine. The orchestrator forwards enrichment and recommendation requests to the data engine and resolves the results back into Spotify-compatible playlist operations. This separation of concerns ensures that Spotify authentication and API integration remain isolated within the orchestrator, while all machine learning logic — embeddings, vector search, and LLM inference — is confined to the data engine.

*[INSERT DIAGRAM HERE — Figure 1: High-level three-tier system architecture (Client → Orchestrator → Data Engine)]*

### Client Service

The client is a single-page application built with React 18, Vite, TanStack Query, and Tailwind CSS. It provides the user interface through which participants authenticate via Spotify OAuth, create and join events using QR-code-based event codes, trigger playlist generation, and view per-participant contribution statistics. All API calls are directed to the orchestrator using Bearer token authorization. The client has no visibility into the internal operations of the data engine; from its perspective, the orchestrator is the sole backend.

### Orchestrator Service

The orchestrator is a NestJS TypeScript service running on port 3000. It acts as the central integration hub, coordinating between the Spotify Web API and the data engine. Its internal module structure comprises five domains:

- **auth**: Implements the Spotify OAuth 2.0 authorization code flow, issues JWT tokens, and exposes a library synchronization trigger. Because Spotify's development mode imposes a five-user whitelist cap per registered application, the auth flow incorporates multi-client routing: on login, the user's email is submitted to the orchestrator, which consults a `SpotifyApp` table (clientId, clientSecret, currentCount) via a `SpotifyClientRegistry` to determine which registered app has capacity. A fill-to-cap assignment strategy routes new users to the first application with fewer than five whitelisted users; once capacity is reached, subsequent users are assigned to the next application. The resolved `spotifyAppId` is persisted on the User record so that token-refresh flows always use the same application credentials.
- **spotify**: Wraps all Spotify API calls — top-track fetching (`GET /v1/me/top/tracks`), track URI search (`GET /v1/search`), playlist creation (`POST /v1/me/playlists`), and batch artist genre fetching.
- **event**: Manages the lifecycle of user events, including participant membership and QR-code joining.
- **playlist**: Orchestrates the five-step playlist generation flow (described below) and computes per-participant contribution statistics using cosine similarity between participant average vectors and each track vector.
- **data-engine**: An HTTP client module that issues `POST /recommend` requests to the Python service.

The playlist generation flow proceeds as follows: (1) verify that all event participants have synced Spotify libraries and that all liked songs carry vector embeddings — any participant without a synced library is automatically triggered to sync before proceeding; (2) call `POST /recommend` on the data engine with only the event ID — the data engine independently queries the shared database for the event description and the indexed songs of all event participants; (3) resolve each returned song to a Spotify track URI via parallel search calls; (4) embed any new AI-suggested wildcard tracks that are not yet in the vector store; (5) create the Spotify playlist and add all resolved tracks to the user's account. This pre-generation sync step, introduced to ensure that recommendations reflect the full and current event library, guarantees that no participant's songs are silently omitted from the retrieval pool.

### Data Engine Service

The data engine is a FastAPI Python service running on port 8000. It handles all data-intensive operations: song enrichment, LLM tagging, vector indexing, and the agentic retrieval-generation workflow. Its primary endpoint is `POST /recommend`, which accepts an event ID and independently queries the shared PostgreSQL database for the event's description and the indexed songs of all event participants, returning an ordered list of `{ title, artist, is_new }` objects. A secondary endpoint, `POST /lyrics/batch`, supports bulk lyrics retrieval. The data engine also holds an `ORCHESTRATOR_URL` environment variable, enabling it to call back to the orchestrator for Spotify URI validation in production deployments.

Internally, the service is organized into four layers:

- **Providers**: An abstraction layer (`LLMProviderContainer`) that exposes four typed protocol slots — `EmbeddingProvider`, `TaggingProvider`, `DJProvider`, and `HyDEProvider` — backed by pluggable implementations for Gemini, NVIDIA NIM, and a local College/Ollama stack. Each non-embedding slot is wrapped by a `FailoverProvider` that implements a circuit-breaker strategy across the chain Gemini → NIM → College. The circuit trips after N consecutive failures — defined as HTTP 5xx errors, timeouts, 429 quota exhaustion responses, or structurally malformed 2xx payloads — within a rolling time window, routing all subsequent requests directly to the next provider until a configurable cooldown period elapses. Quota exhaustion (429) and hard errors (5xx) are both failover triggers but are logged at different severity levels. Failover state is held in process memory; no external coordination store is required at the current deployment scale.
- **Services**: `enrichment.py` orchestrates concurrent Genius lyrics and Last.fm tag fetching; `rag.py` manages vector indexing and cosine-similarity retrieval against the vector store.
- **Workflows**: `playlist_generator.py` implements the LangGraph agentic graph (described in Section 3.3).
- **VectorDB**: A factory layer that instantiates either a ChromaDB in-memory collection (local development) or a pgvector-backed PostgreSQL store (production).

### REST API Contract

The primary inter-service REST contract is `POST /recommend`. Its request body carries only the event ID; the data engine resolves the event description and participant song libraries from the shared database autonomously:

    POST http://data-engine:8000/recommend
    Content-Type: application/json

    {
      "event_id": "42"
    }

The response is a JSON array of song objects, with the `is_new` flag discriminating between songs retrieved from the user's indexed library and AI-generated wildcard suggestions:

    [
      { "title": "Song Name",     "artist": "Artist Name",  "is_new": false },
      { "title": "Wildcard Song", "artist": "Other Artist", "is_new": true  }
    ]

The orchestrator's data-engine client module wraps this call and maps the response to internal DTOs before downstream processing.

### Indexing Pipeline

Upon receiving a batch of songs, the data engine concurrently fetches Genius lyrics and the top eight Last.fm community tags for each track via `asyncio.gather`. These signals are passed to the LLM tagging step. A Gemini Flash or NIM Llama-70b model generates structured JSON metadata comprising `energy_desc`, `mood_desc`, and `vibe_tags` fields, together with a composite `embedding_text` string that integrates all signals. This string is vectorized and stored in the vector database. If Genius lyrics are unavailable for a given track, the pipeline falls back gracefully to using the LLM-generated vibe tags alone for embedding, ensuring no song is silently dropped. This "text-ification" approach replaces the deprecated Spotify Audio Features API with semantically rich, human-readable descriptors [1].

*[INSERT DIAGRAM HERE — Figure 2: Indexing pipeline — EnrichedSong flow (Spotify genres → Genius lyrics → Last.fm tags → LLM tagging → embedding → vector store)]*

### Inference Pipeline

When a playlist generation request arrives, the data engine executes a seven-step retrieval-augmented generation workflow. The event description is first expanded by the HyDE provider [2] into a synthetic song description in order to bridge the semantic gap between short natural-language phrases and the richer embedding space of the indexed songs. The expanded query is used to retrieve the top candidate songs from the vector store, subject to a `max_distance` quality gate (production value: 0.80, calibrated by the eval harness). A relative margin filter then identifies a "strong spine" of closely matching songs, dynamic wildcard targets are computed from the remaining playlist slots, and the LangGraph DJ agent generates, validates, and — if necessary — retries wildcard suggestions before merging them with the spine songs in the final shuffled playlist. The design and parameter choices for this pipeline are detailed in Section 3.3.

*[INSERT DIAGRAM HERE — Figure 3: Inference pipeline — 7-step RAG flow (HyDE expansion → vector search → strong spine identification → dynamic wildcard target → LLM DJ generation → LangGraph validate/retry loop → merge and shuffle)]*

### Deployment Architecture

In production, all three services are orchestrated by a single Docker Compose file. The client container runs nginx on port 443, serving the React SPA over HTTPS and reverse-proxying API traffic to the orchestrator container. The orchestrator and data engine containers expose no external ports; they communicate exclusively over the internal Docker Compose network. PostgreSQL, which hosts the pgvector extension used for production vector storage, runs natively on the host machine and is accessed by both the orchestrator (for relational data) and the data engine (for vector queries) via the `host.docker.internal` hostname. This hybrid arrangement — containerized application services, host-native database — was adopted due to disk constraints on the deployment server, which made running a fully containerized Postgres impractical. In local development, a ChromaDB in-memory collection replaces pgvector, allowing developers to run the full system without a database server. The CI/CD pipeline that builds and deploys these containers is described in Section 3.5.
