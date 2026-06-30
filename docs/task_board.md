# JamOn Project Book — Task Board

**Generated:** 2026-06-25  
**Target:** 50–70 pages (~17,500–24,500 words)  
**Format:** Colman CS degree project book, IEEE [N] citations  
**Team:** daphna, jonatan, noam, dedi, yuval, liav  
**Supervisor:** Dr. Eliav Menachi

> **"MED" throughout this board** = the reference project book at `project-books/Example of a Project Book.pdf`. Cited page/section numbers (e.g. "MED §1.5 p.9") refer to that PDF.
>
> **⚠ Source-of-truth note for all eval/scoring cards:** `apps/data-engine/eval/README.md` is **stale** on the scoring formula — it shows `0.5·alignment + 0.3·acceptance + 0.2·relevance` and a Gemini judge. The **authoritative source is the code**: `eval/scorer.py::compute_composite` (`0.45·alignment + 0.25·acceptance + 0.15·relevance + 0.15·size_fulfillment`), `eval/eval_loop.py:250` (partial = `0.20·acceptance + 0.15·relevance + 0.15·size`), and the judge is **NIM Llama-3.3-70b** (`scorer.py:117`). The main `README.md` scoring table and this board are correct; do not copy formulas from `eval/README.md`.
>
> Similarly, the main README RAG diagram shows illustrative `max_distance=0.7` and `overprovision≈1.4–1.5`; **production** uses `max_distance=0.8` (`eval/optimized/params.json`) and `overprovision_factor=2.0` (`app/api/endpoints.py:93`). Use the production values.

---

## CRITICAL AUDIT OF CURRENT DRAFT

> Before any writing, be aware: **the current `JamOn_Final_Project_Book.docx` is severely outdated and largely wrong.** It describes the old architecture from the project proposal — not the system that was actually built. Do NOT copy from it. Key discrepancies:
>
> - **Architecture described**: Spotify audio features API, per-user average vectors, "User Vectors" centroid. **Actual system**: LLM text-ification replaces audio features; pgvector is used **in production** (ChromaDB is local-dev only); no per-user vector averaging; single shared indexed library per event; HyDE + LangGraph inference workflow.
> - **Objectives listed**: "Audio Features extraction", multi-user vector intersection queries — these do not exist. However, "Real-Time Contribution Statistics" **does** exist — `TasteContributionsCard.tsx` shows per-participant percentage bars and `EventStatistics` exposes `playlistMatchPercent` + per-track `contributorIds`.
> - **Table of Abbreviations**: filled with placeholder nonsense (AB, AFSE, AO, ARP) — must be replaced.
> - **Date on cover**: July 2023 — must be updated to submission year.
> - **Literature Review**: cites Spotify Audio Features API, which is now **deprecated** and explicitly forbidden in `CLAUDE.md`. This section must be rewritten around RAG, LLMs, HyDE, and vector search.
> - **All of Ch4 Results, Evaluation Metrics, and Conclusion**: pure template placeholders — fully empty.
> - **Executive Summary**: blank (`[Provide a concise summary...]`).
>
> **The document is a skeleton. Almost every section needs a complete rewrite, not just edits.**

---

## WHAT WE BUILT — Quick Reference for Writers

**System name:** JamOn  
**Purpose:** Generates event-specific Spotify playlists by indexing a user's library as semantic text embeddings (LLM vibe tags + lyrics) and retrieving + AI-filling matches for any event description.  
**Core innovation:** "Text-ification" RAG — deprecated Spotify audio features replaced by Gemini-generated descriptive tags (`energy_desc`, `mood_desc`, `vibe_tags`).  

**Three services:**
- **Client** — React 18 + Vite + TanStack Query + Tailwind CSS (`:5173`)
- **Orchestrator** — NestJS TypeScript (`:3000`): Spotify OAuth, top-50 tracks fetch, playlist creation, contribution statistics
- **Data Engine** — FastAPI Python (`:8000`): enrichment, LLM tagging, pgvector indexing (ChromaDB for local dev), HyDE + LangGraph inference

**RAG inference flow (7 steps):** HyDE expansion → vector search with `max_distance` gate → strong spine identification (relative `strong_match_margin`) → dynamic wildcard target → LLM DJ over-provisioned generation → LangGraph validate/retry loop → merge & shuffle.

**Eval harness (2 phases):** Phase 1 = 81-combination grid search on 4 retrieval params (no LLM judge). Phase 2 = prompt hill-climbing with NIM Llama-70b as judge. Latest run best composite: **0.8027** (train), **0.6872** (holdout). Gap: 0.1155 — slightly above the 0.10 warning threshold.

**Multi-provider system:** Gemini (3072-dim embeddings), NIM (Llama-70b tagging/HyDE), College/Ollama (gemma3:12b local DJ). Mixing providers per task reduces API cost.

---

## TASK CARDS

---

### Task: Cover Page + Front Matter
**Suggested ARS command:** manual  
**Codebase references:** N/A — administrative  
**Content requirements:** Project title, team names, supervisor name, institution, date, GitHub link. Colman format: centered, formal. See MED example p.1 for exact layout.  
**Key questions to answer:**
- What is the official submission date?
- Is the supervisor name correct? (Current draft says "Dr. Eliav Menachi")
- Are all 6 team member names spelled correctly? (yuval tanami, yehonatan ezron, daphne friedler, liav morad, noam guy, dedi laniado)
- Should the GitHub repo link appear on the cover?

**Code/diagrams needed:** No — JamOn logo/icon if available  
**Est. word count:** ~50 words  
**Must be written after:** Nothing — do first  
**Google Doc heading:** `JamOn` / `Cover`  
**Assignee:**

---

### Task: Acknowledgments
**Suggested ARS command:** manual  
**Codebase references:** N/A  
**Content requirements:** 1–2 paragraphs. Thank the faculty, supervisor, and families. See MED example p.2 for tone and length. Do NOT leave the placeholder text from the current draft.  
**Key questions to answer:**
- Any specific faculty members or external people who helped (beyond Dr. Menachi)?
- Any external APIs/companies whose free tiers were critical (Genius, Last.fm, NIM)?

