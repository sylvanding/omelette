"""Keyword management API endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_llm, get_or_404, get_project
from app.models import Keyword, Project
from app.schemas.common import ApiResponse, KeywordPaginationParams, PaginatedData
from app.schemas.keyword import KeywordCreate, KeywordExpandRequest, KeywordExpandResponse, KeywordRead, KeywordUpdate
from app.services.keyword_service import KeywordService
from app.services.llm.client import LLMClient

router = APIRouter(prefix="/projects/{project_id}/keywords", tags=["keywords"])


@router.get("", response_model=ApiResponse[PaginatedData[KeywordRead]], summary="List keywords")
async def list_keywords(
    project_id: int,
    pagination: KeywordPaginationParams = Depends(),
    level: int | None = None,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    page, page_size = pagination.page, pagination.page_size
    base = select(Keyword).where(Keyword.project_id == project_id)
    if level is not None:
        base = base.where(Keyword.level == level)

    count = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    items = (
        (await db.execute(base.order_by(Keyword.level, Keyword.id).offset((page - 1) * page_size).limit(page_size)))
        .scalars()
        .all()
    )

    return ApiResponse(
        data=PaginatedData(
            items=[KeywordRead.model_validate(k) for k in items],
            total=count,
            page=page,
            page_size=page_size,
            total_pages=(count + page_size - 1) // page_size or 1,
        )
    )


@router.post("", response_model=ApiResponse[KeywordRead], status_code=201, summary="Create keyword")
async def create_keyword(
    project_id: int,
    body: KeywordCreate,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    keyword = Keyword(project_id=project_id, **body.model_dump())
    db.add(keyword)
    await db.flush()
    await db.refresh(keyword)
    return ApiResponse(code=201, message="Keyword created", data=KeywordRead.model_validate(keyword))


@router.post("/bulk", response_model=ApiResponse[dict], summary="Bulk create keywords")
async def bulk_create_keywords(
    project_id: int,
    keywords: list[KeywordCreate],
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    created = 0
    for kw_data in keywords:
        keyword = Keyword(project_id=project_id, **kw_data.model_dump())
        db.add(keyword)
        created += 1
    await db.flush()
    return ApiResponse(data={"created": created})


@router.get("/search-formula", response_model=ApiResponse[dict], summary="Generate boolean search formula")
async def generate_search_formula(
    project_id: int,
    database: str = "wos",
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
    project: Project = Depends(get_project),
):
    """Generate a boolean search formula from project keywords."""
    service = KeywordService(db, llm)
    result = await service.generate_search_formula(project_id, database)
    return ApiResponse(data=result)


@router.put("/{keyword_id}", response_model=ApiResponse[KeywordRead], summary="Update keyword")
async def update_keyword(
    project_id: int,
    keyword_id: int,
    body: KeywordUpdate,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    keyword = await get_or_404(db, Keyword, keyword_id, project_id=project_id, detail="Keyword not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(keyword, key, value)
    await db.flush()
    await db.refresh(keyword)
    return ApiResponse(data=KeywordRead.model_validate(keyword))


@router.delete("/{keyword_id}", response_model=ApiResponse, summary="Delete keyword")
async def delete_keyword(
    project_id: int,
    keyword_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    keyword = await get_or_404(db, Keyword, keyword_id, project_id=project_id, detail="Keyword not found")
    await db.delete(keyword)
    return ApiResponse(message="Keyword deleted")


@router.post("/expand", response_model=ApiResponse[KeywordExpandResponse], summary="Expand keywords with LLM")
async def expand_keywords(
    project_id: int,
    body: KeywordExpandRequest,
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
    project: Project = Depends(get_project),
):
    """Use LLM to expand seed keywords with synonyms and related terms."""
    svc = KeywordService(db, llm)
    expanded = await svc.expand_keywords_with_llm(
        project_id=project_id,
        seed_terms=body.seed_terms,
        language=body.language,
        max_results=body.max_results,
    )

    return ApiResponse(
        data=KeywordExpandResponse(
            expanded_terms=expanded,
            source=f"llm:{llm.provider}" if llm else "none",
        )
    )
