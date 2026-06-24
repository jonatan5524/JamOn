# Vibe-Carrying Wildcards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the participants' pooled library can't match an event's vibe, make LLM-generated wildcards (anchored to the participants' artists) carry the playlist instead of silently returning mismatched library songs — and stop diluting vibe matching with raw lyrics in the embedding.

**Architecture:** Replace the fixed "library-spine + 5 wildcards" model with a dynamic ratio driven by how many library songs clear a *strict* cosine-distance threshold. Few strong matches → generation fills the playlist; many strong matches → library stays the spine. Wildcards are always anchored to the **full** participant library (not the vibe-filtered subset), so weak matches still yield taste-relevant generation. Separately, song embeddings drop raw lyrics in favor of LLM-distilled mood labels folded into the vibe sentence.

**Tech Stack:** Python 3.14, FastAPI, LangGraph (`StateGraph`), ChromaDB (cosine), pytest (`asyncio_mode = auto`), Gemini for tagging/DJ/HyDE.

**Locked decisions (from brainstorming):**
- `strong_match_distance = 0.4` (cosine), tunable via eval.
- `target_playlist_size = 20`.
- `min_wildcards = 3` (floor — never generate fewer than this even with a full library).
- Embedding text = vibe sentence + LLM-derived `lyric_mood_tags`, **no raw lyrics**.

**All commands run from:** `/home/jonatan5524/git/JamOn/apps/data-engine`
**Test runner:** `python -m pytest` (config in `pytest.ini`, `asyncio_mode = auto`).

---

## File Structure

- `app/services/embedding_text.py` — **new.** Single source of truth for building a song's embedding string (vibe only, no lyrics). Imported by both the vector store and the ingest endpoint to kill the existing duplication.
- `app/providers/vectordb/chroma.py` — **modify.** Cosine metric on the collection; use the shared embedding-text helper; remove the masking fallback (`return filtered if filtered else retrieved`).
- `app/providers/vectordb/pgvector.py` — **modify.** Add a parity note/guard so the cosine + two-threshold semantics aren't lost when the stub is implemented.
- `app/models/state.py` — **modify.** Add `target_wildcards` field (computed per-run, threaded through the graph).
- `app/workflows/playlist_generator.py` — **modify.** New constructor params (`target_playlist_size`, `min_wildcards`, `strong_match_distance`); dynamic wildcard count; strong-match-only library spine; anchors from full library.
- `app/api/endpoints.py` — **modify.** Seed anchors from the full participant library into the graph; use the shared embedding-text helper; widen retrieval; update builder construction.
- `app/prompts/audio_features_prompt.txt` — **modify.** Add `lyric_mood_tags` field and fold it into `embedding_text`.
- `app/poc.py` — **modify.** Update builder construction to new constructor signature.
- `app/test_rag_engine.py`, `app/tests/test_providers.py` — **modify.** Fix call sites broken by the constructor/behavior changes.
- `app/tests/test_embedding_text.py`, `app/tests/test_vector_store.py`, `app/tests/test_dynamic_wildcards.py` — **new.** Tests for the new behavior.

---

## Task 1: Shared `build_embedding_text` helper (vibe only, no lyrics)

**Files:**
- Create: `app/services/embedding_text.py`
- Create: `app/tests/test_embedding_text.py`
- Modify: `app/providers/vectordb/chroma.py:33-52` (text building in `add_songs`)
- Modify: `app/api/endpoints.py:25-34` (remove `_build_embedding_text`) and `app/api/endpoints.py:213-216` (use shared helper)

- [ ] **Step 1: Write the failing tests**

Create `app/tests/test_embedding_text.py`:

```python
from app.services.embedding_text import build_embedding_text


def test_build_embedding_text_uses_llm_embedding_text_and_excludes_lyrics():
    song = {"title": "X", "embedding_text": "a calm acoustic ballad, mood: wistful"}
    text = build_embedding_text(song)
    assert text == "a calm acoustic ballad, mood: wistful"
    assert "Lyrics" not in text


def test_build_embedding_text_fallback_uses_mood_tags_not_lyrics():
    song = {
        "energy_desc": "low",
        "mood_desc": "calm",
        "vibe_tags": ["Chill", "Acoustic"],
        "lyric_mood_tags": ["wistful", "nostalgic"],
    }
    text = build_embedding_text(song)
    assert "wistful" in text
    assert "nostalgic" in text
    assert "Chill" in text
    assert "Lyrics" not in text


def test_build_embedding_text_fallback_survives_missing_fields():
    text = build_embedding_text({})
    assert isinstance(text, str)
    assert "Lyrics" not in text
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest app/tests/test_embedding_text.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.embedding_text'`

- [ ] **Step 3: Create the helper**

Create `app/services/embedding_text.py`:

