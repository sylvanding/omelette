"""Unified LLM client supporting Aliyun Bailian, Volcengine, and mock mode."""

import json
import logging
from typing import Any

from openai import AsyncOpenAI

from app.config import settings

logger = logging.getLogger(__name__)

MOCK_RESPONSES: dict[str, str] = {
    "keyword_expand": json.dumps({
        "expanded_terms": [
            {"term": "STED microscopy", "term_zh": "受激发射损耗显微"},
            {"term": "STORM imaging", "term_zh": "随机光学重建显微"},
            {"term": "PALM microscopy", "term_zh": "光激活定位显微"},
            {"term": "structured illumination", "term_zh": "结构光照明"},
        ]
    }),
    "summarize": "This paper presents a novel approach to super-resolution microscopy...",
    "dedup_check": json.dumps({"is_duplicate": False, "confidence": 0.85, "reason": "Different methodology"}),
    "default": "This is a mock LLM response for testing purposes.",
}


class LLMClient:
    """Abstraction layer for LLM API calls with provider switching and mock support."""

    def __init__(self, provider: str | None = None):
        self.provider = provider or settings.llm_provider
        self._client: AsyncOpenAI | None = None

    def _get_client(self) -> AsyncOpenAI:
        if self._client is not None:
            return self._client

        if self.provider == "aliyun":
            self._client = AsyncOpenAI(
                api_key=settings.aliyun_api_key,
                base_url=settings.aliyun_base_url,
            )
        elif self.provider == "volcengine":
            self._client = AsyncOpenAI(
                api_key=settings.volcengine_api_key,
                base_url=settings.volcengine_base_url,
            )
        elif self.provider == "mock":
            return None  # type: ignore[return-value]
        else:
            raise ValueError(f"Unknown LLM provider: {self.provider}")

        return self._client

    def _get_model(self) -> str:
        if self.provider == "aliyun":
            return settings.aliyun_model
        elif self.provider == "volcengine":
            return settings.volcengine_model
        return "mock-model"

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        task_type: str = "default",
        response_format: dict[str, str] | None = None,
    ) -> str:
        """Send a chat completion request and return the assistant message content."""
        if self.provider == "mock":
            logger.info(f"[MockLLM] task_type={task_type}, messages={len(messages)}")
            return MOCK_RESPONSES.get(task_type, MOCK_RESPONSES["default"])

        client = self._get_client()
        kwargs: dict[str, Any] = {
            "model": self._get_model(),
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format:
            kwargs["response_format"] = response_format

        try:
            response = await client.chat.completions.create(**kwargs)
            content = response.choices[0].message.content or ""
            logger.info(f"[LLM:{self.provider}] task={task_type} tokens={response.usage}")
            return content
        except Exception as e:
            logger.error(f"[LLM:{self.provider}] Error: {e}")
            raise

    async def chat_json(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.3,
        task_type: str = "default",
    ) -> dict:
        """Send a chat request expecting JSON output, parse and return as dict."""
        content = await self.chat(
            messages,
            temperature=temperature,
            task_type=task_type,
        )
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            start = content.find("{")
            end = content.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(content[start:end])
            raise ValueError(f"Could not parse JSON from LLM response: {content[:200]}")


def get_llm_client(provider: str | None = None) -> LLMClient:
    return LLMClient(provider=provider)
