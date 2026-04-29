"""Paper comparison service — generates side-by-side analysis of multiple papers."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Paper
from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)

COMPARISON_DIMENSIONS = [
    "research_question",
    "method",
    "dataset",
    "key_results",
    "limitations",
]

COMPARISON_SYSTEM_PROMPT = """You are an expert research analyst. Given multiple scientific papers, produce a structured comparison.

Respond with valid JSON only, no markdown or explanation. The JSON must have this exact structure:
{
  "dimensions": {
    "research_question": {"paper_<id>": "summary for this paper", ...},
    "method": {"paper_<id>": "summary for this paper", ...},
    "dataset": {"paper_<id>": "summary for this paper", ...},
    "key_results": {"paper_<id>": "summary for this paper", ...},
    "limitations": {"paper_<id>": "summary for this paper", ...}
  },
  "summary": "A concise paragraph highlighting key differences, contradictions, and complementary findings across the papers. Reference papers by their titles."
}

Keep each dimension cell to 2-3 sentences. Be specific and cite concrete details from each paper."""


class ComparisonService:
    def __init__(self, db: AsyncSession, llm: LLMClient):
        self.db = db
        self.llm = llm

    async def compare_papers(
        self,
        paper_ids: list[int],
        focus: str | None = None,
    ) -> dict:
        """Generate a comparison of the given papers using LLM analysis."""
        if len(paper_ids) < 2 or len(paper_ids) > 5:
            raise ValueError("Must compare between 2 and 5 papers")

        stmt = select(Paper).where(Paper.id.in_(paper_ids))
        result = await self.db.execute(stmt)
        papers = result.scalars().all()

        if len(papers) < 2:
            raise ValueError("At least 2 papers must exist in the database")

        papers_by_id = {p.id: p for p in papers}
        ordered = [papers_by_id[pid] for pid in paper_ids if pid in papers_by_id]

        focus_clause = f"\nFocus specifically on: {focus}" if focus else ""

        paper_contexts = []
        for p in ordered:
            authors = ", ".join(a.get("name", "") for a in (p.authors or [])[:3])
            paper_contexts.append(
                f'paper_{p.id}: "{p.title}"\n'
                f"Authors: {authors}\n"
                f"Year: {p.year or 'N/A'}\n"
                f"Journal: {p.journal or 'N/A'}\n"
                f"Citations: {p.citation_count}\n"
                f"Abstract: {p.abstract or 'N/A'}"
            )

        prompt = "Compare the following research papers:\n\n" + "\n\n---\n\n".join(paper_contexts) + focus_clause

        response = await self.llm.chat_json(
            messages=[
                {"role": "system", "content": COMPARISON_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            task_type="paper_comparison",
        )

        return self._format_response(response, ordered)

    @staticmethod
    def _format_response(raw: dict, papers: list[Paper]) -> dict:
        """Normalize the LLM response into the API response format."""
        dimensions = raw.get("dimensions", {})
        summary = raw.get("summary", "")

        rows = []
        for dim in COMPARISON_DIMENSIONS:
            cells: list[dict] = []
            for p in papers:
                key = f"paper_{p.id}"
                cells.append(
                    {
                        "paper_id": p.id,
                        "content": dimensions.get(dim, {}).get(key, "—"),
                    }
                )
            rows.append({"dimension": dim, "cells": cells})

        meta_rows = [
            {
                "dimension": "year",
                "cells": [{"paper_id": p.id, "content": str(p.year or "—")} for p in papers],
            },
            {
                "dimension": "citation_count",
                "cells": [{"paper_id": p.id, "content": str(p.citation_count)} for p in papers],
            },
        ]

        return {
            "papers": [
                {
                    "id": p.id,
                    "title": p.title,
                    "authors": p.authors,
                    "year": p.year,
                    "journal": p.journal,
                    "citation_count": p.citation_count,
                }
                for p in papers
            ],
            "dimensions": rows + meta_rows,
            "summary": summary,
        }
