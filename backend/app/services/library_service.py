"""AI library organization service: metadata health, repair, auto-tagging, and clustering."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import httpx

from app.config import settings

if TYPE_CHECKING:
    from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)

AUTO_TAG_SYSTEM = (
    "You are a research librarian. Given the titles and abstracts of scientific papers, "
    "suggest 3-5 concise, descriptive tags for each paper that would help organize a research library. "
    "Tags should be lowercase, use hyphens for multi-word tags, and cover methodology, domain, and key topics. "
    "Return ONLY valid JSON with the structure: "
    '{"tags": [{"paper_id": N, "suggested_tags": ["tag1", "tag2", ...]}]}'
)

CLUSTER_SYSTEM = (
    "You are a research analysis expert. Given a set of scientific paper titles and abstracts, "
    "group them into coherent thematic clusters based on topic similarity. "
    "Each cluster should have a descriptive name, a brief description, and the paper IDs belonging to it. "
    "Aim for 3-7 clusters depending on the diversity of papers. "
    "Return ONLY valid JSON with the structure: "
    '{"clusters": [{"name": "...", "description": "...", "paper_ids": [1, 2, ...]}]}'
)

S2_FIELDS = "title,abstract,authors,journal,year,citationCount,externalIds,openAccessPdf,url"


def _get_proxy() -> str | None:
    return settings.http_proxy or None


class LibraryService:
    """Service for AI-powered library organization."""

    def __init__(self, llm: LLMClient):
        self.llm = llm

    # ------------------------------------------------------------------
    # Metadata health
    # ------------------------------------------------------------------

    def check_health(self, papers: list[dict]) -> dict:
        """Scan papers for missing or incomplete metadata fields.

        Args:
            papers: List of dicts with paper_id, title, abstract, authors,
                    journal, year, citation_count, doi.

        Returns:
            Dict with total_papers, papers_with_issues, and issue details.
        """
        issues = []
        for p in papers:
            paper_issues = []
            if not p.get("abstract") or (isinstance(p["abstract"], str) and p["abstract"].strip() == ""):
                paper_issues.append("missing_abstract")
            if not p.get("authors") or (isinstance(p["authors"], list) and len(p["authors"]) == 0):
                paper_issues.append("missing_authors")
            if not p.get("year"):
                paper_issues.append("missing_year")
            if not p.get("journal") or (isinstance(p["journal"], str) and p["journal"].strip() == ""):
                paper_issues.append("missing_journal")
            if not p.get("doi") or (isinstance(p["doi"], str) and p["doi"].strip() == ""):
                paper_issues.append("missing_doi")
            if not p.get("citation_count") and p.get("citation_count") != 0:
                paper_issues.append("missing_citation_count")

            if paper_issues:
                issues.append(
                    {
                        "paper_id": p["paper_id"],
                        "title": (p.get("title") or "")[:200],
                        "issues": paper_issues,
                        "issue_count": len(paper_issues),
                    }
                )

        return {
            "total_papers": len(papers),
            "papers_with_issues": len(issues),
            "healthy_papers": len(papers) - len(issues),
            "issues": issues,
        }

    # ------------------------------------------------------------------
    # Metadata repair via Semantic Scholar
    # ------------------------------------------------------------------

    async def repair_metadata(self, papers: list[dict]) -> dict:
        """Attempt to repair missing metadata by querying Semantic Scholar.

        Args:
            papers: List of dicts with at least paper_id and title.

        Returns:
            Dict with repaired papers metadata and success/failure counts.
        """
        if not papers:
            return {"repaired": [], "failed": [], "total_attempted": 0}

        repaired = []
        failed = []

        for paper in papers:
            title = paper.get("title", "")
            doi = paper.get("doi")

            if not title and not doi:
                failed.append({"paper_id": paper["paper_id"], "reason": "no_title_or_doi"})
                continue

            try:
                fixed_paper = await self._lookup_on_semantic_scholar(title=title, doi=doi)
                if fixed_paper:
                    repaired.append(
                        {
                            "paper_id": paper["paper_id"],
                            "title": fixed_paper.get("title", ""),
                            "abstract": fixed_paper.get("abstract", ""),
                            "authors": fixed_paper.get("authors", []),
                            "journal": fixed_paper.get("journal", ""),
                            "year": fixed_paper.get("year"),
                            "citation_count": fixed_paper.get("citation_count", 0),
                            "doi": fixed_paper.get("doi", ""),
                        }
                    )
                else:
                    failed.append({"paper_id": paper["paper_id"], "reason": "not_found"})
            except Exception:
                logger.exception("Failed to repair metadata for paper %d", paper.get("paper_id"))
                failed.append({"paper_id": paper["paper_id"], "reason": "api_error"})

        return {
            "repaired": repaired,
            "failed": failed,
            "total_attempted": len(papers),
            "success_count": len(repaired),
            "failure_count": len(failed),
        }

    async def _lookup_on_semantic_scholar(self, *, title: str = "", doi: str = "") -> dict | None:
        """Look up a paper on Semantic Scholar by DOI or title search."""
        headers = {}
        if settings.semantic_scholar_api_key:
            headers["x-api-key"] = settings.semantic_scholar_api_key

        async with httpx.AsyncClient(proxy=_get_proxy(), timeout=30.0) as client:
            if doi:
                resp = await client.get(
                    f"https://api.semanticscholar.org/graph/v1/paper/DOI:{doi}",
                    params={"fields": S2_FIELDS},
                    headers=headers or None,
                )
                if resp.status_code != 200:
                    resp = await client.get(
                        "https://api.semanticscholar.org/graph/v1/paper/search",
                        params={"query": title[:200], "limit": 1, "fields": S2_FIELDS},
                        headers=headers or None,
                    )
            else:
                resp = await client.get(
                    "https://api.semanticscholar.org/graph/v1/paper/search",
                    params={"query": title[:200], "limit": 1, "fields": S2_FIELDS},
                    headers=headers or None,
                )

            if resp.status_code != 200:
                return None

            data = resp.json()
            items = data.get("data", [data]) if "data" in data else [data]
            if not items or not items[0]:
                return None

            item = items[0] if "data" not in data else items[0]
            return self._parse_s2_response(item)

    def _parse_s2_response(self, item: dict) -> dict:
        """Parse a Semantic Scholar API response into standardized metadata."""
        authors = []
        for a in item.get("authors", []) or []:
            authors.append({"name": a.get("name", ""), "affiliation": ""})

        ext = item.get("externalIds") or {}
        doi = ""
        if ext.get("DOI"):
            doi = ext["DOI"] if isinstance(ext["DOI"], str) else str(ext["DOI"])

        oa = item.get("openAccessPdf") or {}
        pdf_url = oa.get("url", "")

        journal_obj = item.get("journal") or {}
        journal = journal_obj.get("name", "") if isinstance(journal_obj, dict) else ""

        return {
            "title": item.get("title", ""),
            "abstract": item.get("abstract", "") or "",
            "authors": authors,
            "journal": journal,
            "year": item.get("year"),
            "citation_count": item.get("citationCount", 0),
            "doi": doi,
            "pdf_url": pdf_url,
        }

    # ------------------------------------------------------------------
    # Auto-tagging via LLM
    # ------------------------------------------------------------------

    async def suggest_tags(self, papers: list[dict]) -> list[dict]:
        """Suggest AI tags for untagged papers.

        Args:
            papers: List of dicts with paper_id, title, abstract.

        Returns:
            List of dicts with paper_id and suggested_tags.
        """
        if not papers:
            return []

        paper_texts = []
        for p in papers[:50]:
            abstract = (p.get("abstract") or "")[:1000]
            paper_texts.append(f"Paper ID: {p['paper_id']}\nTitle: {p.get('title', '')}\nAbstract: {abstract}")

        messages = [
            {"role": "system", "content": AUTO_TAG_SYSTEM},
            {
                "role": "user",
                "content": "Papers to tag:\n\n" + "\n\n---\n\n".join(paper_texts),
            },
        ]

        try:
            result = await self.llm.chat_json(
                messages,
                temperature=0.3,
                task_type="library_auto_tag",
            )
            tags = result.get("tags", [])

            valid = []
            for t in tags:
                pid = t.get("paper_id")
                suggested = t.get("suggested_tags", [])
                if pid and suggested:
                    valid.append(
                        {
                            "paper_id": pid,
                            "suggested_tags": [tag.lower().strip() for tag in suggested if tag.strip()][:5],
                        }
                    )

            return valid

        except Exception:
            logger.exception("Failed to suggest tags")
            return []

    # ------------------------------------------------------------------
    # Paper clustering via LLM
    # ------------------------------------------------------------------

    async def cluster_papers(self, papers: list[dict]) -> list[dict]:
        """Group papers into thematic clusters.

        Args:
            papers: List of dicts with paper_id, title, abstract.

        Returns:
            List of cluster dicts with name, description, paper_ids.
        """
        if not papers:
            return []

        if len(papers) < 2:
            return [
                {
                    "name": "General",
                    "description": "All papers in the library",
                    "paper_ids": [p["paper_id"] for p in papers],
                }
            ]

        paper_texts = []
        for p in papers[:60]:
            abstract = (p.get("abstract") or "")[:800]
            paper_texts.append(f"Paper ID: {p['paper_id']}\nTitle: {p.get('title', '')}\nAbstract: {abstract}")

        messages = [
            {"role": "system", "content": CLUSTER_SYSTEM},
            {
                "role": "user",
                "content": "Papers to cluster:\n\n" + "\n\n---\n\n".join(paper_texts),
            },
        ]

        try:
            result = await self.llm.chat_json(
                messages,
                temperature=0.3,
                task_type="library_cluster_analysis",
            )
            clusters = result.get("clusters", [])

            valid = []
            all_paper_ids = {p["paper_id"] for p in papers}
            for c in clusters:
                name = (c.get("name") or "").strip()[:100]
                description = (c.get("description") or "").strip()[:500]
                cluster_paper_ids = [pid for pid in c.get("paper_ids", []) if pid in all_paper_ids]
                if name and cluster_paper_ids:
                    valid.append(
                        {
                            "name": name,
                            "description": description,
                            "paper_ids": cluster_paper_ids,
                        }
                    )

            return valid

        except Exception:
            logger.exception("Failed to cluster papers")
            return []
