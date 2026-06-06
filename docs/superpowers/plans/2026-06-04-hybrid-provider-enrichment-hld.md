# HLD: Hybrid Provider Mode, Song Enrichment Pipeline, and Wildcard Anchor Strategy

**Date:** 2026-06-04  
**Branch:** rag-flow-refactor  
**Status:** Design / Pre-implementation

---

## 1. Background and Motivation

The data-engine currently supports two provider modes (`gemini`, `college`). The
per-task provider work on this branch already introduced `EMBEDDING_PROVIDER`,
`TAGGING_PROVIDER`, and `DJ_PROVIDER` config knobs, but each task still maps to
a single concrete implementation. Three gaps remain:

1. **Quota ceiling on vibe tagging.** Gemini Flash has 5–15 RPM and 100–1000 RPD.
   A 250-song indexing event generates ~17 batched tagging calls, which hits the
   free tier daily ceiling within a single heavy session.

2. **Thin enrichment context.** The tagging prompt receives `title + artist +
   genres`. Songs with no lyrics and little Western genre coverage get weak tags,
   degrading retrieval quality for niche/non-English content.

3. **Wildcard knowledge gap.** The DJ model generates wildcard suggestions
   free-form. For groups whose taste sits in non-Western genres, the model
   defaults to mainstream Western equivalents when recalling from scratch.

---

## 2. Change 1 — Hybrid Provider Mode

### 2.1 Provider Assignment in Hybrid Mode

| Task | Provider | Model | Rationale |
|---|---|---|---|
| Embeddings | Gemini | text-embedding-004 (768-dim) | Vector space consistency with existing `songs_gemini_768` ChromaDB collection. Embedding quota is separate from generation quota and is not the bottleneck. |
| Vibe Tagging | NVIDIA NIM | meta/llama-3.3-70b-instruct | 40 RPM, no daily cap. 250-song event = ~17 batched calls, well within limits. Model receives enriched context, so recall depth for niche songs is irrelevant. |
| HyDE Query Expansion | NVIDIA NIM | meta/llama-3.3-70b-instruct | 1 call per playlist event. The HyDE output is then embedded via Gemini to maintain vector space consistency before ChromaDB query. |
| DJ Orchestration | College | gpt-oss-120b | 120B param model. 1 call per event so the 5 RPM limit is irrelevant. 10–30 s latency acceptable for playlist generation. |
| Wildcard Validation | College | llama3.1:8b | Simple binary accept/reject task. ~3–5 calls per event. Small fast model is sufficient. |

### 2.2 NIM Provider — OpenAI-Compatible Client

NVIDIA NIM exposes an OpenAI-compatible API at `https://integrate.api.nvidia.com/v1`.
The NIM concrete implementations for `TaggingProvider` and HyDE will use the
OpenAI SDK (already a transitive dependency via the college client) configured
with `base_url=NIM_BASE_URL` and `api_key=NVIDIA_API_KEY`. No new HTTP client
library is needed.

### 2.3 Where HyDE Lives — HyDEProvider vs DJProvider

**Recommendation: separate `HyDEProvider` protocol.**

