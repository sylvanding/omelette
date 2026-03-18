"""Rewrite API — SSE endpoint for streaming excerpt rewriting."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Literal

import httpx
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.config import settings
from app.prompts.rewrite import REWRITE_PROMPTS
from app.services.llm.client import get_llm_client
from app.services.user_settings_service import UserSettingsService
from app.utils.sse import format_sse_error

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

_rewrite_semaphore = asyncio.Semaphore(settings.rewrite_semaphore_limit)


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
                async with asyncio.timeout(settings.rewrite_timeout):
                    async for token in llm.chat_stream(messages, temperature=0.3, task_type="rewrite"):
                        full_text += token
                        yield _sse("rewrite_delta", {"delta": token})
            except TimeoutError:
                yield format_sse_error(
                    f"Rewrite timed out after {settings.rewrite_timeout}s",
                    code=408,
                )
                return

            yield _sse("rewrite_end", {"full_text": full_text})

    except asyncio.CancelledError:
        logger.info("Rewrite stream cancelled by client")
        return
    except (httpx.HTTPError, ValueError, RuntimeError) as e:
        logger.exception("Rewrite stream error")
        yield format_sse_error(str(e), code=500)


@router.post("/rewrite", summary="Stream excerpt rewrite")
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
