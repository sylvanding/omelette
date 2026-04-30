"""Literature gap detection and research opportunity finder."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)

GAP_DETECTION_SYSTEM = (
    "You are a research strategy analyst. Given a collection of scientific papers with their "
    "titles, abstracts, tags, and publication years, analyze the collection to identify:\n"
    "1. UNDER-RESEARCHED SUBTOPICS (gaps): Areas that the current papers touch on but lack "
    "deep exploration. For each gap, provide a topic name, a description of what is missing, "
    "evidence showing why it is under-explored (citing specific paper IDs), and a gap_score (0-1).\n"
    "2. RESEARCH QUESTIONS: Candidate questions a researcher could pursue to fill these gaps. "
    "For each question, provide the question text, which gap it addresses, a novelty_score (0-1) "
    "indicating how novel the research would be, and a feasibility_score (0-1) indicating how "
    "tractable it is given the existing literature.\n\n"
    "Return ONLY valid JSON with this exact structure:\n"
    '{"gaps": [{"topic": "...", "description": "...", "evidence": "...", '
    '"related_paper_ids": [1, 2], "gap_score": 0.75}], '
    '"research_questions": [{"question": "...", "addresses_gap": "...", '
    '"novelty_score": 0.8, "feasibility_score": 0.6}], '
    '"summary": {"total_gaps": 4, "total_questions": 7}}'
)


class GapService:
    """Service for identifying research gaps and opportunities in a paper collection."""

    def __init__(self, llm: LLMClient):
        self.llm = llm

    async def analyze_gaps(self, papers: list[dict]) -> dict[str, Any]:
        """Analyze papers to find under-researched areas and generate research questions.

        Args:
            papers: List of dicts with paper_id, title, abstract, tags, and year.

        Returns:
            Dict with keys: gaps, research_questions, summary.
        """
        if len(papers) < 2:
            return _empty_response()

        paper_texts = []
        for p in papers[:30]:
            tags_str = ", ".join(p.get("tags") or [])
            abstract = (p.get("abstract") or "")[:1000]
            paper_texts.append(
                f"Paper ID: {p['paper_id']}\n"
                f"Title: {p.get('title', '')}\n"
                f"Year: {p.get('year', 'N/A')}\n"
                f"Tags: {tags_str}\n"
                f"Abstract: {abstract}"
            )

        messages = [
            {"role": "system", "content": GAP_DETECTION_SYSTEM},
            {
                "role": "user",
                "content": "Analyze this paper collection for research gaps and opportunities:\n\n"
                + "\n\n---\n\n".join(paper_texts),
            },
        ]

        try:
            result = await self.llm.chat_json(
                messages,
                temperature=0.5,
                task_type="gap_analysis",
            )
            return _validate_response(result)

        except Exception:
            logger.exception("Failed to analyze research gaps")
            return _empty_response()


def _validate_response(result: dict) -> dict[str, Any]:
    """Validate and sanitize LLM response into the expected format."""
    gaps = []
    for g in result.get("gaps", [])[:5]:
        gaps.append(
            {
                "topic": (g.get("topic") or "Unknown gap")[:200],
                "description": (g.get("description") or "")[:500],
                "evidence": (g.get("evidence") or "")[:500],
                "related_paper_ids": g.get("related_paper_ids", [])[:10],
                "gap_score": _clamp(g.get("gap_score", 0.5)),
            }
        )

    research_questions = []
    for q in result.get("research_questions", [])[:10]:
        research_questions.append(
            {
                "question": (q.get("question") or "")[:300],
                "addresses_gap": (q.get("addresses_gap") or "")[:200],
                "novelty_score": _clamp(q.get("novelty_score", 0.5)),
                "feasibility_score": _clamp(q.get("feasibility_score", 0.5)),
            }
        )

    summary = {
        "total_gaps": len(gaps),
        "total_questions": len(research_questions),
    }

    return {
        "gaps": gaps,
        "research_questions": research_questions,
        "summary": summary,
    }


def _clamp(value: Any) -> float:
    """Clamp a numeric value to [0.0, 1.0]."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 0.5
    return max(0.0, min(1.0, v))


def _empty_response() -> dict[str, Any]:
    """Return empty gap analysis for projects with insufficient data."""
    return {
        "gaps": [],
        "research_questions": [],
        "summary": {"total_gaps": 0, "total_questions": 0},
    }