```python
def build_embedding_text(song: dict) -> str:
    """Build the text embedded into the vector store for a song.

    Vibe only — raw lyrics are intentionally excluded. The LLM distills lyrics
    into `lyric_mood_tags` (folded into `embedding_text` by the tagger), which
    captures lyrical *feel* without dragging lyrical vocabulary into the cosine
    score. Falls back to assembling a vibe string from individual fields when
    the tagger did not return a unified `embedding_text` (e.g. lyrics missing).
    """
    embedding_text = song.get("embedding_text")
    if embedding_text:
        return embedding_text

    mood_tags = song.get("lyric_mood_tags") or []
    return (
        f"Energy: {song.get('energy_desc', '')}\n"
        f"Mood: {song.get('mood_desc', '')}\n"
        f"Tags: {', '.join(song.get('vibe_tags', []))}\n"
        f"Mood tags: {', '.join(mood_tags)}"
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest app/tests/test_embedding_text.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Wire the helper into `chroma.add_songs`**

In `app/providers/vectordb/chroma.py`, add the import near the top (after line 5):

```python
from app.providers.exceptions import CollectionMismatchError
from app.services.embedding_text import build_embedding_text
```

Replace the per-song text building block (currently `app/providers/vectordb/chroma.py:34-52`):

```python
        for song in songs_with_features:
            title = song.get("title", "")
            artist = song.get("artist", "")
            lyrics = lyrics_map.get(title, "")

            if "embedding_text" in song:
                text = f"{song['embedding_text']}\n\nLyrics Snippet:\n{lyrics[:500]}..."
            else:
                text = (
                    f"Title: {title}\nArtist: {artist}\n"
                    f"Energy: {song.get('energy_desc', '')}\n"
                    f"Mood: {song.get('mood_desc', '')}\n"
                    f"Tags: {', '.join(song.get('vibe_tags', []))}\n"
                    f"Lyrics: {lyrics[:500]}..."
                )
            logger.debug(
                f"[chroma] embedding text for '{title}' by '{artist}' "
                f"({len(text)} chars): {text[:150]!r}..."
            )
            prepared.append((text, song))
```

with:

```python
        for song in songs_with_features:
            title = song.get("title", "")
            artist = song.get("artist", "")
            text = build_embedding_text(song)
            logger.debug(
                f"[chroma] embedding text for '{title}' by '{artist}' "
                f"({len(text)} chars): {text[:150]!r}..."
            )
            prepared.append((text, song))
```

(`lyrics_map` stays in the method signature for protocol compatibility; it is simply no longer used for the embedding text.)

- [ ] **Step 6: Wire the helper into the ingest endpoint**

In `app/api/endpoints.py`, delete the local `_build_embedding_text` function (currently `app/api/endpoints.py:25-34`) and add the import alongside the other service imports (near line 16-19):

```python
from app.services.embedding_text import build_embedding_text
```

Replace the `texts` comprehension in `ingest_batch` (currently `app/api/endpoints.py:213-216`):

```python
    texts = [
        _build_embedding_text(song, lyrics_map.get(song.get("title", ""), ""))
        for song in songs_with_features
    ]
```

with:

```python
    texts = [build_embedding_text(song) for song in songs_with_features]
```

- [ ] **Step 7: Run the full suite to confirm nothing regressed**

Run: `python -m pytest app/tests/test_embedding_text.py app/tests/test_providers.py -v`
Expected: PASS (existing tests still green; new tests green)

---

## Task 2: Tagging prompt emits `lyric_mood_tags`

**Files:**
- Modify: `app/prompts/audio_features_prompt.txt`
- Test: `app/tests/test_embedding_text.py` (add a prompt-contract guard test)

The tagging providers (`app/providers/llm/gemini/tagging.py`, college, nim) return the parsed JSON verbatim, so a new field flows through with **no code change** — only the prompt changes. We add a guard test so the contract isn't silently lost.

- [ ] **Step 1: Write the failing guard test**

Append to `app/tests/test_embedding_text.py`:

```python
def test_tagging_prompt_requests_lyric_mood_tags():
    import os
    path = os.path.join(
        os.path.dirname(__file__), "..", "prompts", "audio_features_prompt.txt"
    )
    with open(path) as f:
        content = f.read()
    assert "lyric_mood_tags" in content
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest app/tests/test_embedding_text.py::test_tagging_prompt_requests_lyric_mood_tags -v`
Expected: FAIL with `assert 'lyric_mood_tags' in content`

- [ ] **Step 3: Update the prompt**

In `app/prompts/audio_features_prompt.txt`, add a derived-mood instruction. Add this line to the **Instructions for Analysis** block (after the numbered Spotify-feature list, before `**Input Data:**`):

```
8. **Lyrical Mood:** From the `lyrics_snippet` (if present), distill 2-3 short mood/theme labels describing how the words *feel* (e.g. "wistful", "defiant", "nostalgic"). If no lyrics are present, infer from the artist/title. Do NOT copy raw lyric phrases.
```

Then update the **Required Output Schema** so each object includes `lyric_mood_tags` and so `embedding_text` is instructed to weave them in. Replace the schema block:

```
  {
    "id": 1, // Matches input index
    "title": "Song Name",
    "artist": "Artist Name",
    
    // 1. High-level descriptive tags (for filtering)
    // Example: ["High Energy", "Sad", "Fast", "Electronic"]
    "vibe_tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],

    // 2. The Master String for Vector Embedding
    // SYNTAX: "A [Energy/Tempo] [Genre] song that is [Danceability] and [Acousticness]. The mood is [Valence]. [Instrumentalness/Liveness notes]."
    "embedding_text": "A high-energy, fast-paced Pop song that is perfect for dancing and features electronic production. The mood is cheerful and euphoric. Features heavy vocals."
  }
