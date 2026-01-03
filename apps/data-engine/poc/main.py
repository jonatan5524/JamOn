import os
import sys
import json
from dotenv import load_dotenv

# Add current directory to sys.path to import local modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from data.mock_data import MOCK_SONGS, MOCK_LYRICS
import llm_service
from rag_engine import RagEngine

def main():
    # Load environment variables
    load_dotenv()
    
    if not os.environ.get("GEMINI_API_KEY"):
        print("Error: GEMINI_API_KEY not found in environment variables.")
        print("Please set it in a .env file or export it.")
        return

    print("--- Starting JamOn RAG POC ---")

    # 1. Get Audio Features from LLM
    print("\n1. Generating Audio Features for Mock Songs...")
    # For POC, we can process all 20 songs.
    songs_with_features = llm_service.generate_audio_features(MOCK_SONGS)
    
    if not songs_with_features:
        print("Failed to generate audio features. Exiting.")
        return

    print(f"Generated features for {len(songs_with_features)} songs.")
    print("Sample feature:", json.dumps(songs_with_features[0], indent=2))

    # 2. Index Songs in Vector DB
    print("\n2. Indexing Songs into Vector DB...")
    rag = RagEngine()
    rag.add_songs(songs_with_features, MOCK_LYRICS)

    # 3. Define Mock Event
    mock_event = "A chill late night coding session with lo-fi vibes and deep focus."
    print(f"\n3. Mock Event: '{mock_event}'")

    # 4. Query Vector DB
    print("\n4. Retrieving relevant songs from library...")
    # Retrieve top 10 context songs
    context_songs = rag.query_songs(mock_event, n_results=10)
    
    print(f"Retrieved {len(context_songs)} context songs.")
    for song in context_songs:
        desc = song.get('mood_desc') or song.get('embedding_text') or ""
        print(f" - {song['title']} by {song['artist']} ({desc[:50]}...)")

    # 5. Generate Playlist
    print("\n5. Generating Final Playlist...")
    playlist = llm_service.generate_playlist(mock_event, context_songs)

    print("\n--- Final Playlist ---")
    print(json.dumps(playlist, indent=2))

if __name__ == "__main__":
    main()
