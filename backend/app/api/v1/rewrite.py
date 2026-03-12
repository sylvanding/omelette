"""Rewrite API — SSE endpoint for streaming excerpt rewriting."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Literal

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services.llm.client import get_llm_client
from app.services.user_settings_service import UserSettingsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["rewrite"])

_rewrite_semaphore = asyncio.Semaphore(3)

REWRITE_PROMPTS: dict[str, str] = {
    "simplify": (
        "Rewrite the following academic text in plain, accessible language. "
        "Keep the core meaning and key concepts intact, but make it understandable "
        "to a general audience. Output only the rewritten text, no explanations."
    ),
    "academic": (
        "Rewrite the following text in formal academic style. "
        "Use precise terminology, passive voice where appropriate, and proper "
        "academic conventions. Maintain the original meaning. Output only the rewritten text."
    ),
    "translate_en": (
        "Translate the following text into English. "
        "Preserve academic terminology and the original meaning. "
        "Output only the translation, no explanations."
    ),
    "translate_zh": ("将以下文本翻译为中文。保留学术术语和原意。仅输出翻译结果，不要添加解释。"),
}

REWRITE_TIMEOUT = 30.0


class RewriteRequest(BaseModel):
    excerpt: str
    style: Literal["simplify", "academic", "translate_en", "translate_zh", "custom"]
    custom_prompt: str | None = None
    source_language: str = "auto"

    @field_validator("excerpt")
    @classmethod
    def excerpt_max_length(cls, v: str) -> str:
        if len(v) > 2000:
            raise ValueError("excerpt must not exceed 2000 characters")
        return v

    @model_validator(mode="after")
    def custom_requires_prompt(self) -> RewriteRequest:
        if self.style == "custom" and not self.custom_prompt:
            raise ValueError("custom_prompt required when style is 'custom'")
        return self


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _stream_rewrite(request: RewriteRequest, db: AsyncSession):
    """Generator that yields SSE events for the rewrite stream."""
    try:
        async with _rewrite_semaphore:
            svc = UserSettingsService(db)
            config = await svc.get_merged_llm_config()
            llm = get_llm_client(config=config)

            system_prompt = request.custom_prompt or "" if request.style == "custom" else REWRITE_PROMPTS[request.style]

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.excerpt},
            ]

            full_text = ""
            try:
                async with asyncio.timeout(REWRITE_TIMEOUT):
                    async for token in llm.chat_stream(messages, temperature=0.3, task_type="rewrite"):
                        full_text += token
                        yield _sse("rewrite_delta", {"delta": token})
            except TimeoutError:
                yield _sse("error", {"code": "timeout", "message": "Rewrite timed out after 30s"})
                return

            yield _sse("rewrite_end", {"full_text": full_text})

    except asyncio.CancelledError:
        logger.info("Rewrite stream cancelled by client")
        return
    except Exception as e:
        logger.exception("Rewrite stream error")
        yield _sse("error", {"code": "rewrite_error", "message": str(e)})


@router.post("/rewrite")
async def rewrite_stream(
    request: RewriteRequest,
    db: AsyncSession = Depends(get_db),
):
    """SSE streaming rewrite endpoint — rewrites an excerpt in the chosen style."""
    return StreamingResponse(
        _stream_rewrite(request, db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
