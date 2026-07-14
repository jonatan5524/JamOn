# 2. Literature Review

## 2.1. Relevant Literature

This chapter surveys the research domains that inform the design of JamOn. The system generates event-specific Spotify playlists by indexing a user's listening library as semantic text embeddings and retrieving matches against natural-language event descriptions. The following subsections review retrieval-augmented generation, hypothetical document embeddings, text-based music representation, LLM metadata generation, agentic workflows, vector search infrastructure, music and group recommendation paradigms, prompt optimization, and the Spotify developer ecosystem. Together, these bodies of work establish both the technical foundations and the gaps that motivate the project's "text-ification" approach.

### 2.1.1. Retrieval-Augmented Generation

Retrieval-Augmented Generation (RAG) was introduced by Lewis et al. as a framework for conditioning a language model on externally retrieved documents rather than relying solely on parametric knowledge stored in model weights [1]. In the canonical architecture, a retriever selects relevant passages from a corpus, and a generator synthesizes a response grounded in those passages. This separation addresses two persistent limitations of standalone large language models: factual hallucination and the inability to incorporate private or dynamically updated knowledge bases.

RAG has since been applied across knowledge-intensive natural language processing tasks, including open-domain question answering and dialogue systems [1]. Its relevance to recommendation extends naturally: instead of retrieving textual documents, a system retrieves items — in this case, songs — whose representations are semantically proximate to a user's stated intent. The JamOn system adopts this paradigm by embedding each track as a descriptive text document (LLM-generated vibe tags combined with a lyrics snippet) and retrieving the top semantic matches at inference time against an event description query [2]. This grounds playlist construction in the user's actual library rather than in the model's general music knowledge alone.

The inference pipeline further combines retrieval with generative completion: retrieved library tracks form a "strong spine" of guaranteed matches, while a language model fills remaining playlist slots with new song suggestions validated against the Spotify catalog [2]. This hybrid retrieve-then-generate pattern mirrors the RAG design principle of using retrieval to anchor generation, reducing the risk that the model proposes tracks entirely disconnected from the user's taste profile.

### 2.1.2. Hypothetical Document Embeddings

A central challenge in dense retrieval is the semantic mismatch between short user queries and long indexed documents. Cosine similarity in embedding space performs best when the query and document occupy comparable semantic regions; a brief phrase such as "late night study session" embeds differently from a rich song description containing mood tags, energy descriptors, and lyrical fragments [2].

Hypothetical Document Embeddings (HyDE), proposed by Gao et al. in "Precise Zero-Shot Dense Retrieval without Relevance Labels," address this gap by using a language model to generate a synthetic document that hypothetically answers the query before embedding [3]. The synthetic document is embedded and used as the retrieval query vector, placing it in the same semantic space as the indexed corpus. Gao et al. demonstrate that this zero-shot approach improves dense retrieval accuracy without requiring relevance-labeled training pairs [3].

JamOn applies HyDE at the first stage of its inference pipeline: the raw event description is rewritten by an LLM into a rich synthetic song description — for example, transforming "Late night melancholic study session" into prose resembling "Slow tempo, acoustic, introspective lyrics, low energy, sad mood, lo-fi, rainy night vibe" — which is then embedded and queried against the vector store [2]. The README documents the design rationale explicitly: short event phrases are not in the same embedding space as tag-and-lyrics document embeddings, and HyDE bridges that semantic gap [2]. This design choice is evaluated empirically in the project's automated tuning harness, which alternates HyDE prompt mutations during Phase 2 prompt hill-climbing [2].

### 2.1.3. Text Embeddings for Music

Traditional music information retrieval has relied heavily on low-level audio signal processing and numeric feature vectors. Spotify's Audio Features API, which exposed dimensions such as energy, valence, and danceability as floating-point scores, was widely used in academic and commercial recommender systems. Spotify has since deprecated this endpoint, removing programmatic access to those numeric descriptors [4]. This deprecation motivates alternative representations that do not depend on proprietary audio analysis pipelines.

The JamOn project adopts a "text-ification" strategy: rather than representing songs as raw numeric feature vectors, the system uses large language models to translate each track into descriptive text tags — for example, "High Energy, Sad" — which are embedded alongside lyrics snippets for semantic search [5]. This approach treats each song as a natural-language document in a shared embedding space, making the personal music library queryable through the same dense retrieval mechanisms used in textual RAG systems [1], [2].

