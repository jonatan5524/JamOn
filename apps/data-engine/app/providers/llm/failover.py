import logging
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Callable, Deque, List, Sequence

import httpx
from google.genai import errors as google_errors

from app.providers.exceptions import GenerationError, ProviderResponseError, TaggingError

logger = logging.getLogger(__name__)


@dataclass
class ProviderCircuitBreaker:
    name: str
    failure_threshold: int = 3
    window_seconds: float = 300.0
    recovery_timeout: float = 60.0
    state: str = "closed"
    failure_times: Deque[float] = field(default_factory=deque)
    opened_at: float = 0.0

    def allow_request(self) -> bool:
        now = time.time()
        if self.state == "open":
            if now - self.opened_at >= self.recovery_timeout:
                self.state = "half-open"
                logger.info("Provider circuit half-open: %s", self.name)
                return True
            return False
        return True

    def record_success(self) -> None:
        if self.state != "closed" or self.failure_times:
            logger.info("Provider circuit closed: %s", self.name)
        self.state = "closed"
        self.failure_times.clear()
        self.opened_at = 0.0

    def record_failure(self) -> None:
        now = time.time()
        if self.state == "half-open":
            self._open(now)
            return
        while self.failure_times and now - self.failure_times[0] > self.window_seconds:
            self.failure_times.popleft()
        self.failure_times.append(now)
        if len(self.failure_times) >= self.failure_threshold:
            self._open(now)

    def _open(self, now: float) -> None:
        if self.state != "open":
            logger.warning(
                "Provider circuit opened: %s for %.0fs",
                self.name,
                self.recovery_timeout,
            )
        self.state = "open"
        self.opened_at = now


_breakers: dict[str, ProviderCircuitBreaker] = {}


def get_provider_breaker(
    name: str,
    failure_threshold: int = 3,
    window_seconds: float = 300.0,
    recovery_timeout: float = 60.0,
) -> ProviderCircuitBreaker:
    breaker = _breakers.get(name)
    if breaker is None:
        breaker = ProviderCircuitBreaker(
            name=name,
            failure_threshold=failure_threshold,
            window_seconds=window_seconds,
            recovery_timeout=recovery_timeout,
        )
        _breakers[name] = breaker
    return breaker


def reset_provider_circuit_breakers() -> None:
    _breakers.clear()


@dataclass(frozen=True)
class ProviderEntry:
    provider_id: str
    provider: object
    breaker: ProviderCircuitBreaker


def _exception_chain(exc: BaseException):
    seen = set()
    current = exc
    while current is not None and id(current) not in seen:
        yield current
        seen.add(id(current))
        current = current.__cause__ or current.__context__


def _status_code(exc: BaseException):
    return getattr(exc, "status_code", None) or getattr(exc, "code", None)


def _failure_kind(exc: BaseException) -> str:
    for item in _exception_chain(exc):
        if isinstance(item, ProviderResponseError):
            return "soft"
        code = _status_code(item)
        if code == 429:
            return "soft"
        if isinstance(item, google_errors.ClientError) and getattr(item, "code", None) == 429:
            return "soft"
        if isinstance(item, (TimeoutError, httpx.TimeoutException, httpx.TransportError)):
            return "hard"
        if isinstance(item, httpx.HTTPStatusError):
            status = item.response.status_code
            if status == 429:
                return "soft"
            if 500 <= status < 600:
                return "hard"
        if isinstance(item, google_errors.ServerError):
            return "hard"
        if code is not None and 500 <= int(code) < 600:
            return "hard"
    return "hard"


def _message(exc: BaseException) -> str:
    try:
        return str(exc) or exc.__class__.__name__
    except Exception:
        return exc.__class__.__name__


