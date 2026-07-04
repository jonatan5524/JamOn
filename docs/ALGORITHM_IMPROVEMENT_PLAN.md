# JamOn Algorithm Audit & Improvement Plan

> Source-level audit of the embedding + playlist-generation pipelines (2026-07-04).
> Scope: `apps/data-engine` (RAG, LangGraph workflow, providers, prompts, tuned params)
> and `apps/orchestrator` (resolution, validation, attribution).
> **Update (2026-07-04): Phase 1 and Phase 2 items are implemented, per owner decisions
> on which bugs were worth fixing (see status tags on each bug/item below). Phase 3
> (architectural) is still just a plan — nothing there has been built.**

---

## Step 1 — Current algorithms (as implemented)

### Embedding pipeline (`/ingest-batch`, `apps/data-engine/app/api/endpoints.py:150`)

- **What's embedded:** NOT raw lyrics. Each song is enriched (Genius lyrics snippet
  ≤800 chars + Last.fm tags in `app/services/enrichment.py`), then an LLM tagger
  produces a unified `embedding_text` — a 1–2 sentence vibe description
  (energy/mood/tempo/danceability/genre, no title/artist/lyrics).
  `build_embedding_text()` (`app/services/embedding_text.py`) uses that, falling back
  to a template of `energy_desc`/`mood_desc`/`vibe_tags`/`lyric_mood_tags`.
- **Active embedding model:** Gemini `gemini-embedding-2-preview`, 3072-dim,
  `RETRIEVAL_DOCUMENT`/`RETRIEVAL_QUERY` task types
  (`app/providers/llm/gemini/embedding.py`). Env: `EMBEDDING_PROVIDER=gemini`,
  `VECTOR_DB_PROVIDER=pgvector`. A 384-dim `all-minilm` "college" alternative exists.
- **Tagging model (configured):** `TAGGING_PROVIDER=nim` (`meta/llama-3.1-8b-instruct`),
  batches of 5, JSON-array output with fence-stripping. But see **B1** — failover mode
  actually routes tagging to Gemini 2.5 Flash first.
- **Storage:** vectors are returned to NestJS, which stores them on the shared
  `songs.embedding` pgvector column (`song.service.ts:updateEmbeddings`, matched by
  exact name+artist). The tags themselves are **discarded** (see **B2**).
- **HyDE** (`app/services/rag.py`): the event description is expanded by an LLM
  (`HYDE_PROVIDER=nim`, llama-3.1-8b — again overridden by failover to Gemini first)
  using `app/prompts/hyde_prompt.txt`, which asks for the "ideal song's"
  energy/mood/tempo/genre. The **entire raw LLM response** is embedded as the query
  vector. Both `hyde_prompt.txt` and `playlist_generation_prompt.txt` are
  optimizer-mutated artifacts (copies in `eval/optimized/`) containing
  pseudo-quantitative junk ("for low alignment (< 0.6) cases…").

### Playlist generation pipeline (`/recommend` → LangGraph in `app/workflows/playlist_generator.py`)

- **Query:** event `context` (fallback `title`) from Postgres → HyDE expansion →
  `embed_query` → pgvector cosine search (`<=>`) scoped to songs liked by the event's
  participants (`app/providers/vectordb/pgvector.py:42`), `LIMIT n_results`, then
  filter `distance <= max_distance`. Empty result returns `[]` deliberately
  (weak pool → generation-heavy playlist).
- **Merging across participants:** there is **no per-participant logic**. All
  participants' liked songs are pooled in one SQL `IN` subquery, and global top-N by
  distance wins. "Fairness" exists only as post-hoc attribution stats, not in
  generation.
- **Spine/wildcard split** (`initial_fetch`): results sorted by distance; "strong" =
  within `strong_match_margin` (0.10) of the best distance;
  `target_wildcards = max(3, 20 − strong)`; spine = closest `20 − target_wildcards`
  songs. Tuned params (`eval/optimized/params.json`: n_results=5, max_distance=0.8,
  target_wildcards=7) are scaled to a 20-song target → **n_results=8, wildcards≥12**
  in production.
