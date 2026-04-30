"""Paper version tracking service: polls external APIs for preprint-to-journal updates."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import httpx

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

SEMANTIC_SCHOLAR_API = "https://api.semanticscholar.org/graph/v1"


class VersionService:
    """Track preprint-to-journal version lineage for papers."""

    def __init__(self, db: AsyncSession):
        self._db = db

    async def check_for_updates(self, paper_id: int) -> dict[str, Any] | None:
        """Check Semantic Scholar for newer versions of a paper.

        Returns a dict with version info if a newer version is found, else None.
        """
        from sqlalchemy import select

        from app.models import Paper, PaperVersion

        paper = await self._db.get(Paper, paper_id)
        if not paper or not paper.doi:
            return None

        # Check if we already have this version recorded
        stmt = select(PaperVersion).where(
            PaperVersion.paper_id == paper_id,
            PaperVersion.doi == paper.doi,
        )
        result = await self._db.execute(stmt)
        if result.scalars().first():
            return None

        metadata = await self._fetch_semantic_scholar(paper.doi)
        if not metadata:
            return None

        # Check if this is a journal version (not a preprint)
        is_preprint = _is_preprint_source(metadata)

        return {
            "doi": metadata.get("externalIds", {}).get("DOI", paper.doi),
            "title": metadata.get("title", paper.title),
            "abstract": metadata.get("abstract", paper.abstract or ""),
            "authors": metadata.get("authors", paper.authors),
            "journal": metadata.get("venue", paper.journal or ""),
            "year": metadata.get("year", paper.year),
            "citation_count": metadata.get("citationCount", paper.citation_count or 0),
            "pdf_url": metadata.get("openAccessPdf", {}).get("url"),
            "is_preprint": is_preprint,
            "preprint_server": _extract_preprint_server(metadata),
        }

    async def get_version_history(self, paper_id: int) -> list[dict[str, Any]]:
        """Return the version history for a paper, ordered by version number."""
        from sqlalchemy import select

        from app.models import PaperVersion

        stmt = select(PaperVersion).where(PaperVersion.paper_id == paper_id).order_by(PaperVersion.version)
        result = await self._db.execute(stmt)
        versions = result.scalars().all()

        return [
            {
                "id": v.id,
                "paper_id": v.paper_id,
                "version": v.version,
                "source": v.source,
                "doi": v.doi,
                "title": v.title,
                "abstract": v.abstract,
                "authors": v.authors,
                "journal": v.journal,
                "year": v.year,
                "citation_count": v.citation_count,
                "pdf_url": v.pdf_url,
                "is_preprint": v.is_preprint,
                "preprint_server": v.preprint_server,
                "diff_summary": v.diff_summary,
                "created_at": v.created_at.isoformat() if v.created_at else None,
            }
            for v in versions
        ]

    async def record_version(
        self,
        paper_id: int,
        version_info: dict[str, Any],
        previous_doi: str | None = None,
    ) -> dict[str, Any]:
        """Record a new version entry for a paper."""
        from sqlalchemy import func, select

        from app.models import Paper, PaperVersion

        paper = await self._db.get(Paper, paper_id)
        if not paper:
            raise ValueError(f"Paper {paper_id} not found")

        # Determine version number
        stmt = select(func.max(PaperVersion.version)).where(PaperVersion.paper_id == paper_id)
        result = await self._db.execute(stmt)
        max_version = result.scalar() or 0
        new_version = max_version + 1

        # Compute diff summary if there's a previous version to compare against
        diff_summary = None
        if previous_doi:
            diff_summary = await self._compute_diff(paper, version_info)

        entry = PaperVersion(
            paper_id=paper_id,
            version=new_version,
            source=version_info.get("source", "manual"),
            doi=version_info.get("doi"),
            title=version_info.get("title", paper.title),
            abstract=version_info.get("abstract", paper.abstract or ""),
            authors=version_info.get("authors", paper.authors),
            journal=version_info.get("journal", paper.journal or ""),
            year=version_info.get("year", paper.year),
            citation_count=version_info.get("citation_count", paper.citation_count or 0),
            pdf_url=version_info.get("pdf_url"),
            is_preprint=version_info.get("is_preprint", True),
            preprint_server=version_info.get("preprint_server"),
            diff_summary=diff_summary,
        )
        self._db.add(entry)
        await self._db.flush()
        await self._db.refresh(entry)

        return {
            "id": entry.id,
            "paper_id": entry.paper_id,
            "version": entry.version,
            "source": entry.source,
            "doi": entry.doi,
            "title": entry.title,
            "abstract": entry.abstract,
            "authors": entry.authors,
            "journal": entry.journal,
            "year": entry.year,
            "citation_count": entry.citation_count,
            "pdf_url": entry.pdf_url,
            "is_preprint": entry.is_preprint,
            "preprint_server": entry.preprint_server,
            "diff_summary": entry.diff_summary,
            "created_at": entry.created_at.isoformat() if entry.created_at else None,
        }

    async def upgrade_to_version(
        self,
        paper_id: int,
        version_id: int,
    ) -> dict[str, Any]:
        """Upgrade a paper to a newer version, preserving annotations.

        Copies metadata from the target version to the paper record.
        Annotations, notes, tags, and other user-level data remain attached
        to the paper (they are not stored in PaperVersion).
        """
        from app.models import Paper, PaperStatus, PaperVersion

        paper = await self._db.get(Paper, paper_id)
        version = await self._db.get(PaperVersion, version_id)

        if not paper or not version:
            raise ValueError("Paper or version not found")

        if version.paper_id != paper_id:
            raise ValueError("Version does not belong to this paper")

        # Preserve user data that should survive the upgrade
        preserved = {
            "notes": paper.notes,
            "tags": paper.tags,
            "reading_status": paper.reading_status,
            "read_at": paper.read_at,
            "rating": paper.rating,
            "quality_tags": paper.quality_tags,
            "status": PaperStatus.INDEXED if paper.status == PaperStatus.INDEXED else paper.status,
        }

        # Update paper with version data
        paper.title = version.title
        paper.abstract = version.abstract
        paper.authors = version.authors
        paper.journal = version.journal
        paper.year = version.year
        paper.citation_count = version.citation_count
        paper.doi = version.doi
        if version.pdf_url:
            paper.pdf_url = version.pdf_url

        # Restore preserved user data
        for key, value in preserved.items():
            setattr(paper, key, value)

        await self._db.flush()
        await self._db.refresh(paper)

        return {
            "paper_id": paper.id,
            "upgraded_to_version": version.version,
            "new_doi": paper.doi,
            "new_journal": paper.journal,
            "preserved_fields": list(preserved.keys()),
        }

    async def poll_all_papers(self) -> list[dict[str, Any]]:
        """Poll all papers with DOIs for version updates. Called by the daily scheduled job."""
        from sqlalchemy import select

        from app.models import Paper

        stmt = select(Paper).where(Paper.doi.isnot(None))
        result = await self._db.execute(stmt)
        papers = result.scalars().all()

        updates: list[dict[str, Any]] = []
        for paper in papers:
            version_info = await self.check_for_updates(paper.id)
            if version_info:
                version_info["source"] = "auto_poll"
                entry = await self.record_version(paper.id, version_info, previous_doi=paper.doi)
                updates.append(entry)

        return updates

    async def _fetch_semantic_scholar(self, doi: str) -> dict[str, Any] | None:
        """Fetch paper metadata from Semantic Scholar API."""
        url = f"{SEMANTIC_SCHOLAR_API}/paper/DOI:{doi}"
        params = {
            "fields": "title,abstract,authors,year,venue,citationCount,externalIds,openAccessPdf,isOpenAccess,tldr",
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 404:
                    return None
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as e:
            logger.warning("Semantic Scholar fetch failed for DOI %s: %s", doi, e)
            return None

    async def _compute_diff(self, paper: Any, new_version: dict[str, Any]) -> str | None:
        """Generate a human-readable diff summary between current paper and new version."""
        changes: list[str] = []

        if new_version.get("title") and new_version["title"] != paper.title:
            changes.append("Title changed")

        if new_version.get("journal") and new_version["journal"] != (paper.journal or ""):
            changes.append(f"Journal: {paper.journal or 'None'} -> {new_version['journal']}")

        old_count = paper.citation_count or 0
        new_count = new_version.get("citation_count", 0)
        if new_count != old_count:
            changes.append(f"Citations: {old_count} -> {new_count}")

        if new_version.get("year") and new_version["year"] != paper.year:
            changes.append(f"Year: {paper.year} -> {new_version['year']}")

        return "; ".join(changes) if changes else None


def _is_preprint_source(metadata: dict[str, Any]) -> bool:
    """Check if the paper metadata indicates a preprint source."""
    venue = (metadata.get("venue") or "").lower()
    external_ids = metadata.get("externalIds", {})

    preprint_indicators = ["arxiv", "bioRxiv", "medRxiv", "chemRxiv", "ssrn", "osf", "research square"]

    for key in external_ids:
        if any(p in key.lower() for p in preprint_indicators):
            return True

    return any(p in venue for p in preprint_indicators)


def _extract_preprint_server(metadata: dict[str, Any]) -> str | None:
    """Extract the preprint server name from metadata."""
    external_ids = metadata.get("externalIds", {})

    for key in external_ids:
        lower = key.lower()
        if "arxiv" in lower:
            return "arXiv"
        if "biorxiv" in lower:
            return "bioRxiv"
        if "medrxiv" in lower:
            return "medRxiv"
        if "chemrxiv" in lower:
            return "chemRxiv"
        if "ssrn" in lower:
            return "SSRN"

    return None