**Code/diagrams needed:** No  
**Est. word count:** ~150 words  
**Must be written after:** Cover  
**Google Doc heading:** `Acknowledgments`  
**Assignee:**

---

### Task: Executive Summary
**Suggested ARS command:** manual (write LAST — after all chapters done)  
**Codebase references:** CLAUDE.md §1–6, README.md (main)  
**Content requirements:** Exactly 250–300 words. Must cover: (1) what the system does, (2) methodology (RAG + LLM tagging), (3) key technical innovation (text-ification replacing audio features), (4) evaluation results (cite actual numbers: 0.80 composite, 0.69 holdout). No bullet points — flowing paragraphs like MED example p.3.  
**Key questions to answer:**
- What is the one-sentence "so what" — why is this approach better than Spotify DJ or manual playlists?
- What are the 2–3 most impressive results to highlight?
- Is there a demo / live deployment to reference?

**Code/diagrams needed:** No  
**Est. word count:** 250–300 words (strict)  
**Must be written after:** ALL chapters complete  
**Google Doc heading:** `Executive Summary`  
**Assignee:**

---

### Task: Table of Contents / Abbreviations / Figures
**Suggested ARS command:** manual  
**Codebase references:** N/A  
**Content requirements:**
- TOC: auto-generate from headings in Google Doc. Verify page numbers match.
- **Table of Abbreviations: MUST be completely rewritten.** Current draft has wrong placeholders. Actual abbreviations to define: RAG (Retrieval-Augmented Generation), LLM (Large Language Model), HyDE (Hypothetical Document Embeddings), API (Application Programming Interface), OAuth, JWT, QR, NLP (Natural Language Processing), REST, NIM (NVIDIA Inference Microservices), DJ (used as shorthand for the playlist-generation agent), ChromaDB.
- Table of Figures: list all architecture diagrams and screenshots with figure numbers.

**Code/diagrams needed:** No  
**Est. word count:** ~300 words (abbreviations table)  
**Must be written after:** All chapters (so all figures are known)  
**Google Doc heading:** `Table of Contents` / `Table of Abbreviations` / `Table of Figures`  
**Assignee:**

---

### Task: Ch.1.1 — Background
**Suggested ARS command:** manual  
**Codebase references:** CLAUDE.md §1, README.md opening paragraph, current draft Background section (partially salvageable)  
**Content requirements:** 2–3 paragraphs covering: (1) the social context — group music at gatherings is a friction point, (2) the state of playlist tech (Spotify DJ is single-user, Spotify Jam is dumb queue), (3) the gap — no system uses semantic natural language + personal library RAG together. Mirror MED §1.1 depth (~300–400 words).  
**Key questions to answer:**
- What market/social trend motivates this? (streaming growth, social gatherings, multi-user listening)
- Has any team member experienced the "music at a party" problem personally — can we cite it?
- Are Spotify Jam or Apple SharePlay worth naming as inadequate prior art?

**Code/diagrams needed:** No  
**Est. word count:** ~350 words  
**Must be written after:** Nothing  
**Google Doc heading:** `1.1. Background`  
**Assignee:**

---

### Task: Ch.1.2 — Problem Statement
**Suggested ARS command:** manual  
**Codebase references:** CLAUDE.md §1, current draft Problem Statement (rewrite needed — it describes the old solution, not the problem)  
**Content requirements:** 1–2 paragraphs stating the specific problem cleanly: existing tools either ignore personal taste (Spotify DJ) or lack semantic event context (Spotify Jam queue). No solution converts a natural-language event description + personal listening library into a contextually relevant playlist. Do NOT describe the solution here.  
**Key questions to answer:**
- What specifically is wrong with "dictatorship" playlists or random Spotify DJ suggestions?
- Can you quantify the problem? (e.g., average event has N participants with diverse tastes)
- Is there a published study on music preference conflicts in groups to cite?

**Code/diagrams needed:** No  
**Est. word count:** ~200 words  
**Must be written after:** Ch.1.1  
**Google Doc heading:** `1.2. Problem Statement`  
**Assignee:**

---

### Task: Ch.1.3 — Objectives
**Suggested ARS command:** manual  
**Codebase references:** CLAUDE.md §3 (pipelines), README.md (RAG Pipeline section)  
**Content requirements:** Numbered list of 5–7 concrete, achieved objectives. **CRITICAL: The current draft's objectives are from the OLD proposal and do NOT match the real system.** Rewrite entirely based on what was actually built:
1. Build a semantic indexing pipeline (LLM tagging replaces audio features)
2. Implement HyDE-based query expansion for vague event descriptions
3. Build a LangGraph agentic workflow for playlist generation + validation
4. Support multi-provider LLM backends (Gemini, NIM, College/Ollama)
5. Build an automated eval harness for RAG parameter optimization
6. Create an end-to-end web app (React → NestJS → FastAPI → Spotify)

**Key questions to answer:**
- Which objectives were fully achieved vs. partially achieved?
- Multi-user end-to-end: ✅ **RESOLVED (Q4)** — fully implemented. Known open issue: Spotify OAuth dev mode caps 1 Client ID at 5 users; per-user Client ID mapping not yet resolved. Frame as "achieved, with a documented OAuth limitation."
- Is QR-code based event joining fully working?
- Contribution statistics: ✅ **RESOLVED (Q3)** — fully wired. The **orchestrator** computes everything (`event.service.ts`, `event-statistics.types.ts`): per-participant cosine similarity (`averageVectors`) vs each track vector → `contributorIds` per track + overall `playlistMatchPercent`. The data engine returns the song list only; it does **not** return `contributorIds`. Do not describe the data engine as involved in scoring.

**Code/diagrams needed:** No  
**Est. word count:** ~300 words  
**Must be written after:** Ch.1.1, Ch.1.2  
**Google Doc heading:** `1.3. Objectives`  
**Assignee:**

