"""Collections API: CRUD for paper collections and smart tagging."""

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_project
from app.models import Collection, CollectionPaper, Paper, Project
from app.schemas.common import ApiResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["collections"])


# --- Request / Response schemas ---


class CollectionCreate(BaseModel):
    name: str
    description: str = ""
    color: str = ""


class CollectionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    color: str | None = None
    sort_order: int | None = None


class CollectionItem(BaseModel):
    id: int
    project_id: int
    name: str
    description: str
    color: str
    sort_order: int
    paper_count: int


class CollectionResponse(BaseModel):
    collections: list[CollectionItem]


class AddPapersRequest(BaseModel):
    paper_ids: list[int]


class RemovePapersRequest(BaseModel):
    paper_ids: list[int]


class SmartTagRequest(BaseModel):
    paper_ids: list[int]


class PaperTagSuggestion(BaseModel):
    paper_id: int
    suggested_tags: list[str]


class SmartTagResponse(BaseModel):
    tags: list[PaperTagSuggestion]


class CollectionPaperItem(BaseModel):
    paper_id: int
    title: str
    doi: str | None
    year: int | None
    citation_count: int


class CollectionDetailResponse(BaseModel):
    collection: CollectionItem
    papers: list[CollectionPaperItem]


# --- Collection CRUD ---