Semantic music understanding through text embeddings aligns with broader trends in multimodal representation learning, where high-level descriptive captions can capture perceptual qualities that numeric features approximate. Prior work on music auto-tagging and lyric-based retrieval demonstrates that textual descriptors — whether extracted from lyrics, crowdsourced tags, or model-generated captions — support similarity search without access to raw audio waveforms [NEEDS INPUT — pending team clarification on specific prior-work citations for LLM-generated music metadata]. The project's core concept explicitly rejects raw numeric audio features in favor of LLM-generated descriptive metadata, a design constraint documented in the project architecture specification [5].

### 2.1.4. LLM-Based Tagging and Annotation

Large language models have demonstrated strong capability for structured annotation tasks: given contextual inputs, they can produce JSON-formatted metadata conforming to a specified schema. In the JamOn indexing pipeline, when a user synchronizes their library, the orchestrator fetches the user's top 50 tracks and artist genres via the Spotify API and forwards track metadata to the data engine [5]. The data engine enriches each track with scraped lyrics and community tags, then sends the batch to an LLM tagging provider (Gemini 1.5 Flash by default) with a prompt requesting estimated energy, valence, and descriptive tags based on artist style and genre context [5].

The tagging model returns structured JSON containing energy_desc, mood_desc, and vibe_tags fields for each song [5]. These tags are combined with a lyrics snippet into a single embedding text string, which is vectorized and stored in the vector database [5]. If lyrics scraping fails, the system degrades gracefully by embedding only the LLM-generated vibe tags rather than aborting the pipeline [5]. This fallback behavior reflects a practical constraint of real-world metadata pipelines: external lyric sources are incomplete, and robust systems must tolerate partial enrichment.

The use of LLMs for music metadata generation differs from collaborative filtering and content-based approaches that rely on play-count statistics or pre-computed audio descriptors [6]. By inferring perceptual qualities from artist, genre, lyric, and community-tag context, the tagging step effectively "hallucinates" structured metadata that replaces the deprecated Spotify Audio Features API [4], [5].

### 2.1.5. LangGraph and Agentic Workflows

Playlist generation in JamOn extends beyond a single LLM call. The inference pipeline includes a validation-and-retry loop: suggested wildcard tracks are checked against the Spotify catalog, rejected suggestions are fed back to the generation model, and the process repeats until sufficient validated tracks are obtained or a maximum attempt count is reached [2]. This pattern — generate, validate, conditionally regenerate — constitutes an agentic workflow in which the system iterates toward a goal rather than accepting the first model output.

LangGraph, a library for building stateful, multi-step LLM applications as directed graphs, provides the orchestration framework for this workflow [7]. The JamOn data engine implements four graph nodes — initial_fetch, validate, regenerate, and merge_and_shuffle — connected by a conditional should_finalize router that determines whether to accept the current wildcard set or loop back for regeneration [2]. Agentic loops of this form are increasingly adopted in production LLM systems where output quality depends on external verification against tools or APIs [7].

The validation step addresses a known failure mode of LLM-based music suggestion: models may propose plausible-sounding song titles that do not exist on Spotify or that resolve to incorrect recordings. By coupling generation with catalog verification and bounded retry, the workflow constrains hallucination rate while preserving the creative flexibility to suggest tracks outside the user's indexed library [2].

### 2.1.6. Vector Databases

Dense retrieval requires a store capable of efficiently searching high-dimensional embedding vectors by similarity. JamOn uses cosine distance as the similarity metric: indexed song embeddings and query embeddings are compared via the cosine distance operator, with lower distance indicating stronger semantic match [2]. The README notes that cosine distances for text embeddings in this system cluster in a practically observed band of roughly 0.05 to 0.80, with strong matches typically falling between 0.20 and 0.35 [2]. This narrow clustering motivates the relative strong_match_margin threshold used in spine identification rather than a fixed absolute cutoff [2].

Two vector store backends are employed. ChromaDB serves local development and evaluation, providing an in-memory or file-backed collection with configurable embedding dimensionality [8]. pgvector, a PostgreSQL extension, serves production deployment, storing vectors alongside relational metadata in the same database that holds user, event, and song records [9]. Both backends support approximate nearest-neighbor indexing; pgvector leverages Hierarchical Navigable Small World (HNSW) graphs for sub-linear search over large corpora [9]. The production system scopes retrieval to songs indexed for all participants in a given event, ensuring that vector search operates over the union of participant libraries rather than a global catalog [2].