```

with:

```
  {
    "id": 1, // Matches input index
    "title": "Song Name",
    "artist": "Artist Name",
    
    // 1. High-level descriptive tags (for filtering)
    // Example: ["High Energy", "Sad", "Fast", "Electronic"]
    "vibe_tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],

    // 2. Lyrical mood labels (2-3 words distilled from the lyrics — feel, not words)
    // Example: ["wistful", "nostalgic"]
    "lyric_mood_tags": ["mood1", "mood2"],

    // 3. The Master String for Vector Embedding.
    // Describe the VIBE only. Incorporate the lyric_mood_tags as part of the mood.
    // Do NOT include raw lyric phrases — only the distilled feel.
    // SYNTAX: "A [Energy/Tempo] [Genre] song that is [Danceability] and [Acousticness]. The mood is [Valence], [lyric mood labels]. [Instrumentalness/Liveness notes]."
    "embedding_text": "A high-energy, fast-paced Pop song that is perfect for dancing and features electronic production. The mood is cheerful and euphoric, defiant and triumphant. Features heavy vocals."
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest app/tests/test_embedding_text.py::test_tagging_prompt_requests_lyric_mood_tags -v`
Expected: PASS


---

## Task 3: Cosine metric + remove the masking fallback in Chroma

**Files:**
- Modify: `app/providers/vectordb/chroma.py:14` (collection creation) and `app/providers/vectordb/chroma.py:141` (fallback)
- Create: `app/tests/test_vector_store.py`

**Why:** The collection is created with no `hnsw:space`, so Chroma defaults to **L2** — every `cosine_dist` log line and the `0.7` threshold are wrong today. And `return filtered if filtered else retrieved` silently dumps mismatched library songs when nothing clears the threshold, which is exactly the signal we want to act on.

- [ ] **Step 1: Write the failing tests**

Create `app/tests/test_vector_store.py`:

```python
from app.providers.vectordb.chroma import ChromaVectorStore


class FakeEmbedder:
    """Maps known embedding-text / query strings to fixed 2-D vectors so we can
    control exact cosine distances. Collection names end in `_2` so the store's
    expected-dims check (parsed from the name) matches our 2-D vectors."""

    provider_id = "fake"

    def __init__(self, mapping):
        self._mapping = mapping

    def embed_documents(self, texts):
        return [self._mapping[t] for t in texts]

    def embed_query(self, text):
        return self._mapping[text]


def test_query_songs_excludes_songs_beyond_max_distance():
    songs = [
        {"title": "Chill Song", "artist": "A", "embedding_text": "a calm acoustic ballad"},
        {"title": "Hype Song", "artist": "B", "embedding_text": "a high energy banger"},
    ]
    mapping = {
        "a calm acoustic ballad": [1.0, 0.0],   # cosine_dist 0.0 from query
        "a high energy banger": [0.0, 1.0],     # cosine_dist 1.0 from query
        "chill query": [1.0, 0.0],
    }
    embedder = FakeEmbedder(mapping)
    store = ChromaVectorStore("vibe_excludes_2")
    store.add_songs(songs, {}, embedder)

    results = store.query_songs("chill query", embedder, n_results=5, max_distance=0.7)
    titles = [r["title"] for r in results]
    assert "Chill Song" in titles
    assert "Hype Song" not in titles  # 1.0 > 0.7 -> dropped, not fallback-returned


def test_query_songs_returns_empty_when_nothing_matches():
    songs = [{"title": "Hype Song", "artist": "B", "embedding_text": "a high energy banger"}]
    mapping = {"a high energy banger": [0.0, 1.0], "chill query": [1.0, 0.0]}
    embedder = FakeEmbedder(mapping)
    store = ChromaVectorStore("vibe_empty_2")
    store.add_songs(songs, {}, embedder)

    results = store.query_songs("chill query", embedder, n_results=5, max_distance=0.7)
    assert results == []  # no silent fallback to mismatched library


def test_query_songs_attaches_distance():
    songs = [{"title": "Chill Song", "artist": "A", "embedding_text": "a calm acoustic ballad"}]
    mapping = {"a calm acoustic ballad": [1.0, 0.0], "chill query": [1.0, 0.0]}
    embedder = FakeEmbedder(mapping)
    store = ChromaVectorStore("vibe_distance_2")
    store.add_songs(songs, {}, embedder)

    results = store.query_songs("chill query", embedder, n_results=5, max_distance=0.7)
    assert results[0]["distance"] < 0.01  # near-zero cosine distance
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest app/tests/test_vector_store.py -v`
Expected: `test_query_songs_returns_empty_when_nothing_matches` FAILS (the fallback returns the mismatched song instead of `[]`). The exclusion/distance tests may also fail depending on the (currently L2) metric.

- [ ] **Step 3: Set cosine metric on the collection**

In `app/providers/vectordb/chroma.py`, replace line 14:

```python
        self._collection = self._client.create_collection(name=collection_name)
```

with:

```python
        self._collection = self._client.create_collection(
            name=collection_name, metadata={"hnsw:space": "cosine"}
        )
```

- [ ] **Step 4: Remove the masking fallback**

In `app/providers/vectordb/chroma.py`, replace the final line of `query_songs` (line 141):

```python
        return filtered if filtered else retrieved
```

with:

```python
        # No fallback: if nothing clears max_distance, return [] so the caller
        # can treat a weak pool as the trigger for vibe-carrying generation,
        # rather than silently surfacing mismatched library songs.
        return filtered
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest app/tests/test_vector_store.py -v`
Expected: PASS (3 passed)

---

## Task 4: Add `target_wildcards` to `PlaylistState`

**Files:**
- Modify: `app/models/state.py`
- Test: `app/test_rag_engine.py` (extend the existing definition test)

The dynamic wildcard count is computed once in `initial_fetch` and must persist across the validate/regenerate loop, so it lives on the state.

- [ ] **Step 1: Write the failing test**

Append to `app/test_rag_engine.py` (after `test_playlist_state_definition`, around line 13):

```python
def test_playlist_state_has_target_wildcards():
    from app.models.state import PlaylistState
    s = PlaylistState(event_description="x", target_wildcards=12)
    assert s.target_wildcards == 12
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest app/test_rag_engine.py::test_playlist_state_has_target_wildcards -v`
Expected: FAIL — `PlaylistState` rejects unexpected `target_wildcards` (pydantic) or the attribute is missing.

- [ ] **Step 3: Add the field**

In `app/models/state.py`, add after the `attempts` field (line 11):

```python
    target_wildcards: int = Field(default=0, description="Per-run wildcard target computed from how many library songs strongly match the vibe")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest app/test_rag_engine.py::test_playlist_state_has_target_wildcards -v`
Expected: PASS

---

## Task 5: Dynamic wildcard ratio + strong-match-only spine + full-library anchors

**Files:**
- Modify: `app/workflows/playlist_generator.py` (`__init__`, `initial_fetch`, `regenerate`, `should_finalize`)
- Modify: `app/poc.py:126-132` (constructor call site)
- Create: `app/tests/test_dynamic_wildcards.py`

This is the core of Option A. `initial_fetch` partitions retrieval into strong matches (≤ `strong_match_distance`), keeps only those as the library spine, and sets `target_wildcards = max(min_wildcards, target_playlist_size - strong_count)`. Anchors are read from `state.anchor_artists` (the full participant library, seeded by the endpoint in Task 6) and only fall back to retrieval-derived artists when the state didn't seed them.

- [ ] **Step 1: Write the failing tests**

Create `app/tests/test_dynamic_wildcards.py`:

```python
import pytest
from app.workflows.playlist_generator import PlaylistGraphBuilder
from app.models.state import PlaylistState


def _capturing_llm(captured):
    async def mock_llm(event, count, rejected, context, anchors):
        captured["count"] = count
        captured["anchors"] = list(anchors)
        captured["context_len"] = len(context)
        return [
            {"title": f"W{i}", "artist": "AI", "source": "new_suggestion"}
            for i in range(count)
        ]
    return mock_llm


@pytest.mark.asyncio
async def test_zero_strong_matches_fills_playlist_with_wildcards():
    captured = {}

    async def mock_db(query):
        # Weak match only: distance 0.9 > strong threshold 0.4
        return [{"title": "Lose Yourself", "artist": "Eminem", "distance": 0.9}]

    builder = PlaylistGraphBuilder(
        _capturing_llm(captured), mock_db, None,
        target_playlist_size=20, min_wildcards=3, strong_match_distance=0.4,
    )
    state = PlaylistState(
        event_description="chill evening",
        anchor_artists=["Eminem", "Imagine Dragons"],
    )
    result = await builder.initial_fetch(state)

    assert captured["count"] == 20            # 20 - 0 strong
    assert result["target_wildcards"] == 20
    assert result["db_songs"] == []           # weak song dropped from spine
    assert captured["context_len"] == 0
    assert captured["anchors"] == ["Eminem", "Imagine Dragons"]  # full library, not retrieval


@pytest.mark.asyncio
async def test_many_strong_matches_hits_wildcard_floor():
    captured = {}

    async def mock_db(query):
        return [{"title": f"S{i}", "artist": "A", "distance": 0.1} for i in range(19)]

    builder = PlaylistGraphBuilder(
        _capturing_llm(captured), mock_db, None,
        target_playlist_size=20, min_wildcards=3, strong_match_distance=0.4,
    )
    state = PlaylistState(event_description="party", anchor_artists=["A"])
    result = await builder.initial_fetch(state)

    assert captured["count"] == 3             # max(3, 20 - 19)
    assert len(result["db_songs"]) == 19


@pytest.mark.asyncio
async def test_partial_strong_matches_balance_ratio():
    captured = {}

    async def mock_db(query):
        return [{"title": f"S{i}", "artist": "A", "distance": 0.2} for i in range(5)]

    builder = PlaylistGraphBuilder(
        _capturing_llm(captured), mock_db, None,
        target_playlist_size=20, min_wildcards=3, strong_match_distance=0.4,
    )
    state = PlaylistState(event_description="party", anchor_artists=["A"])
    result = await builder.initial_fetch(state)

    assert captured["count"] == 15            # 20 - 5
    assert len(result["db_songs"]) == 5


@pytest.mark.asyncio
async def test_anchors_fall_back_to_retrieval_when_state_unset():
    captured = {}

    async def mock_db(query):
        return [{"title": "S1", "artist": "Drake", "distance": 0.1}]

    builder = PlaylistGraphBuilder(
        _capturing_llm(captured), mock_db, None,
        target_playlist_size=20, min_wildcards=3, strong_match_distance=0.4,
    )
    state = PlaylistState(event_description="party")  # no anchors seeded
    await builder.initial_fetch(state)

    assert captured["anchors"] == ["Drake"]   # derived from retrieval
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest app/tests/test_dynamic_wildcards.py -v`
Expected: FAIL — `PlaylistGraphBuilder.__init__` does not accept `target_playlist_size` / `min_wildcards` / `strong_match_distance`.

- [ ] **Step 3: Update the constructor**

In `app/workflows/playlist_generator.py`, replace `__init__` (lines 12-24):

```python
    def __init__(
        self, 
        llm_generator: Callable[[str, int, List[str], List[Dict[str, Any]], List[str]], Awaitable[List[Dict[str, Any]]]],
        db_fetcher: Callable[[str], Awaitable[List[Dict[str, Any]]]], 
        uri_validator: Callable[[Dict[str, Any]], Awaitable[bool]], 
        target_wildcards: int = 5, 
        max_attempts: int = 3
    ):
        self.llm_generator = llm_generator
        self.db_fetcher = db_fetcher
        self.uri_validator = uri_validator
        self.target_wildcards = target_wildcards
        self.max_attempts = max_attempts
```

with:

```python
    def __init__(
        self,
        llm_generator: Callable[[str, int, List[str], List[Dict[str, Any]], List[str]], Awaitable[List[Dict[str, Any]]]],
        db_fetcher: Callable[[str], Awaitable[List[Dict[str, Any]]]],
        uri_validator: Callable[[Dict[str, Any]], Awaitable[bool]],
        target_playlist_size: int = 20,
        min_wildcards: int = 3,
        strong_match_distance: float = 0.4,
        max_attempts: int = 3,
    ):
        self.llm_generator = llm_generator
        self.db_fetcher = db_fetcher
        self.uri_validator = uri_validator
        self.target_playlist_size = target_playlist_size
        self.min_wildcards = min_wildcards
        self.strong_match_distance = strong_match_distance
        self.max_attempts = max_attempts
```

- [ ] **Step 4: Rewrite `initial_fetch`**

Replace `initial_fetch` (lines 26-44):

```python
    async def initial_fetch(self, state: PlaylistState) -> Dict[str, Any]:
        logger.info(f"Starting initial fetch for event: {state.event_description}")
        # Sequential: Fetch DB songs first, then use them as context for LLM
        db_songs = await self.db_fetcher(state.event_description)
        anchor_artists = list({s["artist"] for s in db_songs if s.get("artist")})
        candidate_wildcards = await self.llm_generator(
            state.event_description,
            self.target_wildcards,
            [],
            db_songs,
            anchor_artists,
        )

        return {
            "db_songs": db_songs,
            "anchor_artists": anchor_artists,
            "candidate_wildcards": candidate_wildcards,
            "attempts": 1
        }
```

with:

```python
    async def initial_fetch(self, state: PlaylistState) -> Dict[str, Any]:
        logger.info(f"Starting initial fetch for event: {state.event_description}")
        retrieved = await self.db_fetcher(state.event_description)

        # Only songs that STRONGLY match the vibe become the library spine.
        strong_songs = [
            s for s in retrieved
            if s.get("distance", 1.0) <= self.strong_match_distance
        ]
        logger.info(
            f"Library match: {len(retrieved)} retrieved, "
            f"{len(strong_songs)} strong (<= {self.strong_match_distance})"
        )

        # Anchors come from the FULL participant library (seeded into state by
        # the endpoint), NOT the vibe-filtered retrieval. Otherwise a weak match
        # leaves no anchors and the DJ generates generic, taste-blind wildcards.
        # Fall back to retrieval-derived artists only when nothing was seeded.
        anchor_artists = state.anchor_artists or list(
            {s["artist"] for s in retrieved if s.get("artist")}
        )

        # Few strong matches -> generation fills the playlist (vibe-carrying).
        # Many strong matches -> library stays the spine, minimal generation.
        target_wildcards = max(
            self.min_wildcards,
            self.target_playlist_size - len(strong_songs),
        )
        logger.info(
            f"Dynamic wildcard target: {target_wildcards} "
            f"(playlist_size={self.target_playlist_size}, strong={len(strong_songs)})"
        )

        candidate_wildcards = await self.llm_generator(
            state.event_description,
            target_wildcards,
            [],
            strong_songs,
            anchor_artists,
        )

        return {
            "db_songs": strong_songs,
            "anchor_artists": anchor_artists,
            "candidate_wildcards": candidate_wildcards,
            "attempts": 1,
            "target_wildcards": target_wildcards,
        }
```

- [ ] **Step 5: Update `regenerate` and `should_finalize` to use `state.target_wildcards`**

In `app/workflows/playlist_generator.py`, in `regenerate` replace line 74:

```python
        missing = self.target_wildcards - len(state.validated_wildcards)
```

with:

```python
        missing = state.target_wildcards - len(state.validated_wildcards)
```

In `should_finalize` replace line 91:

```python
        if len(state.validated_wildcards) >= self.target_wildcards:
```

with:

```python
        if len(state.validated_wildcards) >= state.target_wildcards:
```

- [ ] **Step 6: Update the poc.py call site**

In `app/poc.py`, replace the builder construction (lines 126-132):

```python
    builder = PlaylistGraphBuilder(
        llm_generator=llm_gen_wrapper,
        db_fetcher=db_fetch_wrapper,
        uri_validator=mock_uri_validator,
        target_wildcards=5,
        max_attempts=3
    )
```

with:

```python
    builder = PlaylistGraphBuilder(
        llm_generator=llm_gen_wrapper,
        db_fetcher=db_fetch_wrapper,
        uri_validator=mock_uri_validator,
        target_playlist_size=20,
        max_attempts=3
    )
```

- [ ] **Step 7: Run the new tests to verify they pass**

Run: `python -m pytest app/tests/test_dynamic_wildcards.py -v`
Expected: PASS (4 passed)

---

## Task 6: Seed full-library anchors from the `/recommend` endpoint

**Files:**
- Modify: `app/api/endpoints.py` (extract `_library_anchor_artists`, seed graph state, widen retrieval, update builder construction)
- Test: `app/tests/test_providers.py` (unit test for the anchor helper)

`initial_fetch` now reads anchors from `state.anchor_artists`. The endpoint must seed that from the full participant library (`request.songs`), independent of which songs matched the vibe. Retrieval is widened so all strong matches are captured.

- [ ] **Step 1: Write the failing test**

Append to `app/tests/test_providers.py`:

```python
def test_library_anchor_artists_dedupes_and_skips_empty():
    from app.api.endpoints import _library_anchor_artists

    class S:
        def __init__(self, artist):
            self.artist = artist

    result = _library_anchor_artists([S("Eminem"), S("Eminem"), S("Drake"), S("")])
    assert sorted(result) == ["Drake", "Eminem"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest app/tests/test_providers.py::test_library_anchor_artists_dedupes_and_skips_empty -v`
Expected: FAIL with `ImportError: cannot import name '_library_anchor_artists'`

- [ ] **Step 3: Add the anchor helper**

In `app/api/endpoints.py`, add a module-level helper (near the top, after the `router` definition around line 22):

```python
def _library_anchor_artists(songs) -> List[str]:
    """Deduplicated artist list from the full participant library. Used to
    anchor wildcard generation to the group's taste even when no library song
    matches the requested vibe."""
    return list({s.artist for s in songs if s.artist})
```

- [ ] **Step 4: Seed anchors, widen retrieval, update builder construction**

In `app/api/endpoints.py`, in the `recommend` handler, change `db_fetch_wrapper` to retrieve a wider candidate set (currently `app/api/endpoints.py:103-104`):

```python
    async def db_fetch_wrapper(query: str):
        return await rag.query_songs(query, n_results=20)
```

to:

```python
    async def db_fetch_wrapper(query: str):
        # Retrieve a wide candidate set; the graph keeps only strong matches.
        return await rag.query_songs(query, n_results=50)
```

Replace the builder construction (currently `app/api/endpoints.py:111-117`):

```python
    builder = PlaylistGraphBuilder(
        llm_generator=llm_gen_wrapper,
        db_fetcher=db_fetch_wrapper,
        uri_validator=validate_spotify_uri_via_nestjs,
        target_wildcards=5,
        max_attempts=3,
    )
```

with:

```python
    builder = PlaylistGraphBuilder(
        llm_generator=llm_gen_wrapper,
        db_fetcher=db_fetch_wrapper,
        uri_validator=validate_spotify_uri_via_nestjs,
        target_playlist_size=20,
        min_wildcards=3,
        strong_match_distance=0.4,
        max_attempts=3,
    )
```

Replace the workflow invocation (currently `app/api/endpoints.py:122`):

```python
        final_state = await workflow.ainvoke({"event_description": request.event_description})
```

with:

```python
        final_state = await workflow.ainvoke({
            "event_description": request.event_description,
            "anchor_artists": _library_anchor_artists(request.songs),
        })
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `python -m pytest app/tests/test_providers.py::test_library_anchor_artists_dedupes_and_skips_empty -v`
Expected: PASS

---

## Task 7: Fix existing tests broken by the API/behavior changes

**Files:**
- Modify: `app/test_rag_engine.py` (`test_initial_fetch`, `test_regenerate`, `test_should_finalize`)
- Modify: `app/tests/test_providers.py` (`test_playlist_graph_builder_passes_anchor_artists_to_llm`)

These reference the removed `target_wildcards` constructor param and rely on pre-change behavior (library songs without a `distance` are no longer kept as spine).

- [ ] **Step 1: Run the suite to see the failures**

Run: `python -m pytest app/test_rag_engine.py app/tests/test_providers.py -v`
Expected: FAILs in `test_initial_fetch`, `test_regenerate`, `test_should_finalize`, `test_playlist_graph_builder_passes_anchor_artists_to_llm` (unexpected `target_wildcards` kwarg / behavior change).

- [ ] **Step 2: Fix `test_initial_fetch`**

In `app/test_rag_engine.py`, replace `test_initial_fetch` (lines 18-35):

```python
@pytest.mark.asyncio
async def test_initial_fetch():
    async def mock_db(query): return [{"title": "DB1", "artist": "A1"}]
    async def mock_llm(prompt, count, rejected, context, anchor_artists):
        assert len(context) == 1
        assert context[0]["title"] == "DB1"
        assert anchor_artists == ["A1"]
        return [{"title": "L1", "artist": "A2"}] * count
    
    # Testing with parameterized wildcards
    builder = PlaylistGraphBuilder(mock_llm, mock_db, None, target_wildcards=3)
    state = PlaylistState(event_description="test event")
    
    result = await builder.initial_fetch(state)
    
    assert len(result["db_songs"]) == 1
    assert len(result["candidate_wildcards"]) == 3
    assert result["attempts"] == 1
```

with:

```python
@pytest.mark.asyncio
async def test_initial_fetch():
    # DB song carries a strong-match distance so it stays in the spine.
    async def mock_db(query): return [{"title": "DB1", "artist": "A1", "distance": 0.1}]
    async def mock_llm(prompt, count, rejected, context, anchor_artists):
        assert len(context) == 1
        assert context[0]["title"] == "DB1"
        assert anchor_artists == ["A1"]
        return [{"title": "L1", "artist": "A2"}] * count

    # playlist_size 4, 1 strong match -> 3 wildcards
    builder = PlaylistGraphBuilder(
        mock_llm, mock_db, None,
        target_playlist_size=4, min_wildcards=1, strong_match_distance=0.4,
    )
    state = PlaylistState(event_description="test event")

    result = await builder.initial_fetch(state)

    assert len(result["db_songs"]) == 1
    assert len(result["candidate_wildcards"]) == 3
    assert result["target_wildcards"] == 3
    assert result["attempts"] == 1
```

- [ ] **Step 3: Fix `test_regenerate`**

In `app/test_rag_engine.py`, replace `test_regenerate` (lines 64-82):

```python
@pytest.mark.asyncio
async def test_regenerate():
    async def mock_llm(prompt, count, rejected, context, anchor_artists):
        assert count == 2 # 3 target - 1 validated
        assert "Bad Song by Bad Artist" in rejected
        assert context == []
        return [{"title": "New L1", "artist": "A1"}] * count

    builder = PlaylistGraphBuilder(mock_llm, None, None, target_wildcards=3)
    state = PlaylistState(
        event_description="event",
        validated_wildcards=[{"title": "V1", "artist": "A1"}],
        rejected_wildcards=["Bad Song by Bad Artist"],
        attempts=1
    )
    
    result = await builder.regenerate(state)
    assert len(result["candidate_wildcards"]) == 2
    assert result["attempts"] == 2
```

with:

```python
@pytest.mark.asyncio
async def test_regenerate():
    async def mock_llm(prompt, count, rejected, context, anchor_artists):
        assert count == 2 # 3 target - 1 validated
        assert "Bad Song by Bad Artist" in rejected
        assert context == []
        return [{"title": "New L1", "artist": "A1"}] * count

    builder = PlaylistGraphBuilder(mock_llm, None, None)
    state = PlaylistState(
        event_description="event",
        target_wildcards=3,
        validated_wildcards=[{"title": "V1", "artist": "A1"}],
        rejected_wildcards=["Bad Song by Bad Artist"],
        attempts=1
    )

    result = await builder.regenerate(state)
    assert len(result["candidate_wildcards"]) == 2
    assert result["attempts"] == 2
```

- [ ] **Step 4: Fix `test_should_finalize`**

In `app/test_rag_engine.py`, replace `test_should_finalize` (lines 84-88):

```python
def test_should_finalize():
    builder = PlaylistGraphBuilder(None, None, None, target_wildcards=5, max_attempts=3)
    assert builder.should_finalize(PlaylistState(event_description="x", validated_wildcards=[{"x":1}]*5, attempts=1)) == "merge_and_shuffle"
    assert builder.should_finalize(PlaylistState(event_description="x", validated_wildcards=[{"x":1}]*2, attempts=3)) == "merge_and_shuffle"
    assert builder.should_finalize(PlaylistState(event_description="x", validated_wildcards=[{"x":1}]*2, attempts=2)) == "regenerate"
```

with:

```python
def test_should_finalize():
    builder = PlaylistGraphBuilder(None, None, None, max_attempts=3)
    assert builder.should_finalize(PlaylistState(event_description="x", target_wildcards=5, validated_wildcards=[{"x":1}]*5, attempts=1)) == "merge_and_shuffle"
    assert builder.should_finalize(PlaylistState(event_description="x", target_wildcards=5, validated_wildcards=[{"x":1}]*2, attempts=3)) == "merge_and_shuffle"
    assert builder.should_finalize(PlaylistState(event_description="x", target_wildcards=5, validated_wildcards=[{"x":1}]*2, attempts=2)) == "regenerate"
```

- [ ] **Step 5: Fix `test_playlist_graph_builder_passes_anchor_artists_to_llm`**

In `app/tests/test_providers.py`, in `test_playlist_graph_builder_passes_anchor_artists_to_llm`, replace the builder construction (currently lines 866-872):

```python
    builder = PlaylistGraphBuilder(
        llm_generator=fake_llm_gen,
        db_fetcher=fake_db_fetch,
        uri_validator=fake_validator,
        target_wildcards=1,
        max_attempts=1,
    )
```

with:

```python
    builder = PlaylistGraphBuilder(
        llm_generator=fake_llm_gen,
        db_fetcher=fake_db_fetch,
        uri_validator=fake_validator,
        max_attempts=1,
    )
```

(The `db_songs` in this test have no `distance`, so they are not kept as spine — but anchors are derived from the full `retrieved` set when state seeds none, so the `BTS`/`BLACKPINK` assertions still hold.)

- [ ] **Step 6: Run both files to verify all pass**

Run: `python -m pytest app/test_rag_engine.py app/tests/test_providers.py -v`
Expected: PASS (all green)

---

## Task 8: pgvector parity guard for cosine + two-threshold semantics

**Files:**
- Modify: `app/providers/vectordb/pgvector.py`
- Test: `app/tests/test_vector_store.py` (add a guard test)

`PgVectorStore` is a stub today. When implemented during the Postgres migration, it must use cosine (`<=>`) and the same "return only filtered, no fallback" semantics as Chroma, or the bug returns. Add a docstring contract and a test that locks the stub's intent so it isn't reintroduced as L2/fallback.

- [ ] **Step 1: Write the failing test**

Append to `app/tests/test_vector_store.py`:

```python
def test_pgvector_documents_cosine_and_no_fallback_contract():
    import app.providers.vectordb.pgvector as pg
    doc = (pg.PgVectorStore.__doc__ or "") + (pg.PgVectorStore.query_songs.__doc__ or "")
    assert "cosine" in doc.lower()
    assert "no fallback" in doc.lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest app/tests/test_vector_store.py::test_pgvector_documents_cosine_and_no_fallback_contract -v`
Expected: FAIL (`assert 'cosine' in ...`)

- [ ] **Step 3: Document the contract on the stub**

In `app/providers/vectordb/pgvector.py`, replace the class docstring and `query_songs` method:

```python
class PgVectorStore:
    """Stub — raises NotImplementedError. Exists only to verify factory wiring."""
```

with:

```python
class PgVectorStore:
    """Stub — raises NotImplementedError. Exists only to verify factory wiring.

    IMPLEMENTATION CONTRACT (must match ChromaVectorStore):
    - Distance must be cosine (use the pgvector `<=>` operator), NOT L2.
    - query_songs returns ONLY rows within max_distance, with `distance`
      attached to each result. No fallback: when nothing clears the threshold,
      return [] so the graph treats a weak pool as a generation trigger.
    """
```

and replace `query_songs` (currently lines 19-22):

```python
    def query_songs(
        self, query_text: str, embedder: EmbeddingProvider, n_results: int, max_distance: float
    ) -> List[dict]:
        raise NotImplementedError("PgVectorStore is not yet implemented")
```

with:

```python
    def query_songs(
        self, query_text: str, embedder: EmbeddingProvider, n_results: int, max_distance: float
    ) -> List[dict]:
        """Cosine (`<=>`) similarity search. Returns only rows within
        max_distance with `distance` attached; no fallback (returns [] on a
        weak pool)."""
        raise NotImplementedError("PgVectorStore is not yet implemented")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest app/tests/test_vector_store.py::test_pgvector_documents_cosine_and_no_fallback_contract -v`
Expected: PASS

---

## Final verification

- [ ] **Run the entire data-engine suite**

Run: `python -m pytest -v`
Expected: All tests pass.

- [ ] **Sanity-check the wiring with a grep**

Run: `grep -rn "target_wildcards=" app --include=*.py | grep -v "state.target_wildcards" | grep -v "target_wildcards:" | grep -v test`
Expected: No remaining constructor call sites pass `target_wildcards=` (only `PlaylistState(... target_wildcards=...)` field usage remains).

---

## Out of scope / follow-ups (do NOT build here)

- **Eval-to-production param wiring.** `strong_match_distance`, `target_playlist_size`, and `min_wildcards` are good candidates for the eval auto-improvement loop (`eval/`), but per prior findings the eval loop's optimized params are not consumed by production at all. Wiring that pipeline is a separate effort. For now these are constructor defaults in `endpoints.py`.
- **Tuning `strong_match_distance`.** 0.4 is a starting guess; it can only be validated once the cosine-metric fix (Task 3) lets the eval loop read real cosine distances. Re-tune via eval after this lands.
- **Multi-user fairness cap.** When a multi-user event has some strong matches all from one participant, capping any single participant's share is worth considering — but it's not the single-narrow-taste bug this plan targets.
- **pgvector implementation.** Task 8 only documents the contract; implementing the store is part of the Postgres migration.
```
