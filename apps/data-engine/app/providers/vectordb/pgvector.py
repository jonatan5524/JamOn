import logging
from typing import List

from app.providers.protocols import EmbeddingProvider
from app.services.db import _get_connection

logger = logging.getLogger(__name__)


class PgVectorStore:
    def __init__(self, collection_name: str):
        self.collection_name = collection_name
        self._session_keys: list = []  # (name, artist) pairs indexed this session

    def song_exists(self, track_id: str) -> bool:
        name, _, artist = track_id.partition("-")
        with _get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM songs WHERE name = %s AND artist_name = %s AND embedding IS NOT NULL",
                    (name, artist),
                )
                return cur.fetchone() is not None

    def add_songs(
        self,
        songs_with_features: List[dict],
        lyrics_map: dict,
        embedder: EmbeddingProvider,
    ) -> None:
        prepared = []
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
            prepared.append((text, song))

        if not prepared:
            logger.warning("[pgvector] no songs to embed")
            return

        logger.info(f"[pgvector] embedding {len(prepared)} songs")
        vectors = embedder.embed_documents([text for text, _ in prepared])

        with _get_connection() as conn:
            with conn.cursor() as cur:
                indexed = 0
                for (_, song), vector in zip(prepared, vectors):
                    if not vector:
                        continue
                    title = song.get("title", "")
                    artist = song.get("artist", "")
                    vec_str = "[" + ",".join(str(v) for v in vector) + "]"
                    cur.execute(
                        """
                        INSERT INTO songs (name, artist_name, embedding)
                        VALUES (%s, %s, %s::vector)
                        ON CONFLICT (name, artist_name)
                        DO UPDATE SET embedding = EXCLUDED.embedding
                        """,
                        (title, artist, vec_str),
                    )
                    self._session_keys.append((title, artist))
                    indexed += 1
            conn.commit()

        logger.info(f"[pgvector] indexed {indexed} songs in '{self.collection_name}'")

    def query_songs(
        self,
        query_text: str,
        embedder: EmbeddingProvider,
        n_results: int,
        max_distance: float,
    ) -> List[dict]:
        if not self._session_keys:
            logger.warning("[pgvector] no songs indexed this session — returning empty")
            return []

        query_vector = embedder.embed_query(query_text)
        if not query_vector:
            return []

        vec_str = "[" + ",".join(str(v) for v in query_vector) + "]"
        placeholders = ",".join(["(%s, %s)"] * len(self._session_keys))
        flat_pairs = [v for pair in self._session_keys for v in pair]

        with _get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT name, artist_name,
                           (embedding <=> %s::vector) AS distance
                    FROM songs
                    WHERE (name, artist_name) IN ({placeholders})
                      AND embedding IS NOT NULL
                    ORDER BY distance
                    LIMIT %s
                    """,
                    [vec_str] + flat_pairs + [n_results],
                )
                rows = cur.fetchall()

        if not rows:
            return []

        retrieved, filtered = [], []
        for name, artist_name, distance in rows:
            meta = {
                "title": name,
                "artist": artist_name,
                "distance": float(distance),
                "vibe_tags": [],
                "energy_desc": "",
                "mood_desc": "",
            }
            retrieved.append(meta)
            if float(distance) <= max_distance:
                filtered.append(meta)

        logger.info(
            f"[pgvector] {len(retrieved)} candidates, "
            f"{len(filtered)} passed max_distance={max_distance}"
        )
        for meta in retrieved:
            status = "PASS" if float(meta["distance"]) <= max_distance else "FAIL"
            logger.info(
                f"  [{status}] {meta['title']} — {meta['artist']} "
                f"| cosine_dist={meta['distance']:.4f}"
            )

        return filtered if filtered else retrieved
