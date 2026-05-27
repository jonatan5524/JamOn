import pytest
from unittest.mock import MagicMock, patch
from google.genai import errors
from app.services import llm
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

@patch('app.services.llm.client')
def test_retries_on_rate_limit(mock_client):
    # Mock generate_content to fail twice then succeed
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
    success_response.text = '{"energy": 0.8}'
    
    mock_client.models.generate_content.side_effect = [fail_response, fail_response, success_response]
    
    # We need to bypass the real load_prompt or provide a mock
    with patch('app.services.llm.load_prompt', return_value="mock prompt {songs_list}"):
        # We also need to speed up tenacity retries for tests
        with patch('tenacity.nap.time.sleep', return_value=None):
            result = llm.generate_audio_features([{"title": "Test", "artist": "Test"}])
            
    assert result == {"energy": 0.8}
    assert mock_client.models.generate_content.call_count == 3

@patch('app.services.llm.client')
def test_circuit_breaker_prevents_calls_when_open(mock_client):
    cb = CircuitBreaker()
    cb.state = "OPEN"
    cb.last_failure_time = time.time()
    
    with pytest.raises(AIServiceUnavailableError):
        llm.generate_audio_features([{"title": "Test", "artist": "Test"}])
        
    assert mock_client.models.generate_content.call_count == 0
