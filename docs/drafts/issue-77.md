# 3. System Design

## 3.1. System Architecture

JamOn is designed as a three-tier distributed system comprising three distinct services: a React/Vite client, a NestJS orchestrator, and a FastAPI data engine. Each tier encapsulates a well-defined set of responsibilities and communicates exclusively through REST over HTTP. The client interacts solely with the orchestrator; it has no direct communication channel to the data engine. The orchestrator forwards enrichment and recommendation requests to the data engine and resolves the results back into Spotify-compatible playlist operations. This separation of concerns ensures that Spotify authentication and API integration remain isolated within the orchestrator, while all machine learning logic — embeddings, vector search, and LLM inference — is confined to the data engine.

*[INSERT DIAGRAM HERE — Figure 1: High-level three-tier system architecture (Client → Orchestrator → Data Engine)]*

### Client Service

The client is a single-page application built with React 18, Vite, TanStack Query, and Tailwind CSS. It provides the user interface through which participants authenticate via Spotify OAuth, create and join events using QR-code-based event codes, trigger playlist generation, and view per-participant contribution statistics. All API calls are directed to the orchestrator using Bearer token authorization. The client has no visibility into the internal operations of the data engine; from its perspective, the orchestrator is the sole backend.

### Orchestrator Service

The orchestrator is a NestJS TypeScript service running on port 3000. It acts as the central integration hub, coordinating between the Spotify Web API and the data engine. Its internal module structure comprises five domains:

- **auth**: Implements the Spotify OAuth 2.0 authorization code flow, issues JWT tokens, and exposes a library synchronization trigger.
- **spotify**: Wraps all Spotify API calls — top-track fetching (`GET /v1/me/top/tracks`), track URI search (`GET /v1/search`), playlist creation (`POST /v1/me/playlists`), and batch artist genre fetching.
- **event**: Manages the lifecycle of user events, including participant membership and QR-code joining.
- **playlist**: Orchestrates the five-step playlist generation flow (described below) and computes per-participant contribution statistics using cosine similarity between participant average vectors and each track vector.
- **data-engine**: An HTTP client module that issues `POST /recommend` requests to the Python service.

The playlist module orchestrates a multi-step generation flow that coordinates library synchronization, data engine calls, Spotify URI resolution, and playlist creation; the full implementation is described in Section 3.3.

### Data Engine Service

The data engine is a FastAPI Python service running on port 8000. It handles all data-intensive operations: song enrichment, LLM tagging, vector indexing, and the agentic retrieval-generation workflow. Its primary endpoint is `POST /recommend`, which accepts an event ID and independently queries the shared PostgreSQL database for the event's description and the indexed songs of all event participants, returning an ordered list of `{ title, artist, is_new }` objects. A secondary endpoint, `POST /lyrics/batch`, supports bulk lyrics retrieval. The data engine also holds an `ORCHESTRATOR_URL` environment variable, enabling it to call back to the orchestrator for Spotify URI validation in production deployments.

Internally, the service is organized into four layers:

- **Providers**: An abstraction layer that supports pluggable LLM backends (Gemini, NVIDIA NIM, and a local College/Ollama stack), including automatic failover between providers. The provider abstraction and failover strategy are described in detail in Section 3.3.
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
