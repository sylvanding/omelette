"""Reviews API: systematic review workflow with data extraction tables."""

import json
import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_project
from app.models import Paper, Project, Review, ReviewExtraction
from app.schemas.common import ApiResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["reviews"])


# --- Request / Response schemas ---


class ReviewColumn(BaseModel):
    name: str
    description: str = ""


class ReviewCreate(BaseModel):
    title: str
    research_question: str = ""
    columns: list[ReviewColumn] = []
    paper_ids: list[int] = []


class ReviewUpdate(BaseModel):
    title: str | None = None
    research_question: str | None = None
    columns: list[ReviewColumn] | None = None
    paper_ids: list[int] | None = None


class ReviewItem(BaseModel):
    id: int
    project_id: int
    title: str
    research_question: str
    columns: list
    paper_ids: list
    extraction_status: str


class ReviewListResponse(BaseModel):
    reviews: list[ReviewItem]


class ExtractionResult(BaseModel):
    paper_id: int
    extracted_data: dict
    status: str
    confidence: float


class ExtractionProgressResponse(BaseModel):
    review_id: int
    status: str
    total_papers: int
    completed: int
    results: list[ExtractionResult]


class ExportResponse(BaseModel):
    csv_content: str


# --- Review CRUD ---


@router.get(
    "",
    response_model=ApiResponse[ReviewListResponse],
    summary="List reviews in a project",
)
async def list_reviews(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Return all reviews for a project."""
    stmt = select(Review).where(Review.project_id == project_id).order_by(Review.created_at.desc())
    result = await db.execute(stmt)
    reviews = result.scalars().all()

    review_items = []
    for r in reviews:
        review_items.append(
            ReviewItem(
                id=r.id,
                project_id=r.project_id,
                title=r.title,
                research_question=r.research_question or "",
                columns=json.loads(r.columns) if isinstance(r.columns, str) else (r.columns or []),
                paper_ids=json.loads(r.paper_ids) if isinstance(r.paper_ids, str) else (r.paper_ids or []),
                extraction_status=r.extraction_status,
            )
        )

    return ApiResponse(data=ReviewListResponse(reviews=review_items))


@router.post(
    "",
    response_model=ApiResponse[ReviewItem],
    status_code=201,
    summary="Create a new review",
)
async def create_review(
    project_id: int,
    body: ReviewCreate,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Create a new systematic review within a project."""
    columns_json = json.dumps([c.model_dump() for c in body.columns])

    review = Review(
        project_id=project_id,
        title=body.title,
        research_question=body.research_question,
        columns=columns_json,
        paper_ids=json.dumps(body.paper_ids),
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)

    return ApiResponse(
        data=ReviewItem(
            id=review.id,
            project_id=review.project_id,
            title=review.title,
            research_question=review.research_question or "",
            columns=body.columns,
            paper_ids=body.paper_ids,
            extraction_status=review.extraction_status,
        )
    )


@router.put(
    "/{review_id}",
    response_model=ApiResponse[ReviewItem],
    summary="Update a review",
)
async def update_review(
    project_id: int,
    review_id: int,
    body: ReviewUpdate,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Update review configuration."""
    stmt = select(Review).where(
        Review.id == review_id,
        Review.project_id == project_id,
    )
    result = await db.execute(stmt)
    review = result.scalar_one_or_none()
    if not review:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Review not found")

    if body.title is not None:
        review.title = body.title
    if body.research_question is not None:
        review.research_question = body.research_question
    if body.columns is not None:
        review.columns = json.dumps([c.model_dump() for c in body.columns])
    if body.paper_ids is not None:
        review.paper_ids = json.dumps(body.paper_ids)

    await db.commit()
    await db.refresh(review)

    return ApiResponse(
        data=ReviewItem(
            id=review.id,
            project_id=review.project_id,
            title=review.title,
            research_question=review.research_question or "",
            columns=json.loads(review.columns) if isinstance(review.columns, str) else (review.columns or []),
            paper_ids=json.loads(review.paper_ids) if isinstance(review.paper_ids, str) else (review.paper_ids or []),
            extraction_status=review.extraction_status,
        )
    )


@router.delete(
    "/{review_id}",
    response_model=ApiResponse[None],
    summary="Delete a review",
)
async def delete_review(
    project_id: int,
    review_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Delete a review and all its extractions."""
    stmt = select(Review).where(
        Review.id == review_id,
        Review.project_id == project_id,
    )
    result = await db.execute(stmt)
    review = result.scalar_one_or_none()
    if not review:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Review not found")

    await db.delete(review)
    await db.commit()

    return ApiResponse(data=None)


# --- Extraction ---


@router.post(
    "/{review_id}/extract",
    response_model=ApiResponse[ExtractionProgressResponse],
    summary="Run LLM extraction for all papers in review",
)
async def run_extraction(
    project_id: int,
    review_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Run LLM-based data extraction for all papers in the review."""
    from app.api.deps import get_llm
    from app.services.review_service import ReviewService

    stmt = select(Review).where(
        Review.id == review_id,
        Review.project_id == project_id,
    )
    result = await db.execute(stmt)
    review = result.scalar_one_or_none()
    if not review:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Review not found")

    columns = json.loads(review.columns) if isinstance(review.columns, str) else (review.columns or [])
    paper_ids = json.loads(review.paper_ids) if isinstance(review.paper_ids, str) else (review.paper_ids or [])

    if not paper_ids:
        return ApiResponse(
            data=ExtractionProgressResponse(
                review_id=review.id,
                status="complete",
                total_papers=0,
                completed=0,
                results=[],
            )
        )

    # Fetch papers
    papers_stmt = select(Paper).where(Paper.id.in_(paper_ids))
    papers_result = await db.execute(papers_stmt)
    papers = papers_result.scalars().all()

    # Clear existing extractions
    await db.execute(ReviewExtraction.__table__.delete().where(ReviewExtraction.review_id == review_id))

    # Update review status
    review.extraction_status = "in_progress"
    await db.commit()

    llm = get_llm()
    svc = ReviewService(llm)

    results = []
    completed = 0

    for paper in papers:
        paper_data = {
            "paper_id": paper.id,
            "title": paper.title or "",
            "abstract": paper.abstract or "",
        }

        extract_result = await svc.extract_paper_data(paper_data, columns)

        extraction = ReviewExtraction(
            review_id=review.id,
            paper_id=paper.id,
            extracted_data=json.dumps(extract_result["extracted_data"]),
            status="complete",
            confidence=extract_result["confidence"],
        )
        db.add(extraction)
        completed += 1

        results.append(
            ExtractionResult(
                paper_id=paper.id,
                extracted_data=extract_result["extracted_data"],
                status="complete",
                confidence=extract_result["confidence"],
            )
        )

    review.extraction_status = "complete"
    await db.commit()

    return ApiResponse(
        data=ExtractionProgressResponse(
            review_id=review.id,
            status="complete",
            total_papers=len(papers),
            completed=completed,
            results=results,
        )
    )


@router.get(
    "/{review_id}/extractions",
    response_model=ApiResponse[ExtractionProgressResponse],
    summary="Get extraction results for a review",
)
async def get_extractions(
    project_id: int,
    review_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Return current extraction results for a review."""
    stmt = select(Review).where(
        Review.id == review_id,
        Review.project_id == project_id,
    )
    result = await db.execute(stmt)
    review = result.scalar_one_or_none()
    if not review:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Review not found")

    extractions_stmt = select(ReviewExtraction).where(ReviewExtraction.review_id == review_id)
    extractions_result = await db.execute(extractions_stmt)
    extractions = extractions_result.scalars().all()

    paper_ids = json.loads(review.paper_ids) if isinstance(review.paper_ids, str) else (review.paper_ids or [])
    total_papers = len(paper_ids)
    completed = sum(1 for e in extractions if e.status == "complete")

    results = []
    for ext in extractions:
        extracted = ext.extracted_data
        if isinstance(extracted, str):
            try:
                extracted = json.loads(extracted)
            except json.JSONDecodeError:
                extracted = {}
        results.append(
            ExtractionResult(
                paper_id=ext.paper_id,
                extracted_data=extracted,
                status=ext.status,
                confidence=ext.confidence,
            )
        )

    return ApiResponse(
        data=ExtractionProgressResponse(
            review_id=review.id,
            status=review.extraction_status,
            total_papers=total_papers,
            completed=completed,
            results=results,
        )
    )


# --- Export ---


@router.get(
    "/{review_id}/export",
    summary="Export review data as CSV",
)
async def export_review(
    project_id: int,
    review_id: int,
    format: str = "csv",
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Export review extraction data as CSV."""
    from app.services.review_service import ReviewService

    stmt = select(Review).where(
        Review.id == review_id,
        Review.project_id == project_id,
    )
    result = await db.execute(stmt)
    review = result.scalar_one_or_none()
    if not review:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Review not found")

    columns = json.loads(review.columns) if isinstance(review.columns, str) else (review.columns or [])

    extractions_stmt = select(ReviewExtraction).where(
        ReviewExtraction.review_id == review_id,
        ReviewExtraction.status == "complete",
    )
    extractions_result = await db.execute(extractions_stmt)
    extractions = extractions_result.scalars().all()

    # Fetch paper metadata
    paper_ids = [ext.paper_id for ext in extractions]
    if paper_ids:
        papers_stmt = select(Paper).where(Paper.id.in_(paper_ids))
        papers_result = await db.execute(papers_stmt)
        papers = papers_result.scalars().all()
    else:
        papers = []

    papers_dict = {
        p.id: {
            "title": p.title or "",
            "year": p.year or "",
            "citation_count": p.citation_count or 0,
        }
        for p in papers
    }

    ext_records = []
    for ext in extractions:
        extracted = ext.extracted_data
        if isinstance(extracted, str):
            try:
                extracted = json.loads(extracted)
            except json.JSONDecodeError:
                extracted = {}
        ext_records.append({"paper_id": ext.paper_id, "extracted_data": extracted})

    svc = ReviewService(None)  # No LLM needed for export
    csv_content = svc.export_to_csv(columns, ext_records, papers_dict)

    from fastapi.responses import StreamingResponse

    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="review-{review_id}-export.csv"'},
    )
