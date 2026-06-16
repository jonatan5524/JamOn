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


def test_build_embedding_text_fallback_handles_none_lyric_mood_tags():
    text = build_embedding_text({"energy_desc": "high", "lyric_mood_tags": None})
    assert isinstance(text, str)
    assert "Lyrics" not in text


def test_tagging_prompt_requests_lyric_mood_tags():
    import os
    path = os.path.join(
        os.path.dirname(__file__), "..", "prompts", "audio_features_prompt.txt"
    )
    with open(path) as f:
        content = f.read()
    assert "lyric_mood_tags" in content
