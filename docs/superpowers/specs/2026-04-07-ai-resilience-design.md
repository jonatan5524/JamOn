# AI Resilience and Error Handling — Design Spec

## Overview
Implement a robust multi-layered error handling strategy to manage AI model limits and failures. This ensures the application remains stable when the Gemini API hits rate limits (429) or becomes unavailable (5xx).

**Goal:** Prevent cascading failures, reduce unnecessary API calls during outages, and provide user-friendly feedback.

---

## Architecture: Multi-Layer Resilience

### 1. Python Data Engine (Resilience Layer)
The `data-engine` (`/apps/data-engine`) will implement proactive failure management using retries and a circuit breaker.

#### **A. Smart Retries (Tenacity)**
Use the `tenacity` library to wrap all LLM calls in `llm_service.py`.
- **Strategy:** Exponential backoff with jitter.
- **Config:** `wait_exponential(multiplier=1, min=2, max=10)`, `stop_after_attempt(3)`.
- **Target Errors:** `google.api_core.exceptions.ResourceExhausted` (429) and transient `ServiceUnavailable` (503/504).

#### **B. Circuit Breaker**
A state-based circuit breaker to "fast-fail" when the API is consistently down.
- **Logic:** If 3 consecutive calls fail after retries, open the circuit for 60 seconds.
- **Behavior:** While "OPEN", all calls to `llm_service.py` functions return a custom `AIServiceUnavailableError` (mapped to HTTP 503) immediately without calling the Gemini API.
- **Self-Healing:** After 60 seconds, the circuit enters a "HALF-OPEN" state, allowing one trial call to pass through.

### 2. NestJS Orchestrator (User Feedback Layer)
The `orchestrator` (`/apps/orchestrator`) will translate technical status codes into human-readable messages.

#### **A. Error Mapping**
Update `DataEngineService` to catch specific HTTP status codes from the Python service:
- **429 (Too Many Requests):** Maps to `PlaylistError.AI_SERVICE_BUSY`.
- **503 (Service Unavailable / Circuit Open):** Maps to `PlaylistError.AI_SERVICE_BUSY`.

#### **B. Graceful Degradation**
Update `PlaylistService` and the global exception filter to return a specific 429/503 response to the frontend.
- **User Message:** `"The AI engine is currently at capacity. Please try again in a few moments."`

---

## Data Flow

```
User Request
  |
  v
NestJS Orchestrator
  |
  |-- 1. Call Python /recommend
  |   v
  |   Python Data Engine
  |     |
  |     |-- 2. Check Circuit Breaker (is OPEN?) --> Yes: Return 503
  |     |-- 3. Call Gemini API (via Tenacity)
  |     |     |-- Success: Return Result
  |     |     |-- 429/5xx: Retry with Backoff
  |     |     |-- Max Retries Hit: Update Circuit Breaker, Return 503/429
  |   v
  |-- 4. Catch 503/429
  |-- 5. Return Friendly Error to User
  v
User sees "AI is busy" message
```

---

## Implementation Details (Python)

### New Dependency
- `tenacity`: For declarative retry logic.

### `llm_service.py` Changes
- Implement a `CircuitBreaker` class (Singleton).
- Apply `@retry` decorators to `generate_audio_features`, `generate_playlist`, and `get_embedding`.
- Wrap the core API calls in a check for the circuit breaker state.

---

## Error Handling Mapping

| Python Status | NestJS Error Code | User Message |
|---|---|---|
| 429 | `AI_SERVICE_BUSY` | "AI engine at capacity. Try again in a minute." |
| 503 (Circuit Open) | `AI_SERVICE_BUSY` | "AI engine at capacity. Try again in a minute." |
| 500 (Other) | `INTERNAL_SERVER_ERROR` | "An unexpected error occurred." |

---

## Testing Strategy

### 1. Unit Tests (Python)
- **Mock Gemini Client:** Simulate 429 and 503 responses.
- **Verify Retries:** Assert that the client was called 3 times before failing.
- **Verify Circuit Breaker:** Call a failing mock 3 times, then assert that the 4th call fails immediately without calling the mock.

### 2. Integration Tests (NestJS)
- **Mock Data Engine:** Simulate 429/503 responses.
- **Verify Response:** Assert that the API returns the correct `AI_SERVICE_BUSY` error code and message.

---

## Self-Review

1. **Placeholder scan:** None. Exact strategies for retry and circuit breaker defined.
2. **Internal consistency:** Python layer handles technical resilience; NestJS handles UI translation.
3. **Scope check:** Focused strictly on Issue #25 (Error Handling Model Limit).
4. **Ambiguity check:** Defined specific 429/503 status codes and user messages.
