"""Pipeline orchestration API — start, status, resume, cancel LangGraph pipelines."""

import asyncio
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models import Project
from app.schemas.common import ApiResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pipelines", tags=["pipelines"])

_running_tasks: dict[str, dict] = {}


class SearchPipelineRequest(BaseModel):
    project_id: int
    query: str = ""
    sources: list[str] | None = None
    max_results: int = Field(50, ge=1, le=200)


class UploadPipelineRequest(BaseModel):
    project_id: int
    pdf_paths: list[str]


class ResumeRequest(BaseModel):
    resolved_conflicts: list[dict] = []


async def _ensure_project(project_id: int, db: AsyncSession) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("/search", response_model=ApiResponse[dict])
async def start_search_pipeline(body: SearchPipelineRequest, db: AsyncSession = Depends(get_db)):
    """Start a keyword-search pipeline: search → dedup → crawl → OCR → index."""
    await _ensure_project(body.project_id, db)

    from app.pipelines.graphs import create_search_pipeline

    thread_id = f"search_{uuid.uuid4().hex[:12]}"
    pipeline = create_search_pipeline()

    initial_state = {
        "project_id": body.project_id,
        "thread_id": thread_id,
        "pipeline_type": "search",
        "params": {
            "query": body.query,
            "sources": body.sources,
            "max_results": body.max_results,
        },
        "papers": [],
        "conflicts": [],
        "resolved_conflicts": [],
        "progress": 0,
        "total": 100,
        "stage": "starting",
        "error": None,
        "cancelled": False,
        "result": {},
    }

    config = {"configurable": {"thread_id": thread_id}}

    _running_tasks[thread_id] = {"status": "running", "pipeline": pipeline, "config": config}

    async def _run():
        try:
            result = await pipeline.ainvoke(initial_state, config=config)
            snapshot = pipeline.get_state(config)
            if snapshot and snapshot.next:
                _running_tasks[thread_id]["status"] = "interrupted"
                _running_tasks[thread_id]["result"] = result
            else:
                _running_tasks[thread_id]["status"] = "completed"
                _running_tasks[thread_id]["result"] = result
        except Exception as e:
            logger.error("Pipeline %s failed: %s", thread_id, e)
            _running_tasks[thread_id]["status"] = "failed"
            _running_tasks[thread_id]["error"] = str(e)

    asyncio.create_task(_run())

    return ApiResponse(
        data={
            "thread_id": thread_id,
            "status": "running",
            "project_id": body.project_id,
        }
    )


@router.post("/upload", response_model=ApiResponse[dict])
async def start_upload_pipeline(body: UploadPipelineRequest, db: AsyncSession = Depends(get_db)):
    """Start a PDF-upload pipeline: extract → dedup → OCR → index."""
    await _ensure_project(body.project_id, db)

    from app.pipelines.graphs import create_upload_pipeline

    thread_id = f"upload_{uuid.uuid4().hex[:12]}"
    pipeline = create_upload_pipeline()

    initial_state = {
        "project_id": body.project_id,
        "thread_id": thread_id,
        "pipeline_type": "upload",
        "params": {"pdf_paths": body.pdf_paths},
        "papers": [],
        "conflicts": [],
        "resolved_conflicts": [],
        "progress": 0,
        "total": 100,
        "stage": "starting",
        "error": None,
        "cancelled": False,
        "result": {},
    }

    config = {"configurable": {"thread_id": thread_id}}
    _running_tasks[thread_id] = {"status": "running", "pipeline": pipeline, "config": config}

    async def _run():
        try:
            result = await pipeline.ainvoke(initial_state, config=config)
            snapshot = pipeline.get_state(config)
            if snapshot and snapshot.next:
                _running_tasks[thread_id]["status"] = "interrupted"
                _running_tasks[thread_id]["result"] = result
            else:
                _running_tasks[thread_id]["status"] = "completed"
                _running_tasks[thread_id]["result"] = result
        except Exception as e:
            logger.error("Pipeline %s failed: %s", thread_id, e)
            _running_tasks[thread_id]["status"] = "failed"
            _running_tasks[thread_id]["error"] = str(e)

    asyncio.create_task(_run())

    return ApiResponse(
        data={
            "thread_id": thread_id,
            "status": "running",
            "project_id": body.project_id,
        }
    )


@router.get("/{thread_id}/status", response_model=ApiResponse[dict])
async def get_pipeline_status(thread_id: str):
    """Get pipeline execution status."""
    task = _running_tasks.get(thread_id)
    if not task:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    data: dict = {
        "thread_id": thread_id,
        "status": task["status"],
    }

    if task["status"] == "interrupted":
        pipeline = task.get("pipeline")
        config = task.get("config")
        if pipeline and config:
            try:
                snapshot = pipeline.get_state(config)
                if snapshot and snapshot.next:
                    data["interrupted_at"] = list(snapshot.next)
                state = snapshot.values if snapshot else {}
                data["conflicts"] = state.get("conflicts", [])
                data["stage"] = state.get("stage", "")
                data["progress"] = state.get("progress", 0)
            except Exception:
                pass

    if task["status"] == "completed":
        result = task.get("result", {})
        data["stage"] = result.get("stage", "completed")
        data["progress"] = result.get("progress", 100)
        data["result"] = result.get("result", {})

    if task.get("error"):
        data["error"] = task["error"]

    return ApiResponse(data=data)


@router.post("/{thread_id}/resume", response_model=ApiResponse[dict])
async def resume_pipeline(thread_id: str, body: ResumeRequest):
    """Resume an interrupted pipeline with resolved conflicts."""
    from langgraph.types import Command

    task = _running_tasks.get(thread_id)
    if not task:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    if task["status"] != "interrupted":
        raise HTTPException(status_code=400, detail=f"Pipeline is {task['status']}, not interrupted")

    pipeline = task["pipeline"]
    config = task["config"]
    task["status"] = "running"

    async def _resume():
        try:
            result = await pipeline.ainvoke(
                Command(resume=body.resolved_conflicts),
                config=config,
            )
            snapshot = pipeline.get_state(config)
            if snapshot and snapshot.next:
                task["status"] = "interrupted"
            else:
                task["status"] = "completed"
            task["result"] = result
        except Exception as e:
            logger.error("Pipeline resume %s failed: %s", thread_id, e)
            task["status"] = "failed"
            task["error"] = str(e)

    asyncio.create_task(_resume())

    return ApiResponse(data={"thread_id": thread_id, "status": "running"})


@router.post("/{thread_id}/cancel", response_model=ApiResponse[dict])
async def cancel_pipeline(thread_id: str):
    """Cancel a running pipeline."""
    task = _running_tasks.get(thread_id)
    if not task:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    task["status"] = "cancelled"
    return ApiResponse(data={"thread_id": thread_id, "status": "cancelled"})
