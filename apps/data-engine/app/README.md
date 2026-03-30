# JamOn RAG POC

This is a Proof of Concept for the JamOn RAG-based music recommendation engine.
It demonstrates the "Text-ification" RAG approach using Gemini 1.5 Flash and ChromaDB.

## Prerequisites

- Python 3.10+
- A Google Gemini API Key

## Setup

1. Navigate to the POC directory:
   ```bash
   cd apps/data-engine/poc
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
   Create a `.env` file in this directory (`apps/data-engine/app/.env`) and add your key:
   ```
   GEMINI_API_KEY=your_actual_api_key_here
   ```

## Running the POC

Optional: start the Node lyrics server first if you want real lyrics from Genius.

```bash
cd apps/lyrics-server
npm start
```

Then set the Python app to use it:

```bash
export LYRICS_SERVICE_URL=http://localhost:3001
```

Run the main script:
```bash
python main.py
```

## How it Works

1. **Mock Data**: Loads 20 sample songs.
2. **Lyrics Fetching**: Tries to fetch lyrics from the local Node Genius server. If the service is unavailable or a song has no lyrics result, the POC continues with an empty lyrics string for that track.
3. **Audio Feature Extraction**: Sends the songs to `gemini-1.5-flash` to generate descriptive tags (Energy, Mood, Vibe) instead of raw numbers.
4. **Vectorization**: Combines the generated tags and lyrics snippets into a single text block and embeds it using `gemini-embedding-2-preview`.
5. **Indexing**: Stores the embeddings and metadata in a local ChromaDB instance.
6. **Retrieval**: Queries the database with a mock event description ("A chill late night coding session...") to find the most semantically relevant songs.
7. **Playlist Generation**: Sends the retrieved context songs and the event description to `gemini-1.5-flash` to generate a curated playlist, potentially adding new suggestions.