---

### Task: Ch.1.4 — Scope and Limitations
**Suggested ARS command:** manual  
**Codebase references:** CLAUDE.md §4 (API contracts), README.md (Provider Modes table), eval README  
**Content requirements:** 2 paragraphs. Scope: what is included (single-user library + event description → playlist; 3 provider modes; eval harness). Limitations: (1) Spotify Developer mode restricts API to 25 approved users, (2) lyrics scraping may fail for some songs (graceful fallback to tags-only), (3) embedding provider cannot be changed after indexing without full re-index, (4) eval uses mock library of 20 songs, not real user data by default, (5) prompt files from eval must be manually promoted to production.  
**Key questions to answer:**
- Multi-user: ✅ **RESOLVED (Q4)** — implemented; the only limitation to list here is the Spotify dev-mode 5-user-per-Client-ID cap.
- What languages/markets does Genius cover? Any non-English limitations?
- Is there a rate limit that affects real-world usage?

**Code/diagrams needed:** No  
**Est. word count:** ~300 words  
**Must be written after:** Ch.1.3  
**Google Doc heading:** `1.4. Scope and Limitations`  
**Assignee:**

---

### Task: Ch.1.5 — Methodology
**Suggested ARS command:** manual  
**Codebase references:** CLAUDE.md §3 (both pipelines), README.md (eval section)  
**Content requirements:** High-level ordered steps of how the project was developed (not the system flow — the development process). E.g.: (1) Literature review → (2) System design → (3) Indexing pipeline → (4) Inference pipeline → (5) Multi-provider abstraction → (6) Eval harness → (7) Frontend. See MED §1.5 for style. **The current draft describes the old work plan stages — rewrite entirely.**  
**Key questions to answer:**
- In what order did the team build things? What was built first?
- Was there a period when pgvector was used and then switched to ChromaDB? (Note: pgvector = production, Chroma = local-dev/eval — they coexist, not a switch.)
- Development methodology: ✅ **RESOLVED (Q7)** — **2-week sprints** (sprint start = backlog planning; sprint end = internal team review + supervisor meeting).

**Code/diagrams needed:** No  
**Est. word count:** ~250 words  
**Must be written after:** Ch.1.3  
**Google Doc heading:** `1.5. Methodology`  
**Assignee:**

---

### Task: Ch.1.6 — Organization of the Project Book
**Suggested ARS command:** manual  
**Codebase references:** N/A  
**Content requirements:** Bulleted list of chapters with 1-sentence descriptions. Mirror MED §1.6 p.9 exactly. Write last among the Ch1 tasks.  
**Code/diagrams needed:** No  
**Est. word count:** ~150 words  
**Must be written after:** All Ch1 sections  
**Google Doc heading:** `1.6. Organization of the Project Book`  
**Assignee:**

---

### Task: Ch.2.1 — Literature Review: Relevant Literature
**Suggested ARS command:** /ars-lit-review  
**Codebase references:** README.md (Key Parameters table, HyDE rationale, eval metrics), CLAUDE.md §1 (core concept)  
**Content requirements:** This is the largest section. Cover the following topic clusters with proper IEEE [N] citations for each. **Do NOT cite Spotify Audio Features API — it is deprecated and our system explicitly does not use it.**

Topics to cover:
1. **Retrieval-Augmented Generation (RAG)** — foundational paper (Lewis et al. 2020), application to recommendation systems
2. **HyDE — Hypothetical Document Embeddings** — Gao et al. 2022 original paper; why short queries fail cosine similarity; how synthetic docs bridge the gap
3. **Text embeddings for music** — "text-ification" as a concept; semantic music understanding without audio features
4. **LLM-based tagging/annotation** — using LLMs to generate structured metadata (energy, mood, vibe) from artist/genre context
5. **LangGraph and agentic workflows** — AI agent loops for generation + validation
6. **Vector databases (ChromaDB, pgvector)** — cosine similarity search; HNSW indexing
7. **Music Recommendation Systems** — collaborative filtering, content-based, hybrid; why existing systems fail for group/event contexts
8. **Group recommendation systems** — aggregation strategies (least misery, average, social welfare); how JamOn differs (no aggregation — one shared library)
9. **Prompt optimization / auto-tuning** — hill-climbing, DSPy, related approaches
10. **Spotify API ecosystem** — OAuth 2.0, top tracks endpoint; what is and isn't available

See MED's Literature Review (pp. 10–27) for expected depth per topic: 2–4 paragraphs each.  
**Key questions to answer:**
- Which paper first proposed HyDE? (Gao et al. 2022 — "Precise Zero-Shot Dense Retrieval without Relevance Labels")
- Is there prior work on LLM-generated music metadata to cite?
- Are there papers on cosine distance clustering in text embedding spaces that support our `strong_match_margin` design decision?
- What is the best citation for "Spotify's audio features are deprecated" to legitimize our design choice?

**Code/diagrams needed:** No (though a comparison table of related systems at the end is optional)  
**Est. word count:** ~2,500–3,500 words  
**Must be written after:** Ch.1 complete  
**Google Doc heading:** `2.1. Relevant Literature`  
**Assignee:**

---

### Task: Ch.3.1 — System Architecture
**Suggested ARS command:** manual  
**Codebase references:** README.md (Architecture ASCII diagrams), CLAUDE.md §2 (Tech Stack), orchestrator README, data-engine README  
**Content requirements:** This is the most diagram-heavy section. Describe the three-tier architecture (Client → Orchestrator → Data Engine). **Completely rewrite the current draft — it describes the old system.**

Required diagrams:
1. **High-level system architecture diagram** — the three-service box diagram from README.md, redrawn as a proper labeled figure (Figure 1 in the book)
2. **Indexing pipeline diagram** — EnrichedSong flow: Spotify genres → Genius lyrics → Last.fm tags → LLM tagging → embedding → ChromaDB
3. **Inference pipeline (7-step RAG flow)** — the detailed step-by-step from README.md with HyDE, max_distance gate, spine identification, dynamic wildcards, LangGraph retry loop

