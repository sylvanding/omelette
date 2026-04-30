"""Concept knowledge graph service: extracts concepts and builds topic pages."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)

CONCEPT_EXTRACT_SYSTEM = (
    "You are a research analysis assistant. Given the titles and abstracts of scientific papers, "
    "extract the key concepts, topics, and technical terms that appear across them. "
    "For each concept provide: name, definition, frequency (number of papers mentioning it), "
    "and the paper IDs that discuss it. Return ONLY valid JSON with the structure: "
    '{"concepts": [{"name": "...", "definition": "...", "frequency": N, "related_papers": [1, 2]}]}'
)

CONCEPT_GRAPH_SYSTEM = (
    "You are a research analysis assistant. Given a list of extracted concepts from research papers, "
    "identify relationships between concepts. For each pair of related concepts, provide a relationship "
    "type (e.g., 'prerequisite', 'related_to', 'applies_to', 'contrasts_with') and a brief description. "
    "Return ONLY valid JSON with the structure: "
    '{"related_concepts": [{"concept_a": "...", "concept_b": "...", "relation_type": "...", "description": "..."}]}'
)

TOPIC_PAGE_SYSTEM = (
    "You are a research expert. Given a concept name, its definition, related concepts, "
    "and the titles/abstracts of papers that discuss it, write a comprehensive topic overview. "
    "Include: a detailed explanation, how it relates to other concepts, key findings from the papers, "
    "and open research directions. Return ONLY valid JSON with the structure: "
    '{"overview": "...", "key_findings": ["..."], "related_topics": ["..."], "research_directions": ["..."]}'
)


class ConceptService:
    """Service for concept extraction, graph building, and topic pages."""

    def __init__(self, llm: LLMClient):
        self.llm = llm

    async def extract_concepts(self, papers: list[dict]) -> list[dict]:
        """Extract key concepts from a collection of papers.

        Args:
            papers: List of dicts with paper_id, title, and abstract/content.

        Returns:
            List of concept dicts with name, definition, frequency, related_papers.
        """
        if not papers:
            return []

        paper_texts = []
        for p in papers[:30]:
            abstract = (p.get("abstract") or p.get("content") or "")[:1500]
            paper_texts.append(f"Paper ID: {p['paper_id']}\nTitle: {p.get('title', '')}\nAbstract: {abstract}")

        messages = [
            {"role": "system", "content": CONCEPT_EXTRACT_SYSTEM},
            {
                "role": "user",
                "content": "Papers to analyze for concepts:\n\n" + "\n\n---\n\n".join(paper_texts),
            },
        ]

        try:
            result = await self.llm.chat_json(
                messages,
                temperature=0.3,
                task_type="concept_extraction",
            )
            concepts = result.get("concepts", [])

            valid_items = []
            for c in concepts:
                valid_items.append(
                    {
                        "name": (c.get("name") or "").strip()[:200],
                        "definition": (c.get("definition") or "").strip()[:1000],
                        "frequency": int(c.get("frequency", 0)),
                        "related_papers": c.get("related_papers", []),
                    }
                )

            return [c for c in valid_items if c["name"]]

        except Exception:
            logger.exception("Failed to extract concepts")
            return []

    async def build_concept_graph(self, concepts: list[dict]) -> dict:
        """Build a concept graph by identifying relationships between concepts.

        Args:
            concepts: List of concept dicts from extract_concepts.

        Returns:
            Dict with nodes (concepts with related_concepts) and edges.
        """
        if len(concepts) < 2:
            return {
                "nodes": concepts,
                "edges": [],
                "total_concepts": len(concepts),
            }

        concept_names = [c["name"] for c in concepts]
        messages = [
            {"role": "system", "content": CONCEPT_GRAPH_SYSTEM},
            {
                "role": "user",
                "content": f"Concepts to analyze for relationships:\n{', '.join(concept_names)}",
            },
        ]

        try:
            result = await self.llm.chat_json(
                messages,
                temperature=0.3,
                task_type="concept_graph_building",
            )
            related = result.get("related_concepts", [])

            concept_name_set = {c["name"] for c in concepts}
            edges = []
            for r in related:
                ca = r.get("concept_a", "")
                cb = r.get("concept_b", "")
                if ca in concept_name_set and cb in concept_name_set:
                    edges.append(
                        {
                            "source": ca,
                            "target": cb,
                            "relation_type": r.get("relation_type", "related_to"),
                            "description": (r.get("description") or "")[:500],
                        }
                    )

            nodes_with_relations = []
            for c in concepts:
                related_concepts = [
                    e["target"] if e["source"] == c["name"] else e["source"]
                    for e in edges
                    if e["source"] == c["name"] or e["target"] == c["name"]
                ]
                nodes_with_relations.append(
                    {
                        **c,
                        "related_concepts": related_concepts,
                    }
                )

            return {
                "nodes": nodes_with_relations,
                "edges": edges,
                "total_concepts": len(nodes_with_relations),
            }

        except Exception:
            logger.exception("Failed to build concept graph")
            return {
                "nodes": concepts,
                "edges": [],
                "total_concepts": len(concepts),
            }

    async def get_topic_page(
        self, concept_name: str, concept_def: str, related_concepts: list[str], papers: list[dict]
    ) -> dict:
        """Generate a comprehensive topic overview for a concept.

        Args:
            concept_name: The concept name.
            concept_def: The concept definition.
            related_concepts: List of related concept names.
            papers: List of paper dicts that discuss this concept.

        Returns:
            Dict with overview, key_findings, related_topics, research_directions.
        """
        if not papers:
            return {
                "concept_name": concept_name,
                "definition": concept_def,
                "overview": f"Information about {concept_name} based on available papers.",
                "key_findings": [],
                "related_topics": related_concepts,
                "research_directions": [],
            }

        paper_texts = []
        for p in papers[:15]:
            abstract = (p.get("abstract") or p.get("content") or "")[:1000]
            paper_texts.append(f"Title: {p.get('title', '')}\nAbstract: {abstract}")

        messages = [
            {"role": "system", "content": TOPIC_PAGE_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"Concept: {concept_name}\n"
                    f"Definition: {concept_def}\n"
                    f"Related concepts: {', '.join(related_concepts)}\n\n"
                    f"Papers discussing this concept:\n\n" + "\n\n---\n\n".join(paper_texts)
                ),
            },
        ]

        try:
            result = await self.llm.chat_json(
                messages,
                temperature=0.5,
                task_type="topic_page_generation",
            )

            return {
                "concept_name": concept_name,
                "definition": concept_def,
                "overview": result.get("overview", "")[:2000],
                "key_findings": result.get("key_findings", [])[:10],
                "related_topics": result.get("related_topics", related_concepts)[:10],
                "research_directions": result.get("research_directions", [])[:10],
            }

        except Exception:
            logger.exception("Failed to generate topic page for %s", concept_name)
            return {
                "concept_name": concept_name,
                "definition": concept_def,
                "overview": f"Information about {concept_name} based on available papers.",
                "key_findings": [],
                "related_topics": related_concepts,
                "research_directions": [],
            }