- **Wildcards:** DJ LLM (`playlist_generation_prompt.txt`) gets event description,
  anchor artists (full participant-library artist set, seeded by the endpoint), spine
  context, and rejected list; asked for `count` new songs (2× overprovisioned).
  Validation = HTTP call per song to NestJS `/internal/spotify/validate` (Spotify
  search); invalid songs go to a rejected list fed back to the DJ; up to 3 attempts,
  then finalize regardless.
- **Finalize:** spine + validated wildcards, dedupe by lowercased title-artist, trim
  to 20 (spine-first), shuffle.
- **Resolution (NestJS `playlist.service.ts`):** each title/artist → Spotify search
  (limit 1) in chunks of 5, dedupe by URI, upsert songs, create playlist, add tracks;
  unresolved songs reported as `tracksNotFound`; unembedded new songs get
  background-ingested, then stats recalc.
- **Attribution (`event.service.ts:calculateStatisticsForEvent`):** per participant, a
  "taste vector" = mean of their liked-song embeddings. Per track: cosine(track, each
  taste vector), clipped ≥0; contribution percents = each participant's share of
  per-track normalized scores, summed and rounded to 100; per-track `contributorIds` =
  top-2 always plus anyone within 95% of top, capped at 3; `playlistMatchPercent` =
  cosine(mean taste vector, mean playlist vector).

---

## Step 2 — Bugs and weaknesses

### Logic bugs

**B1. ~~Failover silently discards per-task provider selection~~ — NOT A BUG, BY DESIGN**
`app/providers/llm/factory.py:140-165`: when `enable_failover` is true (default, and
true in `.env`), the tagging/DJ/HyDE providers are built solely from
`PROVIDER_FAILOVER_CHAIN` (`gemini,nim,college`) — everything's primary is Gemini,
per-task overrides (`DJ_PROVIDER=college`, `HYDE_PROVIDER=nim`, `TAGGING_PROVIDER=nim`)
only apply when failover is disabled. **Decision (2026-07-04): keep this behavior.**
Failover-first is the desired default; no fix planned for this item.

