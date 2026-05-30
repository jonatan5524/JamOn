# Provider Abstraction Design — JamOn Data Engine

**Date:** 2026-05-29  
**Branch:** rag-flow-refactor  
**Scope:** `apps/data-engine/`

---

## Problem

The data-engine is tightly coupled to Google Gemini and ChromaDB. All four LLM functions in `services/llm.py` call the Gemini SDK directly. `RagEngine` instantiates `chromadb.Client()` inline with a hardcoded collection name (`"songs_collection"`). There is no abstraction layer, no provider selection, and no protection against embedding dimension mismatches when switching models.

---

## Goals

1. Swap LLM providers (Gemini ↔ College/Ollama) via a single config change.
2. Swap vector DB backends (ChromaDB → pgvector) via a single config change.
3. Prevent dimension mismatch bugs when provider changes — vectors embedded by one model must never be queried by another.
4. Keep service code (RagEngine, endpoints, workflow) oblivious to provider details.

---

## Approach: Two Independent Factories, Joined in Lifespan

Two separate factory systems — one for LLM providers, one for the vector store — are created during the FastAPI `lifespan` context manager and stored in `app.state.providers`. They are independent: any LLM provider can be paired with any vector DB backend. The only connection between them is a narrow `EmbeddingConfig` dataclass passed from the LLM factory to the vector store factory at startup.

---

## Folder Structure

```
apps/data-engine/app/
├── providers/
│   ├── protocols.py              # EmbeddingProvider, TaggingProvider, DJProvider, VectorStore
│   ├── containers.py             # LLMProviderContainer, AppContainer, EmbeddingConfig
│   ├── llm/
│   │   ├── factory.py            # LLMProviderFactory — reads config.LLM_PROVIDER
│   │   ├── gemini/
│   │   │   ├── embedding.py      # GeminiEmbeddingProvider
│   │   │   ├── tagging.py        # GeminiTaggingProvider
│   │   │   └── dj.py             # GeminiDJProvider
│   │   └── college/
│   │       ├── embedding.py      # CollegeEmbeddingProvider (Ollama)
│   │       ├── tagging.py        # CollegeTaggingProvider (llama3.1:8b, batch 7)
│   │       └── dj.py             # CollegeDJProvider (gemma3:12b)
│   └── vectordb/
│       ├── factory.py            # VectorStoreFactory — reads config.VECTOR_DB_PROVIDER
│       ├── chroma.py             # ChromaVectorStore
│       └── pgvector.py           # PgVectorStore (stub — raises NotImplementedError on all methods,
│                                 #   exists only to verify factory wiring before the migration)
├── services/
│   ├── rag.py                    # RagEngine — receives VectorStore + EmbeddingProvider
│   ├── lyrics.py                 # unchanged
│   └── validator.py              # unchanged
├── core/
│   └── config.py                 # adds LLM_PROVIDER, VECTOR_DB_PROVIDER settings
└── main.py                       # lifespan wires AppContainer into app.state
```

---

## Protocols

Defined in `providers/protocols.py` using `typing.Protocol` (structural subtyping — no inheritance required).

### EmbeddingProvider
```
provider_id: str                        # "gemini" | "college" — identity only
embed_document(text: str) → List[float]
embed_query(text: str) → List[float]
```
`embedding_dims` is **not** on the protocol. It is an internal implementation detail, surfaced only via `EmbeddingConfig` at factory construction time.

### TaggingProvider
```
tag_songs(songs: List[dict]) → List[dict]
# Adds energy_desc, mood_desc, vibe_tags to each song dict.
# College implementation batches 7 songs per call (rate limit: 5 req/min on /api/generate).
```

### DJProvider
```
generate_playlist(event_description: str, context_songs: List[dict], count: int, rejected: List[str]) → List[dict]
expand_query_hyde(event_description: str) → str
```

### VectorStore
```
collection_name: str                    # read-only, set at construction — e.g. "songs_gemini_768"
add_songs(songs_with_features: List[dict], lyrics_map: dict, embedder: EmbeddingProvider) → None
query_songs(event_description: str, embedder: EmbeddingProvider, n_results: int, max_distance: float) → List[dict]
song_exists(track_id: str) → bool       # checks within current collection only
                                        # ephemeral stores implement as: return False (always re-embed)
                                        # persistent stores implement as: metadata lookup by track_id
```

`VectorStore` methods receive the `EmbeddingProvider` at call time. The store is stateless with respect to the provider — it delegates all embedding calls to the injected embedder. This means swapping the vector backend does not require changing embedding logic.

---

## Containers & Config Dataclasses

Defined in `providers/containers.py`.

### EmbeddingConfig
Internal dataclass — only travels between factories at startup. Never stored in `app.state` or passed to service code.
```
provider_id: str    # "gemini" | "college"
dims: int           # 768 | 384
```

### LLMProviderContainer
```
embedding: EmbeddingProvider
tagging: TaggingProvider
dj: DJProvider
```

### AppContainer
Stored on `app.state.providers` after lifespan startup.
```
llm: LLMProviderContainer
vector_store: VectorStore
```

