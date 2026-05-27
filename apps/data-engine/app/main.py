import os
import sys
import json
import asyncio
from dotenv import load_dotenv

# Load environment variables before importing other local modules
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

# Add current directory to sys.path to import local modules
sys.path.append(BASE_DIR)

from data.mock_data import MOCK_SONGS
import llm_service
from lyrics_service import fetch_lyrics_map
from rag_engine import RagEngine, PlaylistGraphBuilder

async def mock_uri_validator(song: dict) -> bool:
    """
    Mock validator for local testing without the NestJS orchestrator.
    In this mock, we assume all songs are valid.
    """
    print(f"   [Mock Validator] Checking: {song.get('title')} by {song.get('artist')}... VALID")
    return True

async def main():
    if not os.environ.get("GEMINI_API_KEY"):
        print("Error: GEMINI_API_KEY not found in environment variables.")
        print("Please set it in a .env file or export it.")
        return

    print("--- Starting JamOn Agentic RAG POC ---")

    # 1. Get Audio Features from LLM
    print("\n1. Generating Audio Features for Mock Songs...")
    songs_with_features = llm_service.generate_audio_features(MOCK_SONGS)
    
    if not songs_with_features:
        print("Failed to generate audio features. Exiting.")
        return

    print(f"Generated features for {len(songs_with_features)} songs.")

    print("\nFetching lyrics...")
    lyrics_map = fetch_lyrics_map(MOCK_SONGS)
    lyrics_found = sum(1 for lyrics in lyrics_map.values() if lyrics)
    print(f"Fetched lyrics for {lyrics_found} songs.")

    # 2. Index Songs in Vector DB
    print("\n2. Indexing Songs into Vector DB...")
    rag = RagEngine()
    rag.add_songs(songs_with_features, lyrics_map)

    # 3. Define Mock Event
    mock_event = "A sad mood for a funeral."
    print(f"\n3. Mock Event: '{mock_event}'")

    # 4. Define Graph Wrappers
    async def db_fetch_wrapper(query: str):
        print(f"   [Graph] Querying Vector DB for: {query}")
        return await asyncio.to_thread(rag.query_songs, query, n_results=10)
        
    async def llm_gen_wrapper(prompt: str, count: int, rejected: list):
        print(f"   [Graph] LLM Generating {count} new songs (Avoiding: {len(rejected)} rejected)")
        # We fetch context here for the LLM prompt
        context = await asyncio.to_thread(rag.query_songs, prompt, n_results=10)
        return await asyncio.to_thread(llm_service.generate_playlist, prompt, context, count, rejected)

    # 5. Build and Run Graph
    print("\n5. Executing Agentic LangGraph Workflow...")
    builder = PlaylistGraphBuilder(
        llm_generator=llm_gen_wrapper,
        db_fetcher=db_fetch_wrapper,
        uri_validator=mock_uri_validator,
        target_wildcards=5,
        max_attempts=3
    )
    
    workflow = builder.build()
    initial_state = {"event_description": mock_event}
    
    try:
        final_state = await workflow.ainvoke(initial_state)
        playlist = final_state.get("final_playlist", [])
        
        print("\n--- Final Agentic Playlist ---")
        for i, song in enumerate(playlist):
            source = "NEW" if song.get("source") == "new_suggestion" else "LIBRARY"
            print(f"{i+1}. [{source}] {song['title']} - {song['artist']}")
            
        print(f"\nTotal Songs: {len(playlist)}")
        print(f"Attempts taken: {final_state.get('attempts')}")
        
    except Exception as e:
        print(f"\nError during graph execution: {e}")

if __name__ == "__main__":
    asyncio.run(main())

