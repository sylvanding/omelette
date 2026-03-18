"""Citation graph service — fetches citation/reference data from Semantic Scholar."""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.paper import Paper

logger = logging.getLogger(__name__)

S2_FIELDS = "title,year,citationCount,externalIds,authors"


class CitationGraphService:
    """Build citation graph data from Semantic Scholar API."""

    def __init__(self, db: AsyncSession):
        self._db = db

    async def get_citation_graph(
        self,
        paper_id: int,
        project_id: int,
        *,
        depth: int = 1,
        max_nodes: int = 50,
    ) -> dict[str, Any]:
        """Return {nodes, edges, center_id} for a paper's citation network."""
        paper = await self._db.get(Paper, paper_id)
        if not paper or paper.project_id != project_id:
            raise HTTPException(status_code=404, detail="Paper not found")

        s2_id = await self._resolve_s2_id(paper)
        if not s2_id:
            raise HTTPException(
                status_code=502,
                detail="无法获取引用数据：Semantic Scholar 未收录此论文",
            )

        local_source_ids = await self._get_local_source_ids(project_id)

        nodes: dict[str, dict] = {}
        edges: list[dict] = []

        center_node = {
            "id": s2_id,
            "title": paper.title,
            "year": paper.year,
            "citation_count": paper.citation_count or 0,
            "is_local": True,
            "s2_id": s2_id,
            "paper_id": paper.id,
        }
        nodes[s2_id] = center_node

        citations = await self._fetch_s2_list(f"{settings.s2_api_base}/paper/{s2_id}/citations", max_nodes // 2)
        for item in citations:
            cited_paper = item.get("citingPaper", {})
            cid = cited_paper.get("paperId")
            if not cid or cid in nodes:
                continue
            nodes[cid] = self._make_node(cited_paper, local_source_ids)
            edges.append({"source": cid, "target": s2_id, "type": "cites"})
            if len(nodes) >= max_nodes:
                break

        if len(nodes) < max_nodes:
            references = await self._fetch_s2_list(
                f"{settings.s2_api_base}/paper/{s2_id}/references", max_nodes - len(nodes)
            )
            for item in references:
                ref_paper = item.get("citedPaper", {})
                rid = ref_paper.get("paperId")
                if not rid or rid in nodes:
                    continue
                nodes[rid] = self._make_node(ref_paper, local_source_ids)
                edges.append({"source": s2_id, "target": rid, "type": "cites"})
                if len(nodes) >= max_nodes:
                    break

        return {
            "nodes": list(nodes.values()),
            "edges": edges,
            "center_id": s2_id,
        }

    async def _resolve_s2_id(self, paper: Paper) -> str | None:
        """Resolve S2 paperId from source_id, DOI, or title search."""
        if paper.source == "semantic_scholar" and paper.source_id:
            return paper.source_id

        if paper.doi:
            try:
                data = await self._fetch_s2_json(f"{settings.s2_api_base}/paper/DOI:{paper.doi}?fields=paperId")
                if pid := data.get("paperId"):
                    return pid
            except Exception:
                logger.debug("S2 DOI lookup failed for %s", paper.doi)

        if paper.title:
            try:
                data = await self._fetch_s2_json(
                    f"{settings.s2_api_base}/paper/search",
                    params={"query": paper.title[:200], "limit": "1", "fields": "paperId"},
                )
                papers = data.get("data", [])
                if papers:
                    return papers[0].get("paperId")
            except Exception:
                logger.debug("S2 title search failed for %s", paper.title[:50])

        return None

    async def _get_local_source_ids(self, project_id: int) -> set[str]:
        """Get all S2 source_ids for papers in this project."""
        result = await self._db.execute(
            select(Paper.source_id).where(
                Paper.project_id == project_id,
                Paper.source == "semantic_scholar",
                Paper.source_id != "",
            )
        )
        return {row[0] for row in result.all()}

    def _make_node(self, s2_paper: dict, local_ids: set[str]) -> dict:
        pid = s2_paper.get("paperId", "")
        authors = s2_paper.get("authors", [])
        author_names = [a.get("name", "") for a in (authors or [])][:3]
        return {
            "id": pid,
            "title": s2_paper.get("title", "Unknown"),
            "year": s2_paper.get("year"),
            "citation_count": s2_paper.get("citationCount", 0) or 0,
            "is_local": pid in local_ids,
            "s2_id": pid,
            "authors": author_names,
        }

    async def _fetch_s2_list(self, url: str, limit: int) -> list[dict]:
        """Fetch paginated list from S2 citations/references endpoint."""
        actual_limit = min(limit, settings.s2_max_per_request)
        try:
            data = await self._fetch_s2_json(url, params={"fields": S2_FIELDS, "limit": str(actual_limit)})
            return data.get("data", [])
        except Exception:
            logger.warning("S2 API call failed: %s", url, exc_info=True)
            return []

    async def _fetch_s2_json(self, url: str, params: dict | None = None) -> dict:
        headers: dict[str, str] = {}
        if settings.semantic_scholar_api_key:
            headers["x-api-key"] = settings.semantic_scholar_api_key

        async with httpx.AsyncClient(timeout=settings.s2_timeout) as client:
            resp = await client.get(url, headers=headers, params=params)
            if resp.status_code == 429:
                logger.warning("S2 API rate limited")
                return {}
            resp.raise_for_status()
            return resp.json()
