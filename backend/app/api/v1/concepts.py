"""Concept knowledge graph API endpoints."""

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_project
from app.models import Paper, Project
from app.schemas.common import ApiResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["concepts"])


class ConceptNode(BaseModel):
    """A single concept node."""

    name: str
    definition: str
    frequency: int
    related_papers: list[int]
    related_concepts: list[str] = []


class ConceptEdge(BaseModel):
    """A relationship between two concepts."""

    source: str
    target: str
    relation_type: str
    description: str


class ConceptGraphResponse(BaseModel):
    """Response from concept graph extraction."""

    nodes: list[ConceptNode]
    edges: list[ConceptEdge]
    total_concepts: int


class TopicPageResponse(BaseModel):
    """Response from topic page generation."""

    concept_name: str
    definition: str
    overview: str
    key_findings: list[str]
    related_topics: list[str]
    research_directions: list[str]


@router.post(
    "/extract",
    response_model=ApiResponse[ConceptGraphResponse],
    summary="Extract concepts from project papers",
)
async def extract_concepts(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Extract key concepts from all papers in a project."""
    from app.api.deps import get_llm
    from app.services.concept_service import ConceptService

    stmt = select(Paper).where(Paper.project_id == project_id)
    result = await db.execute(stmt)
    papers = result.scalars().all()

    if not papers:
        return ApiResponse(data=ConceptGraphResponse(nodes=[], edges=[], total_concepts=0))

    papers_for_analysis = [
        {
            "paper_id": p.id,
            "title": p.title or "",
            "abstract": p.abstract or "",
        }
        for p in papers
    ]

    llm = get_llm()
    svc = ConceptService(llm)

    concepts = await svc.extract_concepts(papers_for_analysis)
    graph_data = await svc.build_concept_graph(concepts)

    # Persist concepts to database
    import json

    from app.models.concept import Concept

    del_stmt = select(Concept).where(Concept.project_id == project_id)
    del_result = await db.execute(del_stmt)
    for c in del_result.scalars().all():
        await db.delete(c)

    for n in graph_data["nodes"]:
        concept = Concept(
            project_id=project_id,
            name=n["name"],
            definition=n.get("definition", ""),
            frequency=n.get("frequency", 1),
            related_papers=json.dumps(n.get("related_papers", []))
            if not isinstance(n.get("related_papers"), str)
            else n["related_papers"],
            related_concepts=json.dumps(n.get("related_concepts", []))
            if not isinstance(n.get("related_concepts"), str)
            else n["related_concepts"],
        )
        db.add(concept)
    await db.flush()

    nodes = [
        ConceptNode(
            name=n["name"],
            definition=n["definition"],
            frequency=n["frequency"],
            related_papers=n.get("related_papers", []),
            related_concepts=n.get("related_concepts", []),
        )
        for n in graph_data["nodes"]
    ]
    edges = [
        ConceptEdge(
            source=e["source"],
            target=e["target"],
            relation_type=e["relation_type"],
            description=e["description"],
        )
        for e in graph_data["edges"]
    ]

    return ApiResponse(data=ConceptGraphResponse(nodes=nodes, edges=edges, total_concepts=len(nodes)))


@router.get(
    "/graph",
    response_model=ApiResponse[ConceptGraphResponse],
    summary="Get concept knowledge graph",
)
async def get_concept_graph(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Get the concept graph from DB, or run extraction if not cached."""
    import json

    from app.models.concept import Concept

    # Try to load concepts from database
    try:
        stmt = select(Concept).where(Concept.project_id == project_id)
        result = await db.execute(stmt)
        db_concepts = [c for c in result.scalars().all() if type(c).__name__ == "Concept"]
    except Exception:
        db_concepts = []

    if db_concepts:
        nodes = [
            ConceptNode(
                name=c.name,
                definition=c.definition,
                frequency=c.frequency,
                related_papers=(json.loads(c.related_papers) if c.related_papers else []) if c.related_papers else [],
                related_concepts=(json.loads(c.related_concepts) if c.related_concepts else [])
                if c.related_concepts
                else [],
            )
            for c in db_concepts
        ]
        return ApiResponse(data=ConceptGraphResponse(nodes=nodes, edges=[], total_concepts=len(nodes)))

    # Fall back to LLM extraction if nothing in DB
    from app.api.deps import get_llm
    from app.services.concept_service import ConceptService

    paper_stmt = select(Paper).where(Paper.project_id == project_id)
    paper_result = await db.execute(paper_stmt)
    papers = paper_result.scalars().all()

    if not papers:
        return ApiResponse(data=ConceptGraphResponse(nodes=[], edges=[], total_concepts=0))

    papers_for_analysis = [
        {
            "paper_id": p.id,
            "title": p.title or "",
            "abstract": p.abstract or "",
        }
        for p in papers
    ]

    llm = get_llm()
    svc = ConceptService(llm)

    concepts = await svc.extract_concepts(papers_for_analysis)
    graph_data = await svc.build_concept_graph(concepts)

    # Persist concepts to database
    import json

    from app.models.concept import Concept

    del_stmt = select(Concept).where(Concept.project_id == project_id)
    del_result = await db.execute(del_stmt)
    for c in del_result.scalars().all():
        await db.delete(c)

    for n in graph_data["nodes"]:
        concept = Concept(
            project_id=project_id,
            name=n["name"],
            definition=n.get("definition", ""),
            frequency=n.get("frequency", 1),
            related_papers=json.dumps(n.get("related_papers", []))
            if not isinstance(n.get("related_papers"), str)
            else n["related_papers"],
            related_concepts=json.dumps(n.get("related_concepts", []))
            if not isinstance(n.get("related_concepts"), str)
            else n["related_concepts"],
        )
        db.add(concept)
    await db.flush()

    nodes = [
        ConceptNode(
            name=n["name"],
            definition=n["definition"],
            frequency=n["frequency"],
            related_papers=n.get("related_papers", []),
            related_concepts=n.get("related_concepts", []),
        )
        for n in graph_data["nodes"]
    ]
    edges = [
        ConceptEdge(
            source=e["source"],
            target=e["target"],
            relation_type=e["relation_type"],
            description=e["description"],
        )
        for e in graph_data["edges"]
    ]

    return ApiResponse(data=ConceptGraphResponse(nodes=nodes, edges=edges, total_concepts=len(nodes)))


@router.get(
    "/{concept_name}/page",
    response_model=ApiResponse[TopicPageResponse],
    summary="Get topic page for a concept",
)
async def get_topic_page(
    concept_name: str,
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Generate a comprehensive topic overview for a concept."""
    from app.api.deps import get_llm
    from app.services.concept_service import ConceptService

    stmt = select(Paper).where(Paper.project_id == project_id)
    result = await db.execute(stmt)
    papers = result.scalars().all()

    papers_for_analysis = [
        {
            "paper_id": p.id,
            "title": p.title or "",
            "abstract": p.abstract or "",
        }
        for p in papers
    ]

    llm = get_llm()
    svc = ConceptService(llm)

    concepts = await svc.extract_concepts(papers_for_analysis)

    target_concept = None
    for c in concepts:
        if c["name"].lower() == concept_name.lower():
            target_concept = c
            break

    if not target_concept:
        topic_data = await svc.get_topic_page(
            concept_name=concept_name,
            concept_def="",
            related_concepts=[],
            papers=papers_for_analysis,
        )
    else:
        related_papers = [p for p in papers_for_analysis if p["paper_id"] in target_concept["related_papers"]]
        graph_data = await svc.build_concept_graph(concepts)
        related_names = [n["name"] for n in graph_data["nodes"] if n["name"] != target_concept["name"]][:10]

        topic_data = await svc.get_topic_page(
            concept_name=target_concept["name"],
            concept_def=target_concept["definition"],
            related_concepts=related_names,
            papers=related_papers,
        )

    return ApiResponse(
        data=TopicPageResponse(
            concept_name=topic_data["concept_name"],
            definition=topic_data["definition"],
            overview=topic_data["overview"],
            key_findings=topic_data["key_findings"],
            related_topics=topic_data["related_topics"],
            research_directions=topic_data["research_directions"],
        )
    )
