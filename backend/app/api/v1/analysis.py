"""Analysis API endpoints for multi-document analysis."""

import logging

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_project
from app.models import Paper, Project
from app.schemas.common import ApiResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["analysis"])


class AuthorNode(BaseModel):
    """A single author node in the collaboration network."""

    name: str
    paper_count: int
    paper_ids: list[int]
    coauthors: list[str]
    h_index_estimate: int


class AuthorEdge(BaseModel):
    """A co-authorship edge between two authors."""

    source: str
    target: str
    collaboration_count: int


class NetworkMetrics(BaseModel):
    """Summary metrics for the author network."""

    total_authors: int
    total_edges: int
    density: float
    top_authors: list[dict[str, object]]


class AuthorNetworkResponse(BaseModel):
    """Response from author network analysis."""

    nodes: list[AuthorNode]
    edges: list[AuthorEdge]
    metrics: NetworkMetrics
    total_authors: int


class ContradictionPair(BaseModel):
    """A single contradiction between two papers."""

    paper_a_id: int
    paper_a_title: str
    paper_b_id: int
    paper_b_title: str
    claim: str
    position_a: str
    position_b: str
    confidence: float
    topic: str


class ContradictionResponse(BaseModel):
    """Response from contradiction detection."""

    contradictions: list[ContradictionPair]
    topics: list[str]
    total_contradictions: int


class YearlyCount(BaseModel):
    """Count of papers for a single year."""

    year: int
    count: int


class TopicTrend(BaseModel):
    """Trend data for a single research topic."""

    topic: str
    slope: float
    r_squared: float
    trend: str
    total_papers: int
    first_year: int
    last_year: int
    yearly_counts: list[YearlyCount]


class EmergingTopic(BaseModel):
    """A topic with significant year-over-year growth."""

    topic: str
    yoy_growth: float


class SummaryStats(BaseModel):
    """Summary statistics for trend analysis."""

    total_papers: int
    year_span: int
    first_year: int | None
    last_year: int | None
    total_topics: int
    emerging_count: int
    declining_count: int


class PublicationTimelineEntry(BaseModel):
    """Publication volume and citations for a single year."""

    year: int
    count: int
    citations: int


class TrendResponse(BaseModel):
    """Response from trend analysis."""

    publication_timeline: list[PublicationTimelineEntry]
    topic_trends: list[TopicTrend]
    emerging_topics: list[EmergingTopic]
    declining_topics: list[EmergingTopic]
    summary_stats: SummaryStats


class GapResearchQuestion(BaseModel):
    """A candidate research question for filling a literature gap."""

    question: str
    addresses_gap: str
    novelty_score: float
    feasibility_score: float


class GapEntry(BaseModel):
    """A single identified research gap."""

    topic: str
    description: str
    evidence: str
    related_paper_ids: list[int]
    gap_score: float


class GapSummary(BaseModel):
    """Summary of gap analysis results."""

    total_gaps: int
    total_questions: int


class GapResponse(BaseModel):
    """Response from gap analysis."""

    gaps: list[GapEntry]
    research_questions: list[GapResearchQuestion]
    summary: GapSummary


@router.post(
    "/contradictions",
    response_model=ApiResponse[ContradictionResponse],
    summary="Detect contradictions across project papers",
)
async def detect_contradictions(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Analyze all papers in a project to find contradictory claims or findings."""
    from app.api.deps import get_llm
    from app.services.contradiction_service import ContradictionService

    stmt = select(Paper).where(Paper.project_id == project_id)
    result = await db.execute(stmt)
    papers = result.scalars().all()

    if len(papers) < 2:
        return ApiResponse(
            data=ContradictionResponse(
                contradictions=[],
                topics=[],
                total_contradictions=0,
            )
        )

    papers_for_analysis = [
        {
            "paper_id": p.id,
            "title": p.title or "",
            "abstract": p.abstract or "",
        }
        for p in papers
    ]

    llm = get_llm()
    svc = ContradictionService(llm)
    result_data = await svc.detect_contradictions(papers_for_analysis)

    return ApiResponse(data=ContradictionResponse(**result_data))


@router.get(
    "/author-network",
    response_model=ApiResponse[AuthorNetworkResponse],
    summary="Get author collaboration network for project papers",
)
async def get_author_network(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
    min_collaborations: int = Query(1, ge=1, description="Minimum co-authorship count for an edge"),
    max_nodes: int = Query(100, ge=10, le=500, description="Maximum author nodes to return"),
):
    """Build a co-authorship collaboration graph from all papers in a project."""
    from app.services.author_network_service import AuthorNetworkService

    svc = AuthorNetworkService(db)
    data = await svc.build_network(
        project_id,
        min_collaborations=min_collaborations,
        max_nodes=max_nodes,
    )

    return ApiResponse(data=AuthorNetworkResponse(**data))


@router.get(
    "/trends",
    response_model=ApiResponse[TrendResponse],
    summary="Get research trend analysis for project papers",
)
async def get_research_trends(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Analyze how research topics have evolved over time with trend detection."""
    from app.services.trend_service import TrendService

    svc = TrendService(db)
    data = await svc.compute_trends(project_id)

    return ApiResponse(data=TrendResponse(**data))


@router.post(
    "/gaps",
    response_model=ApiResponse[GapResponse],
    summary="Detect literature gaps and research opportunities",
)
async def detect_gaps(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Analyze papers to identify under-researched areas and generate research questions."""
    from app.api.deps import get_llm
    from app.services.gap_service import GapService

    stmt = select(Paper).where(Paper.project_id == project_id)
    result = await db.execute(stmt)
    papers = result.scalars().all()

    if len(papers) < 2:
        return ApiResponse(
            data=GapResponse(gaps=[], research_questions=[], summary=GapSummary(total_gaps=0, total_questions=0))
        )

    papers_for_analysis = [
        {
            "paper_id": p.id,
            "title": p.title or "",
            "abstract": p.abstract or "",
            "tags": p.tags or [],
            "year": p.year,
        }
        for p in papers
    ]

    llm = get_llm()
    svc = GapService(llm)
    result_data = await svc.analyze_gaps(papers_for_analysis)

    return ApiResponse(
        data=GapResponse(
            gaps=[GapEntry(**g) for g in result_data["gaps"]],
            research_questions=[GapResearchQuestion(**q) for q in result_data["research_questions"]],
            summary=GapSummary(**result_data["summary"]),
        )
    )
