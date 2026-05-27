import os
import sys
import asyncio
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add project root to sys.path to allow absolute imports from 'app'
# Assuming we run this from the project root (apps/data-engine/)
sys.path.append(os.getcwd())

from app.data.mock_data import MOCK_SONGS
from app.services import llm
from app.services.lyrics import fetch_lyrics_map
from app.services.rag import RagEngine
from app.workflows.playlist_generator import PlaylistGraphBuilder
from app.core.config import settings

async def mock_uri_validator(song: dict) -> bool:
    """
    Mock validator for local testing without the NestJS orchestrator.
    In this mock, we assume all songs are valid.
    """
    print(f"   [Mock Validator] Checking: {song.get('title')} by {song.get('artist')}... VALID")
    return True

async def main():
    if not settings.GEMINI_API_KEY:
        print("Error: GEMINI_API_KEY not found in environment variables.")
        return

    print("--- Starting JamOn Agentic RAG POC ---")

    # 1. Get Audio Features from LLM
    print("\n1. Generating Audio Features for Mock Songs...")
    songs_with_features = await asyncio.to_thread(llm.generate_audio_features, MOCK_SONGS)
    
    if not songs_with_features:
        print("Failed to generate audio features. Exiting.")
        return

    print(f"Generated features for {len(songs_with_features)} songs.")

    print("\nFetching lyrics...")
    lyrics_map = await asyncio.to_thread(fetch_lyrics_map, MOCK_SONGS)
    lyrics_found = sum(1 for lyrics in lyrics_map.values() if lyrics)
    print(f"Fetched lyrics for {lyrics_found} songs.")

    # 2. Index Songs in Vector DB
    print("\n2. Indexing Songs into Vector DB...")
    rag = RagEngine()
    await asyncio.to_thread(rag.add_songs, songs_with_features, lyrics_map)

    # 3. Define Mock Event
    mock_event = "A high-energy rooftop pool party with house music"
    print(f"\n3. Mock Event: '{mock_event}'")

    # 4. Define Graph Wrappers
    async def db_fetch_wrapper(query: str):
        print(f"   [Graph] Querying Vector DB for: {query}")
        return await asyncio.to_thread(rag.query_songs, query, n_results=10)
        
    async def llm_gen_wrapper(prompt: str, count: int, rejected: list):
        print(f"   [Graph] LLM Generating {count} new songs (Avoiding: {len(rejected)} rejected)")
        # We fetch context here for the LLM prompt
        context = await asyncio.to_thread(rag.query_songs, prompt, n_results=10)
        return await asyncio.to_thread(llm.generate_playlist, prompt, context, count, rejected)

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
