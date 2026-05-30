import os
import sys
import asyncio
import logging

# Enable debug logging for POC
logging.basicConfig(level=logging.DEBUG)

# Add project root to sys.path to allow absolute imports from 'app'
# Assuming we run this from the project root (apps/data-engine/)
sys.path.append(os.getcwd())

# NOTE: This POC script was written before the provider abstraction refactor.
# It has been updated minimally to import from the new provider classes.
# For full functionality, wire up LLMProviderFactory / VectorStoreFactory as in main.py.
from app.data.mock_data import MOCK_SONGS
from app.providers.llm.factory import LLMProviderFactory
from app.providers.vectordb.factory import VectorStoreFactory
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

def get_user_songs(user_name: str):
    """
    Prompt the user to input songs for a specific person.
    """
    print(f"\n--- Input Top Songs for {user_name} ---")
    print("Paste your list here (Format: 'Title - Artist', one per line).")
    print("Press Enter twice (an empty line) when finished, or just Enter once to use mock data.")
    
    lines = []
    while True:
        try:
            line = input().strip()
            if not line:
                break
            lines.append(line)
        except EOFError:
            break
            
    songs = []
    for line in lines:
        if " - " in line:
            parts = line.split(" - ", 1)
            songs.append({"title": parts[0].strip(), "artist": parts[1].strip()})
            
    if not songs:
        print(f"No songs entered. Using {len(MOCK_SONGS)} mock songs for {user_name}.")
        return MOCK_SONGS
    
    print(f"Added {len(songs)} songs for {user_name}.")
    return songs

async def process_and_index(rag: RagEngine, tagger, user_name: str, songs: list):
    """
    Generate features, fetch lyrics, and index songs for a user.
    """
    print(f"\nProcessing {len(songs)} songs for {user_name}...")

    # 1. Get Audio Features from LLM
    print(f"1. Generating Audio Features for {user_name}'s songs...")
    songs_with_features = await asyncio.to_thread(tagger.tag_songs, songs)
    
    if not songs_with_features:
        print(f"Failed to generate audio features for {user_name}. Using original list.")
        songs_with_features = songs

    # 2. Fetch lyrics
    print(f"2. Fetching lyrics for {user_name}'s songs...")
    lyrics_map = await asyncio.to_thread(fetch_lyrics_map, songs)
    
    # 3. Index Songs in Vector DB
    print(f"3. Indexing {user_name}'s songs into Vector DB...")
    await asyncio.to_thread(rag.add_songs, songs_with_features, lyrics_map)

async def main():
    if not settings.GEMINI_API_KEY:
        print("Error: GEMINI_API_KEY not found in environment variables.")
        return
        
    if not os.environ.get("GENIUS_ACCESS_TOKEN"):
        print("Error: GENIUS_ACCESS_TOKEN not found in environment variables. Please add it to apps/data-engine/app/.env")
        return

    print("--- JamOn Multi-User Agentic RAG POC ---")
    
    # Initialize RAG Engine via factories (keeps dims consistent with config)
    llm_container, embed_config = LLMProviderFactory.create(settings.LLM_PROVIDER)
    _store = VectorStoreFactory.create(settings.VECTOR_DB_PROVIDER, embed_config)
    rag = RagEngine(vector_store=_store, embedder=llm_container.embedding, dj=llm_container.dj)

    # Get songs for User A and User B
    user_a_songs = get_user_songs("User A")
    user_b_songs = get_user_songs("User B")

    # Process and index both
    await process_and_index(rag, llm_container.tagging, "User A", user_a_songs)
    await process_and_index(rag, llm_container.tagging, "User B", user_b_songs)

    # 3. Define Mock Event
    mock_event = input("\nDescribe the event vibe (e.g., 'Late night chill study session'): ").strip()
    if not mock_event:
        mock_event = "A high-energy rooftop pool party with house music"
        print(f"Using default event: '{mock_event}'")

    # 4. Define Graph Wrappers
    async def db_fetch_wrapper(query: str):
        print(f"   [Graph] Querying Vector DB for: {query}")
        return await rag.query_songs(query, n_results=15)
        
    async def llm_gen_wrapper(prompt: str, count: int, rejected: list, context: list):
        print(f"   [Graph] LLM Generating {count} new songs (Avoiding: {len(rejected)} rejected)")
        return await asyncio.to_thread(llm_container.dj.generate_playlist, prompt, context, count, rejected)

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
        
        print("\n--- Final Joint Agentic Playlist ---")
        for i, song in enumerate(playlist):
            source = "NEW" if song.get("source") == "new_suggestion" else "LIBRARY"
            dist_str = f" [Dist: {song['distance']:.3f}]" if "distance" in song else ""
            print(f"{i+1}. [{source}]{dist_str} {song['title']} - {song['artist']}")
            
        print(f"\nTotal Songs: {len(playlist)}")
        print(f"Attempts taken: {final_state.get('attempts')}")
        
    except Exception as e:
        print(f"\nError during graph execution: {e}")

if __name__ == "__main__":
    asyncio.run(main())