Written narrative: explain each service's responsibility, the REST API between them, the internal module structure. Reference the actual endpoint: `POST /recommend` body/response schema.

**Key questions to answer:**
- Docker Compose: ✅ **RESOLVED (Q6)** — `docker-compose.yml` orchestrates all 3 services + nginx/SSL (port 443). PostgreSQL runs **on the host** (not a container), reached via `host.docker.internal`. Data-engine has `ORCHESTRATOR_URL` to call back for Spotify URI validation in production.
- What database is used in production — ChromaDB local or pgvector? Is pgvector still supported? (Resolved Q2: pgvector = production, Chroma = local-dev only.)
- Does the Client communicate directly with the Orchestrator only, or also with Data Engine?

**Code/diagrams needed:** YES — 3 architecture diagrams required (redraw from README ASCII art as proper figures)  
**Est. word count:** ~800 words (plus diagrams)  
**Must be written after:** Nothing (but block all other Ch3 sections)  
**Google Doc heading:** `3.1. System Architecture`  
**Assignee:**

---

### Task: Ch.3.2 — Data Collection and Preprocessing
**Suggested ARS command:** manual  
**Codebase references:** data-engine README (Indexing Pipeline section), `apps/data-engine/app/services/enrichment.py`, `lyrics.py`, `lastfm.py`  
**Content requirements:** Describe the enrichment pipeline end-to-end:
1. Spotify top-tracks fetch (top 50 tracks via `GET /v1/me/top/tracks`)
2. Concurrent enrichment: Genius lyrics + Last.fm top-8 community tags (via `asyncio.gather`)
3. Lyrics fallback: if Genius fails → embedding uses tags-only (no crash)
4. LLM tagging step: what prompt is sent to Gemini Flash, what JSON it returns (`energy_desc`, `mood_desc`, `vibe_tags`, `embedding_text`)
5. Embedding: how the `embedding_text` string is constructed and vectorized
6. ChromaDB storage: collection naming, dimension handling (3072-dim Gemini vs 384-dim College)

**The current draft describes audio features preprocessing — completely discard it.**  
**Key questions to answer:**
- What is the exact format of `embedding_text`? Show a real example from a real song.
- Are lyrics cached between requests to avoid re-scraping?
- Is pgvector the production default and ChromaDB strictly for local dev? (Confirmed yes by team — verify in `VECTOR_DB_PROVIDER` env docs)

**Code/diagrams needed:** Yes — show the enrichment pipeline as a figure (reuse/adapt the data-engine README diagram); include a short code snippet of the embedding_text construction  
**Est. word count:** ~600 words  
**Must be written after:** Ch.3.1  
**Google Doc heading:** `3.2. Data Collection and Preprocessing`  
**Assignee:**

---

### Task: Ch.3.3 — Implementation Details
**Suggested ARS command:** manual  
**Codebase references:** orchestrator README (module structure), data-engine README (provider system, LangGraph), `apps/data-engine/app/workflows/playlist_generator.py`, `apps/data-engine/app/providers/`, `apps/data-engine/app/core/resilience.py`  
**Content requirements:** The deepest technical section. Cover:

1. **Provider abstraction** — `LLMProviderContainer` with 4 typed protocol slots (EmbeddingProvider, TaggingProvider, DJProvider, HyDEProvider). Include the provider mode table (gemini/college/nim). Explain why the abstraction exists: cost, availability, switching without code changes.
2. **HyDE implementation** — how a short event description ("late night study") is expanded into a rich synthetic document ("Slow tempo, acoustic, introspective lyrics..."); why this bridges the semantic gap.
3. **LangGraph workflow** — the 5-node graph: `initial_fetch` → `validate` → `should_finalize` → `regenerate`/`merge_and_shuffle`. Include the graph diagram from README.md as a figure.
4. **Strong spine logic** — explain the relative margin (`best_distance + strong_match_margin`) vs. why absolute thresholds fail for text embeddings (narrow 0.20–0.35 band).
5. **Dynamic wildcard target** — `max(min_wildcards, playlist_size - spine_size)`, with over-provisioning factor (2.0×).
6. **Resilience** — circuit breaker + exponential backoff via `@with_resilience` decorator.
7. **NestJS orchestration** — the 5-step playlist.service.ts flow: getTopTracks → POST /recommend → searchTracks (parallel) → createPlaylist → addTracks.
8. **Contribution statistics** — computed entirely in the orchestrator: `averageVectors` per participant × track vector → `cosineSimilarity` score → `contributorIds` per track + overall `playlistMatchPercent`. The data-engine has no involvement in this calculation.
9. **Code snippets**: include 3–5 short snippets (10–20 lines each) for the most novel parts (e.g., strong spine filter logic, LangGraph node definition, provider factory).

**Code/diagrams needed:** YES — LangGraph workflow diagram (Figure); 3–5 code snippets required by Colman  
**Est. word count:** ~1,200–1,500 words  
**Must be written after:** Ch.3.2  
**Google Doc heading:** `3.3. Implementation Details`  
**Assignee:**

---

### Task: Ch.3.3b — CI/CD Pipeline & Deployment
**Suggested ARS command:** manual  
**Codebase references:** `.github/workflows/ci-cd.yml`, `docs/cicd-setup.md`, `docker-compose.yml`  
**Content requirements:** Document the full deployment pipeline. This is a genuine engineering contribution worth a dedicated sub-section (or a substantial sub-point within Ch.3.3). It demonstrates infrastructure thinking beyond just application code.

