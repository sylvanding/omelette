"""Research trend analysis service: computes temporal insights from project papers."""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class TrendService:
    """Analyze research topic trends over time from papers in a project."""

    def __init__(self, db: AsyncSession):
        self._db = db

    async def compute_trends(self, project_id: int) -> dict[str, Any]:
        """Extract year-binned topic data and detect emerging/declining trends.

        Args:
            project_id: The project to analyze.

        Returns:
            Dict with keys: publication_timeline, topic_trends,
            emerging_topics, declining_topics, summary_stats.
        """
        from sqlalchemy import select

        from app.models import Paper

        stmt = select(Paper).where(Paper.project_id == project_id)
        result = await self._db.execute(stmt)
        papers = result.scalars().all()

        if not papers:
            return _empty_response()

        # Publication volume by year
        volume_by_year: dict[int, int] = defaultdict(int)
        # Topic counts by year: {topic: {year: count}}
        topic_year_counts: dict[str, dict[int, int]] = defaultdict(lambda: defaultdict(int))
        # Citation counts by year
        citations_by_year: dict[int, int] = defaultdict(int)

        for paper in papers:
            year = paper.year
            if year is None:
                continue

            volume_by_year[year] += 1
            citations_by_year[year] += paper.citation_count or 0

            # Extract topics from tags and keywords in extra_metadata
            topics = _extract_topics(paper)
            for topic in topics:
                topic_year_counts[topic][year] += 1

        sorted_years = sorted(volume_by_year.keys())

        # Build publication timeline
        publication_timeline = [
            {"year": year, "count": volume_by_year[year], "citations": citations_by_year.get(year, 0)}
            for year in sorted_years
        ]

        # Compute trend slopes for each topic
        topic_trends = []
        emerging_topics = []
        declining_topics = []

        for topic, year_counts in topic_year_counts.items():
            years = sorted(year_counts.keys())
            counts = [year_counts[y] for y in years]

            slope, r_squared = _linear_regression(years, counts)
            avg_count = sum(counts) / len(counts)

            # YoY growth for latest year
            yoy_growth = _yoy_growth(years, counts)

            trend_direction = _classify_trend(slope, avg_count)

            topic_data = {
                "topic": topic,
                "slope": round(slope, 4),
                "r_squared": round(r_squared, 3),
                "trend": trend_direction,
                "total_papers": sum(counts),
                "first_year": years[0],
                "last_year": years[-1],
                "yearly_counts": [{"year": y, "count": year_counts[y]} for y in years],
            }

            topic_trends.append(topic_data)

            if yoy_growth is not None and yoy_growth > 0.5:
                emerging_topics.append({"topic": topic, "yoy_growth": round(yoy_growth, 3)})
            elif yoy_growth is not None and yoy_growth < -0.3:
                declining_topics.append({"topic": topic, "yoy_growth": round(yoy_growth, 3)})

        # Sort topic trends by total_papers descending
        topic_trends.sort(key=lambda x: x["total_papers"], reverse=True)
        emerging_topics.sort(key=lambda x: x["yoy_growth"], reverse=True)
        declining_topics.sort(key=lambda x: x["yoy_growth"])

        # Summary stats
        total_papers = sum(volume_by_year.values())
        total_topics = len(topic_year_counts)
        year_span = sorted_years[-1] - sorted_years[0] + 1 if sorted_years else 0

        summary_stats = {
            "total_papers": total_papers,
            "year_span": year_span,
            "first_year": sorted_years[0] if sorted_years else None,
            "last_year": sorted_years[-1] if sorted_years else None,
            "total_topics": total_topics,
            "emerging_count": len(emerging_topics),
            "declining_count": len(declining_topics),
        }

        return {
            "publication_timeline": publication_timeline,
            "topic_trends": topic_trends,
            "emerging_topics": emerging_topics,
            "declining_topics": declining_topics,
            "summary_stats": summary_stats,
        }


def _extract_topics(paper: Any) -> list[str]:
    """Extract topic keywords from a paper's tags and metadata."""
    topics: list[str] = []

    if paper.tags:
        topics.extend(str(t).strip().lower() for t in paper.tags if str(t).strip())

    if paper.extra_metadata:
        for key in ("keywords", "topics", "concepts"):
            if key in paper.extra_metadata:
                val = paper.extra_metadata[key]
                if isinstance(val, list):
                    topics.extend(str(v).strip().lower() for v in val if str(v).strip())
                elif isinstance(val, str) and val.strip():
                    topics.extend(t.strip().lower() for t in val.split(",") if t.strip())

    return list(dict.fromkeys(topics))


def _linear_regression(x: list[int], y: list[int]) -> tuple[float, float]:
    """Compute simple linear regression slope and R-squared."""
    n = len(x)
    if n < 2:
        return 0.0, 0.0

    x_mean = sum(x) / n
    y_mean = sum(y) / n

    ss_xy = sum((xi - x_mean) * (yi - y_mean) for xi, yi in zip(x, y))
    ss_xx = sum((xi - x_mean) ** 2 for xi in x)
    ss_yy = sum((yi - y_mean) ** 2 for yi in y)

    if ss_xx == 0:
        return 0.0, 0.0

    slope = ss_xy / ss_xx
    r_squared = (ss_xy**2) / (ss_xx * ss_yy) if ss_yy > 0 else 0.0

    return slope, min(r_squared, 1.0)


def _yoy_growth(years: list[int], counts: list[int]) -> float | None:
    """Compute year-over-year growth rate for the last two data points."""
    if len(counts) < 2:
        return None
    prev = counts[-2]
    curr = counts[-1]
    if prev == 0:
        return 1.0 if curr > 0 else None
    return (curr - prev) / prev


def _classify_trend(slope: float, avg_count: float) -> str:
    """Classify a topic trend based on slope relative to average."""
    if avg_count == 0:
        return "stable"
    normalized_slope = slope / avg_count
    if normalized_slope > 0.1:
        return "rising"
    elif normalized_slope < -0.1:
        return "declining"
    return "stable"


def _empty_response() -> dict[str, Any]:
    """Return empty trend response for projects with no data."""
    return {
        "publication_timeline": [],
        "topic_trends": [],
        "emerging_topics": [],
        "declining_topics": [],
        "summary_stats": {
            "total_papers": 0,
            "year_span": 0,
            "first_year": None,
            "last_year": None,
            "total_topics": 0,
            "emerging_count": 0,
            "declining_count": 0,
        },
    }
