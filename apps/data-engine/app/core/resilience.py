import time
import threading
import logging
import httpx
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception
from google.genai import errors

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CircuitBreaker:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(CircuitBreaker, cls).__new__(cls)
                cls._instance.state = "CLOSED"
                cls._instance.failure_count = 0
                cls._instance.last_failure_time = 0
                cls._instance.recovery_timeout = 60 # seconds
        return cls._instance

    def record_failure(self):
        with self._lock:
            self.failure_count += 1
            self.last_failure_time = time.time()
            if self.failure_count >= 3:
                self.state = "OPEN"
                logger.warning("Circuit Breaker OPENed!")

    def record_success(self):
        with self._lock:
            self.failure_count = 0
            self.state = "CLOSED"

    def is_open(self):
        with self._lock:
            if self.state == "OPEN":
                if time.time() - self.last_failure_time > self.recovery_timeout:
                    self.state = "HALF-OPEN"
                    return False
                return True
            return False

cb = CircuitBreaker()

class AIServiceUnavailableError(Exception):
    pass

def is_retryable_exception(e):
    if isinstance(e, errors.ServerError):
        return True
    if isinstance(e, errors.ClientError) and e.code == 429:
        return True
    if isinstance(e, (OSError, httpx.TransportError)):  # ssl.SSLError, httpx.ConnectError, etc.
        return True
    return False

def with_resilience(func):
    @retry(
        wait=wait_exponential(multiplier=1, min=2, max=10),
        stop=stop_after_attempt(3),
        retry=retry_if_exception(is_retryable_exception),
        reraise=True
    )
    def decorated_func(*args, **kwargs):
        return func(*args, **kwargs)

    def wrapper(*args, **kwargs):
        if cb.is_open():
            raise AIServiceUnavailableError("Circuit Breaker is OPEN")
        try:
            result = decorated_func(*args, **kwargs)
            cb.record_success()
            return result
        except Exception:
            cb.record_failure()
            raise
    return wrapper
