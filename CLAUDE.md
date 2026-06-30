# Project Context & AI Instructions

## 1. Project Overview
**System:** Personalized Music Recommendation Engine (RAG-based).
**Goal:** Generate event-specific Spotify playlists by analyzing a user's library and "hallucinating" missing metadata to match against semantic event descriptions.
**Core Concept:** "Text-ification" RAG. We do NOT use raw numbers. We use LLMs to translate songs into descriptive text tags (e.g., "High Energy, Sad") which are embedded alongside lyrics for semantic search.

---

## 2. Tech Stack & Architecture
**Monorepo Structure:**
* **Manager (`/apps/orchestrator`):** NestJS (TypeScript). Handles User, Auth, Spotify API calls, and Final Playlist Resolution.
* **Worker (`/apps/data-engine`):** Python (FastAPI). Handles Data Science, Scraping, LLM Tagging, and Vector Logic.

**Infrastructure:**
* **Docker:** Orchestrates both services + Vector DB (Postgres/pgvector or Pinecone).
* **Communication:** REST (Internal HTTP calls from NestJS to Python).

---

## 3. Data Pipelines (The "Business Logic")

### A. The Indexing Pipeline (Data Ingestion)
*Triggered when a user syncs their library. Replaces deprecated Spotify Audio Features.*

1.  **NestJS:** Fetches User's Top 50 Tracks + **Artist Genres** (via Spotify API).
2.  **NestJS:** Pushes track metadata (Title, Artist, Genres) to Python.
3.  **Python:**
    * **Scrapes Lyrics:** Uses `lyricsgenius` to get text.
    * **LLM Tagging (The "Vibe" Engine):** Sends the list of songs to **Gemini 1.5 Flash**.
        * *Prompt:* "Estimate the energy, valence, and descriptive tags for these songs based on artist style/genre."
        * *Output:* JSON with `energy_desc`, `mood_desc`, and `vibe_tags`.
    * **Embedding:** Combines `LLM Tags + Lyrics Snippet` into a single string.
    * **Storage:** Saves Vector + Metadata to Vector DB.

### B. The Inference Pipeline (Creative Playlist Generation)
*Triggered when a user requests a playlist.*

1.  **Retrieval (Python):**
    * Embed User's Event Description (e.g., "Late night study").
    * Query Vector DB for the **Top 30** semantic matches from the user's library.
2.  **Generation (Python + LLM):**
    * **Context Construction:** Pass the metadata (Artist, Title, Vibe Tags) of the Top 30 retrieved songs to **Gemini 1.5 Flash**.
    * **Prompt Instruction:** "Act as a DJ. Create a 20-song playlist. Prioritize the user's library (context), but you may **ADD NEW songs** if they fit the vibe perfectly."
    * **Output:** JSON list of `{ title, artist, is_new_suggestion }`.
3.  **Resolution (NestJS):**
    * Receives the list.
    * **Resolver:** If `is_new_suggestion == true`, calls Spotify Search API to get the URI.
    * **Execution:** Creates the final Spotify Playlist.

---

## 4. API Contracts (Python Service)
The Python service (`data-engine`) is internal and exposes:

* `POST /ingest-batch`: Input: `List[{ title, artist, genres }]`. Output: `status: ok` (Triggers background scraping/tagging).
* `POST /recommend`: Input: `{ event_id: str }`. Output: `List[{ title, artist, is_new }]`.
* `POST /lyrics/batch`: (Helper) Bulk lyrics retrieval.

---

## 5. Coding Guidelines for AI
1.  **Strict Separation:** NestJS handles **Users/Auth/Spotify URIs**. Python handles **LLM/Vectors/Scraping**.
2.  **No Spotify Audio Features:** Do not write code that calls `v1/audio-features`. It is deprecated. Use the LLM Tagging approach instead.
3.  **Type Safety:** Use DTOs in NestJS and Pydantic models in Python for all API payloads.
4.  **Error Handling:** If Genius lyrics are missing, fallback to using *only* the LLM-generated vibe tags for the embedding. Do not crash.

---

## 6. LLM Cost Optimization
1.  **Model Selection:** Always use **`gemini-1.5-flash`** or `gpt-4o-mini` for Tagging and Generation tasks.
2.  **Context Efficiency:** In the Inference Pipeline, do **NOT** pass the full lyrics to the LLM. Only pass the `track_name`, `artist`, and `vibe_tags` of the retrieved songs. The Vector DB already handled the deep semantic matching.

---

## 7. Folder Structure Reference
```text
/
├── apps/
│   ├── orchestrator/ (NestJS)
│   │   ├── src/modules/spotify/ (External API calls)
│   │   ├── src/modules/data-engine/ (Data-engine client)
│   │   └── src/modules/playlist/ (Playlist orchestration)
│   └── data-engine/ (Python)
│       ├── app/services/scraper.py
│       ├── app/services/llm_tagger.py (Gemini integration)
│       └── app/services/rag_engine.py
├── docker-compose.yml
└── COPILOT_INSTRUCTIONS.md

**do not do any git operations on your own**

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
