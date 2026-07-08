## 3.3. Implementation Details

This section describes the implementation of the system's core mechanisms: the multi-provider LLM abstraction, HyDE query expansion, the LangGraph generation workflow, the retrieval filtering logic, resilience infrastructure, the NestJS orchestration flow, and the contribution statistics computation.

### 3.3.1 Provider Abstraction Layer

All LLM functionality in the data engine is accessed through a typed abstraction layer rather than direct SDK calls. Four task-specific protocols are defined using Python's structural typing (runtime-checkable Protocol classes): EmbeddingProvider, TaggingProvider, DJProvider, and HyDEProvider. A dataclass container binds one concrete implementation to each slot:

    @dataclass
    class LLMProviderContainer:
        embedding: EmbeddingProvider
        tagging: TaggingProvider
        dj: DJProvider
        hyde: HyDEProvider

    @runtime_checkable
    class DJProvider(Protocol):
        def generate_playlist(
            self,
            event_description: str,
            context_songs: List[dict],
            count: int,
            rejected: List[str],
            anchor_artists: List[str],
        ) -> List[dict]: ...

A factory constructs the container from environment configuration. The global LLM_PROVIDER variable selects a preset, and per-task overrides (EMBEDDING_PROVIDER, TAGGING_PROVIDER, DJ_PROVIDER, HYDE_PROVIDER) always take precedence, so providers can be mixed per task without any code change:

| Preset | Embedding | Tagging | DJ | HyDE |
|---|---|---|---|---|
| gemini | Gemini (3072-dim) | Gemini Flash | Gemini Flash | Gemini Flash |
| college | all-minilm (384-dim) | gemma3:12b | gemma3:12b | gemma3:12b |
| nim | Gemini (3072-dim) | NIM Llama 70b | gemma3:12b | NIM Llama 70b |

The abstraction exists for three reasons. First, cost: expensive commercial calls can be reserved for tasks that need them while cheaper or locally hosted models (NVIDIA NIM, a college-hosted Ollama instance) handle the rest. Second, availability: when automatic failover is enabled, tagging, DJ generation, and HyDE expansion each fall back along the chain gemini, then nim, then college, with a per-task rolling-window circuit breaker deciding when a provider is skipped and when it is probed again after cooldown. Third, evolvability: swapping a model is a configuration change, not a refactor. One constraint is deliberate: the embedding provider must never change after songs are indexed, because Gemini produces 3072-dimensional vectors while the college model produces 384-dimensional vectors, and switching would force a full re-index.

### 3.3.2 HyDE Query Expansion

Event descriptions arrive as short, vague phrases such as "late night study session". Cosine similarity is most reliable when query and documents occupy the same semantic space, and a five-word phrase is not in the same space as the rich tag-plus-lyrics documents stored in the vector index. The system therefore applies HyDE (Hypothetical Document Embeddings): before retrieval, the HyDEProvider rewrites the event description into a synthetic song description — for example, "slow tempo, acoustic, introspective lyrics, low energy, sad mood, lo-fi, rainy night vibe". This hypothetical document resembles the indexed embedding texts, so its embedding lands close to genuinely matching songs, bridging the semantic gap between user intent and stored documents.

### 3.3.3 LangGraph Generation Workflow

Playlist generation is implemented as a LangGraph state machine built by the PlaylistGraphBuilder class. The graph contains four processing nodes — initial_fetch, validate, regenerate, and merge_and_shuffle — connected by a conditional routing function, should_finalize, that decides after each validation pass whether to finalize or loop:

    def should_finalize(self, state: PlaylistState) -> str:
        if len(state.validated_wildcards) >= state.target_wildcards:
            return "merge_and_shuffle"
        if state.attempts >= self.max_attempts:
            return "merge_and_shuffle"
        return "regenerate"

    def build(self):
        workflow = StateGraph(PlaylistState)
        workflow.add_node("initial_fetch", self.initial_fetch)
        workflow.add_node("validate", self.validate)
        workflow.add_node("regenerate", self.regenerate)
        workflow.add_node("merge_and_shuffle", self.merge_and_shuffle)
        workflow.add_edge(START, "initial_fetch")
        workflow.add_edge("initial_fetch", "validate")
        workflow.add_conditional_edges("validate", self.should_finalize)
        workflow.add_edge("regenerate", "validate")
        workflow.add_edge("merge_and_shuffle", END)
        return workflow.compile()

*[INSERT DIAGRAM HERE]*