HyDE is a retrieval pre-processing step (query expansion before ChromaDB lookup),
not a playlist curation step (which is DJ's responsibility). Attaching HyDE to
`DJProvider` would couple two orthogonally replaceable concerns. As a standalone
protocol, HyDE can be swapped independently (e.g., replaced with a different
expansion strategy or disabled entirely) without touching DJ orchestration.

```
HyDEProvider interface
  └── expand_query(event_description: str) -> str
        # returns a hypothetical meta-document (NOT a vector)
        # caller then passes the string to EmbeddingProvider.embed_document()
```

The HyDE output is a natural-language string. The embedding step is always
performed by the configured `EmbeddingProvider` — in hybrid mode, Gemini. This
ensures the query vector lives in the same 768-dim space as all stored song
documents.

### 2.4 ProviderFactory Changes

The factory's `create()` method currently accepts optional per-task overrides
that fall back to a global `LLM_PROVIDER`. The hybrid mode extends this:

- When `LLM_PROVIDER=hybrid`, the factory reads each task's explicit provider
  name from the per-task config (`EMBEDDING_PROVIDER`, `TAGGING_PROVIDER`,
  `DJ_PROVIDER`, `HYDE_PROVIDER`) which are pre-populated with the hybrid
  defaults shown in §2.1.
- Concrete instantiation follows the same registry pattern currently used for
  `gemini` / `college`. A new `nim` key is added, resolving to the NIM concrete
  classes.
- Validation at startup confirms that `NVIDIA_API_KEY` is present when any
  per-task provider resolves to `nim`.

### 2.5 LLMProviderContainer Extension

The `LLMProviderContainer` dataclass gains one new field:

```
hyde_provider: HyDEProvider
```

The container is constructed once at application startup and injected into the
services that need it, exactly as the other providers are today. No service
receives the raw factory; they receive typed fields from the container.

### 2.6 New Environment Variables for Change 1

| Variable | Description | Default |
|---|---|---|
| `NVIDIA_API_KEY` | Auth key for NIM API | — |
| `NIM_BASE_URL` | NIM endpoint | `https://integrate.api.nvidia.com/v1` |
| `NIM_TAGGING_MODEL` | Model name for tagging | `meta/llama-3.3-70b-instruct` |
| `NIM_HYDE_MODEL` | Model name for HyDE | `meta/llama-3.3-70b-instruct` |
| `HYDE_PROVIDER` | Which provider handles HyDE | `nim` (in hybrid mode) |

---

## 3. Change 2 — Song Enrichment Pipeline

### 3.1 Enrichment as a New Pipeline Stage

The indexing pipeline currently runs:

```
[NestJS sends song list]
        │
        ▼
[Python: lyrics scrape (Genius)]
        │
        ▼
[Python: LLM tagging batch]
        │
        ▼
[Python: embed + store in ChromaDB]
```

After this change it becomes:

```
[NestJS sends enriched song list (title, artist, spotify_genres)]
        │
        ▼
[Python: per-song cache check — is track_id already in ChromaDB?]
        │               │
  already indexed   not yet indexed
        │               │
      skip              ▼
              [Python: Enrichment Pipeline]
              ├── 1. Lyrics (Genius → Musixmatch fallback)
              ├── 2. Last.fm community tags (top 8)
              └── (spotify_genres already in payload)
                        │
                        ▼
              [Python: LLM tagging batch — receives enriched context]
                        │
                        ▼
              [Python: embed + store in ChromaDB]
```

The cache check moves to the top of the pipeline, before any external calls, to
avoid redundant enrichment for songs already indexed from a prior sync.

### 3.2 Enrichment Signals

#### 3.2.1 Lyrics (Priority 1)
- Primary: existing `lyricsgenius` integration (Genius API).
- Fallback: Musixmatch API (`api.musixmatch.com`). Better coverage for K-pop,
  Arabic, Latin, and regional music. Requires `MUSIXMATCH_API_KEY`.
- If both fail: `lyrics = null`. Downstream tagging prompt handles null gracefully
  by relying on tags and genres only. No crash.

#### 3.2.2 Last.fm Community Tags (Priority 2)
- Endpoint: `ws.audioscrobbler.com/2.0/?method=track.getTopTags&artist=…&track=…`
- Returns community-generated tags sorted by weight (e.g., "80s", "melancholic",
  "city pop", "female vocalist").
- Top 8 tags are taken. This is the primary useful signal for niche/non-English
  songs that have no lyrics.
- Requires `LASTFM_API_KEY`.
- Failure: `lastfm_tags = []`. Non-fatal.

#### 3.2.3 Spotify Artist Genres (Priority 3)
- Source: NestJS side, via the non-deprecated `/artists/{id}` Spotify endpoint.
- This data is sent by NestJS as part of the song payload (see §3.4). Python
  does not call Spotify.
- `spotify_genres` is already a field in the current song DTO per the CLAUDE.md
  architectural boundary.

### 3.3 Enrichment Result Object

Each song entering the tagging stage is represented as a structured enrichment
object (Pydantic model in the data-engine):

```
EnrichedSong
  ├── track_id: str
  ├── title: str
  ├── artist: str
  ├── spotify_genres: list[str]          # from NestJS payload
  ├── lastfm_tags: list[str]             # [] if unavailable
  ├── lyrics_snippet: str | None         # first ~200 words, or null
  └── lyrics_source: "genius" | "musixmatch" | None
```

The tagging prompt receives this object, not raw `title + artist`.

### 3.4 NestJS Song DTO Update

The `IngestBatchDto` in NestJS gains one new required field per song item:

```typescript
// Before
interface SongItem {
  title: string;
  artist: string;
  spotifyTrackId: string;
}

// After
interface SongItem {
  title: string;
  artist: string;
  spotifyTrackId: string;
  artistGenres: string[];   // fetched from /artists/{id} before sending to Python
}
```

NestJS fetches `artistGenres` from the Spotify `/artists/{id}` endpoint during
the indexing flow, before the HTTP call to the Python `/ingest-batch` endpoint.
No Python service calls Spotify.

### 3.5 Enrichment Caching

Enrichment results are not cached separately. The existing ChromaDB document
presence check (by `track_id`) serves as the cache gate. If a song's document
is found in ChromaDB, it was already enriched and tagged in a prior sync —
the entire enrichment + tagging + embedding pipeline is skipped for that song.

This is sufficient for the current use case. If partial re-tagging (e.g.,
re-tag with new context but same lyrics) becomes necessary in the future, a
separate metadata store can be introduced. Out of scope here.

### 3.6 New Environment Variables for Change 2

| Variable | Description |
|---|---|
| `LASTFM_API_KEY` | Last.fm API key for community tags |
| `MUSIXMATCH_API_KEY` | Musixmatch API key for lyrics fallback |

---

## 4. Change 3 — Wildcard Anchor Strategy in DJ Orchestration

### 4.1 The Problem

The DJ model generates wildcard song suggestions from a free-form vibe
description. For groups whose listening is concentrated in non-Western genres,
the model defaults to mainstream Western output because that is where its
training is densest. The wildcards are validated by the wildcard validator and
Spotify lookup, so hallucinations are caught — but the issue is not hallucination.
It is that the model never attempts to suggest something in the right niche
because it was never shown that niche.

### 4.2 The Fix — Anchoring to the Artist Space

The artist list across all participants' top 50 songs is already present in the
data collected during the pipeline run. No new API calls are needed. The fix is
to extract this list and pass it explicitly to the DJ prompt.

The model is then performing **similarity reasoning from shown anchors** rather
than **recalling from a niche genre from scratch**. This is a tractable task
for any model regardless of training breadth.

### 4.3 DJ Prompt Structure Change

**Before:**
```
You are a DJ. Create a 20-song playlist for: "{event_description}".
Prioritize songs from the user's library below.
You may also suggest new songs (wildcards) that fit the vibe.

Library songs:
{retrieved_songs}
```

**After:**
```
You are a DJ. Create a 20-song playlist for: "{event_description}".
Prioritize songs from the user's library below.
You may also suggest wildcard songs, but they MUST be by artists similar to,
or the same as, the artists in the group's listening history shown here:

Artist space (deduplicated from all participants' top songs):
{anchor_artist_list}

Library songs:
{retrieved_songs}
```

### 4.4 Anchor Artist List Derivation

The anchor artist list is built from the `artist` field across all songs that
were indexed for the current event's participants. This data is already present
in ChromaDB metadata — no extra fetch is needed. The list is deduplicated and
optionally truncated to a reasonable length (suggested: top 80 by frequency)
before being inserted into the prompt to avoid excessive token cost.

The RAG engine constructs this list as part of the existing retrieval step,
since it already queries ChromaDB for the user's songs. The set of unique
artists from the full result set (before the top-K cutoff) serves as the anchor.

---

## 5. End-to-End Call Flow (Playlist Generation)

```
User requests playlist ("Late night study", participants: A, B, C)
        │
        ▼
[NestJS: fetch top 50 tracks + artistGenres for each participant]
[NestJS: POST /recommend { event_description, user_ids }]
        │
        ▼
[Python: RAGEngine.recommend()]
        │
        ├── 1. HyDEProvider.expand_query(event_description)
        │         → NIM generates hypothetical song meta-document
        │
        ├── 2. EmbeddingProvider.embed_document(hyde_output)
        │         → Gemini text-embedding-004 → 768-dim vector
        │
        ├── 3. ChromaVectorStore.query(vector, top_k=30)
        │         → returns top 30 matching EnrichedSong metadata
        │
        ├── 4. Build anchor_artist_list
        │         → deduplicate artist field across all ChromaDB results
        │            (full result set, not just top 30)
        │
        ├── 5. DJProvider.generate_playlist(
        │         event_description,
        │         retrieved_songs,        ← top 30 with vibe tags
        │         anchor_artist_list      ← for wildcard anchoring
        │       )
        │         → College gpt-oss-120b
        │         → returns List[{ title, artist, is_new }]
        │
        ├── 6. For each is_new == true:
        │       WildcardValidator.validate(title, artist)
        │         → College llama3.1:8b binary accept/reject
        │
        └── 7. Return final playlist list to NestJS
                │
                ▼
        [NestJS: resolve Spotify URIs for wildcards + library songs]
        [NestJS: create Spotify playlist]
```

---

## 6. End-to-End Call Flow (Indexing — 250-Song Event)

```
[NestJS: fetch top 50 tracks per participant, fetch artistGenres]
[NestJS: POST /ingest-batch { songs: [...250 SongItem with artistGenres] }]
        │
        ▼
[Python: for each song, check ChromaDB for track_id]
        │
        ├── Already indexed → skip
        │
        └── Not indexed → Enrichment Pipeline (parallel per song)
              ├── Genius lyrics scrape
              │     └── (fail) → Musixmatch fallback
              ├── Last.fm getTopTags (top 8)
              └── spotify_genres already in payload
                        │
                        ▼
              [Batch songs into groups of 15]
              [For each batch: NIM TaggingProvider.tag_songs(batch)]
                        │   ~17 NIM calls @ 40 RPM — no daily cap
                        ▼
              [Collect all EnrichedSong + tags]
              [EmbeddingProvider.embed_documents(all_texts)]
                        │   1 batched Gemini call
                        ▼
              [ChromaVectorStore.add_songs(songs_with_embeddings)]
```

---

## 7. Summary of All New Environment Variables

| Variable | Change | Required When | Default |
|---|---|---|---|
| `NVIDIA_API_KEY` | 1 | `LLM_PROVIDER=hybrid` or any `*_PROVIDER=nim` | — |
| `NIM_BASE_URL` | 1 | `NVIDIA_API_KEY` set | `https://integrate.api.nvidia.com/v1` |
| `NIM_TAGGING_MODEL` | 1 | NIM tagging in use | `meta/llama-3.3-70b-instruct` |
| `NIM_HYDE_MODEL` | 1 | NIM HyDE in use | `meta/llama-3.3-70b-instruct` |
| `HYDE_PROVIDER` | 1 | Always | `nim` |
| `LASTFM_API_KEY` | 2 | Always (enrichment enabled) | — |
| `MUSIXMATCH_API_KEY` | 2 | Optional (lyrics fallback) | — |

---

## 8. Open Questions / Not in Scope

- **Musixmatch rate limits**: The free tier is heavily restricted (~2000 calls/day).
  If indexing volume grows, a quota-aware fallback or caching at the raw lyrics
  level may be needed. Out of scope for this plan.
- **Anchor artist list size cap**: 80 artists suggested as default. The correct
  number depends on token budget experiments against the DJ model. TBD.
- **HyDE quality**: The quality of HyDE-expanded queries has not been empirically
  evaluated. A simple A/B comparison (with vs. without HyDE) should be run after
  implementation to confirm it improves retrieval relevance.
- **Re-tagging on enrichment updates**: If a song's Last.fm tags or lyrics become
  available after a prior null-enrichment run, the cache check will skip the song
  and the tags will not improve. A forced re-index flag is not designed here.
