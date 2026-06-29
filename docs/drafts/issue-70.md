# 1. Introduction

## 1.1. Background

Music has long served as the social fabric of shared experiences — from house parties and road trips to study groups and workplace gatherings. The ubiquity of music streaming has fundamentally changed how individuals discover and consume music: as of 2024, Spotify alone reported over 600 million monthly active users, with listening increasingly occurring in social settings rather than in isolation [1]. Yet despite this shift toward communal listening, the tools available for generating shared playlists have failed to keep pace with the complexity of group musical preference.

Existing playlist generation systems address individual users well but fall short in multi-participant, event-driven contexts. Spotify's AI DJ feature, introduced in 2023, delivers a personalised radio-like experience driven by a closed proprietary model — but it is designed for a single listener and provides no mechanism for incorporating the tastes of multiple participants or tailoring output to a specific event's atmosphere [2]. Spotify Jam, the platform's collaborative listening feature, allows multiple users to add songs to a shared queue; however, it applies no intelligent filtering or vibe matching — the resulting playlist is determined entirely by manual, additive contributions rather than by semantic understanding of the occasion [3]. Apple's SharePlay offers similar collaborative audio capability within the Apple ecosystem, again without any event-contextual or preference-aware generation logic [4]. These solutions share a fundamental design assumption: playlist curation is either a solo activity or a manual group activity. Neither captures the event description — "late night study session," "rooftop birthday party," "morning gym session" — as a first-class input.

A more significant gap exists at the intersection of semantic retrieval and personal music libraries. No commercially available system converts a natural-language event description into a curated playlist by indexing a user's own listening history as semantic embeddings. Retrieval-Augmented Generation (RAG), which has demonstrated strong performance in knowledge-grounded natural language tasks [5], offers a principled framework for this problem: represent each song as descriptive text, embed it into a shared semantic space, and retrieve contextually matching tracks at query time. JamOn is built on this principle, replacing deprecated numeric audio feature APIs with large language model (LLM) generated vibe tags — making the personal music library semantically queryable for the first time.

---

### References (preliminary — to be merged into Ch.6)

[1] Spotify Technology S.A., "Spotify Reports Fourth Quarter and Full Year 2023 Results," Investor Relations, Feb. 2024. [Online]. Available: https://newsroom.spotify.com

[2] Spotify Newsroom, "Spotify's AI DJ Is Now Available in More Than 50 Markets," Sep. 2023. [Online]. Available: https://newsroom.spotify.com

[3] Spotify Support, "Spotify Jam," Spotify Help Center, 2023. [Online]. Available: https://support.spotify.com

[4] Apple Inc., "Use SharePlay to watch, listen, and play together," Apple Support, 2023. [Online]. Available: https://support.apple.com

[5] P. Lewis et al., "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks," in *Advances in Neural Information Processing Systems (NeurIPS)*, vol. 33, pp. 9459–9474, 2020.
