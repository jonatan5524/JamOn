# 1. Introduction

## 1.3. Objectives

The project defined seven concrete objectives, each realized in the delivered system.

1. Build a semantic indexing pipeline in which a large language model generates descriptive energy, mood, and vibe tags for each track, replacing the deprecated Spotify Audio Features API. The tags are combined with scraped lyrics and embedded into a vector store.

2. Implement HyDE (Hypothetical Document Embeddings) query expansion, in which the LLM rewrites a short, vague event description into a rich synthetic song description occupying the same embedding space as the indexed library.

3. Build an agentic playlist-generation workflow using LangGraph, in which suggested songs are validated against the Spotify catalog and rejected suggestions trigger a bounded regenerate-and-validate loop.

4. Support multiple interchangeable LLM providers — Gemini, NVIDIA NIM, and a college-hosted Ollama model — with per-task provider mixing to reduce API cost.

5. Build an automated evaluation harness that tunes the retrieval pipeline in two phases: an 81-combination grid search over four retrieval parameters, followed by prompt hill-climbing guided by an LLM judge, with holdout validation to detect overfitting.

6. Create an end-to-end web application spanning a React client, a NestJS orchestrator, and a FastAPI data engine, culminating in playlist creation on the user's Spotify account.

7. Support multi-user events with per-participant contribution statistics: the orchestrator computes cosine similarity between each participant's average taste vector and every playlist track, deriving the contributors of each track and an overall playlist match percentage.

All seven objectives were fully achieved. One constraint applies to multi-user operation: Spotify's developer mode restricts each Client ID to five authorized test users, which the system mitigates by pooling the team members' Client IDs and mapping each registered user email to an assigned Client ID, raising effective capacity to thirty users. Event joining is fully implemented through shareable invitation codes and QR codes, with automatic fallback to manual code entry in browsers that lack camera-based scanning support.
