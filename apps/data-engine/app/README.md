# JamOn RAG POC

This is a Proof of Concept for the JamOn RAG-based music recommendation engine.
It demonstrates the "Text-ification" RAG approach using Gemini 1.5 Flash and ChromaDB.

## Prerequisites

- Python 3.10+
- A Google Gemini API Key
- Optional: a Genius API access token for lyrics lookup

## Setup

1. Navigate to the POC directory:
   ```bash
   cd apps/data-engine/app
   ```

2. Create a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Set up your API Key:
   Create a `.env` file in this directory (`apps/data-engine/app/.env`) and add your keys:
   ```
   GEMINI_API_KEY=your_actual_api_key_here
   GENIUS_ACCESS_TOKEN=your_actual_genius_token_here
   ```

## Running the POC

Run the main script:
```bash
python main.py
```

## Running the FastAPI Server (main.py)

`main.py` exposes a REST API for the data engine (used by the NestJS orchestrator).

1. Make sure your `.env` file is in place with `GEMINI_API_KEY` set (see Setup above).

2. Optional: set `GENIUS_ACCESS_TOKEN` if you want lyrics from Genius.

3. Start the server from the `apps/data-engine` directory (one level up) to ensure module imports work:
   ```bash
   cd JamOn/apps/data-engine
   uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```

4. The API will be available at `http://127.0.0.1:8000`.
   Open `http://127.0.0.1:8000/docs` for the interactive Swagger UI.

### Available Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/recommend` | Generate a playlist recommendation for an event description |
| `POST` | `/lyrics/batch` | Fetch Genius lyrics for a batch of songs |

**Example `/recommend` request:**
```json
{
  "event_description": "A chill late night coding session",
  "songs": [
    { "title": "Blinding Lights", "artist": "The Weeknd" },
    { "title": "Levitating", "artist": "Dua Lipa" }
  ]
}
```

## How it Works

1. **Mock Data**: Loads 20 sample songs.
2. **Lyrics Fetching**: Tries to fetch lyrics directly from Genius in the Python data-engine. If Genius is unavailable, not configured, or a song has no lyrics result, the POC continues with an empty lyrics string for that track.
3. **Audio Feature Extraction**: Sends the songs to `gemini-1.5-flash` to generate descriptive tags (Energy, Mood, Vibe) instead of raw numbers.
4. **Vectorization**: Combines the generated tags and lyrics snippets into a single text block and embeds it using `gemini-embedding-2-preview`.
5. **Indexing**: Stores the embeddings and metadata in a local ChromaDB instance.
6. **Retrieval**: Queries the database with a mock event description ("A chill late night coding session...") to find the most semantically relevant songs.
7. **Playlist Generation**: Sends the retrieved context songs and the event description to `gemini-1.5-flash` to generate a curated playlist, potentially adding new suggestions.

## RAG Flow Architecture

The "Text-ification" RAG approach used in JamOn moves away from raw audio numbers and relies on semantic descriptions that LLMs can reason about.

### 1. Indexing (The "Text-ification" Pipeline)
*Triggered during library sync.*

- **Data Enrichment**: For each song, the system uses **Gemini 1.5 Flash** to "hallucinate" descriptive metadata (Energy, Mood, Vibe Tags) based on its title, artist, and genres.
- **Lyrics Retrieval**: The engine fetches lyrics snippets via the **Genius API** to provide deep semantic context.
- **Semantic Concatenation**: It constructs a rich text document for each song:
  ```text
  Title: Blinding Lights | Artist: The Weeknd
  Energy: High, driving, synth-heavy
  Mood: Nostalgic but energetic, late-night driving vibe
  Tags: 80s Synthwave, Dark Pop, Fast Tempo
  Lyrics: "I've been on my own for long enough..."
  ```
- **Vectorization**: This text is embedded using `text-embedding-004` (or `gemini-embedding-2-preview`) and stored in a local **ChromaDB** instance.

### 2. Retrieval (HyDE + Vector Search)
*Triggered during playlist generation.*

- **Query Expansion (HyDE)**: To improve retrieval, the system uses **Hypothetical Document Embeddings (HyDE)**. It asks Gemini to describe what a *perfect* song for the user's event (e.g., "A rainy day in Seattle") would sound like.
- **Vector Search**: The hypothetical description is embedded and used to query ChromaDB for the Top 15-20 most semantically similar tracks from the user's library.
- **Threshold Filtering**: Songs are filtered by distance to ensure the retrieved context is actually relevant to the request.

### 3. Generation (Agentic LangGraph Workflow)
*The "DJ" Brain.*

The final playlist is generated using a **LangGraph**-based agentic workflow:
1. **Initial Fetch**: Retrieves matching songs from the database.
2. **Wildcard Generation**: Asks Gemini to suggest **5 NEW songs** (not in the user's library) that bridge the gaps between the retrieved tracks.
3. **Validation Loop**: The agent checks if the new suggestions are valid (via Spotify Search). 
   - If a song is invalid, it is added to a "Rejected" list and the agent **regenerates** it (up to 3 attempts).
4. **Final Shuffle**: Combines the library matches and validated wildcards into a cohesive, shuffled playlist.

## Resilience & Stability

To handle AI model limits and potential outages gracefully, this service implements a **Multi-Layer Resilience Strategy**.

### 1. Smart Retries (Tenacity)
All LLM calls in `llm_service.py` are wrapped with `tenacity` retry decorators.
- **Exponential Backoff:** If a request fails due to a rate limit (429) or server error (5xx), the system waits (2s, 4s, 8s...) before retrying.
- **Jitter:** Randomness is added to the wait time to prevent "thundering herd" issues where many clients retry at the exact same moment.

### 2. Circuit Breaker Pattern
The `CircuitBreaker` class in `llm_service.py` acts as a safety switch for the Gemini API. It is implemented as a thread-safe singleton.

#### **How it works:**
- **CLOSED (Normal):** Requests pass through to the Gemini API. Successes reset the failure counter.
- **OPEN (Tripped):** If **3 consecutive failures** occur (after retries), the circuit "trips". For the next **60 seconds**, all calls to the AI fail **immediately** with an `AIServiceUnavailableError`. This prevents wasting resources and protects the API from further overload.
- **HALF-OPEN (Recovery):** After the 60-second timeout, the circuit allows **one trial request**.
    - If it **succeeds**, the circuit resets to **CLOSED**.
    - If it **fails**, the circuit returns to **OPEN** and the timer resets.

#### **Why we use it:**
1. **Resource Protection:** Prevents our server from hanging on long timeouts when we know the API is down.
2. **User Experience:** Provides an instant "Service Busy" response instead of making the user wait 30+ seconds for a series of failures.
3. **API Etiquette:** Respects the upstream provider (Google) by stopping requests when we are being rate-limited.

### 3. Error Mapping
Technical errors are mapped to standard HTTP status codes in `server.py`:
- **429:** Rate Limit Exceeded (Google API limit).
- **503:** Service Unavailable (Circuit is OPEN or Gemini Server Error).

The NestJS orchestrator catches these and displays a friendly message to the user.
