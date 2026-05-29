import asyncio
import logging
import os
import chromadb
from typing import List, Dict, Any
from app.services import llm
from app.services.llm import client as genai_client
from app.core.config import settings

# Configure logging
logger = logging.getLogger(__name__)

def load_prompt(filename: str) -> str:
    # Adjust path because this file is in app/services/
    prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", filename)
    with open(prompt_path, "r") as f:
        return f.read()

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
            
            logger.debug(f"Embedding text for '{title}' by {artist}:\n{text_to_embed}\n")

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

    async def expand_query_hyde(self, event_description: str) -> str:
        """
        Expands a short event description into a rich hypothetical song document.
        """
        prompt_template = load_prompt("hyde_prompt.txt")
        prompt = prompt_template.replace("{event_description}", event_description)
        
        try:
            # Use asyncio.to_thread for synchronous Gemini call
            response = await asyncio.to_thread(
                genai_client.models.generate_content,
                model=settings.PLAYLIST_GENERATION_MODEL,
                contents=prompt
            )
            expanded_text = response.text
            logger.debug(f"Expanded HyDE query: {expanded_text}")
            return expanded_text
        except Exception as e:
            logger.error(f"Error in HyDE expansion: {e}")
            return event_description # Fallback

    async def query_songs(self, event_description: str, n_results: int = 5, max_distance: float = 0.7) -> List[Dict[str, Any]]:
        logger.debug(f"Querying for event: {event_description}")
        
        # HyDE Expansion
        expanded_query = await self.expand_query_hyde(event_description)
        
        query_embedding = llm.get_query_embedding(expanded_query)
        
        if not query_embedding:
            return []

        # Request distances along with metadatas
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            include=["metadatas", "distances", "documents"]
        )
        
        if not results['metadatas'] or not results['metadatas'][0]:
            return []

        retrieved_songs = []
        filtered_songs = []
        
        metadatas = results['metadatas'][0]
        distances = results['distances'][0] if 'distances' in results and results['distances'] else [0.7] * len(metadatas)
        documents = results['documents'][0] if 'documents' in results and results['documents'] else [""] * len(metadatas)

        for meta, distance, doc in zip(metadatas, distances, documents):
            # Verbose debug logging
            logger.debug(f"Retrieved: {meta.get('title')} by {meta.get('artist')} | Distance: {distance:.4f}")
            logger.debug(f"Retrieved Song Metadata: {meta}")
            
            # Convert vibe_tags string back to list
            if isinstance(meta.get('vibe_tags'), str):
                meta['vibe_tags'] = meta['vibe_tags'].split(", ") if meta['vibe_tags'] else []
            
            # Attach distance for visualization/debugging
            meta['distance'] = distance
                
            retrieved_songs.append(meta)
            if distance <= max_distance:
                filtered_songs.append(meta)
                
        # Fallback: if no songs meet the threshold, return the top K
        if not filtered_songs:
            logger.debug(f"No songs met the threshold (<= {max_distance}). Falling back to Top {n_results}.")
            return retrieved_songs
            
        logger.debug(f"Filtered {len(filtered_songs)} out of {n_results} songs within threshold.")
        return filtered_songs
