# AI Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a robust multi-layered error handling strategy using `tenacity` retries and a custom Circuit Breaker in Python, with graceful error mapping in NestJS.

**Architecture:** 
- Python: `CircuitBreaker` singleton + `@retry` decorators in `llm_service.py`.
- NestJS: `DataEngineService` catches 429/503 and maps to user-friendly messages via `PlaylistService`.

**Tech Stack:** Python (Tenacity, FastAPI), NestJS (Axios).

---

### Task 1: Python - Add Tenacity and Circuit Breaker

**Files:**
- Modify: `apps/data-engine/app/requirements.txt`
- Modify: `apps/data-engine/app/llm_service.py`

- [ ] **Step 1: Add tenacity to requirements.txt**
```text
google-genai
chromadb
python-dotenv
dotenv
fastapi
uvicorn
tenacity
```

- [ ] **Step 2: Install tenacity**
Run: `pip install tenacity`

- [ ] **Step 3: Implement CircuitBreaker and Retry Logic in llm_service.py**
```python
import time
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type
from google.api_core import exceptions

class CircuitBreaker:
    _instance = None
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(CircuitBreaker, cls).__new__(cls)
            cls._instance.state = "CLOSED"
            cls._instance.failure_count = 0
            cls._instance.last_failure_time = 0
            cls._instance.recovery_timeout = 60 # seconds
        return cls._instance

    def record_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= 3:
            self.state = "OPEN"
            print("Circuit Breaker OPENed!")

    def record_success(self):
        self.failure_count = 0
        self.state = "CLOSED"

    def is_open(self):
        if self.state == "OPEN":
            if time.time() - self.last_failure_time > self.recovery_timeout:
                self.state = "HALF-OPEN"
                return False
            return True
        return False

cb = CircuitBreaker()

class AIServiceUnavailableError(Exception):
    pass

# Decorator for LLM functions
def with_resilience(func):
    @retry(
        wait=wait_exponential(multiplier=1, min=2, max=10),
        stop=stop_after_attempt(3),
        retry=retry_if_exception_type((exceptions.ResourceExhausted, exceptions.ServiceUnavailable)),
        after=lambda retry_state: cb.record_failure() if retry_state.outcome.failed else cb.record_success()
    )
    def wrapper(*args, **kwargs):
        if cb.is_open():
            raise AIServiceUnavailableError("Circuit Breaker is OPEN")
        return func(*args, **kwargs)
    return wrapper
```
*(Apply `@with_resilience` to `generate_audio_features`, `generate_playlist`, and `get_embedding`)*

- [ ] **Step 4: Commit Python Changes**
```bash
git add apps/data-engine/app/requirements.txt apps/data-engine/app/llm_service.py
git commit -m "feat: add tenacity retries and circuit breaker to llm_service"
```

---

### Task 2: Python - Map Errors to HTTP Status Codes

**Files:**
- Modify: `apps/data-engine/app/server.py`

- [ ] **Step 1: Add exception handler for AIServiceUnavailableError**
```python
from llm_service import AIServiceUnavailableError

@app.exception_handler(AIServiceUnavailableError)
async def ai_service_unavailable_handler(request, exc):
    return JSONResponse(
        status_code=503,
        content={"detail": "AI Service currently unavailable (Circuit Breaker OPEN)"},
    )

@app.exception_handler(exceptions.ResourceExhausted)
async def resource_exhausted_handler(request, exc):
    return JSONResponse(
        status_code=429,
        content={"detail": "Gemini API Rate Limit Exceeded"},
    )
```

- [ ] **Step 2: Commit Python Server Changes**
```bash
git add apps/data-engine/app/server.py
git commit -m "feat: map resilience errors to HTTP 429/503 in data-engine"
```

---

### Task 3: NestJS - Graceful Error Handling

**Files:**
- Modify: `apps/orchestrator/src/modules/playlist/dto/playlist-response.dto.ts`
- Modify: `apps/orchestrator/src/modules/playlist/playlist.service.ts`
- Modify: `apps/orchestrator/src/modules/data-engine/data-engine.service.ts`

- [ ] **Step 1: Add new error code to playlist-response.dto.ts**
```typescript
export enum PlaylistError {
  // ... existing ...
  AI_SERVICE_BUSY = 'AI_SERVICE_BUSY',
}
```

- [ ] **Step 2: Catch errors in data-engine.service.ts**
```typescript
getRecommendations = async (eventDescription: string, topTracks: SimplifiedTrack[]): Promise<RecommendedSong[]> => {
  try {
    const { data } = await firstValueFrom(
      this.httpService.post<RecommendedSong[]>('/recommend', {
        event_description: eventDescription,
        songs: topTracks
      }),
    );
    return data;
  } catch (error) {
    if (error.response?.status === 429 || error.response?.status === 503) {
      throw new HttpException(
        { error: PlaylistError.AI_SERVICE_BUSY, message: 'The AI engine is currently busy. Please try again in a minute.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    throw error;
  }
};
```

- [ ] **Step 3: Commit NestJS Changes**
```bash
git add apps/orchestrator/src/modules/playlist/dto/playlist-response.dto.ts \
        apps/orchestrator/src/modules/playlist/playlist.service.ts \
        apps/orchestrator/src/modules/data-engine/data-engine.service.ts
git commit -m "feat: handle AI_SERVICE_BUSY in orchestrator"
```

---

### Task 4: Verification

- [ ] **Step 1: Write Python unit tests to verify retries and circuit breaker**
- [ ] **Step 2: Verify NestJS error mapping with mocked Python response**
- [ ] **Step 3: Commit Verification**
```bash
git add apps/data-engine/app/test_llm_service.py apps/orchestrator/test/ai-resilience.spec.ts
git commit -m "test: verify AI resilience strategy"
```
