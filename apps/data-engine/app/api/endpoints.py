import asyncio
import logging
from typing import List

from fastapi import APIRouter, HTTPException, Request

from app.models.api import (
    RecommendRequest,
    RecommendedSong,
    LyricsBatchRequest,
    LyricsBatchResponse,
    IngestedSong,
)
from app.models.song import Track
from app.services.rag import RagEngine
from app.services import lyrics
from app.services.embedding_text import build_embedding_text
from app.services.enrichment import enrich_song
from app.services.validator import validate_spotify_uri_via_nestjs
from app.workflows.playlist_generator import PlaylistGraphBuilder

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post(
    "/recommend",
    response_model=List[RecommendedSong],
    tags=["Playlist Generation"],
    summary="Generate a curated playlist based on event and user taste",
    response_description="A list of recommended songs with metadata",
)
async def recommend(http_request: Request, request: RecommendRequest):
    logger.info("===== /recommend START =====")
    logger.info(f"Event description: '{request.event_description}'")
    logger.info(f"Songs received: {len(request.songs)}")
    for i, s in enumerate(request.songs[:5]):
        logger.info(f"  Song[{i}]: {s.title} — {s.artist}")
    if len(request.songs) > 5:
        logger.info(f"  ... and {len(request.songs) - 5} more")

    if not request.songs:
        raise HTTPException(status_code=400, detail="No songs provided for context")

    providers = http_request.app.state.providers

    raw_songs = [
        {"track_id": f"{s.title}-{s.artist}",
         "title": s.title,
         "artist": s.artist}
        for s in request.songs
    ]
    logger.info(f"Enriching {len(raw_songs)} songs...")
    # enrich_song does blocking HTTP (Genius/Musixmatch/Last.fm). Run each in a worker
    # thread and fan out concurrently so we don't block the event loop or serialize I/O.
    enriched_songs = await asyncio.gather(
        *(asyncio.to_thread(enrich_song, s) for s in raw_songs)
    )
    logger.info(f"Enrichment complete — {sum(1 for e in enriched_songs if e.lyrics_snippet)} with lyrics")

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

    logger.info("Indexing songs in RAG engine...")
    rag = RagEngine(
        vector_store=providers.vector_store,
        embedder=providers.llm.embedding,
        dj=providers.llm.dj,
        hyde=providers.llm.hyde,
    )
    await asyncio.to_thread(rag.add_songs, songs_with_features, lyrics_map)
    logger.info("RAG indexing complete")

    async def db_fetch_wrapper(query: str):
        return await rag.query_songs(query, n_results=20)

    async def llm_gen_wrapper(prompt: str, count: int, rejected: List[str], context: List[dict], anchor_artists: List[str]):
        return await asyncio.to_thread(
            providers.llm.dj.generate_playlist, prompt, context, count, rejected, anchor_artists
        )

    builder = PlaylistGraphBuilder(
        llm_generator=llm_gen_wrapper,
        db_fetcher=db_fetch_wrapper,
        uri_validator=validate_spotify_uri_via_nestjs,
        target_wildcards=5,
        max_attempts=3,
    )
    workflow = builder.build()
    logger.info("LangGraph workflow built — invoking...")

    try:
        final_state = await workflow.ainvoke({"event_description": request.event_description})
        playlist = final_state.get("final_playlist", [])
    except Exception as e:
        logger.error(f"Graph execution error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate playlist via LangGraph")

    if not playlist:
        logger.error("Generated playlist was empty")
        raise HTTPException(status_code=500, detail="Generated playlist was empty")

    logger.info(f"===== /recommend DONE — returning {len(playlist)} songs =====")
    for i, song in enumerate(playlist[:5]):
        logger.info(f"  Result[{i}]: {song.get('title', '?')} — {song.get('artist', '?')} (source={song.get('source', '?')})")

    return [
        RecommendedSong(
            title=song["title"],
            artist=song["artist"],
            is_new=song.get("source", "user_library") == "new_suggestion",
        )
        for song in playlist
    ]


@router.post(
    "/lyrics/batch",
    response_model=LyricsBatchResponse,
    tags=["Lyrics"],
    summary="Fetch Genius lyrics for a batch of songs",
)
async def lyrics_batch(request: LyricsBatchRequest):
    if not request.songs:
        raise HTTPException(
            status_code=400,
            detail="Request body must include a non-empty 'songs' array.",
        )
    input_songs = [{"title": s.title, "artist": s.artist} for s in request.songs]
    results = await asyncio.to_thread(lyrics.fetch_lyrics_batch, input_songs)
    return LyricsBatchResponse(songs=results)


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

    texts = [build_embedding_text(song) for song in songs_with_features]

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
        else:
            logger.warning(f"No embedding for '{song.get('title', '?')}' by '{song.get('artist', '?')}' — skipping")

    logger.info(f"===== /ingest-batch DONE — returning {len(results)} songs =====")
    return results