class _FailoverBase:
    def __init__(
        self,
        task_name: str,
        providers: Sequence[ProviderEntry],
        final_error: type[Exception],
        max_attempts_per_provider: int = 2,
    ):
        self.task_name = task_name
        self.providers = list(providers)
        self.final_error = final_error
        self.max_attempts_per_provider = max(1, max_attempts_per_provider)

    @property
    def provider_chain(self) -> List[str]:
        return [entry.provider_id for entry in self.providers]

    def _call(self, method_name: str, validate: Callable[[object], None], *args, **kwargs):
        errors = []
        for entry in self.providers:
            if not entry.breaker.allow_request():
                logger.warning("[failover:%s] skipping %s because circuit is open", self.task_name, entry.provider_id)
                errors.append(f"{entry.provider_id}: circuit open")
                continue
            for attempt in range(1, self.max_attempts_per_provider + 1):
                try:
                    logger.info(
                        "[failover:%s] trying provider %s (attempt %s/%s)",
                        self.task_name,
                        entry.provider_id,
                        attempt,
                        self.max_attempts_per_provider,
                    )
                    result = getattr(entry.provider, method_name)(*args, **kwargs)
                    validate(result)
                    entry.breaker.record_success()
                    logger.info("[failover:%s] provider %s succeeded", self.task_name, entry.provider_id)
                    return result
                except Exception as exc:
                    kind = _failure_kind(exc)
                    if attempt < self.max_attempts_per_provider:
                        logger.warning(
                            "[failover:%s] retrying %s after %s failure: %s",
                            self.task_name,
                            entry.provider_id,
                            kind,
                            _message(exc),
                        )
                        continue
                    entry.breaker.record_failure()
                    level = logging.WARNING if kind == "soft" else logging.ERROR
                    logger.log(
                        level,
                        "[failover:%s] %s failure from %s: %s",
                        self.task_name,
                        kind,
                        entry.provider_id,
                        _message(exc),
                    )
                    errors.append(f"{entry.provider_id}: {kind} failure")
        raise self.final_error(
            f"All providers failed for {self.task_name}: {', '.join(errors)}"
        )


class FailoverTaggingProvider(_FailoverBase):
    def __init__(self, providers: Sequence[ProviderEntry], max_attempts_per_provider: int = 2):
        super().__init__("tagging", providers, TaggingError, max_attempts_per_provider)

    def tag_songs(self, songs: List[dict]) -> List[dict]:
        def validate(result: object) -> None:
            if not isinstance(result, list):
                raise ProviderResponseError("tagging provider returned a non-list response")
            if songs and not result:
                raise ProviderResponseError("tagging provider returned an empty response")
            if any(not isinstance(item, dict) for item in result):
                raise ProviderResponseError("tagging provider returned malformed song entries")

        return self._call("tag_songs", validate, songs)


class FailoverDJProvider(_FailoverBase):
    def __init__(self, providers: Sequence[ProviderEntry], max_attempts_per_provider: int = 2):
        super().__init__("dj", providers, GenerationError, max_attempts_per_provider)

    def generate_playlist(
        self,
        event_description: str,
        context_songs: List[dict],
        count: int,
        rejected: List[str],
        anchor_artists: List[str],
    ) -> List[dict]:
        def validate(result: object) -> None:
            if not isinstance(result, list):
                raise ProviderResponseError("DJ provider returned a non-list response")
            if count > 0 and not result:
                raise ProviderResponseError("DJ provider returned an empty playlist")
            if any(not isinstance(item, dict) for item in result):
                raise ProviderResponseError("DJ provider returned malformed song entries")

        return self._call(
            "generate_playlist",
            validate,
            event_description,
            context_songs,
            count,
            rejected,
            anchor_artists,
        )


class FailoverHyDEProvider(_FailoverBase):
    def __init__(self, providers: Sequence[ProviderEntry], max_attempts_per_provider: int = 2):
        super().__init__("hyde", providers, GenerationError, max_attempts_per_provider)

    def expand_query(self, event_description: str) -> str:
        def validate(result: object) -> None:
            if not isinstance(result, str) or not result.strip():
                raise ProviderResponseError("HyDE provider returned an empty response")

        return self._call("expand_query", validate, event_description)
