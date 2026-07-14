from app.services import lyrics
from app.services.lyrics import (
    GeniusLyricsError,
    cleanup_lyrics,
    extract_lyrics_from_html,
    fetch_lyrics_batch,
    fetch_lyrics_for_song,
    fetch_lyrics_map,
    search_song_on_genius,
)


class TestCleanupLyrics:
    def test_empty_input_returns_empty_string(self):
        assert cleanup_lyrics("") == ""

    def test_strips_contributors_and_lyrics_header(self):
        raw = "12 Contributors Song Title Lyrics[Verse 1]\nHello world"
        cleaned = cleanup_lyrics(raw)
        assert "Contributors" not in cleaned
        assert "Hello world" in cleaned

    def test_removes_you_might_also_like_and_embed(self):
        raw = "[Verse]\nLine one\nYou might also like\nLine two\n5Embed"
        cleaned = cleanup_lyrics(raw)
        assert "You might also like" not in cleaned
        assert "Embed" not in cleaned
        assert "Line one" in cleaned
        assert "Line two" in cleaned

    def test_collapses_excessive_blank_lines(self):
        raw = "[Verse]\nLine one\n\n\n\nLine two"
        cleaned = cleanup_lyrics(raw)
        assert "\n\n\n" not in cleaned


class TestExtractLyricsFromHtml:
    def test_extracts_text_from_lyrics_container(self):
        html = (
            '<div data-lyrics-container="true">First line<br/>Second line</div>'
        )
        result = extract_lyrics_from_html(html)
        assert "First line" in result
        assert "Second line" in result

    def test_returns_empty_when_no_container(self):
        assert extract_lyrics_from_html("<div>nothing here</div>") == ""


class TestSearchSongOnGenius:
    def test_raises_when_token_missing(self, monkeypatch):
        monkeypatch.delenv("GENIUS_ACCESS_TOKEN", raising=False)
        try:
            search_song_on_genius("Song", "Artist")
            assert False, "expected GeniusLyricsError"
        except GeniusLyricsError:
            pass

    def test_prefers_artist_matching_hit(self, monkeypatch):
        monkeypatch.setenv("GENIUS_ACCESS_TOKEN", "token")
        payload = {
            "response": {
                "hits": [
                    {
                        "type": "song",
                        "result": {
                            "url": "https://genius.com/wrong",
                            "primary_artist": {"name": "Someone Else"},
                            "full_title": "Wrong",
                        },
                    },
                    {
                        "type": "song",
                        "result": {
                            "url": "https://genius.com/right",
                            "primary_artist": {"name": "Dua Lipa"},
                            "full_title": "Right",
                        },
                    },
                ]
            }
        }
        monkeypatch.setattr(lyrics, "_request_json", lambda *a, **k: payload)

        result = search_song_on_genius("Levitating", "Dua Lipa")
        assert result["url"] == "https://genius.com/right"

    def test_falls_back_to_first_song_hit(self, monkeypatch):
        monkeypatch.setenv("GENIUS_ACCESS_TOKEN", "token")
        payload = {
            "response": {
                "hits": [
                    {
                        "type": "song",
                        "result": {
                            "url": "https://genius.com/fallback",
                            "primary_artist": {"name": "Nobody"},
                            "full_title": "Fallback",
                        },
                    }
                ]
            }
        }
        monkeypatch.setattr(lyrics, "_request_json", lambda *a, **k: payload)

        result = search_song_on_genius("Something", "Unrelated Artist")
        assert result["url"] == "https://genius.com/fallback"

    def test_returns_none_when_no_hits(self, monkeypatch):
        monkeypatch.setenv("GENIUS_ACCESS_TOKEN", "token")
        monkeypatch.setattr(lyrics, "_request_json", lambda *a, **k: {"response": {"hits": []}})
        assert search_song_on_genius("X", "Y") is None


class TestFetchLyricsForSong:
    def test_returns_found_result_when_lyrics_present(self, monkeypatch):
        monkeypatch.setattr(
            lyrics,
            "search_song_on_genius",
            lambda t, a: {"url": "https://genius.com/song"},
        )
        monkeypatch.setattr(lyrics, "_request_text", lambda url: "<html/>")
        monkeypatch.setattr(lyrics, "extract_lyrics_from_html", lambda html: "raw")
        monkeypatch.setattr(lyrics, "cleanup_lyrics", lambda raw: "clean lyrics")

        result = fetch_lyrics_for_song("Song", "Artist")
        assert result["found"] is True
        assert result["lyrics"] == "clean lyrics"
        assert result["lyrics_source"] == "genius"

    def test_returns_not_found_when_no_song(self, monkeypatch):
        monkeypatch.setattr(lyrics, "search_song_on_genius", lambda t, a: None)
        result = fetch_lyrics_for_song("Song", "Artist")
        assert result["found"] is False
        assert result["lyrics"] == ""

    def test_returns_not_found_when_lyrics_empty_after_cleanup(self, monkeypatch):
        monkeypatch.setattr(
            lyrics, "search_song_on_genius", lambda t, a: {"url": "u"}
        )
        monkeypatch.setattr(lyrics, "_request_text", lambda url: "<html/>")
        monkeypatch.setattr(lyrics, "extract_lyrics_from_html", lambda html: "raw")
        monkeypatch.setattr(lyrics, "cleanup_lyrics", lambda raw: "")

        result = fetch_lyrics_for_song("Song", "Artist")
        assert result["found"] is False


class TestFetchLyricsBatch:
    def test_flags_missing_title_or_artist(self):
        results = fetch_lyrics_batch([{"title": "", "artist": "A"}])
        assert results[0]["found"] is False
        assert "must include" in results[0]["error"]

    def test_captures_genius_errors_per_song(self, monkeypatch):
        def boom(title, artist):
            raise GeniusLyricsError("api down")

        monkeypatch.setattr(lyrics, "fetch_lyrics_for_song", boom)
        results = fetch_lyrics_batch([{"title": "Song", "artist": "Artist"}])
        assert results[0]["found"] is False
        assert results[0]["error"] == "api down"


class TestFetchLyricsMap:
    def test_defaults_empty_when_no_token(self, monkeypatch):
        monkeypatch.delenv("GENIUS_ACCESS_TOKEN", raising=False)
        result = fetch_lyrics_map([{"title": "Song A"}, {"title": "Song B"}])
        assert result == {"Song A": "", "Song B": ""}

    def test_fills_lyrics_when_token_present(self, monkeypatch):
        monkeypatch.setenv("GENIUS_ACCESS_TOKEN", "token")
        monkeypatch.setattr(
            lyrics,
            "fetch_lyrics_batch",
            lambda songs: [{"title": "Song A", "lyrics": "la la"}],
        )
        result = fetch_lyrics_map([{"title": "Song A"}])
        assert result["Song A"] == "la la"
