# ingest-batch Flow Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align `ingest_batch` endpoint flow with the established `/recommend` pattern — enrich first (concurrent, with lastfm_tags), then tag with enriched context, then batch-embed.

**Architecture:** The single file to touch is `apps/data-engine/app/api/endpoints.py`. The `ingest_batch` function currently tags before enriching and embeds one-by-one; it must be rewritten to mirror how `/recommend` fans out `enrich_song` concurrently, builds `input_songs` with `lastfm_tags` and `lyrics_snippet`, and then calls `embed_documents` once for the whole batch.

**Tech Stack:** Python 3.11, FastAPI, asyncio, `app.services.enrichment.enrich_song`, `app.services.lyrics` (not used directly in new flow), `app.providers.protocols.EmbeddingProvider.embed_documents`

---

## Gap Summary

| Step | `/recommend` (correct pattern) | `/ingest-batch` (current — wrong) |
|------|-------------------------------|-----------------------------------|
| Enrichment | `asyncio.gather` fan-out of `enrich_song` per song — gets lyrics + lastfm_tags | `fetch_lyrics_map` sequential, lyrics only, no lastfm_tags |
| Tagging input | `{title, artist, lastfm_tags, lyrics_snippet}` | `{title, artist}` only |
| Order | Enrich → Tag → Embed | Tag → Fetch lyrics → Embed |
| Embedding | `embed_documents(texts)` batch call (via `rag.add_songs`) | `embed_document(text)` in a loop |
| Logging | `===== START/DONE =====` + per-step counts | Minimal |

---

## Files

- **Modify:** `apps/data-engine/app/api/endpoints.py` — rewrite `ingest_batch` function only; no other files touched.
- **Test:** `apps/data-engine/app/tests/test_providers.py` — add/update integration-level test for the ingest_batch endpoint handler.

---

## Task 1: Write the failing test for the new `ingest_batch` flow

**Files:**
- Modify: `apps/data-engine/app/tests/test_providers.py`

- [ ] **Step 1: Understand what to mock**

The test must verify three things about the new flow:
1. `enrich_song` is called for each track (not `fetch_lyrics_map`)
2. `tag_songs` receives dicts that include `lastfm_tags` and `lyrics_snippet`
3. `embed_documents` is called once with a list of texts (not `embed_document` in a loop)

- [ ] **Step 2: Write the failing test**

Add this test to `apps/data-engine/app/tests/test_providers.py`:

```python
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch, call
from fastapi.testclient import TestClient
from app.main import app  # adjust import if needed
from app.models.song import EnrichedSong


def _make_enriched(title: str, artist: str) -> EnrichedSong:
    return EnrichedSong(
        track_id=f"{title}-{artist}",
        title=title,
        artist=artist,
        lastfm_tags=["pop", "dance"],
        lyrics_snippet="Some lyrics snippet here",
        lyrics_source="genius",
    )


def test_ingest_batch_enriches_before_tagging_and_batch_embeds():
    """
    ingest_batch must:
    - call enrich_song per track (not fetch_lyrics_map)
    - pass lastfm_tags + lyrics_snippet to tag_songs
    - call embed_documents once with all texts (not embed_document in a loop)
    """
    tracks = [
        {"title": "Song A", "artist": "Artist A"},
        {"title": "Song B", "artist": "Artist B"},
    ]

    fake_tagged = [
        {"title": "Song A", "artist": "Artist A", "embedding_text": "Song A vibe tags text"},
        {"title": "Song B", "artist": "Artist B", "embedding_text": "Song B vibe tags text"},
    ]
    fake_vectors = [[0.1] * 10, [0.2] * 10]

    mock_tagging = MagicMock()
    mock_tagging.tag_songs.return_value = fake_tagged

    mock_embedding = MagicMock()
    mock_embedding.embed_documents.return_value = fake_vectors

    mock_providers = MagicMock()
    mock_providers.llm.tagging = mock_tagging
    mock_providers.llm.embedding = mock_embedding

    with patch("app.api.endpoints.enrich_song", side_effect=lambda s: _make_enriched(s["title"], s["artist"])) as mock_enrich, \
         patch("app.api.endpoints.fetch_lyrics_map") as mock_lyrics_map:

        # Simulate the async endpoint call
        import httpx
        from fastapi import FastAPI

        async def run():
            async with httpx.AsyncClient(app=app, base_url="http://test") as client:
                # inject mock providers
                app.state.providers = mock_providers
                resp = await client.post("/ingest-batch", json=tracks)
                return resp

        import asyncio
        resp = asyncio.get_event_loop().run_until_complete(run())

        # enrich_song called for each track, fetch_lyrics_map not called
        assert mock_enrich.call_count == 2
        mock_lyrics_map.assert_not_called()

        # tag_songs received input with lastfm_tags and lyrics_snippet
        tagged_input = mock_tagging.tag_songs.call_args[0][0]
        assert "lastfm_tags" in tagged_input[0]
        assert "lyrics_snippet" in tagged_input[0]

        # embed_documents called once (not embed_document in a loop)
        mock_embedding.embed_documents.assert_called_once()
        mock_embedding.embed_document.assert_not_called()

        # Response contains one IngestedSong per successfully embedded track
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 2
        assert body[0]["name"] == "Song A"
        assert "embedding" in body[0]
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_ingest_batch_enriches_before_tagging_and_batch_embeds -v
```

