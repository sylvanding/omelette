"""Contradiction detection service: identifies conflicting claims across papers."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)

CONTRADICTION_SYSTEM = (
    "You are a research analysis assistant. Given the titles and abstracts of scientific papers, "
    "identify pairs of papers that contradict each other on specific claims or findings. "
    "For each contradiction, provide: the two paper IDs and titles, the specific claim they disagree on, "
    "each paper's position on that claim, a confidence score (0-1), and a topic/category for the contradiction. "
    "Also group contradictions by topic. Return ONLY valid JSON with the structure: "
    '{"contradictions": [{"paper_a_id": 1, "paper_a_title": "...", "paper_b_id": 2, '
    '"paper_b_title": "...", "claim": "...", "position_a": "...", "position_b": "...", '
    '"confidence": 0.85, "topic": "..."}], "topics": ["topic1", "topic2"]}'
)


class ContradictionService:
    """Service for detecting contradictions across papers in a project."""

    def __init__(self, llm: LLMClient):
        self.llm = llm

    async def detect_contradictions(self, papers: list[dict]) -> dict:
        """Analyze papers to find contradictory claims or findings.

        Args:
            papers: List of dicts with paper_id, title, and abstract/content.

        Returns:
            Dict with contradiction pairs grouped by topic, including confidence scores.
        """
        if len(papers) < 2:
            return {"contradictions": [], "topics": [], "total_contradictions": 0}

        # Truncate each paper to avoid token overflow; limit to 20 papers
        paper_texts = []
        for p in papers[:20]:
            abstract = (p.get("abstract") or p.get("content") or "")[:1500]
            paper_texts.append(f"Paper ID: {p['paper_id']}\nTitle: {p.get('title', '')}\nAbstract: {abstract}")

        messages = [
            {"role": "system", "content": CONTRADICTION_SYSTEM},
            {
                "role": "user",
                "content": "Papers to analyze for contradictions:\n\n" + "\n\n---\n\n".join(paper_texts),
            },
        ]

        try:
            result = await self.llm.chat_json(
                messages,
                temperature=0.3,
                task_type="contradiction_detection",
            )

            contradictions = result.get("contradictions", [])

            valid_items = []
            for c in contradictions:
                confidence = float(c.get("confidence", 0.5))
                if confidence < 0.0:
                    confidence = 0.0
                elif confidence > 1.0:
                    confidence = 1.0

                valid_items.append(
                    {
                        "paper_a_id": c.get("paper_a_id"),
                        "paper_a_title": (c.get("paper_a_title") or "")[:300],
                        "paper_b_id": c.get("paper_b_id"),
                        "paper_b_title": (c.get("paper_b_title") or "")[:300],
                        "claim": (c.get("claim") or "")[:500],
                        "position_a": (c.get("position_a") or "")[:500],
                        "position_b": (c.get("position_b") or "")[:500],
                        "confidence": round(confidence, 3),
                        "topic": (c.get("topic") or "uncategorized")[:100],
                    }
                )

            # Collect unique topics from contradictions
            all_topics = list({c["topic"] for c in valid_items})

            return {
                "contradictions": valid_items,
                "topics": all_topics,
                "total_contradictions": len(valid_items),
            }

        except Exception:
            logger.exception("Failed to detect contradictions")
            return {"contradictions": [], "topics": [], "total_contradictions": 0}