@router.get(
    "",
    response_model=ApiResponse[CollectionResponse],
    summary="List collections in a project",
)
async def list_collections(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Return all collections for a project with paper counts."""
    stmt = (
        select(
            Collection,
            func.count(CollectionPaper.id).label("paper_count"),
        )
        .where(Collection.project_id == project_id)
        .outerjoin(CollectionPaper, Collection.id == CollectionPaper.collection_id)
        .group_by(Collection.id)
        .order_by(Collection.sort_order, Collection.created_at)
    )
    result = await db.execute(stmt)
    rows = result.all()

    collections = [
        CollectionItem(
            id=c.id,
            project_id=c.project_id,
            name=c.name,
            description=c.description or "",
            color=c.color or "",
            sort_order=c.sort_order or 0,
            paper_count=count,
        )
        for c, count in rows
    ]

    return ApiResponse(data=CollectionResponse(collections=collections))


@router.post(
    "",
    response_model=ApiResponse[CollectionItem],
    status_code=201,
    summary="Create a new collection",
)
async def create_collection(
    project_id: int,
    body: CollectionCreate,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Create a new collection within a project."""
    collection = Collection(
        project_id=project_id,
        name=body.name,
        description=body.description,
        color=body.color,
    )
    db.add(collection)
    await db.commit()
    await db.refresh(collection)

    return ApiResponse(
        data=CollectionItem(
            id=collection.id,
            project_id=collection.project_id,
            name=collection.name,
            description=collection.description or "",
            color=collection.color or "",
            sort_order=collection.sort_order or 0,
            paper_count=0,
        )
    )


@router.put(
    "/{collection_id}",
    response_model=ApiResponse[CollectionItem],
    summary="Update a collection",
)
async def update_collection(
    project_id: int,
    collection_id: int,
    body: CollectionUpdate,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Update collection metadata."""
    stmt = select(Collection).where(
        Collection.id == collection_id,
        Collection.project_id == project_id,
    )
    result = await db.execute(stmt)
    collection = result.scalar_one_or_none()
    if not collection:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Collection not found")

    if body.name is not None:
        collection.name = body.name
    if body.description is not None:
        collection.description = body.description
    if body.color is not None:
        collection.color = body.color
    if body.sort_order is not None:
        collection.sort_order = body.sort_order

    await db.commit()
    await db.refresh(collection)

    count_result = await db.execute(
        select(func.count(CollectionPaper.id)).where(CollectionPaper.collection_id == collection.id)
    )
    paper_count = count_result.scalar() or 0

    return ApiResponse(
        data=CollectionItem(
            id=collection.id,
            project_id=collection.project_id,
            name=collection.name,
            description=collection.description or "",
            color=collection.color or "",
            sort_order=collection.sort_order or 0,
            paper_count=paper_count,
        )
    )


@router.delete(
    "/{collection_id}",
    response_model=ApiResponse[None],
    summary="Delete a collection",
)
async def delete_collection(
    project_id: int,
    collection_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Delete a collection (papers remain, only the association is removed)."""
    stmt = select(Collection).where(
        Collection.id == collection_id,
        Collection.project_id == project_id,
    )
    result = await db.execute(stmt)
    collection = result.scalar_one_or_none()
    if not collection:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Collection not found")

    await db.delete(collection)
    await db.commit()

    return ApiResponse(data=None)


@router.get(
    "/{collection_id}",
    response_model=ApiResponse[CollectionDetailResponse],
    summary="Get collection with its papers",
)
async def get_collection(
    project_id: int,
    collection_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Return a collection and the papers it contains."""
    coll_stmt = select(Collection).where(
        Collection.id == collection_id,
        Collection.project_id == project_id,
    )
    coll_result = await db.execute(coll_stmt)
    collection = coll_result.scalar_one_or_none()
    if not collection:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Collection not found")

    papers_stmt = (
        select(Paper)
        .join(CollectionPaper, Paper.id == CollectionPaper.paper_id)
        .where(CollectionPaper.collection_id == collection_id)
        .order_by(CollectionPaper.added_at)
    )
    papers_result = await db.execute(papers_stmt)
    papers = papers_result.scalars().all()

    return ApiResponse(
        data=CollectionDetailResponse(
            collection=CollectionItem(
                id=collection.id,
                project_id=collection.project_id,
                name=collection.name,
                description=collection.description or "",
                color=collection.color or "",
                sort_order=collection.sort_order or 0,
                paper_count=len(papers),
            ),
            papers=[
                CollectionPaperItem(
                    paper_id=p.id,
                    title=p.title or "",
                    doi=p.doi,
                    year=p.year,
                    citation_count=p.citation_count or 0,
                )
                for p in papers
            ],
        )
    )


# --- Paper association ---


@router.post(
    "/{collection_id}/papers",
    response_model=ApiResponse[CollectionItem],
    summary="Add papers to a collection",
)
async def add_papers_to_collection(
    project_id: int,
    collection_id: int,
    body: AddPapersRequest,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Add one or more papers to a collection."""
    coll_stmt = select(Collection).where(
        Collection.id == collection_id,
        Collection.project_id == project_id,
    )
    coll_result = await db.execute(coll_stmt)
    collection = coll_result.scalar_one_or_none()
    if not collection:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Collection not found")

    existing_stmt = (
        select(CollectionPaper.paper_id)
        .where(CollectionPaper.collection_id == collection_id)
        .where(CollectionPaper.paper_id.in_(body.paper_ids))
    )
    existing_result = await db.execute(existing_stmt)
    existing_ids = set(existing_result.scalars().all())

    for pid in body.paper_ids:
        if pid not in existing_ids:
            db.add(CollectionPaper(collection_id=collection_id, paper_id=pid))

    await db.commit()

    count_result = await db.execute(
        select(func.count(CollectionPaper.id)).where(CollectionPaper.collection_id == collection_id)
    )
    paper_count = count_result.scalar() or 0

    return ApiResponse(
        data=CollectionItem(
            id=collection.id,
            project_id=collection.project_id,
            name=collection.name,
            description=collection.description or "",
            color=collection.color or "",
            sort_order=collection.sort_order or 0,
            paper_count=paper_count,
        )
    )


@router.delete(
    "/{collection_id}/papers",
    response_model=ApiResponse[CollectionItem],
    summary="Remove papers from a collection",
)
async def remove_papers_from_collection(
    project_id: int,
    collection_id: int,
    body: RemovePapersRequest,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Remove one or more papers from a collection."""
    await db.execute(
        CollectionPaper.__table__.delete().where(
            CollectionPaper.collection_id == collection_id,
            CollectionPaper.paper_id.in_(body.paper_ids),
        )
    )
    await db.commit()

    coll_stmt = select(Collection).where(
        Collection.id == collection_id,
        Collection.project_id == project_id,
    )
    coll_result = await db.execute(coll_stmt)
    collection = coll_result.scalar_one_or_none()
    if not collection:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Collection not found")

    count_result = await db.execute(
        select(func.count(CollectionPaper.id)).where(CollectionPaper.collection_id == collection_id)
    )
    paper_count = count_result.scalar() or 0

    return ApiResponse(
        data=CollectionItem(
            id=collection.id,
            project_id=collection.project_id,
            name=collection.name,
            description=collection.description or "",
            color=collection.color or "",
            sort_order=collection.sort_order or 0,
            paper_count=paper_count,
        )
    )


# --- Smart Tagging ---


@router.post(
    "/tags/suggest",
    response_model=ApiResponse[SmartTagResponse],
    summary="Get AI-suggested tags for papers",
)
async def suggest_tags(
    project_id: int,
    body: SmartTagRequest,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Return AI-generated tag suggestions for the given papers."""
    from app.api.deps import get_llm
    from app.services.collection_service import CollectionService

    stmt = select(Paper).where(
        Paper.project_id == project_id,
        Paper.id.in_(body.paper_ids),
    )
    result = await db.execute(stmt)
    papers = result.scalars().all()

    if not papers:
        return ApiResponse(data=SmartTagResponse(tags=[]))

    papers_for_analysis = [
        {
            "paper_id": p.id,
            "title": p.title or "",
            "abstract": p.abstract or "",
        }
        for p in papers
    ]

    llm = get_llm()
    svc = CollectionService(llm)
    result_data = await svc.suggest_tags(papers_for_analysis)

    tags = [
        PaperTagSuggestion(
            paper_id=t["paper_id"],
            suggested_tags=t["suggested_tags"],
        )
        for t in result_data.get("tags", [])
    ]

    return ApiResponse(data=SmartTagResponse(tags=tags))
