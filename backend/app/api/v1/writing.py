"""Writing assistance API endpoints."""

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_llm, get_project
from app.models import Project
from app.schemas.common import ApiResponse
from app.services.llm_client import LLMClient
from app.services.rag_service import RAGService
from app.services.writing_service import WritingService

router = APIRouter(prefix="/projects/{project_id}/writing", tags=["writing"])


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
    project: Project = Depends(get_project),
):
    """AI-powered writing assistance: summarize, cite, outline, gap analysis."""
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
    project: Project = Depends(get_project),
):
    """Generate summaries for selected papers."""
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
    project: Project = Depends(get_project),
):
    """Generate formatted citations for selected papers."""
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
    project: Project = Depends(get_project),
):
    """Generate a literature review outline based on project papers."""
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
    project: Project = Depends(get_project),
):
    """Analyze research gaps in the project's literature."""
    result = await svc.analyze_gaps(
        project_id=project_id,
        research_topic=body.research_topic,
    )
    return ApiResponse(data=result)


class ReviewDraftRequest(BaseModel):
    topic: str = ""
    style: str = Field(default="narrative", pattern=r"^(narrative|systematic|thematic)$")
    citation_format: str = Field(default="numbered", pattern=r"^(numbered|apa|gb_t_7714)$")
    language: str = Field(default="zh", pattern=r"^(zh|en)$")


@router.post("/review-draft/stream")
async def stream_review_draft(
    project_id: int,
    body: ReviewDraftRequest,
    svc: WritingService = Depends(get_writing_service),
    project: Project = Depends(get_project),
):
    """Stream a structured literature review draft via SSE."""
    return StreamingResponse(
        svc.generate_literature_review(
            project_id=project_id,
            topic=body.topic,
            style=body.style,
            citation_format=body.citation_format,
            language=body.language,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
