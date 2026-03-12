"""Data Stream Protocol SSE formatting helpers.

Outputs events in the Vercel AI SDK 5.0 Data Stream Protocol format.
Each function returns a string ready to be yielded from a StreamingResponse.
"""

from __future__ import annotations

import json
import uuid


def format_start(message_id: str | None = None) -> str:
    mid = message_id or f"msg_{uuid.uuid4().hex}"
    return f"data: {json.dumps({'type': 'start', 'messageId': mid})}\n\n"


def format_text_start(text_id: str | None = None) -> str:
    tid = text_id or f"text_{uuid.uuid4().hex}"
    return f"data: {json.dumps({'type': 'text-start', 'id': tid})}\n\n"


def format_text_delta(text_id: str, delta: str) -> str:
    return f"data: {json.dumps({'type': 'text-delta', 'id': text_id, 'delta': delta})}\n\n"


def format_text_end(text_id: str) -> str:
    return f"data: {json.dumps({'type': 'text-end', 'id': text_id})}\n\n"


def format_data_part(data_type: str, data: dict, *, part_id: str | None = None) -> str:
    """Format a custom data-* part. ``data_type`` should NOT include the ``data-`` prefix."""
    payload: dict = {"type": f"data-{data_type}", "data": data}
    if part_id is not None:
        payload["id"] = part_id
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def format_error(message: str) -> str:
    return f"data: {json.dumps({'type': 'error', 'errorText': message})}\n\n"


def format_finish() -> str:
    return f"data: {json.dumps({'type': 'finish'})}\n\n"


def format_done() -> str:
    return "data: [DONE]\n\n"
