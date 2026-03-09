"""Incremental subscription service — scheduled literature updates via API and RSS."""

import logging
from datetime import datetime, timedelta

import feedparser
import httpx

from app.config import settings
from app.services.search_service import SearchService, StandardizedPaper

logger = logging.getLogger(__name__)


class SubscriptionService:
    """Manages RSS/API subscriptions for incremental literature updates."""

    def __init__(self):
        self.search_service = SearchService()

    async def check_rss_feed(self, feed_url: str, since: datetime | None = None) -> list[dict]:
        """Parse an RSS/Atom feed and return new entries since the given date."""
        proxy = settings.http_proxy or None
        async with httpx.AsyncClient(proxy=proxy, timeout=30.0) as client:
            resp = await client.get(feed_url)
            resp.raise_for_status()

        feed = feedparser.parse(resp.text)
        entries = []

        for entry in feed.entries:
            published = None
            if hasattr(entry, "published_parsed") and entry.published_parsed:
                published = datetime(*entry.published_parsed[:6])
            elif hasattr(entry, "updated_parsed") and entry.updated_parsed:
                published = datetime(*entry.updated_parsed[:6])

            if since and published and published < since:
                continue

            paper = {
                "title": entry.get("title", ""),
                "abstract": entry.get("summary", ""),
                "url": entry.get("link", ""),
                "doi": self._extract_doi(entry),
                "authors": [{"name": a.get("name", "")} for a in entry.get("authors", [])],
                "published": published.isoformat() if published else None,
                "source": "rss",
            }
            entries.append(paper)

        return entries

    def _extract_doi(self, entry) -> str:
        """Try to extract DOI from feed entry."""
        # Check for dc:identifier or prism:doi
        for link in entry.get("links", []):
            href = link.get("href", "")
            if "doi.org" in href:
                return href.split("doi.org/")[-1]
        # Check id field
        entry_id = entry.get("id", "")
        if "doi.org" in entry_id:
            return entry_id.split("doi.org/")[-1]
        return ""

    async def check_api_updates(
        self,
        query: str,
        sources: list[str] | None = None,
        since_days: int = 7,
        max_results: int = 50,
    ) -> dict:
        """Check for new papers via API search (simulates incremental update)."""
        # Use search service with date filter where supported
        results = await self.search_service.search(query, sources, max_results)

        # Filter by publication year if needed
        cutoff_year = datetime.now().year
        recent_papers = [
            p for p in results["papers"]
            if not p.get("year") or p["year"] >= cutoff_year - 1
        ]

        return {
            "new_papers": recent_papers,
            "total_found": len(recent_papers),
            "sources_checked": results.get("source_stats", {}),
        }

    @staticmethod
    def get_common_feeds() -> list[dict]:
        """Return common academic RSS feed templates."""
        return [
            {"name": "arXiv - Physics Optics", "url": "http://export.arxiv.org/rss/physics.optics", "category": "preprint"},
            {"name": "arXiv - Quantum Physics", "url": "http://export.arxiv.org/rss/quant-ph", "category": "preprint"},
            {"name": "Nature Photonics", "url": "https://www.nature.com/nphoton.rss", "category": "journal"},
            {"name": "Science - Latest", "url": "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science", "category": "journal"},
            {"name": "PubMed - Custom", "url": "https://pubmed.ncbi.nlm.nih.gov/rss/search/", "category": "database"},
        ]