The initial_fetch node retrieves candidate songs from the vector store, selects the strong spine (Section 3.3.4), and requests wildcard suggestions from the DJ provider. The validate node checks every candidate against the Spotify catalog concurrently (asyncio.gather over an injected uri_validator); accepted songs accumulate in validated_wildcards, failures in rejected_wildcards. When too few wildcards survive validation, the regenerate node asks the DJ for replacements and passes the rejected list back into the prompt so the model does not repeat suggestions that already failed. The loop is bounded by max_attempts (three by default). Finally, merge_and_shuffle combines spine and validated wildcards, deduplicates by normalized title and artist, trims any overflow beyond the target size, and shuffles so library and AI-generated songs are interleaved.

### 3.3.4 Strong Spine Selection and Dynamic Wildcard Targeting

Retrieved songs pass two different filters. The absolute quality gate, max_distance, is applied upstream by the vector store at retrieval time and discards songs semantically unrelated to the event. The spine filter applied in initial_fetch is deliberately relative: the embedding model packs real-text cosine distances into a narrow band (approximately 0.20–0.35), so a fixed absolute threshold is brittle — set slightly too low it excludes the entire library, slightly too high it admits every song. Instead, songs within strong_match_margin of the closest match for the current query form the strong spine:

    best_distance = retrieved[0].get("distance", 1.0)
    cutoff = best_distance + self.strong_match_margin
    strong_songs = [s for s in retrieved if s.get("distance", 1.0) <= cutoff]

    target_wildcards = max(
        self.min_wildcards,
        self.target_playlist_size - len(strong_songs),
    )

    spine_size = max(0, self.target_playlist_size - target_wildcards)
    spine_songs = strong_songs[:spine_size]

    requested_count = round(target_wildcards * self.overprovision_factor)

The wildcard target is dynamic: a library that fits the event well leaves little for the LLM to fill, while a weak fit shifts the load to generation, subject to a floor of min_wildcards. Because some suggestions always fail Spotify validation, the endpoint passes overprovision_factor=2.0, so the DJ is asked for twice the needed candidates on every generation call; this absorbs the roughly 50 percent under-delivery rate observed with the college model and avoids retry loops caused by too few candidates reaching the validator.

### 3.3.5 Resilience

All AI operations are wrapped by the with_resilience decorator (app/core/resilience.py), which layers two mechanisms. Retries use tenacity with exponential backoff (2 to 10 seconds, three attempts), triggered only for retryable failures: server errors, HTTP 429 quota errors, and transport-level exceptions. A thread-safe singleton circuit breaker sits above the retries — it opens after three consecutive failures, rejects calls immediately for a 60-second recovery window, then half-opens to probe:

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

Provider exceptions are mapped to typed errors (EmbeddingError, TaggingError, GenerationError) handled by FastAPI exception handlers, so upstream services receive structured failures rather than raw stack traces.

### 3.3.6 NestJS Orchestration Flow

The orchestrator's playlist.service.ts executes a five-step flow per generation request: (1) SpotifyService.getTopTracks fetches the user's top tracks from the Spotify API; (2) DataEngineService.getRecommendations posts to the data engine's /recommend endpoint and receives a list of songs, each flagged is_new when AI-suggested; (3) SpotifyService.searchTracks resolves the is_new songs to Spotify URIs, with searches issued in parallel; (4) SpotifyService.createPlaylist creates the playlist on the user's account; (5) SpotifyService.addTracksToPlaylist adds the resolved tracks. Songs whose URIs cannot be resolved are reported back as tracksNotFound rather than failing the request.

### 3.3.7 Contribution Statistics

Per-participant contribution statistics are computed entirely in the orchestrator (event.service.ts); the data engine returns only the song list and plays no part in this calculation. A taste vector is built for each participant by averaging the stored embeddings of that participant's songs (averageVectors). Each playlist track's embedding is then compared against every participant's taste vector using cosine similarity, and the top scorers are credited as that track's contributors:

    const scores = participantIds
      .map((participantId) => ({
        participantId,
        score: Math.max(
          0,
          cosineSimilarity(trackVector, tasteVectors.get(participantId) ?? null),
        ),
      }))
      .sort((a, b) => b.score - a.score);

    const topScore = scores[0]?.score ?? 0;
    const contributorIds =
      topScore <= 0
        ? []
        : scores
            .filter((item, index) => index < 2 || item.score >= topScore * 0.95)
            .slice(0, 3)
            .map((item) => item.participantId);

Per-track scores are normalized and accumulated per participant, then rounded so contribution percentages sum to exactly 100. An overall playlistMatchPercent is derived as the cosine similarity between the average of all participant taste vectors and the average of all playlist track vectors, clamped to [0, 1] and expressed as a percentage. These values drive the statistics display in the client.
