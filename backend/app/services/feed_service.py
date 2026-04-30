"""Personalized research feed service: paper recommendations based on reading history and interests."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)

FEED_SYSTEM_PROMPT = (
    "You are a research assistant. Given a researcher's profile including their reading history, "
    "liked papers, keywords, and recent activity, recommend 10-20 relevant papers that would be "
    "valuable additions to their library. For each paper, provide a relevance score (0.0-1.0) "
    "and a brief reason why it is recommended. Return ONLY valid JSON with the structure: "
    '{"recommendations": [{"title": "...", "authors": "...", "year": N, "abstract": "...", '
    '"doi": "...", "relevance_score": 0.0, "reason": "..."}]}'
)


class FeedService:
    """Service for personalized paper recommendations."""

    def __init__(self, llm: LLMClient):
        self.llm = llm

    async def get_feed(
        self,
        *,
        papers: list[dict],
        reading_history: list[dict],
        liked_paper_ids: list[int],
        keywords: list[str],
        recent_activity: list[dict],
    ) -> list[dict]:
        """Generate personalized paper recommendations.

        Args:
            papers: Papers in the project with metadata.
            reading_history: Papers the user has read (with read time).
            liked_paper_ids: IDs of papers the user liked.
            keywords: User's subscription keywords.
            recent_activity: Recent project activity.

        Returns:
            List of recommended paper dicts with relevance_score and reason.
        """
        profile_parts = []

        if papers:
            paper_texts = []
            for p in papers[:20]:
                abstract = (p.get("abstract") or "")[:500]
                paper_texts.append(f"ID: {p['paper_id']}, Title: {p.get('title', '')}, Abstract: {abstract}")
            profile_parts.append(f"Current library papers:\n{chr(10).join(paper_texts)}")

        if reading_history:
            read_texts = []
            for r in reading_history[:15]:
                read_texts.append(f"Paper: {r.get('title', '')}, Read time: {r.get('read_time_seconds', 0)}s")
            profile_parts.append(f"Reading history:\n{chr(10).join(read_texts)}")

        if liked_paper_ids:
            liked = [p for p in papers if p["paper_id"] in liked_paper_ids]
            if liked:
                liked_texts = [f"{p.get('title', '')}" for p in liked[:10]]
                profile_parts.append(f"Liked papers:\n{chr(10).join(liked_texts)}")

        if keywords:
            profile_parts.append(f"Keywords: {', '.join(keywords)}")

        if recent_activity:
            profile_parts.append(f"Recent activity: {len(recent_activity)} events in the project")

        if not profile_parts:
            return []

        messages = [
            {"role": "system", "content": FEED_SYSTEM_PROMPT},
            {"role": "user", "content": "Researcher profile:\n\n" + "\n\n".join(profile_parts)},
        ]

        try:
            result = await self.llm.chat_json(
                messages,
                temperature=0.5,
                task_type="research_feed",
            )
            recommendations = result.get("recommendations", [])

            valid = []
            for r in recommendations:
                title = (r.get("title") or "").strip()
                if not title:
                    continue
                score = r.get("relevance_score", 0)
                if not isinstance(score, int | float):
                    score = 0.5
                score = max(0.0, min(1.0, float(score)))

                valid.append(
                    {
                        "title": title[:300],
                        "authors": r.get("authors", ""),
                        "year": r.get("year"),
                        "abstract": (r.get("abstract") or "")[:1000],
                        "doi": r.get("doi", ""),
                        "relevance_score": round(score, 2),
                        "reason": (r.get("reason") or "")[:200],
                    }
                )

            return valid[:20]

        except Exception:
            logger.exception("Failed to generate research feed")
            return []

    async def submit_feedback(
        self,
        *,
        paper_id: int,
        feedback: str,
        previous_score: float,
    ) -> dict:
        """Record user feedback on a recommendation to improve future suggestions.

        Args:
            paper_id: The paper the user gave feedback on.
            feedback: "like" or "dislike".
            previous_score: The relevance score that was shown.

        Returns:
            Dict with updated score and acknowledgment.
        """
        is_like = feedback.lower() in ("like", "upvote", "positive")
        new_score = min(1.0, previous_score + 0.1) if is_like else max(0.0, previous_score - 0.1)

        return {
            "paper_id": paper_id,
            "feedback": feedback,
            "previous_score": previous_score,
            "adjusted_score": round(new_score, 2),
            "acknowledged": True,
        }
