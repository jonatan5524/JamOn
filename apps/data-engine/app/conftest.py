import sys
import pytest
from unittest.mock import MagicMock

# Mock llm_service BEFORE any tests run
mock_llm = MagicMock()
sys.modules['llm_service'] = mock_llm


@pytest.fixture(autouse=True)
def reset_circuit_breaker_global():
    """Reset the singleton CircuitBreaker before every test to prevent cross-test state leakage."""
    from app.core.resilience import CircuitBreaker
    cb = CircuitBreaker()
    cb.state = "CLOSED"
    cb.failure_count = 0
    cb.last_failure_time = 0
    yield
