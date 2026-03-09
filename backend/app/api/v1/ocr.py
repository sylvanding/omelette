"""OCR processing API endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.common import ApiResponse, TaskResponse

router = APIRouter(prefix="/projects/{project_id}/ocr", tags=["ocr"])


@router.post("/process", response_model=ApiResponse[TaskResponse])
async def process_ocr(
    project_id: int,
    paper_ids: list[int] | None = None,
    use_gpu: bool = True,
    db: AsyncSession = Depends(get_db),
):
    """Run OCR on downloaded PDFs: extract text, tables, formulas."""
    # TODO: Implement in Phase 2
    return ApiResponse(data=TaskResponse(task_id=0, status="pending", message="OCR not yet implemented"))


@router.get("/stats", response_model=ApiResponse[dict])
async def ocr_stats(project_id: int, db: AsyncSession = Depends(get_db)):
    """Return OCR processing statistics."""
    # TODO: Implement in Phase 2
    return ApiResponse(data={"total": 0, "processed": 0, "failed": 0, "pending": 0})
