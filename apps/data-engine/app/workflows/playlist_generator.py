import asyncio
import random
import logging
from typing import List, Dict, Any, Callable, Awaitable
from langgraph.graph import StateGraph, START, END

from app.models.state import PlaylistState

logger = logging.getLogger(__name__)

class PlaylistGraphBuilder:
    def __init__(
        self, 
        llm_generator: Callable[[str, int, List[str], List[Dict[str, Any]], List[str]], Awaitable[List[Dict[str, Any]]]],
        db_fetcher: Callable[[str], Awaitable[List[Dict[str, Any]]]], 
        uri_validator: Callable[[Dict[str, Any]], Awaitable[bool]], 
        target_wildcards: int = 5, 
        max_attempts: int = 3
    ):
        self.llm_generator = llm_generator
        self.db_fetcher = db_fetcher
        self.uri_validator = uri_validator
        self.target_wildcards = target_wildcards
        self.max_attempts = max_attempts

    async def initial_fetch(self, state: PlaylistState) -> Dict[str, Any]:
        logger.info(f"Starting initial fetch for event: {state.event_description}")
        # Sequential: Fetch DB songs first, then use them as context for LLM
        db_songs = await self.db_fetcher(state.event_description)
        anchor_artists = list({s["artist"] for s in db_songs if s.get("artist")})
        candidate_wildcards = await self.llm_generator(
            state.event_description,
            self.target_wildcards,
            [],
            db_songs,
            anchor_artists,
        )

        return {
            "db_songs": db_songs,
            "anchor_artists": anchor_artists,
            "candidate_wildcards": candidate_wildcards,
            "attempts": 1
        }

    async def validate(self, state: PlaylistState) -> Dict[str, Any]:
        logger.info(f"Validating {len(state.candidate_wildcards)} candidate wildcards")
        validated = list(state.validated_wildcards)
        rejected = list(state.rejected_wildcards)
        candidates = state.candidate_wildcards
        
        if candidates:
            # Parallel async validation using the injected uri_validator
            validation_results = await asyncio.gather(*(self.uri_validator(song) for song in candidates))
            for song, is_valid in zip(candidates, validation_results):
                if is_valid:
                    validated.append(song)
                    logger.info(
                        f"  [wildcard ACCEPTED] {song.get('title', 'Unknown')} "
                        f"— {song.get('artist', 'Unknown')}"
                    )
                else:
                    song_name = f"{song.get('title', 'Unknown')} by {song.get('artist', 'Unknown')}"
                    rejected.append(song_name)
                    logger.warning(f"Rejected song: {song_name}")
                    
        return {
            "validated_wildcards": validated,
            "rejected_wildcards": rejected,
            "candidate_wildcards": []
        }

    async def regenerate(self, state: PlaylistState) -> Dict[str, Any]:
        missing = self.target_wildcards - len(state.validated_wildcards)
        logger.info(f"Regenerating {missing} missing wildcards (Attempt {state.attempts + 1})")
        
        new_candidates = await self.llm_generator(
            state.event_description,
            missing,
            state.rejected_wildcards,
            state.db_songs,
            state.anchor_artists,
        )
        
        return {
            "candidate_wildcards": new_candidates,
            "attempts": state.attempts + 1
        }

    def should_finalize(self, state: PlaylistState) -> str:
        if len(state.validated_wildcards) >= self.target_wildcards:
            logger.info("Target wildcards reached. Proceeding to finalize.")
            return "merge_and_shuffle"
        
        if state.attempts >= self.max_attempts:
            logger.info(f"Max attempts ({self.max_attempts}) reached. Proceeding to finalize.")
            return "merge_and_shuffle"
        
        return "regenerate"

    async def merge_and_shuffle(self, state: PlaylistState) -> Dict[str, Any]:
        logger.info("Merging database songs and validated wildcards")
        combined = state.db_songs + state.validated_wildcards
        
        seen = set()
        deduped = []
        for song in combined:
            key = f"{song.get('title', '').lower()} - {song.get('artist', '').lower()}"
            if key not in seen:
                seen.add(key)
                deduped.append(song)
                
        random.shuffle(deduped)

        library_count = sum(1 for s in deduped if s.get("source") != "new_suggestion")
        ai_count = len(deduped) - library_count
        logger.info(
            f"Final playlist: {len(deduped)} songs — "
            f"{library_count} from library, {ai_count} AI-generated"
        )
        for song in deduped:
            source = "AI" if song.get("source") == "new_suggestion" else "LIBRARY"
            dist = song.get("distance")
            dist_str = f" | cosine_dist={dist:.4f}" if dist is not None else ""
            logger.info(
                f"  [{source}] {song.get('title', 'Unknown')} "
                f"— {song.get('artist', 'Unknown')}{dist_str}"
            )

        return {"final_playlist": deduped}

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
