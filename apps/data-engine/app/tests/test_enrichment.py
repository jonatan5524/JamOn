from app.services import enrichment
from app.services.enrichment import enrich_song


def _patch(monkeypatch, *, lyrics_result, lastfm_tags):
    monkeypatch.setattr(
        enrichment, "fetch_lyrics_for_song", lambda title, artist: lyrics_result
    )
    monkeypatch.setattr(
        enrichment, "fetch_lastfm_tags", lambda title, artist: lastfm_tags
    )


def test_enrich_song_combines_lyrics_and_tags(monkeypatch):
    _patch(
        monkeypatch,
        lyrics_result={"found": True, "lyrics": "hello world", "lyrics_source": "genius"},
        lastfm_tags=["pop", "dance"],
    )

    result = enrich_song({"title": "Levitating", "artist": "Dua Lipa"})

    assert result.title == "Levitating"
    assert result.artist == "Dua Lipa"
    assert result.lyrics_snippet == "hello world"
    assert result.lyrics_source == "genius"
    assert result.lastfm_tags == ["pop", "dance"]


def test_enrich_song_truncates_long_lyrics(monkeypatch):
    long_lyrics = "x" * 2000
    _patch(
        monkeypatch,
        lyrics_result={"found": True, "lyrics": long_lyrics, "lyrics_source": "genius"},
        lastfm_tags=[],
    )

    result = enrich_song({"title": "T", "artist": "A"})
    assert len(result.lyrics_snippet) == 800


def test_enrich_song_handles_missing_lyrics(monkeypatch):
    _patch(
        monkeypatch,
        lyrics_result={"found": False, "lyrics": "", "lyrics_source": None},
        lastfm_tags=["rock"],
    )

    result = enrich_song({"title": "T", "artist": "A"})
    assert result.lyrics_snippet is None
    assert result.lyrics_source is None
    assert result.lastfm_tags == ["rock"]


def test_enrich_song_defaults_track_id(monkeypatch):
    _patch(
        monkeypatch,
        lyrics_result={"found": False, "lyrics": "", "lyrics_source": None},
        lastfm_tags=[],
    )

    result = enrich_song({"title": "Song", "artist": "Artist"})
    assert result.track_id == "Song-Artist"
