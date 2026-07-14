from app.services import lastfm
from app.services.lastfm import fetch_lastfm_tags


def test_returns_empty_when_api_key_missing(monkeypatch):
    monkeypatch.setattr(lastfm.settings, "LASTFM_API_KEY", "")
    assert fetch_lastfm_tags("Song", "Artist") == []


def test_returns_tag_names_capped_at_max(monkeypatch):
    monkeypatch.setattr(lastfm.settings, "LASTFM_API_KEY", "key")
    tags = [{"name": f"tag{i}"} for i in range(12)]
    monkeypatch.setattr(
        lastfm, "_request_json", lambda url: {"toptags": {"tag": tags}}
    )

    result = fetch_lastfm_tags("Song", "Artist")
    assert result == [f"tag{i}" for i in range(8)]


def test_skips_malformed_tag_entries(monkeypatch):
    monkeypatch.setattr(lastfm.settings, "LASTFM_API_KEY", "key")
    tags = [{"name": "good"}, {"noname": "x"}, "not-a-dict", {"name": ""}]
    monkeypatch.setattr(
        lastfm, "_request_json", lambda url: {"toptags": {"tag": tags}}
    )

    assert fetch_lastfm_tags("Song", "Artist") == ["good"]


def test_returns_empty_on_request_failure(monkeypatch):
    monkeypatch.setattr(lastfm.settings, "LASTFM_API_KEY", "key")

    def boom(url):
        raise RuntimeError("network down")

    monkeypatch.setattr(lastfm, "_request_json", boom)
    assert fetch_lastfm_tags("Song", "Artist") == []


def test_handles_missing_toptags_key(monkeypatch):
    monkeypatch.setattr(lastfm.settings, "LASTFM_API_KEY", "key")
    monkeypatch.setattr(lastfm, "_request_json", lambda url: {})
    assert fetch_lastfm_tags("Song", "Artist") == []
