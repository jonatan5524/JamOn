# Table of Contents

The Table of Contents is generated automatically by Google Docs from the document's heading styles (Format > Paragraph styles > Heading 1/2/3) and is not authored as static text. Once every chapter section has been pasted into the Google Doc with the correct heading levels applied, insert the Table of Contents via Insert > Table of contents, and verify that every entry below is present and that its page number matches the corresponding heading in the body of the document.

Expected top-level entries, in order:

Acknowledgments
Executive Summary
1. Introduction
1.1. Background
1.2. Problem Statement
1.3. Objectives
1.4. Scope and Limitations
1.5. Methodology
1.6 Organization of the Project Book
2. Literature Review
2.1. Relevant Literature
3. System Design
3.1. System Architecture
3.2 Data Collection and Preprocessing
3.3. Implementation Details
3.5 Deployment and CI/CD Pipeline
3.4. Evaluation Metrics
4.1 Experimental Setup
4.2 Results Presentation
4.3 Data Analysis and Interpretation
4.4 Comparison with Existing Approaches
4.5 Discussion of Findings
5 Conclusion and Future Work
6. References
7. Appendix A

[NEEDS INPUT — pending team clarification: the drafted sections number the CI/CD sub-section as "3.5 Deployment and CI/CD Pipeline" (see docs/drafts/issue-80.md), which places it after Evaluation Metrics (3.4) in numeral order even though it was written as a sub-point of Implementation Details (3.3) per the task board. Confirm the final section order and renumber headings consistently before generating the Table of Contents, since Google Docs will reproduce whatever heading numerals are typed in the body text.]

[NEEDS INPUT — pending team clarification: no drafted file yet establishes a chapter-level heading grouping 4.1–4.5 (e.g. "4. Results and Evaluation") — only the individual "## 4.1"–"## 4.5" subsection headings exist in docs/drafts/. This Table of Contents lists them as they currently exist, without a parent chapter title. Add a "4." chapter heading to the relevant draft file and to this list once the team confirms its wording, so the Table of Contents in the Google Doc has a heading to anchor to.]

Heading numerals above are transcribed exactly as they appear in each section's own drafted file (docs/drafts/issue-70.md through issue-89.md), including the periods some carry and others do not — this inconsistency in numeral punctuation across chapters should be resolved by whoever owns the final formatting pass, but this Table of Contents intentionally mirrors the current source text rather than silently normalizing it.

---

# Table of Abbreviations

The current draft's Table of Abbreviations contains placeholder entries (AB, AFSE, AO, ARP) that do not correspond to any term used in the project book and must be entirely replaced with the list below.

| Abbreviation | Full Form |
|---|---|
| API | Application Programming Interface |
| ChromaDB | ChromaDB (vector database) |
| DJ | Shorthand used in the system for the playlist-generation agent |
| HyDE | Hypothetical Document Embeddings |
| JWT | JSON Web Token |
| LLM | Large Language Model |
| NIM | NVIDIA Inference Microservices |
| NLP | Natural Language Processing |
| OAuth | Open Authorization |
| QR | Quick Response (code) |
| RAG | Retrieval-Augmented Generation |
| REST | Representational State Transfer |

This list reflects the abbreviations specified for this task. [NEEDS INPUT — pending team clarification: confirm this list is exhaustive against the final text of all chapters; any abbreviation introduced during later editing of Ch.2–Ch.7 that is not in this table must be added here before submission.]

---

# Table of Figures

The following figures are referenced in the drafted chapters (`docs/drafts/`). Each entry lists the figure's current source file and the chapter section in which it appears.

| Figure | Title | Section | Source File |
|---|---|---|---|
| Figure 1 | High-level three-tier system architecture (Client, Orchestrator, Data Engine) | 3.1 System Architecture | `figure1-system-architecture.drawio` / `.png` |
| Figure 2 | Indexing pipeline — EnrichedSong flow (Spotify genres, Genius lyrics, Last.fm tags, LLM tagging, embedding, vector store) | 3.1 System Architecture | `figure2-indexing-pipeline.drawio` / `.png` |
| Figure 3 | Inference pipeline — seven-step RAG flow (HyDE expansion, vector search, strong spine identification, dynamic wildcard target, LLM DJ generation, LangGraph validate/retry loop, merge and shuffle) | 3.1 System Architecture | `figure3-inference-pipeline.drawio` / `.png` |
| Figure N | Enrichment pipeline (concurrent Genius/Last.fm lookup within the data-collection stage) | 3.2 Data Collection and Preprocessing | `figure-enrichment-pipeline.drawio` / `.png` |
| (unnumbered) | LangGraph generation workflow (`initial_fetch`, `validate`, `regenerate`, `merge_and_shuffle` nodes and the `should_finalize` conditional edge) | 3.3 Implementation Details | `figure4-langgraph-workflow.drawio` / `.png` |
| Figure N | CI/CD pipeline flow — three parallel build jobs on GitHub-hosted runners followed by a single deploy job on the self-hosted `colman` runner | 3.5 Deployment and CI/CD Pipeline | `figureN-cicd-pipeline.drawio` / `.png` |
| Figure 4.1 | Phase 2 composite score history across six hill-climbing iterations for Run 3 | 4.2 Results Presentation | `figure4.1-phase2-score-history.drawio` / `.png` |
| Figure 4.2 | Comparison of JamOn with existing music-selection approaches (feature-by-system table) | 4.4 Comparison with Existing Approaches | rendered as a Markdown table in `issue-85.md`, not a `.drawio`/`.png` file |

[NEEDS INPUT — sources disagree: figure numbering is not consistent across chapters. Chapter 3 figures use flat sequential numbers (Figure 1, Figure 2, Figure 3), with two figures (`figure-enrichment-pipeline` in 3.2 and `figureN-cicd-pipeline` in 3.5) left as an unresolved "Figure N" pending this final pass, and the LangGraph diagram in 3.3 carries no figure number or caption at all in the drafted text. Chapter 4, by contrast, uses chapter-scoped numbering (Figure 4.1, Figure 4.2). Before finalizing this table, the team must decide on one scheme — either flat sequential numbering throughout (Figure 1 through Figure 8) or chapter-scoped numbering throughout (Figure 3.1–3.5, Figure 4.1–4.2) — and update the captions in the affected draft sections (`issue-77.md`, `issue-78.md`, `issue-79.md`, `issue-80.md`) to match before pasting into the Google Doc.]

[NEEDS INPUT — pending team clarification: the entry captioned "Figure 4.2" in `issue-85.md` (Section 4.4) is a Markdown feature-comparison table, not a diagram or screenshot. It should likely be renumbered as a table (e.g., Table 4.3, continuing from Table 4.1 and Table 4.2 in Section 4.2) rather than listed in the Table of Figures — confirm with whoever owns the final formatting pass before the Google Doc paste.]

No additional screenshots beyond the figures listed above were found referenced in the drafted chapters at the time of this pass.
