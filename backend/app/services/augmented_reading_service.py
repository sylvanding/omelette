"""Augmented reading service: skimming highlights, citation cards, and definitions."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)


HIGHLIGHT_SYSTEM = (
    "You are a research reading assistant. "
    "Analyze the given paper content and classify sections into three categories: "
    "Goal (research objectives and questions), Method (methodology and approach), "
    "and Result (key findings and conclusions). "
    "Return ONLY valid JSON with the structure: "
    '{"highlights": [{"category": "Goal|Method|Result", "text": "excerpt", "page": 1, "start_offset": 0, "end_offset": 100}]}'
)

CITATION_CARD_SYSTEM = (
    "You are a research assistant. "
    "For each paper provided, generate a concise TLDR (2-3 sentences) summarizing "
    "the core contribution, methodology, and key finding. "
    "Return ONLY valid JSON with the structure: "
    '{"citations": [{"paper_id": 1, "paper_title": "...", "tldr": "...", "doi": "..."}]}'
)

DEFINITION_SYSTEM = (
    "You are a research assistant. "
    "Identify key technical terms and concepts from the paper and provide clear, "
    "concise definitions suitable for a graduate-level researcher. "
    "Return ONLY valid JSON with the structure: "
    '{"definitions": [{"term": "...", "definition": "...", "context": "..."}]}'
)


class AugmentedReadingService:
    """Service for AI-augmented PDF reading features."""

    def __init__(self, llm: LLMClient):
        self.llm = llm

    async def generate_highlights(self, paper_content: str, max_highlights: int = 15) -> list[dict]:
        """Classify paper sections as Goal/Method/Result for skimming highlights."""
        # Truncate to avoid exceeding token limits
        truncated = paper_content[:8000]

        messages = [
            {"role": "system", "content": HIGHLIGHT_SYSTEM},
            {"role": "user", "content": f"Analyze this paper content:\n\n{truncated}"},
        ]

        try:
            result = await self.llm.chat_json(
                messages,
                temperature=0.2,
                task_type="augmented_reading_highlights",
            )
            highlights = result.get("highlights", [])
            # Validate and normalize
            valid_categories = {"Goal", "Method", "Result"}
            return [
                {
                    "category": h.get("category", "Result"),
                    "text": h.get("text", "")[:500],
                    "page": int(h.get("page", 1)),
                    "start_offset": int(h.get("start_offset", 0)),
                    "end_offset": int(h.get("end_offset", 100)),
                }
                for h in highlights[:max_highlights]
                if h.get("category") in valid_categories and h.get("text")
            ]
        except Exception:
            logger.exception("Failed to generate highlights")
            return []

    async def generate_citation_cards(self, papers: list[dict]) -> list[dict]:
        """Generate TLDR citation cards for a list of papers."""
        if not papers:
            return []

        paper_texts = []
        for p in papers[:10]:  # Limit to avoid token overflow
            abstract = p.get("abstract", "") or ""
            title = p.get("title", "") or ""
            paper_texts.append(f"Title: {title}\nAbstract: {abstract[:1000]}")

        messages = [
            {"role": "system", "content": CITATION_CARD_SYSTEM},
            {"role": "user", "content": "Generate TLDRs for these papers:\n\n" + "\n\n---\n\n".join(paper_texts)},
        ]

        try:
            result = await self.llm.chat_json(
                messages,
                temperature=0.3,
                task_type="augmented_reading_citation_cards",
            )
            cards = result.get("citations", [])
            return [
                {
                    "paper_id": c.get("paper_id"),
                    "paper_title": c.get("paper_title", ""),
                    "tldr": c.get("tldr", "")[:500],
                    "doi": c.get("doi"),
                }
                for c in cards[:10]
            ]
        except Exception:
            logger.exception("Failed to generate citation cards")
            return []

    async def generate_definitions(self, paper_content: str) -> list[dict]:
        """Extract and define key technical terms from paper content."""
        truncated = paper_content[:6000]

        messages = [
            {"role": "system", "content": DEFINITION_SYSTEM},
            {"role": "user", "content": f"Extract definitions from this content:\n\n{truncated}"},
        ]

        try:
            result = await self.llm.chat_json(
                messages,
                temperature=0.2,
                task_type="augmented_reading_definitions",
            )
            definitions = result.get("definitions", [])
            return [
                {
                    "term": d.get("term", "")[:100],
                    "definition": d.get("definition", "")[:500],
                    "context": d.get("context", "")[:300],
                }
                for d in definitions[:20]
                if d.get("term") and d.get("definition")
            ]
        except Exception:
            logger.exception("Failed to generate definitions")
            return []