Cover:
1. **Pipeline overview** — triggered on every push to `main` (plus manual `workflow_dispatch`). Two-stage design: build → deploy.
2. **Build stage (3 parallel jobs, GitHub-hosted runners)** — each service (client, orchestrator, data-engine) is built as a Docker image in parallel on `ubuntu-latest` and pushed to **GitHub Container Registry (ghcr.io)**. Docker layer caching (`type=gha`) is used per-service to speed up subsequent builds.
3. **The key design decision — why builds are NOT on the college server**: the college VM has a 3.6 GB disk constraint. Running `npm ci` or `pip install` during a build would fill the disk. Instead, GitHub builds and compresses the images; the server only pulls and runs the final compressed layers. This is an explicit resource constraint tradeoff.
4. **Self-hosted runner (label: `colman`)** — registered on the college server. Handles ONLY the `deploy` job, which runs after all 3 builds succeed (`needs: [build-client, build-orchestrator, build-data-engine]`). The runner is installed as a system service to survive reboots.
5. **Deploy job steps**: pull all 3 images from ghcr.io → `docker compose up -d --remove-orphans` → health-check polling (120s timeout, fails loudly with container logs) → image prune.
6. **Concurrency control** — `cancel-in-progress: false` ensures a second push to `main` queues behind the first rather than racing on the single `colman` runner mid-deploy.
7. **Production architecture** — nginx (port 443, self-signed SSL) serves the React SPA and reverse-proxies `/api/`, `/playlists/`, `/docs` to the orchestrator. Orchestrator and data-engine have no published ports — internal-only within the Docker Compose network. PostgreSQL runs natively on the host (not dockerized), accessed via `host.docker.internal`.
8. **Secret management** — sensitive credentials (API keys, JWT secret, DB password) stored as GitHub Secrets; non-sensitive config (URLs, model names, provider flags) as GitHub Variables. Zero secrets in code or docker-compose.yml.

Include the pipeline flow as a diagram (Figure):
```
push to main
  ├── [ubuntu-latest] Build & Push Client     ─┐
  ├── [ubuntu-latest] Build & Push Orchestrator ├─→ [colman] Deploy
  └── [ubuntu-latest] Build & Push Data Engine ─┘
```

**Key questions to answer:**
- Was setting up the self-hosted runner on the college server difficult? Any notable obstacles? (worth 1 sentence in the book)
- Is there a CI step that runs tests before building? (From the workflow: no separate test job — tests are not gated in CI. Worth noting as a limitation or future work.)

**Code/diagrams needed:** YES — pipeline flow diagram (Figure); optionally a short snippet of the health-check polling loop from the workflow  
**Est. word count:** ~500–700 words  
**Must be written after:** Ch.3.1  
**Google Doc heading:** `3.3. Implementation Details` (as a numbered sub-point) or `3.5. Deployment & CI/CD Pipeline` if the supervisor allows an extra section  
**Assignee:**

---

### Task: Ch.3.4 — Evaluation Metrics
**Suggested ARS command:** manual  
**Codebase references:** README.md (Eval & Auto-Improvement Loop, Scoring Metrics table), eval/README.md (full scoring breakdown)  
**Content requirements:** Define all metrics used to evaluate the system **before** showing results. The current draft has a placeholder — write it properly.

> ⚠ **Use `eval/scorer.py` + `eval/eval_loop.py:250` as the source — NOT `eval/README.md`.** The eval README's scoring section is stale (it shows `0.5/0.3/0.2` weights, omits `size_fulfillment`, and calls the judge "Gemini"). The numbers below are verified against the code.

Metrics to define:
1. **`alignment`** (45% weight in Phase 2) — **NIM Llama-3.3-70b** as judge (`scorer.py:117`, `settings.NIM_TAGGING_MODEL`), rates 0–10, normalized. Explain why subjective quality needs an LLM judge.
2. **`acceptance_rate`** (25%) — `validated_wildcards / target_wildcards`. Why this matters: DJ hallucination rate.
3. **`retrieval_relevance`** (15%) — `(1 − mean_cosine_distance) × recall`. Precision × recall product; why each penalizes different failure modes.
4. **`size_fulfillment`** (15%) — `final_size / target_size`. Guards against configs that produce tiny but "perfect" playlists.
5. **Partial composite (Phase 1)** = `0.20·acceptance + 0.15·relevance + 0.15·size` (max 0.5, no judge) vs. **Full composite (Phase 2)** = `0.45·alignment + 0.25·acceptance + 0.15·relevance + 0.15·size` (max 1.0) — explain why the judge is excluded from Phase 1 (81× API calls too expensive).
6. **Stub Spotify validator** — MD5 hash-based 30% rejection rate; why this is necessary for meaningful `acceptance_rate` signal in eval.

**Key questions to answer:**
- Were there any user-facing subjective evaluations (surveys, user testing)? [NEEDS INPUT FROM TEAM]
- Is there a formal definition of "playlist quality" from the literature to anchor the 0–10 scale?

**Code/diagrams needed:** Optional — scoring formula table (reuse from README)  
**Est. word count:** ~500 words  
**Must be written after:** Ch.3.3  
**Google Doc heading:** `3.4. Evaluation Metrics`  
**Assignee:**

---

### Task: Ch.4.1 — Experimental Setup
**Suggested ARS command:** manual  
**Codebase references:** eval/README.md (full), `eval/runner.py` (MOCK_SONGS, RunConfig), `eval/event_generator.py` (training + holdout events)  
**Content requirements:** Describe the complete eval harness setup. Currently a template placeholder.

Include:
1. **Indexed library**: ✅ **RESOLVED (Q9)** — the reported runs used **real songs from a real event, seeded from the production pgvector DB** (via the `--event-id` flag), **not** the built-in `MOCK_SONGS`. Describe `MOCK_SONGS` (20 built-in songs in `runner.py`) only as the *default fallback* used when no fixture/event is supplied. Do not claim the headline results came from MOCK_SONGS.
2. **Training events** (8): list all 8 from `event_generator.py` ("summer rooftop party with friends", "late night study session", etc.)
3. **Holdout events** (4): list all 4 ("intense gaming session with the squad", "calm rainy morning with coffee and a book", "beach bonfire as the sun goes down", "focused deep-work coding sprint")
4. **Phase 1 grid**: the 81-combination parameter space (n_results × max_distance × target_wildcards × strong_match_margin)
5. **Phase 2 setup**: alternating HyDE/DJ prompt mutations, 5 iterations, failure threshold (alignment < 0.6 OR acceptance < 0.6)
6. **Hardware/environment**: Python 3.10+, Gemini API for embedding + judge, College server for DJ, in-memory Chroma collection

