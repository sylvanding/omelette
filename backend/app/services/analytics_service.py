"""Analytics service for reading productivity metrics."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING

from sqlalchemy import func, select

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.services.llm.client import LLMClient

from app.models.paper import Paper
from app.models.reading_session import ReadingSession

logger = logging.getLogger(__name__)


class AnalyticsService:
    """Service for computing reading analytics and productivity metrics."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def compute_papers_per_week(self, project_id: int) -> float:
        """Return average papers read per week based on read_at timestamps."""
        result = await self.db.execute(
            select(func.count())
            .select_from(Paper)
            .where(Paper.project_id == project_id, Paper.reading_status == "read", Paper.read_at.isnot(None))
        )
        total_read = result.scalar() or 0
        if total_read == 0:
            return 0.0

        result = await self.db.execute(
            select(Paper.read_at)
            .where(Paper.project_id == project_id, Paper.reading_status == "read", Paper.read_at.isnot(None))
            .order_by(Paper.read_at)
        )
        dates = [r[0] for r in result.all() if r[0]]
        if len(dates) < 2:
            return float(total_read)

        span_days = (dates[-1] - dates[0]).total_seconds() / 86400
        weeks = max(span_days / 7, 1)
        return round(total_read / weeks, 2)

    async def compute_avg_read_time(self, project_id: int) -> float:
        """Return average reading time in seconds across all sessions."""
        result = await self.db.execute(
            select(func.avg(ReadingSession.time_spent_seconds))
            .join(Paper, ReadingSession.paper_id == Paper.id)
            .where(Paper.project_id == project_id)
        )
        avg = result.scalar()
        return round(float(avg), 1) if avg else 0.0

    async def compute_reading_streak(self, project_id: int) -> int:
        """Return consecutive days of reading ending today (or most recent day)."""
        result = await self.db.execute(
            select(func.strftime("%Y-%m-%d", ReadingSession.started_at))
            .join(Paper, ReadingSession.paper_id == Paper.id)
            .where(Paper.project_id == project_id)
            .distinct()
            .order_by(func.strftime("%Y-%m-%d", ReadingSession.started_at).desc())
        )
        date_strs = [r[0] for r in result.all() if r[0]]
        if not date_strs:
            return 0

        reading_dates = sorted([datetime.strptime(d, "%Y-%m-%d").date() for d in date_strs], reverse=True)
        streak = 1
        for i in range(len(reading_dates) - 1):
            if (reading_dates[i] - reading_dates[i + 1]).days == 1:
                streak += 1
            else:
                break
        return streak

    async def compute_reading_activity_days(self, project_id: int, days: int = 90) -> list[dict]:
        """Return per-day reading activity for the last N days.

        Each entry has: { date: 'YYYY-MM-DD', count: int }.
        Days with no reading activity are included with count=0.
        """
        cutoff = (date.today() - timedelta(days=days - 1)).isoformat()
        result = await self.db.execute(
            select(
                func.strftime("%Y-%m-%d", Paper.read_at).label("day"),
                func.count().label("cnt"),
            )
            .where(
                Paper.project_id == project_id,
                Paper.reading_status == "read",
                Paper.read_at.isnot(None),
                func.strftime("%Y-%m-%d", Paper.read_at) >= cutoff,
            )
            .group_by("day")
            .order_by("day")
        )
        active_days = {r[0]: r[1] for r in result.all() if r[0]}

        output: list[dict] = []
        for i in range(days):
            d = date.today() - timedelta(days=days - 1 - i)
            output.append({"date": d.isoformat(), "count": active_days.get(d.isoformat(), 0)})
        return output

    async def compute_domain_coverage(self, project_id: int) -> float:
        """Return domain coverage score based on journal diversity.

        Uses the number of distinct journals as a proxy for domain breadth,
        normalized against a baseline of 10 domains (common research breadth).
        """
        result = await self.db.execute(
            select(func.count(func.distinct(Paper.journal))).where(
                Paper.project_id == project_id, Paper.journal != "", Paper.journal.isnot(None)
            )
        )
        distinct_journals = result.scalar() or 0
        return round(min(distinct_journals / 10, 1.0), 2)

    async def compute_citation_impact(self, project_id: int) -> dict:
        """Compute citation impact statistics for project papers."""
        result = await self.db.execute(
            select(
                func.min(Paper.citation_count),
                func.max(Paper.citation_count),
                func.avg(Paper.citation_count),
            ).where(Paper.project_id == project_id)
        )
        row = result.first()
        if not row or row[2] is None:
            return {"min": 0, "max": 0, "mean": 0.0, "median": 0.0, "p75": 0.0}

        min_cite, max_cite, mean_cite = row
        all_cites = (
            (
                await self.db.execute(
                    select(Paper.citation_count).where(Paper.project_id == project_id).order_by(Paper.citation_count)
                )
            )
            .scalars()
            .all()
        )

        median = self._percentile(all_cites, 50)
        p75 = self._percentile(all_cites, 75)

        return {
            "min": min_cite or 0,
            "max": max_cite or 0,
            "mean": round(float(mean_cite), 1),
            "median": round(float(median), 1),
            "p75": round(float(p75), 1),
        }

    async def analyze_knowledge_gaps(self, project_id: int, llm: LLMClient | None = None) -> dict:
        """Identify underrepresented topics based on journal/domain distribution.

        Uses journal names as a proxy for topic domains. Papers with unique journals
        appearing only once are flagged as potential knowledge gaps.
        """
        result = await self.db.execute(
            select(Paper.journal, func.count().label("cnt"))
            .where(Paper.project_id == project_id, Paper.journal != "", Paper.journal.isnot(None))
            .group_by(Paper.journal)
        )
        journal_counts = {row.journal: row.cnt for row in result.all()}

        if not journal_counts:
            return {"gaps": [], "total_topics_analyzed": 0, "coverage_score": 0.0}

        total_papers = sum(journal_counts.values())
        avg_per_journal = total_papers / len(journal_counts)

        gaps = []
        for journal, count in sorted(journal_counts.items(), key=lambda x: x[1]):
            if count < avg_per_journal * 0.5:
                gaps.append(
                    {
                        "topic": journal,
                        "relevance_score": round(count / avg_per_journal, 2),
                        "paper_count": count,
                    }
                )

        return {
            "gaps": gaps,
            "total_topics_analyzed": len(journal_counts),
            "coverage_score": round(min(len(journal_counts) / 10, 1.0), 2),
        }

    @staticmethod
    def _percentile(sorted_values: list, pct: float) -> float:
        """Compute percentile from a sorted list of values."""
        if not sorted_values:
            return 0.0
        k = (len(sorted_values) - 1) * (pct / 100)
        f = int(k)
        c = f + 1
        if c >= len(sorted_values):
            return float(sorted_values[f])
        d0 = sorted_values[f] * (c - k)
        d1 = sorted_values[c] * (k - f)
        return float(d0 + d1)
