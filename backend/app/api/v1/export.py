"""Reference manager export endpoints — BibTeX, RIS, and Zotero."""

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_project
from app.models import Paper, Project

router = APIRouter(tags=["reference-export"])


@router.post(
    "/projects/{project_id}/export/bibtex",
    summary="Export all project papers as BibTeX",
)
async def export_bibtex(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Export all papers in a project as BibTeX formatted string."""
    from app.services.export_service import FORMAT_MIME_TYPES, generate_export

    papers = (
        (await db.execute(select(Paper).where(Paper.project_id == project_id).order_by(Paper.year.desc())))
        .scalars()
        .all()
    )
    if not papers:
        return Response(content="", media_type=FORMAT_MIME_TYPES["bibtex"])

    content = generate_export(papers, "bibtex")
    filename = f"{project.name.replace(' ', '-').lower()}.bib"
    return Response(
        content=content,
        media_type=FORMAT_MIME_TYPES["bibtex"],
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/projects/{project_id}/export/ris",
    summary="Export all project papers as RIS",
)
async def export_ris(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Export all papers in a project as RIS formatted string."""
    from app.services.export_service import FORMAT_MIME_TYPES, generate_export

    papers = (
        (await db.execute(select(Paper).where(Paper.project_id == project_id).order_by(Paper.year.desc())))
        .scalars()
        .all()
    )
    if not papers:
        return Response(content="", media_type=FORMAT_MIME_TYPES["ris"])

    content = generate_export(papers, "ris")
    filename = f"{project.name.replace(' ', '-').lower()}.ris"
    return Response(
        content=content,
        media_type=FORMAT_MIME_TYPES["ris"],
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class ZoteroExportRequest(BaseModel):
    collection_name: str


@router.post(
    "/projects/{project_id}/export/zotero",
    summary="Export papers to Zotero collection",
)
async def export_zotero(
    project_id: int,
    body: ZoteroExportRequest,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Create a Zotero collection and add all project papers as items.

    If Zotero credentials are not configured, returns a BibTeX preview
    that the user can manually import into Zotero.
    """
    from app.services.export_service import generate_export
    from app.services.zotero_service import ZoteroService

    papers = (
        (await db.execute(select(Paper).where(Paper.project_id == project_id).order_by(Paper.year.desc())))
        .scalars()
        .all()
    )
    if not papers:
        raise HTTPException(status_code=400, detail="No papers to export")

    zotero = ZoteroService()

    if not zotero.is_configured:
        # Return preview BibTeX for manual import
        bibtex_preview = generate_export(papers, "bibtex")
        return {
            "data": {
                "preview": bibtex_preview,
                "message": "Zotero credentials not configured. Import the BibTeX preview manually.",
                "paper_count": len(papers),
            }
        }

    # Build structured entries for Zotero
    entries = []
    for paper in papers:
        authors = []
        if paper.authors:
            for a in paper.authors:
                if isinstance(a, dict):
                    authors.append(a.get("name", str(a)))
                else:
                    authors.append(str(a))
        entries.append(
            {
                "title": paper.title,
                "authors": authors,
                "journal": paper.journal or "",
                "year": paper.year or "",
                "doi": paper.doi or "",
                "abstract": paper.abstract or "",
            }
        )

    result = await zotero.create_collection(body.collection_name, entries)
    return {
        "data": {
            "collection_key": result["collection_key"],
            "collection_name": result["collection_name"],
            "items_created": result["items_created"],
            "errors": result["errors"],
        }
    }
