## 3.2 Data Collection and Preprocessing

The indexing pipeline transforms raw Spotify track metadata into semantic vector representations suitable for cosine-similarity retrieval. Library metadata is collected at user login; embeddings are created on demand at playlist generation time, guided by an event identifier. The pipeline proceeds in five stages: Spotify track fetch, concurrent enrichment, LLM-based vibe tagging, embedding text construction, and vector storage.

### Stage 1 — Spotify Track Fetch and Library Sync

When a user authenticates, `triggerLibrarySync()` is invoked (at most once per week, gated by `lastUpdatedSongs`). It fetches the user's top 50 tracks via `GET /v1/me/top/tracks`, upserts the song records to the PostgreSQL database, and immediately identifies any tracks that do not yet have a vector embedding. Those songs are sent to `POST /ingest-batch`, enriched and embedded, and the resulting vectors are written back to the database via `updateEmbeddings()`. The library is therefore fully indexed by the time the user joins an event.

At playlist generation time, two guard checks run before the data engine is contacted. `findParticipantsWithoutLikes(eventId)` detects participants whose library has never been synced and calls `triggerLibrarySync()` for each. `findUnembeddedSongsForEvent(eventId)` then catches any songs still missing embeddings and forwards only that delta to `POST /ingest-batch`.

### Stage 2 — Concurrent Enrichment

The data engine receives the list of unembedded songs (title and artist name, sourced from the database via the event identifier) and enriches every song concurrently. The endpoint dispatches one `enrich_song()` call per track using `asyncio.gather` with thread offloading (`asyncio.to_thread`), so all songs in the batch are processed in parallel. For each individual song, the enrichment function sequentially performs two external lookups:

1. **Genius lyrics** — Queries the Genius Search API, fetches and HTML-parses the song page, and cleans the raw text into a plain lyrics string capped at 800 characters.

2. **Last.fm community tags** — Calls `track.getTopTags` and retains the top 8 community-generated tags (e.g., "indie pop", "melancholic", "2010s"), supplying genre and cultural context that lyrics alone cannot provide.

*[INSERT DIAGRAM HERE — figure-enrichment-pipeline.drawio — replace "Figure N" with the correct figure number once Ch.3.1 figures are finalised]*

### Stage 3 — LLM Vibe Tagging

All enriched songs are forwarded as a single batch to the configured tagging provider (Gemini 1.5 Flash by default). The prompt instructs the model to estimate seven Spotify Audio Feature dimensions — valence, energy, danceability, tempo, acousticness, instrumentalness, and liveness — plus a lyrical-mood analysis, using Last.fm tags and the lyrics snippet as grounding signals. Where signals are absent, the model infers from artist and genre knowledge.

The model returns a JSON array, one object per song, containing:

- `vibe_tags` — a list of descriptive labels (e.g., "high-energy", "driving", "electronic")
- `lyric_mood_tags` — two to three short mood labels distilled from the lyrics feel (e.g., "defiant", "triumphant")
- `embedding_text` — a one-to-two sentence prose string engineered to maximise vibe contrast between songs

### Stage 4 — Embedding Text Construction and Vectorisation

The `build_embedding_text()` function uses the tagger's `embedding_text` directly when present; if absent, it assembles a fallback from the individual descriptor fields. An illustrative example of a tagger-generated `embedding_text` is shown below:

    "Frantic, high-energy and aggressive, with a defiant, triumphant mood.
     Fast-paced and driving, built for hype rather than dancing.
     Hard-hitting electronic hip-hop with dense, forceful vocals."

All embedding texts are submitted in a single `embed_documents()` call. Gemini produces 3072-dimensional vectors; the College (all-MiniLM) provider produces 384-dimensional vectors. Lyrics are not embedded directly — their feel is distilled into `lyric_mood_tags` and folded into `embedding_text`, preventing raw lyrical vocabulary from dominating cosine similarity scores.

### Stage 5 — Storage

The data engine returns `IngestedSong` objects (name, artist, float vector) to the orchestrator, which writes the embeddings to PostgreSQL via `updateEmbeddings()`. In production the pgvector extension handles vector storage; for local development the data engine uses an ephemeral in-memory ChromaDB collection. The collection is named `songs_{provider_id}_{dims}` (e.g., `songs_gemini_3072`); a dimension mismatch raises a `CollectionMismatchError` before any record is written. Lyrics are not cached between ingest calls. If Genius is unavailable, `lyrics_snippet` remains `None` and the embedding proceeds on vibe tags alone with no service interruption.
