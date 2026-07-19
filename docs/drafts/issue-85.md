## 4.4 Comparison with Existing Approaches

JamOn differs from existing music-selection approaches by combining three inputs that are usually treated separately: a personal listening library, a natural-language event description, and a retrieval-augmented generation workflow. Conventional recommenders primarily infer what a listener may like from previous behavior or item similarity, whereas JamOn treats the event description as the active query and the indexed participant libraries as the retrieval corpus [2], [5]. This distinction is central: the system is not merely recommending familiar songs, but selecting and completing a playlist for a stated social or situational context.

Figure 4.2 summarizes the main comparison.

| Feature | Spotify DJ | Spotify Jam | Last.fm / Pandora-style radio | JamOn |
|---------|-------------|-------------|--------------------------------|-------|
| Personal library grounding | Single listener profile | Manual participant queue | Tag or station based | Indexed participant libraries |
| Event description as input | No documented free-text event query | No | No | Yes |
| Semantic retrieval | Closed proprietary behavior | No | Limited tag/station matching | HyDE-expanded vector retrieval |
| Playlist generation | AI-curated stream | Shared queue | Radio-like continuation | RAG spine plus validated wildcards |
| Catalog validation | Internal platform behavior | User-selected tracks | Platform-managed playback | Spotify URI validation loop |
| Group/event suitability | Limited to one listener profile | Collaborative but not semantic | Not event-contextual | Event-scoped retrieval over participant libraries |

Figure 4.2: Comparison of JamOn with existing music-selection approaches.

Spotify DJ provides AI-assisted music curation, but it is organized around a single listener experience rather than an explicit event-level query. It does not expose the personal-library indexing, vector-search parameters, HyDE expansion, or validation loop that JamOn implements. JamOn instead retrieves songs from the relevant participant library scope, identifies a strong semantic spine, and asks the DJ model only to fill the remaining gaps with wildcard suggestions [2]. The result is a pipeline whose intermediate choices are visible and tunable through parameters such as `max_distance`, `strong_match_margin`, and `target_wildcards` [2].

Spotify Jam addresses a different problem: collaboration. It allows multiple people to contribute to a shared listening session, but it does not, by itself, perform semantic event matching. A shared queue can collect preferences, yet the coherence of the final playlist still depends on manual choices. JamOn automates the coherence step by using the event description as the retrieval query and by validating generated additions before they enter the final playlist [2], [5].

Tag-based radio systems such as Last.fm or Pandora-style stations are closer to content-based recommendation, because they can use artist, genre, or tag similarity. However, they are not designed around a full event sentence such as "late night study session." JamOn's text-ification pipeline represents each song as descriptive natural language: LLM-generated energy, mood, and vibe tags are embedded with lyric-derived context, replacing raw numeric audio-feature dependence [5]. This representation is better aligned with human event descriptions because both the query and the indexed songs occupy a textual semantic space [2].

The contrast with Spotify Audio Features is also important. Numeric audio descriptors can represent tempo-like or valence-like dimensions, but the project explicitly avoids the deprecated audio-features endpoint and instead uses LLM-generated descriptive metadata [5]. The advantage is not that text tags are universally more accurate than audio analysis; rather, they support semantic matching against everyday language, where phrases such as "calm rainy morning" or "high-energy pregame" carry contextual meaning that is difficult to express as isolated numeric values.

Finally, HyDE improves the retrieval interface by expanding a short event phrase into a richer synthetic song description before embedding [2], [3]. The available project sources do not report an A/B test comparing HyDE directly against raw query embedding, so no quantitative advantage is claimed here. Nevertheless, the design rationale is clear: a short phrase is not in the same embedding space as the richer tag-and-lyrics documents stored for songs, and HyDE reduces this semantic gap by making the query resemble the indexed documents [2], [3].