**Key questions to answer:**
- Hardware: ✅ **RESOLVED (Q8)** — runs executed on a **local PC, no GPU**.
- What was the total cost (API calls) for a full eval run? [STILL OPEN — not in the resolved Q&A table; ask the team if a precise figure is needed, otherwise describe qualitatively.]
- Were there multiple eval runs? (Yes — 3 result files exist: `run_20260617_192622`, `run_20260618_134500`, `run_20260618_223307` — the last is the best/most recent.)

**Code/diagrams needed:** No (table of training events is sufficient)  
**Est. word count:** ~500 words  
**Must be written after:** Ch.3.4  
**Google Doc heading:** `4.1. Experimental Setup`  
**Assignee:**

---

### Task: Ch.4.2 — Results Presentation
**Suggested ARS command:** manual  
**Codebase references:** `eval/results/run_20260618_223307.json` (most recent / best run), `eval/optimized/params.json`  
**Content requirements:** Present the actual eval results. **Real data exists — use it.** Currently a placeholder.

Results from the best run (2026-06-18 22:33):
- **Phase 1 best params**: `n_results=5, max_distance=0.8, target_wildcards=7, strong_match_margin=0.10`
- **Phase 1 partial score**: 0.3966 (out of 0.50 max)
- **Phase 2 score history**: [0.730, 0.763, 0.803, 0.799, 0.803, 0.799] — converged around 0.803
- **Phase 2 best composite**: **0.8027**
- **Holdout composite**: **0.6872**
- **Train–holdout gap**: 0.1155 (above 0.10 warning threshold)

Present as:
1. A table of Phase 1 top-N parameter combinations and their partial scores (if available from run logs)
2. A line graph of Phase 2 score history across iterations (Figure)
3. A summary table: metric | train score | holdout score
4. Comparison of results across the 3 eval runs (June 17, June 18 first run, June 18 second run) to show improvement

**Code/diagrams needed:** YES — Phase 2 score history line graph (Figure); results summary table  
**Est. word count:** ~400 words  
**Must be written after:** Ch.4.1  
**Google Doc heading:** `4.2. Results Presentation`  
**Assignee:**

---

### Task: Ch.4.3 — Data Analysis and Interpretation
**Suggested ARS command:** manual  
**Codebase references:** eval/README.md (parameter interpretation sections), README.md (Key Parameters table)  
**Content requirements:** Interpret the numbers. Why did these specific params win? Currently a placeholder.

Analyze:
1. Why `max_distance=0.8` (looser) beat stricter options — Gemini 3072-dim embeddings cluster at 0.20–0.35, so 0.5 or 0.65 over-filtered
2. Why `n_results=5` won over 15 or 30 — with a 20-song mock library, requesting 15 or 30 saturates the pool with noise
3. The Phase 2 convergence pattern — score peaked at iteration 3 (0.8027), slight oscillation after; what this implies about the training event set size
4. The 0.1155 train–holdout gap — what it means (some prompt overfitting to the 8 training categories); what would fix it (more training events, fewer iterations)
5. The relationship between `acceptance_rate` and `target_wildcards=7` — why asking for more wildcards with `overprovision_factor=2.0` helps absorb the 30% stub rejection rate

**Key questions to answer:**
- Were any individual events consistently poor performers? Which ones?
- Did the HyDE prompt or DJ prompt improve more over Phase 2 iterations?
- What would happen if real user library data was used instead of MOCK_SONGS?

**Code/diagrams needed:** Optional — bar chart comparing metrics across eval runs  
**Est. word count:** ~600 words  
**Must be written after:** Ch.4.2  
**Google Doc heading:** `4.3. Data Analysis and Interpretation`  
**Assignee:**

---

### Task: Ch.4.4 — Comparison with Existing Approaches
**Suggested ARS command:** manual (can use /ars-lit-review for background)  
**Codebase references:** README.md (RAG Pipeline section, Key Parameters table), CLAUDE.md §1 (core concept)  
**Content requirements:** Compare JamOn against alternatives. Currently a placeholder.

Comparisons to make:
1. **JamOn vs. Spotify DJ** — Spotify DJ: single user, closed model, no personal library indexing, no event context. JamOn: personal library + semantic event description.
2. **JamOn vs. Spotify Jam** — Jam: shared queue, no intelligence, no vibe matching. JamOn: RAG-driven, cohesive vibe.
3. **JamOn vs. Last.fm/Pandora radio** — tag-based but not event-contextual, not playlist-generating.
4. **Text-ification vs. Audio Features** — argue why LLM vibe tags outperform raw numeric audio features for semantic matching.
5. **HyDE vs. direct query embedding** — quantify the semantic gap problem with a concrete example ("late night study" → short phrase vs. rich synthetic doc).

A comparison table (Feature × System) is strongly recommended here.  
**Key questions to answer:**
- Do you have any A/B test data comparing HyDE vs. direct embedding? [NEEDS INPUT FROM TEAM]
- Was there an earlier version using pgvector + audio features you can compare against?
- Can you cite any benchmark showing HyDE improves retrieval recall?

**Code/diagrams needed:** Yes — comparison table (Figure)  
**Est. word count:** ~500–700 words  
**Must be written after:** Ch.2.1 (Literature Review) + Ch.4.2  
**Google Doc heading:** `4.4. Comparison with Existing Approaches`  
**Assignee:**

---

### Task: Ch.4.5 — Discussion of Findings
**Suggested ARS command:** manual  
**Codebase references:** eval/README.md (Key Design Choices), README.md (Key Parameters rationale)  
**Content requirements:** Synthesize what the results mean for the design decisions made. Currently a placeholder.