---

## Configuration

`apps/data-engine/app/core/config.py` gains two new settings (not `.env` — these are architectural choices, not secrets):

```python
LLM_PROVIDER: str = "gemini"       # "gemini" | "college"
VECTOR_DB_PROVIDER: str = "chroma" # "chroma" | "pgvector"
```

---

## Startup Data Flow (Lifespan)

```
1. config.LLM_PROVIDER="gemini", config.VECTOR_DB_PROVIDER="chroma"

2. LLMProviderFactory.create("gemini")
   → LLMProviderContainer(
       embedding=GeminiEmbeddingProvider(),
       tagging=GeminiTaggingProvider(),
       dj=GeminiDJProvider()
     )
   → EmbeddingConfig(provider_id="gemini", dims=768)

3. VectorStoreFactory.create("chroma", embedding_config)
   → ChromaVectorStore(collection_name="songs_gemini_768")

4. app.state.providers = AppContainer(llm=container, vector_store=store)
```

Switching providers requires only changing `config.py` — no service code changes.

---

## Request Data Flow (/recommend)

```
1. Endpoint: providers = request.app.state.providers

2. RagEngine(vector_store=providers.vector_store,
             embedder=providers.llm.embedding)
   constructed per-request (ephemeral — current lifecycle, unchanged for now)

3. rag.add_songs(songs_with_features, lyrics_map)
   → calls embedder.embed_document(text) per song
   → stores vector + metadata in collection "songs_gemini_768"
   Metadata stored per vector: { track_id, title, artist, vibe_tags,
                                  embedding_provider_id, embedding_dims }

4. PlaylistGraphBuilder receives injected callables:
   - db_fetcher    → rag.query_songs (calls embedder.embed_query internally)
   - llm_generator → providers.llm.dj.generate_playlist
   - uri_validator → validate_spotify_uri_via_nestjs (unchanged)

5. Graph: initial_fetch → validate → regenerate (loop) → merge_and_shuffle
```

---

## Dimension Safety: Two-Layer Guard

Vectors embedded by one model must never be queried by another (dimensions differ: 768 vs 384).

**Layer 1 — Collection isolation (active now):**  
Collection names are provider-scoped (`songs_gemini_768` vs `songs_college_384`). A query against the active collection cannot touch vectors from a different provider — the names are different by construction.

**Layer 2 — Per-vector metadata (active now, used for future smart caching):**  
Every stored vector includes `embedding_provider_id` and `embedding_dims` in its metadata. In the future, when persistent indexing replaces the ephemeral model, `song_exists(track_id)` will check both track presence AND dimension match before deciding whether to re-embed.

**Future re-embedding flow (not in scope now):**
```
if not vector_store.song_exists(track_id):
    embed and store         # new song
elif stored_metadata["embedding_dims"] != collection_dims:
    re-embed and update     # provider changed since last index, stale vector
    # collection_dims is derived from the collection_name suffix — no dims property needed on embedder
else:
    skip                    # already correct for active provider
```

---

## Error Handling

| Failure | Where detected | Exception raised |
|---|---|---|
| Unknown `LLM_PROVIDER` or `VECTOR_DB_PROVIDER` value | Factory, during lifespan | `ConfigurationError` — app exits before accepting traffic |
| Embedding SDK failure | `EmbeddingProvider` implementation | `EmbeddingError` — wrapped by existing `with_resilience` |
| Tagging SDK failure | `TaggingProvider` implementation | `TaggingError` — wrapped by existing `with_resilience` |
| Playlist generation failure | `DJProvider` implementation | `GenerationError` — wrapped by existing `with_resilience` |
| Query dimension mismatch | `VectorStore` implementation | `CollectionMismatchError` — last-resort guard, should not fire in normal operation |

**Out of scope:** Automatic provider fallback (e.g., College down → Gemini). The circuit breaker in `core/resilience.py` handles transient failures; provider failover is an operational concern.

---

## Provider Implementation Notes

### College Stack (Ollama at `llm.cs.colman.ac.il`, Basic Auth)
- `CollegeEmbeddingProvider`: `all-minilm:latest` via `/api/embeddings` (rate limit: 20 req/min, dims=384)
- `CollegeTaggingProvider`: `llama3.1:8b` via `/api/generate` with `format:"json"` (rate limit: 5 req/min, **batch 7 songs per call**)
- `CollegeDJProvider`: `gemma3:12b` via `/v1/chat/completions`

### Gemini Stack
- `GeminiEmbeddingProvider`: `gemini-embedding-2-preview` (dims=768)
- `GeminiTaggingProvider`: `gemini-2.5-flash`
- `GeminiDJProvider`: `gemini-2.5-flash`

---

## What This Design Does Not Change

- NestJS owns all Spotify API calls. Python never calls Spotify.
- `lyrics.py` and `validator.py` are untouched.
- `PlaylistGraphBuilder` already uses callable injection — its interface is unchanged.
- The `with_resilience` circuit breaker in `core/resilience.py` is unchanged.
- The ephemeral per-request `RagEngine` lifecycle is preserved for now.
