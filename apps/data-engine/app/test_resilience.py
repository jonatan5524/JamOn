import pytest
from unittest.mock import MagicMock, patch
from google.genai import errors
from app.core.resilience import CircuitBreaker, AIServiceUnavailableError
import time

@pytest.fixture(autouse=True)
def reset_circuit_breaker():
    cb = CircuitBreaker()
    cb.state = "CLOSED"
    cb.failure_count = 0
    cb.last_failure_time = 0
    yield

def test_circuit_breaker_opens_after_failures():
    cb = CircuitBreaker()
    assert cb.state == "CLOSED"

    cb.record_failure()
    cb.record_failure()
    assert cb.state == "CLOSED"

    cb.record_failure()
    assert cb.state == "OPEN"
    assert cb.is_open() is True

def test_circuit_breaker_closes_after_success():
    cb = CircuitBreaker()
    cb.record_failure()
    cb.record_failure()
    cb.record_failure()
    assert cb.state == "OPEN"

    cb.record_success()
    assert cb.state == "CLOSED"
    assert cb.failure_count == 0

def test_circuit_breaker_half_open_after_timeout():
    cb = CircuitBreaker()
    cb.recovery_timeout = 0.1
    cb.record_failure()
    cb.record_failure()
    cb.record_failure()
    assert cb.state == "OPEN"

    time.sleep(0.2)
    assert cb.is_open() is False
    assert cb.state == "HALF-OPEN"


def test_retries_on_rate_limit():
    """GeminiTaggingProvider.tag_songs retries on 429, succeeds on 3rd attempt."""
    import json
    from app.providers.llm.gemini.tagging import GeminiTaggingProvider

    tagged = [{"title": "Test", "artist": "Test", "energy_desc": "High",
               "mood_desc": "Happy", "vibe_tags": ["Pop"], "embedding_text": "..."}]
    fail_response = errors.ClientError(
        code=429,
        response_json={
            "error": {
                "code": 429,
                "message": "Rate limit exceeded",
                "status": "RESOURCE_EXHAUSTED",
            }
        },
    )
    success_response = MagicMock()
    success_response.text = json.dumps(tagged)

    with patch("google.genai.Client"):
        provider = GeminiTaggingProvider()

    provider._client = MagicMock()
    provider._client.models.generate_content.side_effect = [
        fail_response, fail_response, success_response
    ]

    with patch('app.providers.llm.gemini.tagging._load_prompt', return_value="mock prompt {songs_list}"):
        with patch('tenacity.nap.time.sleep', return_value=None):
            result = provider.tag_songs([{"title": "Test", "artist": "Test"}])

    assert result[0]["title"] == "Test"
    assert provider._client.models.generate_content.call_count == 3


def test_circuit_breaker_prevents_calls_when_open():
    """When the circuit breaker is OPEN, tag_songs raises AIServiceUnavailableError without calling generate_content."""
    from app.providers.llm.gemini.tagging import GeminiTaggingProvider

    cb = CircuitBreaker()
    cb.state = "OPEN"
    cb.last_failure_time = time.time()

    with patch("google.genai.Client"):
        provider = GeminiTaggingProvider()

    provider._client = MagicMock()

    with pytest.raises(AIServiceUnavailableError):
        provider.tag_songs([{"title": "Test", "artist": "Test"}])

    assert provider._client.models.generate_content.call_count == 0