Discuss:
1. The **relative margin decision** (`strong_match_margin`) was validated — absolute thresholds failed; relative one is robust to embedding distance clustering
2. The **train–holdout gap of 0.1155** signals mild overfitting — what it implies for production use with real diverse users
3. The **LLM-as-judge approach** (NIM Llama-70b) — limitations (judge may be biased toward certain music genres) and strengths (only metric that captures end-user quality)
4. The **overprovision_factor=2.0** — why it was necessary with the College model's lower reliability vs. Gemini
5. **Lessons learned**: what design decisions would change with hindsight

**Key questions to answer:**
- What surprised the team most during development?
- What would you do differently if starting over?
- Are there failure cases you observed during manual testing?

**Code/diagrams needed:** No  
**Est. word count:** ~500 words  
**Must be written after:** Ch.4.3, Ch.4.4  
**Google Doc heading:** `4.5. Discussion of Findings`  
**Assignee:**

---

### Task: Ch.5 — Conclusion and Future Work
**Suggested ARS command:** manual  
**Codebase references:** README.md (eval section), CLAUDE.md §1  
**Content requirements:** Currently a placeholder. Two parts:

**Conclusion** (~300 words): Summarize what was built, the key innovation (text-ification RAG), and whether objectives were met. Reference the 0.80 composite score as evidence. Acknowledge limitations (train–holdout gap, mock library, Spotify dev mode restriction).

**Future Work** (~300 words): Concrete next steps:
1. Real user data eval — seed `eval/fixtures/user_library.json` with real Spotify libraries
2. Auto-promotion of optimized prompts from `eval/optimized/` to `app/prompts/` (currently requires manual copy)
3. Multi-user events — ✅ **already implemented (Q4)**; frame the *future work* as resolving the Spotify OAuth dev-mode 5-user-per-Client-ID cap (per-user Client ID mapping), not as building multi-user from scratch
4. Eval harness uses in-memory Chroma; consider adding a pgvector eval mode so calibrated params transfer directly without relying on Chroma↔pgvector distance equivalence assumption
5. More training event diversity — reduce holdout gap from 0.1155
6. Frontend improvements — contribution statistics per participant, playlist history

**Code/diagrams needed:** No  
**Est. word count:** ~600 words  
**Must be written after:** Ch.4.5  
**Google Doc heading:** `5. Conclusion and Future Work`  
**Assignee:**

---

### Task: Ch.6 — References
**Suggested ARS command:** /ars-citation-check after initial draft  
**Codebase references:** N/A — built from Ch.2.1 literature review  
**Content requirements:** IEEE numbered format [1], [2], ... Full references for every citation used in the book. **Replace the current draft's 3 placeholder references** (Genius, Spotify, Gemini docs) with a complete list including all academic papers cited in Ch.2.1. Minimum expected: 12–15 references.

Core references to include:
- Lewis et al. 2020 — RAG paper
- Gao et al. 2022 — HyDE paper
- Relevant LangGraph/LangChain paper or docs
- Vector database papers (ChromaDB, pgvector)
- Music recommendation systems papers
- Group recommendation papers
- Spotify API docs (Web API reference)
- Genius API docs
- Last.fm API docs
- Gemini API docs

**Code/diagrams needed:** No  
**Est. word count:** ~400 words (reference list)  
**Must be written after:** Ch.2.1 complete  
**Google Doc heading:** `6. References`  
**Assignee:**

---

### Task: Ch.7 — Appendix A: Setup Instructions
**Suggested ARS command:** manual  
**Codebase references:** README.md (Quick Start section), orchestrator README (Setup), data-engine README (Environment Variables table), client README  
**Content requirements:** Step-by-step instructions for running JamOn locally. This can mostly be adapted from the README.md Quick Start section. Include:
1. Prerequisites (Python 3.10+, Node.js 18+, Spotify Developer app, Gemini API key)
2. Data Engine setup (venv, pip install, .env file, uvicorn command)
3. Orchestrator setup (npm install, .env file, npm run start:dev)
4. Client setup (npm install, .env file, npm run dev)
5. How to get a Spotify Access Token for manual testing
6. Provider mode reference table (gemini/college/nim)

Optionally include: how to run the eval harness (`python -m eval.eval_loop`).  
**Code/diagrams needed:** No (code blocks for terminal commands)  
**Est. word count:** ~400 words  
**Must be written after:** Ch.3.3  
**Google Doc heading:** `7. Appendix A`  
**Assignee:**

---

## DEPENDENCY ORDER TABLE

| # | Task | Depends On | Can Start Immediately? |
|---|------|------------|----------------------|
| 1 | Cover Page + Front Matter | — | YES |
| 2 | Acknowledgments | Cover | YES (near-trivially) |
| 3 | Ch.1.1 Background | — | YES |
| 4 | Ch.1.2 Problem Statement | 1.1 | After 1.1 |
| 5 | Ch.1.3 Objectives | 1.1, 1.2 | After 1.2 |
| 6 | Ch.1.4 Scope & Limitations | 1.3 | After 1.3 |
| 7 | Ch.1.5 Methodology | 1.3 | After 1.3 |
| 8 | Ch.1.6 Book Organization | All Ch1 | Last in Ch1 |
| 9 | **Ch.2.1 Literature Review** | Ch1 done | After Ch1 ★ |
| 10 | **Ch.3.1 System Architecture** | — | YES (independent) |
| 11 | Ch.3.2 Data Collection | 3.1 | After 3.1 |
| 12 | Ch.3.3 Implementation Details | 3.2 | After 3.2 |
| 12b | Ch.3.3b CI/CD & Deployment | 3.1 | After 3.1 (independent of 3.2/3.3) |
| 13 | Ch.3.4 Evaluation Metrics | 3.3 | After 3.3 |
| 14 | Ch.4.1 Experimental Setup | 3.4 | After 3.4 |
| 15 | Ch.4.2 Results Presentation | 4.1 | After 4.1 |
| 16 | Ch.4.3 Data Analysis | 4.2 | After 4.2 |
| 17 | Ch.4.4 Comparison | 2.1 + 4.2 | After 2.1 AND 4.2 |
| 18 | Ch.4.5 Discussion | 4.3 + 4.4 | After 4.3 AND 4.4 |
| 19 | Ch.5 Conclusion & Future Work | 4.5 | After 4.5 |
| 20 | Ch.6 References | 2.1 | After 2.1 |
| 21 | Ch.7 Appendix | 3.3 | After 3.3 |
| 22 | Executive Summary | ALL | LAST |
| 23 | TOC / Abbreviations / Figures | ALL | LAST |

