"""Pipeline state definition shared across all pipeline types."""

from __future__ import annotations

from typing import Any, TypedDict


class PipelineState(TypedDict, total=False):
    """Shared state passed between pipeline nodes."""

    papers: list[dict]
    conflicts: list[dict]
    resolved_conflicts: list[dict]
    task_id: int
    project_id: int
    thread_id: str
    progress: int
    total: int
    stage: str
    pipeline_type: str
    params: dict[str, Any]
    error: str | None
    cancelled: bool
    result: dict[str, Any]
