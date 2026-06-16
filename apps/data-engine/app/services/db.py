import psycopg2
from app.core.config import settings


def _get_connection():
    return psycopg2.connect(
        host=settings.DB_HOST,
        port=settings.DB_PORT,
        dbname=settings.DB_NAME,
        user=settings.DB_USERNAME,
        password=settings.DB_PASSWORD,
    )


def fetch_event_description(event_id: str) -> str:
    with _get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COALESCE(context, title) FROM events WHERE id = %s",
                (event_id,),
            )
            row = cur.fetchone()
            if not row:
                raise ValueError(f"Event {event_id} not found")
            return row[0]


def fetch_event_songs(event_id: str) -> list:
    with _get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT s.name, s.artist_name
                FROM event_participants ep
                JOIN song_likes sl ON sl.user_id = ep.user_id
                JOIN songs s ON s.id = sl.song_id
                WHERE ep.event_id = %s
                """,
                (event_id,),
            )
            return [{"title": row[0], "artist": row[1]} for row in cur.fetchall()]
