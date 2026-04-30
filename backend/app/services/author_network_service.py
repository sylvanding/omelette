"""Author network service: builds co-authorship collaboration graphs from project papers."""

from __future__ import annotations

import logging
from collections import Counter, defaultdict
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def _extract_author_name(author: str | dict) -> str | None:
    """Normalize an author entry to a plain name string."""
    if isinstance(author, str):
        name = author.strip()
        return name if name else None
    if isinstance(author, dict):
        name = author.get("name", "")
        if isinstance(name, str):
            name = name.strip()
        return name if name else None
    return None


class AuthorNetworkService:
    """Build a co-authorship network from papers in a project."""

    def __init__(self, db: AsyncSession):
        self._db = db

    async def build_network(
        self,
        project_id: int,
        *,
        min_collaborations: int = 1,
        max_nodes: int = 100,
    ) -> dict[str, Any]:
        """Extract authors from all papers and build a co-authorship graph.

        Args:
            project_id: The project to analyze.
            min_collaborations: Minimum co-authorship count for an edge to appear.
            max_nodes: Maximum number of author nodes to return (by paper count).

        Returns:
            Dict with keys: nodes, edges, metrics, total_authors.
        """
        from sqlalchemy import select

        from app.models import Paper

        stmt = select(Paper).where(Paper.project_id == project_id)
        result = await self._db.execute(stmt)
        papers = result.scalars().all()

        # Build: author -> list of paper_ids, and co-authorship pairs
        author_papers: dict[str, list[int]] = defaultdict(list)
        pair_counts: Counter[tuple[str, str]] = Counter()

        for paper in papers:
            if not paper.authors:
                continue
            names = [n for a in paper.authors if (n := _extract_author_name(a))]
            # Deduplicate within a single paper
            unique_names = list(dict.fromkeys(names))

            for name in unique_names:
                author_papers[name].append(paper.id)

            for i in range(len(unique_names)):
                for j in range(i + 1, len(unique_names)):
                    pair = tuple(sorted([unique_names[i], unique_names[j]]))
                    pair_counts[pair] += 1

        if not author_papers:
            return {
                "nodes": [],
                "edges": [],
                "metrics": {
                    "total_authors": 0,
                    "total_edges": 0,
                    "density": 0,
                    "top_authors": [],
                },
                "total_authors": 0,
            }

        # Sort authors by paper count, take top max_nodes
        sorted_authors = sorted(
            author_papers.items(),
            key=lambda x: len(x[1]),
            reverse=True,
        )[:max_nodes]
        author_set = {name for name, _ in sorted_authors}

        nodes = []
        for name, paper_ids in sorted_authors:
            nodes.append(
                {
                    "name": name,
                    "paper_count": len(paper_ids),
                    "paper_ids": paper_ids,
                    "coauthors": [],
                    "h_index_estimate": _estimate_h_index(len(paper_ids)),
                }
            )

        # Build edges only between nodes in the selected set
        edges = []
        coauthor_map: dict[str, list[str]] = defaultdict(list)
        for (a, b), count in pair_counts.items():
            if count < min_collaborations:
                continue
            if a not in author_set or b not in author_set:
                continue
            edges.append(
                {
                    "source": a,
                    "target": b,
                    "collaboration_count": count,
                }
            )
            coauthor_map[a].append(b)
            coauthor_map[b].append(a)

        # Attach coauthor lists to nodes
        for node in nodes:
            node["coauthors"] = coauthor_map.get(node["name"], [])

        # Compute centrality metrics
        degree = {node["name"]: len(node["coauthors"]) for node in nodes}
        top_authors = sorted(degree.items(), key=lambda x: x[1], reverse=True)[:10]

        n = len(nodes)
        max_possible_edges = n * (n - 1) // 2 if n > 1 else 1
        density = len(edges) / max_possible_edges if max_possible_edges > 0 else 0

        return {
            "nodes": nodes,
            "edges": edges,
            "metrics": {
                "total_authors": len(author_papers),
                "total_edges": len(edges),
                "density": round(density, 3),
                "top_authors": [{"name": name, "degree": deg} for name, deg in top_authors],
            },
            "total_authors": len(author_papers),
        }


def _estimate_h_index(paper_count: int) -> int:
    """Rough h-index estimate based on paper count (fallback without citation data)."""
    if paper_count <= 0:
        return 0
    # Square root heuristic as a rough estimate
    return max(1, int(paper_count**0.5))