The observation that cosine distances cluster in a narrow band for text embeddings — rather than spreading uniformly across the distance range — informs the strong_match_margin design decision in JamOn [2]. While general sentence-embedding literature documents that semantically related texts tend to occupy tight regions of vector space [NEEDS INPUT — pending team clarification on a formal citation supporting relative-margin thresholds over fixed absolute cutoffs], the project's evaluation harness treats strong_match_margin as a tunable parameter alongside max_distance, validating the relative approach empirically across 81 grid-search combinations [2].

The max_distance parameter acts as an absolute quality gate: the vector store always returns the top-N closest results even when those results are semantically distant from the query, and max_distance filters out matches beyond a configurable distance threshold to prevent irrelevant songs from entering the candidate pool [2].

### 2.1.7. Music Recommendation Systems

Music recommendation has been studied extensively under three dominant paradigms. Collaborative filtering exploits user-item interaction matrices to predict preferences based on taste similarity among users [10]. Content-based filtering recommends items whose feature profiles resemble those of items the user previously enjoyed [11]. Hybrid systems combine both signals to mitigate cold-start and sparsity problems [6].

These paradigms excel at personalized discovery — suggesting songs a user might like based on historical behavior — but they are poorly suited to event-contextual playlist generation. Collaborative filtering requires aggregate interaction data and does not accept a free-text event description as input. Content-based systems traditionally depend on audio features or tag co-occurrence statistics, neither of which captures the semantic nuance of a phrase such as "calm rainy morning with coffee and a book." Furthermore, commercial single-user recommenders such as Spotify DJ apply AI curation within one listener's profile and provide no mechanism for tailoring output to a specific social occasion [2].

