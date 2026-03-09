"""Keyword management API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_llm
from app.models import Keyword, Project
from app.schemas.common import ApiResponse
from app.schemas.keyword import KeywordCreate, KeywordRead, KeywordUpdate, KeywordExpandRequest, KeywordExpandResponse
from app.services.keyword_service import KeywordService
from app.services.llm_client import LLMClient

router = APIRouter(prefix="/projects/{project_id}/keywords", tags=["keywords"])


async def _ensure_project(project_id: int, db: AsyncSession) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("", response_model=ApiResponse[list[KeywordRead]])
async def list_keywords(project_id: int, level: int | None = None, db: AsyncSession = Depends(get_db)):
    await _ensure_project(project_id, db)
    stmt = select(Keyword).where(Keyword.project_id == project_id)
    if level is not None:
        stmt = stmt.where(Keyword.level == level)
    stmt = stmt.order_by(Keyword.level, Keyword.id)
    result = await db.execute(stmt)
    keywords = result.scalars().all()
    return ApiResponse(data=[KeywordRead.model_validate(k) for k in keywords])


@router.post("", response_model=ApiResponse[KeywordRead], status_code=201)
async def create_keyword(project_id: int, body: KeywordCreate, db: AsyncSession = Depends(get_db)):
    await _ensure_project(project_id, db)
    keyword = Keyword(project_id=project_id, **body.model_dump())
    db.add(keyword)
    await db.flush()
    await db.refresh(keyword)
    return ApiResponse(code=201, message="Keyword created", data=KeywordRead.model_validate(keyword))


@router.post("/bulk", response_model=ApiResponse[dict])
async def bulk_create_keywords(
    project_id: int, keywords: list[KeywordCreate], db: AsyncSession = Depends(get_db)
):
    await _ensure_project(project_id, db)
    created = 0
    for kw_data in keywords:
        keyword = Keyword(project_id=project_id, **kw_data.model_dump())
        db.add(keyword)
        created += 1
    await db.flush()
    return ApiResponse(data={"created": created})


@router.get("/search-formula", response_model=ApiResponse[dict])
async def generate_search_formula(
    project_id: int,
    database: str = "wos",
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
):
    """Generate a boolean search formula from project keywords."""
    await _ensure_project(project_id, db)
    service = KeywordService(db, llm)
    result = await service.generate_search_formula(project_id, database)
    return ApiResponse(data=result)


@router.put("/{keyword_id}", response_model=ApiResponse[KeywordRead])
async def update_keyword(
    project_id: int, keyword_id: int, body: KeywordUpdate, db: AsyncSession = Depends(get_db)
):
    await _ensure_project(project_id, db)
    keyword = await db.get(Keyword, keyword_id)
    if not keyword or keyword.project_id != project_id:
        raise HTTPException(status_code=404, detail="Keyword not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(keyword, key, value)
    await db.flush()
    await db.refresh(keyword)
    return ApiResponse(data=KeywordRead.model_validate(keyword))


@router.delete("/{keyword_id}", response_model=ApiResponse)
async def delete_keyword(project_id: int, keyword_id: int, db: AsyncSession = Depends(get_db)):
    await _ensure_project(project_id, db)
    keyword = await db.get(Keyword, keyword_id)
    if not keyword or keyword.project_id != project_id:
        raise HTTPException(status_code=404, detail="Keyword not found")
    await db.delete(keyword)
    return ApiResponse(message="Keyword deleted")


@router.post("/expand", response_model=ApiResponse[KeywordExpandResponse])
async def expand_keywords(
    project_id: int,
    body: KeywordExpandRequest,
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
):
    """Use LLM to expand seed keywords with synonyms and related terms."""
    await _ensure_project(project_id, db)

    prompt = (
        f"Given these seed keywords in the field of scientific research: {body.seed_terms}\n"
        f"Language: {body.language}\n"
        f"Generate up to {body.max_results} related terms including synonyms, abbreviations, "
        "alternate names, and cross-disciplinary terms.\n"
        "Return JSON: {\"expanded_terms\": [{\"term\": \"...\", \"term_zh\": \"...\", \"relation\": \"synonym|abbreviation|related\"}]}"
    )

    result = await llm.chat_json(
        messages=[
            {"role": "system", "content": "You are a scientific terminology expert. Return valid JSON only."},
            {"role": "user", "content": prompt},
        ],
        task_type="keyword_expand",
    )

    return ApiResponse(data=KeywordExpandResponse(
        expanded_terms=result.get("expanded_terms", []),
        source=f"llm:{llm.provider}",
    ))
