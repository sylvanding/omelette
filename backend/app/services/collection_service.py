"""Collection service: CRUD for paper collections and AI smart tagging."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)

SMART_TAG_SYSTEM = (
    "You are a research organization assistant. Given the titles and abstracts of scientific papers, "
    "suggest 3-5 relevant tags for each paper. Tags should be concise, descriptive keywords "
    "that capture the paper's key topics, methods, or domains. Return ONLY valid JSON with the structure: "
    '{"tags": [{"paper_id": 1, "suggested_tags": ["tag1", "tag2", "tag3"]}]}'
)


class CollectionService:
    """Service for managing paper collections and smart tagging."""

    def __init__(self, llm: LLMClient):
        self.llm = llm

    async def suggest_tags(self, papers: list[dict]) -> dict:
        """Generate AI-suggested tags for a list of papers.

        Args:
            papers: List of dicts with paper_id, title, and abstract.

        Returns:
            Dict mapping paper_id to list of suggested tags.
        """
        if not papers:
            return {"tags": []}

        paper_texts = []
        for p in papers[:20]:
            abstract = (p.get("abstract") or "")[:1000]
            paper_texts.append(f"Paper ID: {p['paper_id']}\nTitle: {p.get('title', '')}\nAbstract: {abstract}")

        messages = [
            {"role": "system", "content": SMART_TAG_SYSTEM},
            {
                "role": "user",
                "content": "Papers to tag:\n\n" + "\n\n---\n\n".join(paper_texts),
            },
        ]

        try:
            result = await self.llm.chat_json(
                messages,
                temperature=0.5,
                task_type="smart_tagging",
            )

            tags = result.get("tags", [])
            valid_items = []
            for t in tags:
                paper_id = t.get("paper_id")
                suggested = t.get("suggested_tags", [])
                if paper_id is not None and suggested:
                    valid_items.append(
                        {
                            "paper_id": paper_id,
                            "suggested_tags": [str(tag)[:50] for tag in suggested[:5]],
                        }
                    )

            return {"tags": valid_items}

        except Exception:
            logger.exception("Failed to generate smart tags")
            return {"tags": []}
