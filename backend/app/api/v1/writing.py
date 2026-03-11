"""Writing assistance API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_llm
from app.models import Project
from app.schemas.common import ApiResponse
from app.services.llm_client import LLMClient
from app.services.rag_service import RAGService
from app.services.writing_service import WritingService

router = APIRouter(prefix="/projects/{project_id}/writing", tags=["writing"])


async def _ensure_project(project_id: int, db: AsyncSession) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


class WritingAssistRequest(BaseModel):
    task: str = Field(..., description="summarize, cite, review_outline, gap_analysis")
    text: str = ""
    paper_ids: list[int] | None = None
    topic: str = ""
    style: str = "gb_t_7714"
    language: str = "en"


class WritingAssistResponse(BaseModel):
    content: str
    citations: list[dict] = []
    suggestions: list[str] = []


class SummarizeRequest(BaseModel):
    paper_ids: list[int]
    language: str = "en"


class CitationsRequest(BaseModel):
    paper_ids: list[int]
    style: str = "gb_t_7714"


class ReviewOutlineRequest(BaseModel):
    topic: str
    language: str = "en"


class GapAnalysisRequest(BaseModel):
    research_topic: str


def get_writing_service(
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
) -> WritingService:
    rag = RAGService(llm=llm)
    return WritingService(db=db, llm=llm, rag=rag)


@router.post("/assist", response_model=ApiResponse[WritingAssistResponse])
async def writing_assist(
    project_id: int,
    body: WritingAssistRequest,
    db: AsyncSession = Depends(get_db),
    svc: WritingService = Depends(get_writing_service),
):
    """AI-powered writing assistance: summarize, cite, outline, gap analysis."""
    await _ensure_project(project_id, db)
    paper_ids = body.paper_ids or []
    content = ""
    citations: list[dict] = []
    suggestions: list[str] = []

    if body.task == "summarize":
        summaries = await svc.summarize_papers(paper_ids=paper_ids, language=body.language)
        content = "\n\n".join([f"## {s['title']}\n{s['summary']}" for s in summaries])
    elif body.task == "cite":
        citations = await svc.generate_citations(paper_ids=paper_ids, style=body.style)
        content = "\n".join(c["citation"] for c in citations)
    elif body.task == "review_outline":
        topic = body.topic or body.text or "Literature Review"
        result = await svc.generate_review_outline(project_id=project_id, topic=topic, language=body.language)
        content = result["outline"]
    elif body.task == "gap_analysis":
        topic = body.topic or body.text or "Research"
        result = await svc.analyze_gaps(project_id=project_id, research_topic=topic)
        content = result["analysis"]
    else:
        return ApiResponse(
            code=400,
            message=f"Unknown task: {body.task}. Use summarize, cite, review_outline, or gap_analysis.",
            data=WritingAssistResponse(content="", citations=[], suggestions=[]),
        )

    return ApiResponse(
        data=WritingAssistResponse(
            content=content,
            citations=citations,
            suggestions=suggestions,
        )
    )


@router.post("/summarize", response_model=ApiResponse[dict])
async def summarize_papers(
    project_id: int,
    body: SummarizeRequest,
    db: AsyncSession = Depends(get_db),
    svc: WritingService = Depends(get_writing_service),
):
    """Generate summaries for selected papers."""
    await _ensure_project(project_id, db)
    summaries = await svc.summarize_papers(
        paper_ids=body.paper_ids,
        language=body.language,
    )
    return ApiResponse(data={"summaries": summaries})


@router.post("/citations", response_model=ApiResponse[dict])
async def generate_citations(
    project_id: int,
    body: CitationsRequest,
    db: AsyncSession = Depends(get_db),
    svc: WritingService = Depends(get_writing_service),
):
    """Generate formatted citations for selected papers."""
    await _ensure_project(project_id, db)
    citations = await svc.generate_citations(
        paper_ids=body.paper_ids,
        style=body.style,
    )
    return ApiResponse(data={"citations": citations, "style": body.style})


@router.post("/review-outline", response_model=ApiResponse[dict])
async def generate_review_outline(
    project_id: int,
    body: ReviewOutlineRequest,
    db: AsyncSession = Depends(get_db),
    svc: WritingService = Depends(get_writing_service),
):
    """Generate a literature review outline based on project papers."""
    await _ensure_project(project_id, db)
    result = await svc.generate_review_outline(
        project_id=project_id,
        topic=body.topic,
        language=body.language,
    )
    return ApiResponse(data=result)


@router.post("/gap-analysis", response_model=ApiResponse[dict])
async def analyze_gaps(
    project_id: int,
    body: GapAnalysisRequest,
    db: AsyncSession = Depends(get_db),
    svc: WritingService = Depends(get_writing_service),
):
    """Analyze research gaps in the project's literature."""
    await _ensure_project(project_id, db)
    result = await svc.analyze_gaps(
        project_id=project_id,
        research_topic=body.research_topic,
    )
    return ApiResponse(data=result)
