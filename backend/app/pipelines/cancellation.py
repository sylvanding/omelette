"""Shared cancellation state for pipeline execution."""

_cancelled: dict[str, bool] = {}


def is_cancelled(thread_id: str) -> bool:
    """Check if pipeline has been cancelled via the API."""
    return _cancelled.get(thread_id, False)


def mark_cancelled(thread_id: str) -> None:
    """Mark a pipeline as cancelled."""
    _cancelled[thread_id] = True


def clear_cancelled(thread_id: str) -> None:
    """Clear cancellation flag for a pipeline (call when pipeline ends)."""
    _cancelled.pop(thread_id, None)
