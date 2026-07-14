## 4.2 Results Presentation

Three complete evaluation runs were conducted between 17 June 2026 and 18 June 2026, each executing the full two-phase optimization loop against the eight training events described in Section 4.1. The quantitative outcomes reported below are drawn directly from the result log files stored in `eval/results/`.

**Phase 1 — Best Parameter Configurations**

Each result file records only the winning Phase 1 configuration; a ranked listing of all 81 combinations is not preserved in the logs. Table 4.1 presents the best Phase 1 configuration and its corresponding partial score for each run. Run 1 does not record a `strong_match_margin` value or a Phase 1 partial score.

| Run | Timestamp | n_results | max_distance | target_wildcards | strong_match_margin | Phase 1 Partial |
|-----|-----------|-----------|-------------|-----------------|--------------------|--------------------|
| 1 | 2026-06-17 19:26 | 15 | 0.65 | 5 | — | — |
| 2 | 2026-06-18 13:45 | 5 | 0.80 | 3 | 0.06 | 0.4246 |
| 3 | 2026-06-18 22:33 | 5 | 0.80 | 7 | 0.10 | 0.3966 |

Table 4.1: Best Phase 1 parameter configurations per run (partial score maximum is 0.50).

The parameters from Run 3 were adopted as the production configuration, as stored in `eval/optimized/params.json`.

**Phase 2 — Score History**

Figure 4.1 plots the Phase 2 composite score across six hill-climbing iterations for Run 3, the canonical reference run. Each iteration alternates between mutating the HyDE prompt and the DJ prompt. The baseline composite of 0.730 rose to 0.803 at iteration 3 (first DJ mutation), fell slightly to 0.799, recovered to 0.803 at iteration 5 (second DJ mutation), and declined marginally to 0.799 at the final iteration, indicating convergence around 0.803.

*[INSERT DIAGRAM HERE]*

Figure 4.1: Phase 2 composite score history across six iterations for Run 3 (`run_20260618_223307`). Score sequence: 0.730 → 0.763 → 0.803 → 0.799 → 0.803 → 0.799. Dashed line marks the best composite of 0.8027.

**Cross-Run Summary**

Table 4.2 compares the Phase 2 best composite, holdout composite, and train–holdout gap across all three runs.

| Run | Phase 2 Best Composite | Holdout Composite | Train–Holdout Gap |
|-----|----------------------|------------------|-------------------|
| 1 (2026-06-17) | 0.6825 | 0.6712 | 0.0113 |
| 2 (2026-06-18, 13:45) | 0.8278 | 0.7813 | 0.0465 |
| 3 (2026-06-18, 22:33) | 0.8027 | 0.6872 | 0.1155 |

Table 4.2: Phase 2 composite and holdout scores across all three evaluation runs.

The train composite improved substantially from Run 1 (0.6825) to Runs 2 and 3 (0.8278 and 0.8027 respectively). Run 3 selected a higher `target_wildcards` value (7 versus 3 in Run 2) alongside a wider `strong_match_margin` (0.10 versus 0.06), resulting in a lower Phase 1 partial score (0.3966 versus 0.4246). The train–holdout gap widened to 0.1155 in Run 3, exceeding the 0.10 warning threshold flagged by the evaluation harness.
