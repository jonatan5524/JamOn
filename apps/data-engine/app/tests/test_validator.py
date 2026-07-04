import pytest

from app.services import validator
from app.services.validator import validate_spotify_uri_via_nestjs


class _FakeResponse:
    def __init__(self, status_code, payload=None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self, *, response=None, exc=None):
        self._response = response
        self._exc = exc

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, *args, **kwargs):
        if self._exc is not None:
            raise self._exc
        return self._response


def _patch_client(monkeypatch, **kwargs):
    monkeypatch.setattr(
        validator.httpx, "AsyncClient", lambda *a, **k: _FakeClient(**kwargs)
    )


@pytest.mark.asyncio
async def test_returns_false_when_title_or_artist_missing():
    assert await validate_spotify_uri_via_nestjs({"title": "", "artist": "A"}) is False
    assert await validate_spotify_uri_via_nestjs({"title": "T", "artist": ""}) is False


@pytest.mark.asyncio
async def test_returns_true_when_orchestrator_confirms(monkeypatch):
    _patch_client(monkeypatch, response=_FakeResponse(200, {"is_valid": True}))
    result = await validate_spotify_uri_via_nestjs({"title": "Song", "artist": "Artist"})
    assert result is True


@pytest.mark.asyncio
async def test_returns_false_when_orchestrator_says_invalid(monkeypatch):
    _patch_client(monkeypatch, response=_FakeResponse(200, {"is_valid": False}))
    result = await validate_spotify_uri_via_nestjs({"title": "Song", "artist": "Artist"})
    assert result is False


@pytest.mark.asyncio
async def test_returns_false_on_non_200_status(monkeypatch):
    _patch_client(monkeypatch, response=_FakeResponse(500))
    result = await validate_spotify_uri_via_nestjs({"title": "Song", "artist": "Artist"})
    assert result is False


@pytest.mark.asyncio
async def test_returns_false_when_request_raises(monkeypatch):
    _patch_client(monkeypatch, exc=RuntimeError("connection refused"))
    result = await validate_spotify_uri_via_nestjs({"title": "Song", "artist": "Artist"})
    assert result is False
