"""Citation graph service — fetches citation/reference data from Semantic Scholar."""

from __future__ import annotations

import logging
from typing import Any, Literal

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.paper import Paper

logger = logging.getLogger(__name__)

S2_FIELDS = "title,year,citationCount,externalIds,authors"

# Error messages (extracted for maintainability)
CITATION_NOT_FOUND = "无法获取引用数据：Semantic Scholar 未收录此论文"

GraphMode = Literal["all", "prior", "derivative", "similarity"]


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
        mode: GraphMode = "all",
    ) -> dict[str, Any]:
        """Return {nodes, edges, center_id, mode} for a paper's citation network.

        Modes:
            all: Both prior works (references) and derivative works (citations).
            prior: Only prior works — papers cited by the seed paper.
            derivative: Only derivative works — papers citing the seed paper.
            similarity: All project papers connected by embedding cosine similarity.
        """
        paper = await self._db.get(Paper, paper_id)
        if not paper or paper.project_id != project_id:
            raise HTTPException(status_code=404, detail="Paper not found")

        if mode == "similarity":
            return await self._get_similarity_graph(paper, project_id, max_nodes)

        s2_id = await self._resolve_s2_id(paper)
        if not s2_id:
            raise HTTPException(status_code=502, detail=CITATION_NOT_FOUND)

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

        if mode in ("all", "derivative"):
            citations = await self._fetch_s2_list(f"{settings.s2_api_base}/paper/{s2_id}/citations", max_nodes // 2)
            for item in citations:
                cited_paper = item.get("citingPaper", {})
                cid = cited_paper.get("paperId")
                if not cid or cid in nodes:
                    continue
                nodes[cid] = self._make_node(cited_paper, local_source_ids)
                edges.append({"source": cid, "target": s2_id, "type": "cited_by"})
                if len(nodes) >= max_nodes:
                    break

        if mode in ("all", "prior"):
            remaining = max_nodes - len(nodes)
            if remaining > 0:
                references = await self._fetch_s2_list(f"{settings.s2_api_base}/paper/{s2_id}/references", remaining)
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
            "mode": mode,
        }

    async def _get_similarity_graph(self, paper: Paper, project_id: int, max_nodes: int) -> dict[str, Any]:
        """Build a graph of project papers connected by embedding cosine similarity."""
        try:
            from app.services.rag_service import RAGService

            rag = RAGService(llm=None)
            collection = rag._get_collection(project_id)
        except Exception:
            logger.debug("ChromaDB unavailable for similarity graph", exc_info=True)
            return {"nodes": [], "edges": [], "center_id": str(paper.id), "mode": "similarity"}

        all_papers_result = await self._db.execute(
            select(Paper)
            .where(
                Paper.project_id == project_id,
                Paper.id != paper.id,
            )
            .limit(max_nodes - 1)
        )
        other_papers = list(all_papers_result.scalars().all())

        seed_s2_id = paper.source_id if paper.source == "semantic_scholar" else None

        nodes: list[dict] = []
        edges: list[dict] = []

        seed_embedding = None
        try:
            seed_ids = [f"paper_{paper.id}_chunk_0"]
            result = collection.get(ids=seed_ids, include=["embeddings"])
            if result["embeddings"] and len(result["embeddings"]) > 0:
                import numpy as np

                seed_embedding = np.mean(result["embeddings"], axis=0)
        except Exception:
            logger.debug("No embedding found for seed paper %d", paper.id)

        if seed_embedding is None:
            return {
                "nodes": [],
                "edges": [],
                "center_id": str(paper.id),
                "mode": "similarity",
            }

        import numpy as np

        local_source_ids = await self._get_local_source_ids(project_id)

        center_node = {
            "id": str(paper.id),
            "title": paper.title,
            "year": paper.year,
            "citation_count": paper.citation_count or 0,
            "is_local": True,
            "s2_id": seed_s2_id or "",
            "paper_id": paper.id,
        }
        nodes.append(center_node)

        for other in other_papers:
            try:
                chunk_ids = [f"paper_{other.id}_chunk_0"]
                result = collection.get(ids=chunk_ids, include=["embeddings"])
                if not result["embeddings"] or len(result["embeddings"]) == 0:
                    continue
                other_embedding = np.mean(result["embeddings"], axis=0)

                norm_a = np.linalg.norm(seed_embedding)
                norm_b = np.linalg.norm(other_embedding)
                if norm_a == 0 or norm_b == 0:
                    continue
                similarity = float(np.dot(seed_embedding, other_embedding) / (norm_a * norm_b))

                if similarity < 0.5:
                    continue

                other_s2_id = other.source_id if other.source == "semantic_scholar" else None
                nodes.append(
                    {
                        "id": str(other.id),
                        "title": other.title,
                        "year": other.year,
                        "citation_count": other.citation_count or 0,
                        "is_local": str(other.id) in local_source_ids or True,
                        "s2_id": other_s2_id or "",
                        "paper_id": other.id,
                    }
                )
                edges.append(
                    {
                        "source": str(paper.id),
                        "target": str(other.id),
                        "type": "similar",
                        "similarity": round(similarity, 3),
                    }
                )
            except Exception:
                logger.debug("Failed to compute similarity for paper %d", other.id, exc_info=True)

        edges.sort(key=lambda e: e["similarity"], reverse=True)
        edges = edges[: max_nodes - 1]
        connected_ids = {paper.id}
        for e in edges:
            connected_ids.add(int(e["target"]))
        nodes = [n for n in nodes if n["paper_id"] in connected_ids]

        return {
            "nodes": nodes,
            "edges": edges,
            "center_id": str(paper.id),
            "mode": "similarity",
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