JamOn occupies a distinct niche: it combines personal library retrieval (content-based, grounded in the user's own indexed tracks) with generative completion (LLM-as-DJ) and event-description-driven query expansion (HyDE). The system does not model user-user similarity or global popularity trends; instead, it treats the event description as the primary retrieval query and the participant libraries as the retrieval corpus [5], [2].

### 2.1.8. Group Recommendation Systems

When recommendation targets a group rather than an individual, the preference aggregation problem arises: diverse individual tastes must be reconciled into a shared outcome [12]. Classical group recommendation strategies include least-misery (optimizing for the least satisfied member), average satisfaction, and social-welfare maximization [12], [13]. These approaches typically operate over rating matrices or explicit preference profiles and produce a single aggregated recommendation list.

JamOn takes a structurally different approach. Rather than aggregating individual preference vectors into a group profile and querying against a global catalog, the system indexes each participant's personal library as semantic embeddings and retrieves against a shared event description scoped to the union of all participant libraries [2], [5]. The retrieval step itself does not apply a least-misery, average, or social-welfare aggregation function; semantic matching is driven by the shared event description rather than by reconciling explicit individual ratings [2].

This design reflects the project's scope: the primary input is a natural-language event description, not a set of conflicting individual ratings. The system prioritizes semantic coherence with the stated occasion over explicit multi-criteria group fairness optimization [5].

### 2.1.9. Prompt Optimization and Auto-Tuning

The quality of LLM-driven pipelines depends critically on prompt wording. Manual prompt engineering is labor-intensive and does not scale to the combinatorial parameter spaces encountered in retrieval-augmented systems, where numeric thresholds (max_distance, strong_match_margin, target_wildcards) and textual prompts (HyDE expansion, DJ generation) interact non-linearly [2].

JamOn addresses this through a two-phase automated evaluation harness [2]. Phase 1 performs an exhaustive grid search over 81 combinations of four retrieval parameters (n_results, max_distance, target_wildcards, strong_match_margin), scoring each configuration on cheap metrics — acceptance rate, retrieval relevance, and size fulfillment — without invoking an LLM judge [2]. Phase 2 freezes the best numeric parameters and applies prompt hill-climbing: the optimizer alternates between mutating the HyDE prompt and the DJ prompt, accepting mutations that improve a full composite score including an LLM judge rating [2].

This hill-climbing approach belongs to a broader family of prompt optimization methods. DSPy, introduced by Khattab et al., formalizes prompt tuning as a compilation problem in which demonstrations and instructions are iteratively refined against a metric [14]. While JamOn's implementation uses a simpler accept/revert hill-climbing loop rather than DSPy's full programmatic abstraction, the underlying principle is shared: treat prompts as tunable parameters subject to automated search rather than fixed hand-crafted strings [2], [14]. Holdout validation on events excluded from optimization detects overfitting; when the train–holdout composite gap exceeds the 0.10 warning threshold documented in the harness, the optimizer flags possible prompt overfitting [2].

### 2.1.10. Spotify API Ecosystem

JamOn's orchestrator integrates with the Spotify Web API for authentication, library access, search, and playlist management [5]. User authentication follows the OAuth 2.0 authorization code flow, after which the orchestrator obtains access tokens scoped for playlist modification and library reading [15]. Library synchronization fetches each user's top 50 tracks via the GET /v1/me/top/tracks endpoint, together with artist genre metadata obtained through batch artist API calls [5], [2].

The inference pipeline's data engine returns a list of song title and artist pairs flagged as new suggestions; the orchestrator resolves each suggestion to a Spotify track URI via the search API and creates the final playlist on the user's account [5]. What the Spotify API does not provide — and what motivates the entire text-ification pipeline — is programmatic access to semantic audio descriptors or event-contextual recommendation given a free-text occasion description [4], [5]. The deprecated Audio Features endpoint previously supplied numeric energy and valence scores; its removal leaves integrators without a first-party mechanism for content-based semantic matching [4].

The orchestrator maintains sole responsibility for Spotify authentication and external API integration, preserving the strict separation between user-facing API calls and the data engine's machine-learning logic [5].

---

### References (preliminary — to be merged into Ch.6)

[1] P. Lewis et al., "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks," in Proc. Advances in Neural Information Processing Systems (NeurIPS), vol. 33, pp. 9459–9474, 2020.

[2] JamOn Project, "JamOn README — RAG Pipeline, Key Parameters, and Eval Loop," GitHub repository, 2026. [Online]. Available: https://github.com/jonatan5524/JamOn

[3] L. Gao et al., "Precise Zero-Shot Dense Retrieval without Relevance Labels," arXiv preprint arXiv:2212.10496, 2022.

[4] Spotify Developer, "Web API Reference — Audio Features," Spotify for Developers, 2024. [Online]. Available: https://developer.spotify.com/documentation/web-api/reference/get-audio-features. [NEEDS INPUT — pending team clarification on the official deprecation announcement URL to cite]

[5] JamOn Project, "CLAUDE.md — Project Architecture and Pipeline Specification," GitHub repository, 2026.

[6] G. Adomavicius and A. Tuzhilin, "Toward the Next Generation of Recommender Systems: A Survey of the State-of-the-Art and Possible Extensions," IEEE Trans. Knowledge and Data Engineering, vol. 17, no. 6, pp. 734–749, Jun. 2005.

[7] LangChain Inc., "LangGraph Documentation," 2024. [Online]. Available: https://langchain-ai.github.io/langgraph/

[8] A. Embiricos et al., "ChromaDB: The Open-Source Embedding Database," 2023. [Online]. Available: https://www.trychroma.com/

[9] P. Szafranski, "pgvector: Open-Source Vector Similarity Search for PostgreSQL," GitHub repository, 2024. [Online]. Available: https://github.com/pgvector/pgvector

[10] P. Resnick et al., "GroupLens: An Open Architecture for Collaborative Filtering of Netnews," in Proc. ACM Conf. Computer Supported Cooperative Work (CSCW), pp. 175–186, 1994.

[11] M. Pazzani and D. Billsus, "Content-Based Recommendation Systems," in The Adaptive Web, pp. 325–341, Springer, 2007.

[12] L. Baltrunas, T. Broderick, and F. Ricci, "Group Recommendations with Rank Aggregation and Collaborative Filtering," in Proc. 4th ACM Conf. Recommender Systems (RecSys), pp. 119–126, 2010.

[13] A. Masthoff, "Group Recommender Systems: Combining Individual Models," in Recommender Systems Handbook, pp. 677–702, Springer, 2011.

[14] O. Khattab et al., "DSPy: Compiling Declarative Language Model Calls into Self-Improving Pipelines," arXiv preprint arXiv:2310.03714, 2023.

[15] D. Hardt, "The OAuth 2.0 Authorization Framework," RFC 6749, IETF, Oct. 2012.
