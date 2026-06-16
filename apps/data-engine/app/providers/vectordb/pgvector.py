import logging
from typing import List

from app.providers.protocols import EmbeddingProvider
from app.services.db import _get_connection

logger = logging.getLogger(__name__)


class PgVectorStore:
    def __init__(self, collection_name: str):
        self.collection_name = collection_name

    def query_songs(
        self,
        query_text: str,
        embedder: EmbeddingProvider,
        n_results: int,
        max_distance: float,
        event_id: str,
    ) -> List[dict]:
        query_vector = embedder.embed_query(query_text)
        if not query_vector:
            return []

        vec_str = "[" + ",".join(str(v) for v in query_vector) + "]"

        with _get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT s.name, s.artist_name,
                           (s.embedding <=> %s::vector) AS distance
                    FROM songs s
                    WHERE s.id IN (
                        SELECT sl.song_id
                        FROM event_participants ep
                        JOIN song_likes sl ON sl.user_id = ep.user_id
                        WHERE ep.event_id = %s
                    )
                    AND s.embedding IS NOT NULL
                    ORDER BY distance
                    LIMIT %s
                    """,
                    (vec_str, event_id, n_results),
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
