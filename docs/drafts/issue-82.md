## 4.1 Experimental Setup

This section describes the configuration of the evaluation harness used to produce the results reported in Section 4.2. All experiments were executed using the two-phase evaluation loop implemented in `eval/eval_loop.py`.

**Indexed Library**

The evaluation library consists of real songs drawn from a real event, seeded from the production pgvector database using the `--event-id` flag. This operational mode retrieves pre-computed vectors directly from the production store and bypasses the Gemini re-embedding step, eliminating the primary source of API quota consumption during Phase 1. The harness also includes a built-in fallback corpus of twenty songs defined as `MOCK_SONGS` in `eval/runner.py`, used automatically when no fixture file or event identifier is provided. The headline results reported in Section 4.2 were not obtained using this fallback; `MOCK_SONGS` exists solely to allow the harness to execute without external dependencies for smoke-testing purposes.

**Training and Holdout Events**

Eight training event descriptions, defined in `eval/event_generator.py`, were used during both Phase 1 and Phase 2 optimization:

| # | Training Event |
|---|----------------|
| 1 | summer rooftop party with friends |
| 2 | late night study session |
| 3 | morning workout at the gym |
| 4 | relaxed dinner at home |
| 5 | long road trip on the highway |
| 6 | romantic evening at home |
| 7 | sad and introspective Sunday afternoon |
| 8 | high-energy pregame before a night out |

Four holdout events, withheld entirely from both optimization phases, were scored once at the conclusion of Phase 2 to assess generalization:

| # | Holdout Event |
|---|---------------|
| 1 | intense gaming session with the squad |
| 2 | calm rainy morning with coffee and a book |
| 3 | beach bonfire as the sun goes down |
| 4 | focused deep-work coding sprint |

**Phase 1: Parameter Grid Search**

Phase 1 exhaustively evaluates all 81 combinations of four retrieval and generation parameters in a 3⁴ grid:

| Parameter | Values Swept | Controls |
|-----------|-------------|----------|
| `n_results` | 5, 15, 30 | Candidate pool size fetched from the vector store |
| `max_distance` | 0.5, 0.65, 0.8 | Cosine distance ceiling; songs above this value are discarded |
| `target_wildcards` | 3, 5, 7 | Minimum AI-generated songs when library matches are weak |
| `strong_match_margin` | 0.06, 0.10, 0.14 | Relative margin above the closest match for spine eligibility |

Each combination is scored across all eight training events using three mechanical metrics only, without invoking the LLM alignment judge. This avoids the cost and latency of 648 separate judge API calls. The best-scoring configuration is written to `eval/optimized/params.json` as each new maximum is found, so a partial run preserves progress.

**Phase 2: Prompt Hill-Climbing**

Phase 2 takes the best parameters from Phase 1 and iteratively refines the HyDE and DJ generation prompts over five iterations, alternating between the two prompt types. A mutation is accepted only if the full composite score improves. Events yielding an alignment score below 0.6 or an acceptance rate below 0.6 are classified as failure cases and supplied to the meta-prompt as concrete examples for the subsequent mutation. The best prompts are persisted to `eval/optimized/` on completion.

**Hardware and Software Environment**

All three evaluation runs were executed on a local PC with no dedicated GPU. Because the runs supplied a real event identifier via the `--event-id` flag, the harness retrieved pre-computed embeddings directly from the production pgvector store and bypassed all Gemini embedding calls; HyDE expansion in this mode is performed by NIM rather than Gemini. In the default mode (no `--event-id`), the harness uses the Gemini API to embed both the song corpus and the HyDE-expanded query. Across both modes, the software environment comprised Python 3.10 or later, an in-memory ChromaDB collection (fresh per run, cosine distance), NIM (`meta/llama-3.3-70b-instruct`) for Phase 2 alignment judgments, and the College server (`gemma3:12b`) for DJ generation. The College server enforces a rate limit of five requests per minute; the harness inserts a nine-second delay after each DJ call to remain within this constraint. Three complete runs were conducted — `run_20260617_192622`, `run_20260618_134500`, and `run_20260618_223307` — with the final run producing the best reported results.
