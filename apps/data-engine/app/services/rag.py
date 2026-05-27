import chromadb
from typing import List, Dict, Any
from app.services import llm
from app.core.config import settings

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
            
            embedding = llm.get_embedding(text_to_embed)
            
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
        query_embedding = llm.get_query_embedding(event_description)
        
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
