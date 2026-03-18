"""SSE (Server-Sent Events) formatting utilities."""

import json


def format_sse_error(message: str, code: int = 500) -> str:
    """Format a standardized SSE error event.

    Unified format: event: error\\ndata: {"code": status_code, "message": error_msg}\\n\\n
    """
    return f"event: error\ndata: {json.dumps({'code': code, 'message': message})}\n\n"
