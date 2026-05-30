# HyDE Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement HyDE (Hypothetical Document Embedding) to improve vector search accuracy by expanding natural language queries into rich song profiles.

**Architecture:** Use Gemini 1.5 Flash to generate a hypothetical song document matching the indexed structure, then embed that expansion for ChromaDB retrieval.

**Tech Stack:** Python, Google GenAI, ChromaDB.

---

### Task 1: Implement `expand_query_hyde` in `RagEngine`

**Files:**
- Modify: `apps/data-engine/app/services/rag.py`

- [ ] **Step 1: Add imports and `expand_query_hyde` function**

```python
# apps/data-engine/app/services/rag.py
import logging
from google.genai import types

logger = logging.getLogger(__name__)

# Inside RagEngine class:
    async def expand_query_hyde(self, event_description: str) -> str:
        """
        Expands a short event description into a hypothetical song document.
        """
        logger.debug(f"Expanding query via HyDE for: {event_description}")
        
        prompt = f"""
        Act as a music expert. Given an event description, generate a hypothetical "perfect" song that fits the vibe.
        
        Event: {event_description}
        
        Provide the following:
        1. A fictional Song Title and Artist.
        2. 3-4 lines of lyrics imagery/themes that would appear in this song.
        3. A descriptive sentence about the energy, mood, and genre.
        
        Format the output as a single descriptive paragraph without labels.
        """
        
        try:
            # We use the client directly since it's already instantiated in llm.py 
            # or we can import it. But instructions say 'match pattern already in file'.
            # llm.py has `client = genai.Client(...)`. We can use that.
            from app.services.llm import client as genai_client
            
            response = await asyncio.to_thread(
                genai_client.models.generate_content,
                model=settings.PLAYLIST_GENERATION_MODEL, # gemini-1.5-flash
                contents=prompt
            )
            
            expanded_text = response.text.strip()
            logger.debug(f"HyDE Expanded Query: {expanded_text}")
            return expanded_text
            
        except Exception as e:
            logger.error(f"HyDE expansion failed: {e}")
            return event_description # Fallback to original
```

- [ ] **Step 2: Update `query_songs` to use HyDE**

```python
# apps/data-engine/app/services/rag.py
    async def query_songs(self, event_description: str, n_results: int = 5, max_distance: float = 0.75) -> List[Dict[str, Any]]:
        # Use HyDE expansion
        expanded_query = await self.expand_query_hyde(event_description)
        
        # Use expanded_query for embedding instead of raw event_description
        query_embedding = llm.get_query_embedding(expanded_query)
        # ... rest of logic stays same ...
```

- [ ] **Step 3: Add Verbose Debug Logging**
Ensure `logger.setLevel(logging.DEBUG)` is set in the module or core config if needed for visibility during POC.

- [ ] **Step 4: Commit**
```bash
git add apps/data-engine/app/services/rag.py
git commit -m "feat: implement HyDE query expansion for improved RAG retrieval"
```

### Task 2: Verification

- [ ] **Step 1: Run POC**
Run: `python app/poc.py`
Verify:
1. "HyDE Expanded Query" appears in logs.
2. Distances for relevant matches are lower (e.g., < 0.6).
3. Final playlist still contains 5 wildcards and correct library tracks.