**B2. Vibe tags are never persisted, so the DJ gets no vibe context — HIGH — ✅ FIXED**
`/ingest-batch` returns only `{name, artist_name, embedding}` (`IngestedSong`), and
`PgVectorStore.query_songs` (pgvector.py:65-72) hardcodes `vibe_tags=[]`,
`energy_desc=""`, `mood_desc=""`. The DJ providers filter context down to
`title, artist, vibe_tags, energy_desc, mood_desc` — so with pgvector active, the DJ
only ever sees titles and artists. The CLAUDE.md contract ("pass vibe_tags of
retrieved songs") is broken; wildcard quality relies on the LLM's prior knowledge of
the tracks.

**B3. Retrieval capped at 8 candidates; playlist forced to ≥60% AI wildcards — HIGH — ✅ FIXED**
Tuned `n_results=5` was optimized for a 12-song playlist; `scale_params_to_target`
(`app/core/tuned_params.py:44`) scales it to 8 for the 20-song target. So even a
200-song, perfectly on-vibe group library contributes at most 8 tracks, and
`target_wildcards = max(3, 20−strong) ≥ 12` — the "library is the spine" intent is
inverted. Also, `tuned["target_wildcards"]` is scaled and then never used (the graph
derives its own target) — dead config that misleads tuning.

**B4. `max_distance` gate is dead — MEDIUM — DEFERRED (decision 2026-07-04: not must-fix)**
Tuned `max_distance=0.8` (default 0.7) vs the acknowledged real distance band of
~0.20–0.35 (comment in `playlist_generator.py:44`). The absolute gate never filters
anything, so the "weak pool → return [] → generation trigger" path in both vector
stores is unreachable. The only quality gate is the relative 0.10 margin off the best
hit — which is itself meaningless when the best hit is a bad match (a mismatched
query still yields a full "strong" cluster).

**B5. Contributor attribution always credits top 2 — MEDIUM — ✅ FIXED**
`event.service.ts` (`calculateStatisticsForEvent`):
`scores.filter((item, index) => index < 2 || item.score >= topScore * 0.95)`
unconditionally includes the second-ranked participant no matter how low their score.
Every track in a group event shows ≥2 contributors even when only one person's taste
explains it.

**B6. Track↔song row misalignment risk in resolution — MEDIUM — ✅ FIXED**
`playlist.service.ts:124-136` maps `resolvedTracks[index]` to `savedSongs[index]`,
but `upsertSongsFromTracks` **filters out** tracks whose row lookup failed
(`song.service.ts:72-74`). One missing row shifts every subsequent index → wrong
`songId` per track, and `song.id` on `undefined` throws. Should be keyed, not
positional.

**B7. LLM-echoed titles break embedding persistence — MEDIUM — ✅ FIXED**
In `/ingest-batch`, the returned `name`/`artist_name` come from the **tagger's JSON
output**, not the input. `updateEmbeddings` then matches by exact
`(name, artistName)`. Any LLM respelling ("Don't" → "Dont", feat. normalization,
casing) makes the update a silent no-op — the song stays unembedded forever and gets
re-ingested (re-scraped, re-tagged, re-embedded) on every subsequent playlist
generation. Same zip-by-index fragility if the tagger drops or reorders songs
relative to input.

**B8. Chroma store ignores `event_id` and is never populated — MEDIUM (latent) — DEFERRED (decision 2026-07-04: ignore)**
`ChromaVectorStore.query_songs` (chroma.py:90) takes `event_id` and never uses it —
retrieval spans every indexed song, violating participant scoping. Additionally the
in-process Chroma collection is never written by any API path (`add_songs` is only
called from eval code), so `VECTOR_DB_PROVIDER=chroma` yields permanently-empty
retrieval → silently all-wildcard playlists. It also uses `create_collection`
(crashes on name collision) and the `distances` fallback fabricates `max_distance`
values.

### Silent failure modes

**B9. Validator swallows outages and poisons the rejected list — HIGH — ✅ FIXED**
`app/services/validator.py` returns `False` on *any* exception (orchestrator down, 5s
timeout, auth failure). Consequence chain: all wildcards silently rejected → their
names are appended to `rejected_wildcards` → the DJ is instructed to *avoid these
perfectly fine songs* in retries → after 3 attempts you ship a spine-only (or, with
B3, near-empty) playlist. Infrastructure failure is indistinguishable from
"hallucinated song."

**B10. Wildcard flag depends on the LLM emitting `source` — LOW — DEFERRED (decision 2026-07-04: ignore)**
`is_new` (`endpoints.py:120`) and the library/AI split in `merge_and_shuffle` read
`song.get("source")`, which only exists if the model followed the prompt schema.
Nothing sets `source="new_suggestion"` in code on DJ output, and library songs never
get `source="user_library"` explicitly. Misreported provenance downstream.

**B11. Two overlapping circuit breakers — LOW — DEFERRED (decision 2026-07-04: ignore)**
`app/core/resilience.py` is a process-global singleton breaker shared by *all*
`@with_resilience` Gemini methods (embedding failures open the breaker for tagging,
etc.), sitting alongside the newer per-provider-per-task breakers in `failover.py`.
Confusing double accounting; the global one can 503 the whole service due to one
task's failures.

### Embedding-quality issues

**B12. HyDE output is embedded raw — MEDIUM — ✅ FIXED**
The full chat response (llama-8b or Gemini) — preamble ("Certainly! For a dinner
party…"), headers, numbered factor lists — is embedded verbatim. The document-side
texts are tight 1–2 sentence vibe strings; the query side is a long, chatty,
differently-shaped document. This asymmetry dilutes the query vector.

**B13. Optimizer-corrupted prompts — MEDIUM — ✅ FIXED**
Both production prompts contain unexecutable pseudo-metrics ("alignment score
(> 0.8)", "increase acceptance rate by 5% each iteration", "20% reduction in score")
that are noise at best and confuse smaller models (the active DJ chain includes
gemma3:12b and llama-8b) at worst. The DJ prompt also asks for "a clear and concise
description of the generated playlist" while demanding "RETURN ONLY A RAW JSON LIST"
— an internal contradiction that invites malformed output.

### Intent-vs-implementation mismatches

**B14. No fairness logic anywhere — HIGH (architectural) — DEFERRED (decision 2026-07-04: ignore for now)**
The product premise is "balancing musical fairness across all participants."
Generation-side, participants' libraries are pooled and globally ranked; one
participant with a large on-vibe library can supply the entire spine; anchor artists
are a flat dedup set (a user with 40 likes gets 40× the anchor weight of a user with
1). Fairness only exists as after-the-fact attribution *reporting*.

---

## Step 3 — Improvement plan (sequenced for handoff)

Each item is self-contained; do them in order.
⚙ = Python only · 🟨 = TypeScript only.

### Phase 1 — Correctness fixes (High)

**1. ~~Fix failover/per-task provider interaction~~ — SKIPPED (decision 2026-07-04)**
*(was B1)* Failover-first (Gemini primary for every task, per-task overrides only
applying with failover off) is the desired default, not a bug. No change planned.

**2. ⚙ Distinguish validator errors from rejections — HIGH — ✅ DONE** *(fixes B9)*
`app/services/validator.py` + `app/workflows/playlist_generator.py`: return a
tri-state (`valid` / `invalid` / `error`) instead of bool. In `validate()`, only
`invalid` goes to `rejected_wildcards`; `error` results are re-queued without
entering the DJ's avoid-list, and if *all* validations error in one batch, the graph
raises `ValidatorUnavailableError` → the endpoint returns 503 instead of shipping a
degraded playlist.
*Why:* transient orchestrator/Spotify outages currently masquerade as hallucinations
and poison retries.

**3. ⚙🟨 Persist and return vibe metadata — HIGH — ✅ DONE** *(fixes B2)*
`IngestedSong` (`app/models/api.py`) now carries `vibe_tags`/`energy_desc`/`mood_desc`,
populated in `ingest_batch` from the tagger output. NestJS `Song` entity gained
`vibeTags`/`energyDesc`/`moodDesc` columns (auto-migrated via TypeORM
`synchronize: true`), threaded through `CreateSongDto`, `DataEngineService.ingestBatch`,
and `SongService.updateEmbeddings`. `PgVectorStore.query_songs` now selects and returns
the real columns instead of hardcoding them empty.
*Why:* the DJ context and any future re-ranking are currently blind to the vibe data
the system spends LLM calls producing.
*Note:* retrieval/similarity search itself still runs purely on the embedding vector —
these fields are consumed downstream, filtered into `context_str` by every DJ provider
(`gemini/dj.py`, `nim/dj.py`, `college/dj.py`) when building the wildcard-generation
prompt.

**4. ⚙ Echo input identity through ingestion — HIGH — ✅ DONE (simplified)** *(fixes B7)*
Rather than id-based matching, `/ingest-batch` now builds `IngestedSong` from the
**input** title/artist (zipped positionally against `input_songs`, never the tagger's
echoed JSON), and hard-fails with a 500 if the tagger returns a mismatched song count
instead of zipping blindly. The tagging prompt (`audio_features_user.txt`) also now
explicitly instructs the model not to alter title/artist spelling, as defense in depth.
*Why:* kills the silent no-op embedding updates and the perpetual re-ingest loop.

**5. ⚙ Fix retrieval sizing — HIGH — ✅ DONE** *(fixes B3)*
`scale_params_to_target` (`app/core/tuned_params.py`) no longer scales `n_results`
proportionally to the tuned ratio; it now sets a generous fixed pool
(`max(30, 2×target_playlist_size)`) and drops the unused `target_wildcards` key
entirely. The strong-match margin + spine cap in `initial_fetch` do the real selection.
*Why:* an 8-candidate ceiling forces ≥12 wildcards regardless of library quality,
inverting the design intent.

**6. 🟨 Key resolution by identity, not index — HIGH — ✅ DONE** *(fixes B6)*
`playlist.service.ts`: `playlistTracks` is now built by looking up saved songs in a
`Map` keyed by normalized title+artist (`songKey`, exported from `song.service.ts`);
tracks whose row is missing are skipped and reported in `tracksNotFound` instead of
shifting every subsequent index.

### Phase 2 — Calibration & silent-failure cleanup (Medium)

**7. ⚙ Make the absolute quality gate real — MEDIUM — DEFERRED** *(fixes B4; not must-fix per 2026-07-04 decision)*
Recalibrate `max_distance` to the actual observed band (log distances; pick e.g.
best-distance + 0.15, or an absolute ~0.40 for the gemini space); store it per
embedding provider (0.8 is meaningless for a space whose worst matches sit at 0.35).
Add a "best match is still bad" check in `initial_fetch`: if `best_distance` exceeds
a per-provider sanity bound, treat the pool as weak (spine = ∅) instead of building a
strong cluster around a bad anchor.

**8. ⚙ Set `source` in code — LOW (do with #7) — DEFERRED** *(fixes B10; ignored per 2026-07-04 decision)*
In `playlist_generator.py`: stamp `source="new_suggestion"` on every DJ candidate
after generation and `source="user_library"` on retrieved songs; stop trusting the
LLM schema for provenance.

**9. 🟨 Fix contributor rule — MEDIUM — ✅ DONE** *(fixes B5)*
`event.service.ts`: replaced `index < 2 || score >= topScore*0.95` with a pure
relative rule — `score >= topScore * 0.85`, capped at 3 (top score is always index 0,
so this is always ≥1 when `topScore > 0`).

**10. ⚙ Clean the prompts — MEDIUM — ✅ DONE** *(fixes B13; pairs with #11)*
Stripped the pseudo-metric/iteration language from `hyde_prompt.txt` and
`playlist_generation_prompt.txt`. HyDE now asks for a single short paragraph in the
same register as `embedding_text` (energy → mood → tempo → danceability/acousticness
→ genre), explicitly "no preamble, no headings, ≤60 words". DJ prompt dropped the
self-iteration/alignment-score clauses and the "playlist description" instruction
that conflicted with JSON-only output.
*Not done:* `eval/optimized/` copies were left untouched — those are optimizer output
and should be regenerated by re-running the eval loop, not hand-edited.

**11. ⚙ Post-process HyDE output before embedding — MEDIUM — ✅ DONE** *(fixes B12)*
`RagEngine.query_songs` (`app/services/rag.py`) now runs the raw HyDE response
through `_clean_hyde_output()` — strips markdown/preamble/numbered-list lines and
truncates to ~2 sentences — before it's passed to `embed_query`.
*Not done:* the "embed both raw description and HyDE doc, average" hedge was not
implemented; the current fix is clean-then-embed only.

**12. ⚙ Retire the global circuit breaker — MEDIUM — DEFERRED** *(fixes B11; ignored per 2026-07-04 decision)*
Remove the singleton `CircuitBreaker` gate from `with_resilience` (keep the tenacity
retry), leaving breaker duty to the per-task/per-provider breakers in `failover.py`.
Keep `AIServiceUnavailableError` handling for the embedding path by giving embedding
its own named breaker.

**13. ⚙ Fix or fence the Chroma store — LOW — DEFERRED** *(fixes B8; ignored per 2026-07-04 decision)*
Either implement event scoping (store `event_id`/user metadata and filter) plus
`get_or_create_collection`, or explicitly mark `ChromaVectorStore` eval-only and make
`VECTOR_DB_PROVIDER=chroma` fail fast at startup in the API service.

### Phase 3 — Architectural improvements (beyond bugs) — NOT STARTED

**A. Fairness-aware retrieval and spine selection** *(addresses B14, deferred per
2026-07-04 decision — do after #5 if revisited; needs a short design pass first)*
- Retrieve per participant (one pgvector query per user, or one query returning
  `user_id`) and build the spine by round-robin over per-participant ranked lists
  (or maximal-marginal-relevance with a participant-coverage term), so each
  participant with *any* plausible match gets floor representation before anyone gets
  a second slot.
- Weight anchor artists per participant (top-k artists per user, deduped) instead of
  a flat set, so wildcard anchoring reflects the group, not the biggest library.
- Surface per-participant coverage in the response so the UI's fairness stats reflect
  an actual mechanism.

**B. Score-aware wildcard integration**
After validation, embed wildcard candidates' event-fit (embed a mini vibe doc per
wildcard, or re-embed "title by artist" + DJ-supplied tags) and rank wildcards by
distance to the query vector instead of accepting insertion order. Overprovisioning
(2×) already exists — currently the *first* validated N win, not the best N.

**C. Resolution-aware validation (dedupe two Spotify searches)**
The data-engine validates each wildcard via NestJS Spotify search, then NestJS
searches *again* for every track during resolution. Have the validation endpoint
return the URI and pass it through `/recommend`'s response, halving Spotify calls and
eliminating validate-passes/resolve-fails drift.

**D. Embedding-side improvements**
- Add genre/era anchors to `embedding_text` from Last.fm tags deterministically
  (append `Tags: {lastfm_tags}`) rather than relying solely on LLM paraphrase —
  improves cluster separation for genre-driven events.
- Consider re-embedding with `task_type=SEMANTIC_SIMILARITY` or
  normalizing/whitening stored vectors: the acknowledged "narrow band" (0.20–0.35)
  suggests typical embedding anisotropy; even simple centering of the library vectors
  would widen usable distance contrast and make absolute gates viable.

**E. Eval-loop hygiene**
The optimizer currently tunes `n_results`/`target_wildcards` at a 12-song scale and
mutates prompts into pseudo-metric noise. Pin the eval to the production playlist
size, add a prompt-lint step (reject prompts containing numeric self-iteration
instructions), and add a regression assertion that library share ≥ X% when the seed
library is on-vibe.

---

## Handoff order (one task at a time, junior-model friendly)

| Order | Item | Area | Priority | Status |
|-------|------|------|----------|--------|
| 1 | ~~#1 Failover per-task chains~~ | — | Skipped (by design) | Skipped |
| 2 | #2 Tri-state validator | Python | High | ✅ Done |
| 3 | #4 Input-identity ingestion | Python | High | ✅ Done |
| 4 | #6 Keyed resolution mapping | TypeScript | High | ✅ Done |
| 5 | #3 Persist vibe metadata | Python + TS | High | ✅ Done |
| 6 | #5 Retrieval sizing | Python | High | ✅ Done |
| 7 | #7 + #8 Distance gate + `source` stamping | Python | Medium | Deferred (not must-fix / ignored) |
| 8 | #9 Contributor rule | TypeScript | Medium | ✅ Done |
| 9 | #10 + #11 Prompt cleanup + HyDE post-processing | Python | Medium | ✅ Done |
| 10 | #12 Retire global breaker | Python | Medium | Deferred (ignored) |
| 11 | #13 Chroma fence | Python | Low | Deferred (ignored) |
| 12 | Phase 3 A–E | Both | Design-first | Not started |
