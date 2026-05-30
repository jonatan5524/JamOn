# Spec: HyDE Retrieval for Music RAG

## 1. Problem Statement
The current RAG system often fails to find matches within the `0.75` distance threshold because the user's natural language query (e.g., "sad night") does not semantically match the rich metadata structure of indexed songs (Title + Features + Lyrics). 

## 2. Proposed Solution: HyDE (Hypothetical Document Embedding)
We will implement HyDE to "bridge" the gap between short queries and rich documents. Instead of embedding the raw query, we will:
1. Use the LLM to hallucinate a "perfect" song that would fit the user's description.
2. The hallucinated song will be formatted exactly like our indexed documents.
3. We will embed this expanded text to perform the vector search.

## 3. Design Details

### 3.1 `expand_query_hyde` function
- **Location**: `apps/data-engine/app/services/rag.py`
- **Input**: `event_description: str`, `llm_client: genai.Client`
- **Prompt**:
  ```text
  Act as a music expert. Given an event description, generate a hypothetical "perfect" song that fits the vibe.
  
  Event: {event_description}
  
  Provide the following in your response:
  - Song title and artist (be creative)
  - 3-4 lines of lyrics imagery/themes
  - A descriptive sentence about the energy, mood, and genre.
  
  Format the output as a single paragraph.
  ```
- **Output**: A string formatted for embedding.

### 3.2 `query_songs` integration
- Call `expand_query_hyde` at the start of `query_songs`.
- Use the expanded string for `llm.get_query_embedding`.
- Keep the existing threshold and fallback logic.

### 3.3 Verbose Debug Logging
- Add `logger.debug` statements for:
  - The expanded HyDE query.
  - The raw API response from Gemini (if applicable).
  - The feature/lyrics metadata being returned.

## 4. Success Criteria
- The distance for "good" matches in the POC should drop significantly (closer to 0.4-0.6).
- The HyDE expansion accurately reflects the user's requested vibe.
- No regression in existing fallback or multi-user indexing logic.