Expected: FAIL — `mock_enrich.call_count == 0` or `embed_document` called instead of `embed_documents`.

---

## Task 2: Rewrite `ingest_batch` to match the `/recommend` pattern

**Files:**
- Modify: `apps/data-engine/app/api/endpoints.py:170-203`

- [ ] **Step 1: Replace the function body**

The current `ingest_batch` (lines 170–203) becomes:

```python
@router.post(
    "/ingest-batch",
    response_model=List[IngestedSong],
    tags=["Indexing"],
    summary="Tag features and create an embedding for a batch of tracks",
    response_description="A list of songs with their generated embeddings",
)
async def ingest_batch(http_request: Request, tracks: List[Track]):
    logger.info("===== /ingest-batch START =====")
    logger.info(f"Tracks received: {len(tracks)}")

    if not tracks:
        raise HTTPException(status_code=400, detail="No tracks provided")

    providers = http_request.app.state.providers

    raw_songs = [
        {"track_id": f"{t.title}-{t.artist}", "title": t.title, "artist": t.artist}
        for t in tracks
    ]

    logger.info(f"Enriching {len(raw_songs)} songs...")
    enriched_songs = await asyncio.gather(
        *(asyncio.to_thread(enrich_song, s) for s in raw_songs)
    )
    logger.info(
        f"Enrichment complete — {sum(1 for e in enriched_songs if e.lyrics_snippet)} with lyrics"
    )

    input_songs = [
        {
            "title": e.title,
            "artist": e.artist,
            "lastfm_tags": e.lastfm_tags,
            "lyrics_snippet": e.lyrics_snippet,
        }
        for e in enriched_songs
    ]

    logger.info(f"Tagging {len(input_songs)} songs...")
    songs_with_features = await asyncio.to_thread(
        providers.llm.tagging.tag_songs, input_songs
    )
    if not songs_with_features:
        logger.error("Tagging returned empty result")
        raise HTTPException(status_code=500, detail="Failed to tag songs")
    logger.info(f"Tagging complete — {len(songs_with_features)} songs tagged")

    lyrics_map = {e.title: e.lyrics_snippet or "" for e in enriched_songs}

    texts = [
        _build_embedding_text(song, lyrics_map.get(song.get("title", ""), ""))
        for song in songs_with_features
    ]

    logger.info(f"Creating embeddings for {len(texts)} songs...")
    vectors = await asyncio.to_thread(providers.llm.embedding.embed_documents, texts)
    logger.info(f"Embeddings created — {len(vectors)} vectors")

    results: List[IngestedSong] = []
    for song, vector in zip(songs_with_features, vectors):
        if vector:
            results.append(
                IngestedSong(
                    name=song.get("title", ""),
                    artist_name=song.get("artist", ""),
                    embedding=vector,
                )
            )

    logger.info(f"===== /ingest-batch DONE — returning {len(results)} songs =====")
    return results
```

Note: The `lyrics` import (`from app.services import lyrics`) is no longer called in `ingest_batch`. Leave the import in place — it is still used by the `/lyrics/batch` endpoint.

- [ ] **Step 2: Run the test to verify it passes**

```bash
cd apps/data-engine && python -m pytest app/tests/test_providers.py::test_ingest_batch_enriches_before_tagging_and_batch_embeds -v
```

Expected: PASS.

- [ ] **Step 3: Run the full test suite to check for regressions**

```bash
cd apps/data-engine && python -m pytest app/tests/ -v
```

Expected: All previously passing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add apps/data-engine/app/api/endpoints.py apps/data-engine/app/tests/test_providers.py
git commit -m "refactor: align ingest_batch with recommend flow — enrich-first, batch-embed"
```

---

## Self-Review

**Spec coverage:**
- ✅ Enrich-first with concurrent fan-out via `asyncio.gather` + `asyncio.to_thread(enrich_song)`
- ✅ `input_songs` includes `lastfm_tags` and `lyrics_snippet` before tagging
- ✅ Embed via `embed_documents` batch call, not per-song `embed_document` loop
- ✅ `lyrics_map` built from enriched results, not `fetch_lyrics_map`
- ✅ Logging matches `/recommend` pattern with START/DONE banners and per-step counts

**Placeholder scan:** None found — all code blocks are complete.

**Type consistency:** `IngestedSong(name=..., artist_name=..., embedding=...)` matches the Pydantic model in `app/models/api.py:28-31`. `embed_documents` returns `List[List[float]]`, iterated correctly with `zip`. `enrich_song` returns `EnrichedSong` with `.lyrics_snippet`, `.lastfm_tags`, `.title`, `.artist` — all accessed correctly.
