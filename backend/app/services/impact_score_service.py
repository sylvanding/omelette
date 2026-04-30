"""Impact scoring service — computes Omelette Impact Score (0-100) per paper."""

from __future__ import annotations

import math
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import select

from app.models.paper import Paper

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

# Weight factors for the composite score
CITATION_WEIGHT = 0.30
RECENCY_WEIGHT = 0.20
JOURNAL_WEIGHT = 0.20
EVIDENCE_WEIGHT = 0.15
FIELD_WEIGHT = 0.15


class ImpactScoreService:
    """Compute Omelette Impact Score combining citations, recency, journal prestige,
    evidence consensus, and field percentile."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def compute_scores(self, project_id: int) -> list[dict]:
        """Return impact scores for all papers in a project."""
        stmt = select(Paper).where(Paper.project_id == project_id)
        result = await self.db.execute(stmt)
        papers = result.scalars().all()

        if not papers:
            return []

        citation_counts = [p.citation_count for p in papers]
        max_citations = max(citation_counts) if citation_counts else 1

        years = [p.year for p in papers if p.year is not None]
        current_year = datetime.now().year
        max_age = max((current_year - min(years)), 1) if years else 1

        journal_paper_counts: dict[str, int] = {}
        for p in papers:
            if p.journal:
                journal_paper_counts[p.journal] = journal_paper_counts.get(p.journal, 0) + 1
        max_journal_count = max(journal_paper_counts.values()) if journal_paper_counts else 1

        sorted_cites = sorted(citation_counts)

        scores = []
        for paper in papers:
            citation_score = self._citation_score(paper.citation_count, max_citations)
            recency_score = self._recency_score(paper.year, current_year, max_age)
            journal_score = self._journal_score(paper.journal, journal_paper_counts, max_journal_count)
            evidence_score = self._evidence_score(paper)
            field_score = self._field_percentile(paper.citation_count, sorted_cites)

            composite = round(
                citation_score * CITATION_WEIGHT
                + recency_score * RECENCY_WEIGHT
                + journal_score * JOURNAL_WEIGHT
                + evidence_score * EVIDENCE_WEIGHT
                + field_score * FIELD_WEIGHT,
                1,
            )

            scores.append(
                {
                    "paper_id": paper.id,
                    "title": paper.title,
                    "score": composite,
                    "factors": {
                        "citations": {
                            "raw": paper.citation_count,
                            "normalized": round(citation_score, 2),
                            "weight": CITATION_WEIGHT,
                        },
                        "recency": {
                            "year": paper.year,
                            "normalized": round(recency_score, 2),
                            "weight": RECENCY_WEIGHT,
                        },
                        "journal": {
                            "name": paper.journal or "",
                            "normalized": round(journal_score, 2),
                            "weight": JOURNAL_WEIGHT,
                        },
                        "evidence_consensus": {
                            "quality_tags": paper.quality_tags or [],
                            "normalized": round(evidence_score, 2),
                            "weight": EVIDENCE_WEIGHT,
                        },
                        "field_percentile": {
                            "percentile": round(field_score, 2),
                            "normalized": round(field_score, 2),
                            "weight": FIELD_WEIGHT,
                        },
                    },
                }
            )

        return scores

    @staticmethod
    def _citation_score(count: int, max_count: int) -> float:
        """Log-scaled citation score in [0, 1]."""
        if max_count == 0:
            return 0.0
        return math.log1p(count) / math.log1p(max_count)

    @staticmethod
    def _recency_score(year: int | None, current_year: int, max_age: int) -> float:
        """Recency score: newer papers score higher. [0, 1]."""
        if year is None:
            return 0.3
        age = current_year - year
        return max(0, 1 - (age / max(max_age, 1)))

    @staticmethod
    def _journal_score(journal: str | None, journal_counts: dict[str, int], max_count: int) -> float:
        """Journal prestige proxy: journals with more papers in the collection
        are treated as more established/relevant. [0, 1]."""
        if not journal or journal not in journal_counts:
            return 0.2
        return journal_counts[journal] / max_count

    @staticmethod
    def _evidence_score(paper: Paper) -> float:
        """Evidence consensus based on quality_tags and rating. [0, 1]."""
        score = 0.5
        tags = paper.quality_tags or []
        positive_tags = {"high_quality", "strong_evidence", "replicable", "open_data"}
        negative_tags = {"low_quality", "weak_evidence", "retracted", "questionable"}

        for tag in tags:
            tag_lower = tag.lower().replace(" ", "_")
            if tag_lower in positive_tags:
                score += 0.15
            elif tag_lower in negative_tags:
                score -= 0.15

        rating = getattr(paper, "rating", 0) or 0
        score += (rating / 5) * 0.2

        return max(0.0, min(1.0, score))

    @staticmethod
    def _field_percentile(count: int, sorted_cites: list[int]) -> float:
        """Field-normalized percentile rank based on citation count within project."""
        if not sorted_cites:
            return 0.0
        below = sum(1 for c in sorted_cites if c < count)
        return below / len(sorted_cites)