---

## CRITICAL PATH

**Ch.4.5 Discussion has TWO predecessors (4.3 AND 4.4), so the critical path forks and re-joins at 4.5.** Both branches below must finish before 4.5 starts:

```
Branch A (implementation/results):
Ch.3.1 → Ch.3.2 → Ch.3.3 → Ch.3.4 → Ch.4.1 → Ch.4.2 → Ch.4.3 ─┐
                                                                ├─► Ch.4.5 → Ch.5 → Executive Summary (LAST)
Branch B (literature/comparison):                               │
Ch.1 → Ch.2.1 Literature Review (longest single section) → Ch.4.4 ┘
                                  (Ch.4.4 also needs Ch.4.2)
```

**Why Branch B is co-critical, not just "parallel":** Ch.2.1 is the single longest deliverable (~3,000 words) and it gates Ch.4.4, which gates Ch.4.5. If Ch.2.1 starts late it can become *the* critical path. Start Ch.2.1 as early as possible (it only needs Ch.1 framing) and consider splitting it across two writers (see Balance notes).

**Also in parallel (not on the critical path):**

```
Ch.1.1 → Ch.1.2 → Ch.1.3 → Ch.1.4 + Ch.1.5 → Ch.1.6
Ch.3.3b CI/CD (after 3.1, independent of 3.2/3.3)
Ch.6 References (after 2.1)
Ch.7 Appendix (after 3.3)
TOC / Abbreviations / Figures (LAST)
```

**What blocks everything else:**
1. **Ch.3.1 System Architecture** — must be done before any other Ch3 or Ch4 section. Also needed to unblock the writers of Ch.2.1 (who need to understand what was actually built to frame the literature correctly).
2. **Ch.2.1 Literature Review** — blocks Ch.4.4 and Ch.6. The longest single section. Start early. (It needs only Ch.1 framing to begin; it does **not** hard-depend on Ch.3.1 — the earlier prose claim that 3.1 must precede 2.1 was overstated. A writer can draft the literature in parallel with the architecture chapter.)
3. **Open team inputs** — only **Q10 (submission date)** and the **eval API-cost figure** remain open (see table below). All other previously-blocking items are now resolved and have been inlined into the relevant cards.

---

## BALANCE & SCOPE NOTES (review additions)

1. **Total word budget falls short of target.** Summing every card's "Est. word count" gives **≈13,500–14,000 words**, but the stated goal is **17,500–24,500 words (50–70 pages)**. The board is ~4,000 words under the *minimum*. Either raise per-section targets (the natural candidates: Ch.2.1, Ch.3.3, Ch.4.3) or explicitly agree the book lands near 50 pages, not 70. Decide before assigning, so writers aim at the right length.

2. **Ch.2.1 is the long pole — consider splitting it across two assignees.** At ~3,000 words and 10 topic clusters it is 3–4× any other card, and it gates Ch.4.4 + Ch.6. Suggested split: **2.1a** topics 1–5 (RAG, HyDE, text-embeddings-for-music, LLM tagging, LangGraph/agents); **2.1b** topics 6–10 (vector DBs, music recommenders, group recommenders, prompt optimization, Spotify API). Merge into one numbered section at the end.

3. **TOC / Abbreviations / Figures is three deliverables in one card.** Fine to keep as one "front-matter finishing" task, but assign it to someone who owns final-pass formatting, since all three depend on every chapter being frozen.

## [NEEDS INPUT FROM TEAM] — Blocking Questions

All questions resolved except the submission date (Q10) and the eval API-cost figure (Q11, newly surfaced):

| # | Question | Status |
|---|----------|--------|
| 1 | How many songs fetched? | ✅ **Top 50** via Spotify `GET /v1/me/top/tracks` |
| 2 | pgvector vs ChromaDB? | ✅ **pgvector = production**, ChromaDB = local dev only |
| 3 | Contribution stats wired? | ✅ **Fully wired.** Orchestrator computes per-participant cosine similarity (`averageVectors`) against each track vector → `contributorIds` per track + overall `playlistMatchPercent`. Data-engine returns the song list only; orchestrator handles all scoring attribution independently. |
| 4 | Multi-user end-to-end? | ✅ **Fully implemented.** Known open issue: Spotify OAuth limits 1 Client ID to 5 users in dev mode — per-user Client ID mapping needed (issue open, not yet resolved). |
| 5 | User testing? | ✅ **Manual testing by the team** — no formal user surveys |
| 6 | Docker Compose? | ✅ **Yes** — orchestrates all 3 services + nginx/SSL (port 443). PostgreSQL runs on **host machine** (not a container), accessed via `host.docker.internal`. Data-engine has `ORCHESTRATOR_URL` → calls back to orchestrator for Spotify URI validation in production. |
| 7 | Development methodology? | ✅ **2-week sprints** — sprint start: backlog planning; sprint end: internal team review + supervisor meeting |
| 8 | Eval hardware? | ✅ **Local PC, no GPU** |
| 9 | Eval songs? | ✅ **Real songs from a real event** seeded from production pgvector DB (not built-in MOCK_SONGS) |
| 10 | Official submission date? | ⏳ **NEEDS INPUT** — fill in on cover page |
| 11 | Total API cost of a full eval run? | ⏳ **NEEDS INPUT** — referenced in Ch.4.1; provide a figure or write qualitatively |
