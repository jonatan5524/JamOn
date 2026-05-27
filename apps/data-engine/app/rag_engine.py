import chromadb
import asyncio
import random
from typing import List, Dict, Any, TypedDict
import llm_service

class RagEngine:
    def __init__(self):
        # Use a persistent client or ephemeral for POC? 
        # Ephemeral is better for a simple "run from main" POC unless persistence is requested.
        # User said "minimal python test app", so ephemeral is fine.
        self.client = chromadb.Client()
        self.collection = self.client.create_collection(name="songs_collection")

    def add_songs(self, songs_with_features: List[Dict[str, Any]], lyrics_map: Dict[str, str]):
        ids = []
        documents = []
        metadatas = []
        embeddings = []

        print("Generating embeddings and indexing songs...")
        for i, song in enumerate(songs_with_features):
            title = song["title"]
            artist = song["artist"]
            
            # Get lyrics
            lyrics = lyrics_map.get(title, "")
            
            # Combine features and lyrics for embedding
            # "Text-ification" RAG approach
            if "embedding_text" in song:
                text_to_embed = f"""
                {song['embedding_text']}
                
                Lyrics Snippet:
                {lyrics[:500]}...
                """
            else:
                text_to_embed = f"""
                Title: {title}
                Artist: {artist}
                Energy: {song.get('energy_desc', '')}
                Mood: {song.get('mood_desc', '')}
                Tags: {', '.join(song.get('vibe_tags', []))}
                Lyrics: {lyrics[:500]}... 
                """ 
            # Truncating lyrics for embedding context window efficiency if needed, 
            # but for POC full lyrics might be fine if not too long. 
            # The instructions said "Combines LLM Tags + Lyrics Snippet".
            
            embedding = llm_service.get_embedding(text_to_embed)
            
            if embedding:
                ids.append(str(i))
                documents.append(text_to_embed)
                # Store full metadata for retrieval
                metadatas.append({
                    "title": title,
                    "artist": artist,
                    "energy_desc": song.get('energy_desc', ''),
                    "mood_desc": song.get('mood_desc', ''),
                    "embedding_text": song.get('embedding_text', ''),
                    "vibe_tags": ", ".join(song.get('vibe_tags', []))
                })
                embeddings.append(embedding)
        
        if ids:
            self.collection.add(
                ids=ids,
                documents=documents,
                metadatas=metadatas,
                embeddings=embeddings
            )
            print(f"Indexed {len(ids)} songs.")

    def query_songs(self, event_description: str, n_results: int = 5) -> List[Dict[str, Any]]:
        print(f"Querying for event: {event_description}")
        query_embedding = llm_service.get_query_embedding(event_description)
        
        if not query_embedding:
            return []

        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results
        )
        
        # Parse results
        retrieved_songs = []
        if results['metadatas']:
            for meta in results['metadatas'][0]:
                # Convert vibe_tags string back to list
                meta['vibe_tags'] = meta['vibe_tags'].split(", ")
                retrieved_songs.append(meta)
                
        return retrieved_songs


class PlaylistState(TypedDict):
    event_description: str
    db_songs: List[Dict[str, Any]]
    candidate_wildcards: List[Dict[str, Any]]
    validated_wildcards: List[Dict[str, Any]]
    rejected_wildcards: List[str]
    attempts: int
    final_playlist: List[Dict[str, Any]]

class PlaylistGraphBuilder:
    def __init__(self, llm_generator, db_fetcher, uri_validator, target_wildcards=5, max_attempts=3):
        self.llm_generator = llm_generator
        self.db_fetcher = db_fetcher
        self.uri_validator = uri_validator
        self.target_wildcards = target_wildcards
        self.max_attempts = max_attempts

    async def initial_fetch(self, state: PlaylistState) -> PlaylistState:
        # Run DB fetch and LLM wildcard generation concurrently
        db_task = self.db_fetcher(state.get("event_description", ""))
        llm_task = self.llm_generator(state.get("event_description", ""), self.target_wildcards, [])
        
        db_songs, candidate_wildcards = await asyncio.gather(db_task, llm_task)
        
        return {
            "db_songs": db_songs,
            "candidate_wildcards": candidate_wildcards,
            "validated_wildcards": [],
            "rejected_wildcards": [],
            "attempts": 1
        }

    async def validate(self, state: PlaylistState) -> PlaylistState:
        validated = list(state.get("validated_wildcards", []))
        rejected = list(state.get("rejected_wildcards", []))
        candidates = state.get("candidate_wildcards", [])
        
        if candidates:
            # Parallel async validation using the injected uri_validator
            validation_results = await asyncio.gather(*(self.uri_validator(song) for song in candidates))
            for song, is_valid in zip(candidates, validation_results):
                if is_valid:
                    validated.append(song)
                else:
                    rejected.append(f"{song.get('title', 'Unknown')} by {song.get('artist', 'Unknown')}")
                    
        return {
            "validated_wildcards": validated,
            "rejected_wildcards": rejected,
            "candidate_wildcards": []
        }

    async def regenerate(self, state: PlaylistState) -> PlaylistState:
        validated = state.get("validated_wildcards", [])
        rejected = state.get("rejected_wildcards", [])
        attempts = state.get("attempts", 1)
        missing = self.target_wildcards - len(validated)
        
        new_candidates = await self.llm_generator(
            state.get("event_description", ""), 
            missing, 
            rejected
        )
        
        return {
            "candidate_wildcards": new_candidates,
            "attempts": attempts + 1
        }

    def should_finalize(self, state: PlaylistState) -> str:
        if len(state.get("validated_wildcards", [])) >= self.target_wildcards or state.get("attempts", 1) >= self.max_attempts:
            return "merge_and_shuffle"
        return "regenerate"

    async def merge_and_shuffle(self, state: PlaylistState) -> PlaylistState:
        combined = state.get("db_songs", []) + state.get("validated_wildcards", [])
        
        seen = set()
        deduped = []
        for song in combined:
            key = f"{song.get('title', '').lower()} - {song.get('artist', '').lower()}"
            if key not in seen:
                seen.add(key)
                deduped.append(song)
                
        random.shuffle(deduped)
        return {"final_playlist": deduped}

    def build(self):
        # Assumes langgraph is installed
        try:
            from langgraph.graph import StateGraph, START, END
        except ImportError:
            raise RuntimeError("langgraph is required. Run pip install langgraph")
            
        workflow = StateGraph(PlaylistState)
        
        workflow.add_node("initial_fetch", self.initial_fetch)
        workflow.add_node("validate", self.validate)
        workflow.add_node("regenerate", self.regenerate)
        workflow.add_node("merge_and_shuffle", self.merge_and_shuffle)
        
        workflow.add_edge(START, "initial_fetch")
        workflow.add_edge("initial_fetch", "validate")
        workflow.add_conditional_edges("validate", self.should_finalize)
        workflow.add_edge("regenerate", "validate")
        workflow.add_edge("merge_and_shuffle", END)
        
        return workflow.compile()
