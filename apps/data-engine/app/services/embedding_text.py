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
