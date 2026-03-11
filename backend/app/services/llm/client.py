"""LLMClient — backward-compatible wrapper around LangChain ChatModel.

All existing callers (rag_service, writing_service, keyword_service, dedup_service)
use ``chat()`` and ``chat_json()`` methods.  This module preserves those signatures
while delegating to the provider factory.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, SystemMessage

from app.config import settings
from app.schemas.llm import LLMConfig
from app.services.llm.factory import get_chat_model

logger = logging.getLogger(__name__)


def _resolve_config(provider: str | None = None) -> LLMConfig:
    """Build an LLMConfig from env settings for the given (or default) provider."""
    prov = provider or settings.llm_provider

    key_map: dict[str, tuple[str, str, str]] = {
        "openai": (
            getattr(settings, "openai_api_key", ""),
            "",
            getattr(settings, "openai_model", "gpt-4o-mini"),
        ),
        "anthropic": (
            getattr(settings, "anthropic_api_key", ""),
            "",
            getattr(settings, "anthropic_model", "claude-sonnet-4-20250514"),
        ),
        "aliyun": (settings.aliyun_api_key, settings.aliyun_base_url, settings.aliyun_model),
        "volcengine": (
            settings.volcengine_api_key,
            settings.volcengine_base_url,
            settings.volcengine_model,
        ),
        "ollama": (
            "",
            getattr(settings, "ollama_base_url", "http://localhost:11434"),
            getattr(settings, "ollama_model", "llama3"),
        ),
        "mock": ("", "", "mock-model"),
    }

    api_key, base_url, model = key_map.get(prov, ("", "", ""))

    return LLMConfig(
        provider=prov,
        api_key=api_key,
        base_url=base_url,
        model=model,
    )


def _to_langchain_messages(messages: list[dict[str, str]]) -> list:
    """Convert OpenAI-style dicts to LangChain message objects."""
    lc_msgs = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        if role == "system":
            lc_msgs.append(SystemMessage(content=content))
        elif role == "assistant":
            lc_msgs.append(AIMessage(content=content))
        else:
            lc_msgs.append(HumanMessage(content=content))
    return lc_msgs


class LLMClient:
    """Backward-compatible LLM client wrapping a LangChain ChatModel."""

    def __init__(
        self,
        provider: str | None = None,
        *,
        config: LLMConfig | None = None,
    ):
        if config is not None:
            self._config = config
        else:
            self._config = _resolve_config(provider)
        self.provider = self._config.provider
        self._model: BaseChatModel | None = None

    def _get_model(self) -> BaseChatModel:
        if self._model is None:
            self._model = get_chat_model(self._config)
        return self._model

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        task_type: str = "default",
        response_format: dict[str, str] | None = None,
    ) -> str:
        """Send a chat completion and return the assistant content string."""
        if self.provider == "mock":
            from app.services.llm.adapters.mock_adapter import MOCK_RESPONSES

            logger.info("[MockLLM] task_type=%s, messages=%d", task_type, len(messages))
            return MOCK_RESPONSES.get(task_type, MOCK_RESPONSES["default"])

        model = self._get_model()
        lc_messages = _to_langchain_messages(messages)

        kwargs: dict[str, Any] = {}
        if temperature != self._config.temperature:
            kwargs["temperature"] = temperature
        if max_tokens != self._config.max_tokens:
            kwargs["max_tokens"] = max_tokens

        try:
            result = await model.ainvoke(lc_messages, **kwargs)
            content = result.content if isinstance(result.content, str) else str(result.content)
            logger.info("[LLM:%s] task=%s len=%d", self.provider, task_type, len(content))
            return content
        except Exception:
            logger.exception("[LLM:%s] Error during chat", self.provider)
            raise

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        task_type: str = "default",
    ) -> AsyncIterator[str]:
        """Stream chat completion tokens as an async iterator of strings."""
        if self.provider == "mock":
            from app.services.llm.adapters.mock_adapter import MOCK_RESPONSES

            full = MOCK_RESPONSES.get(task_type, MOCK_RESPONSES["default"])
            for word in full.split(" "):
                yield word + " "
            return

        model = self._get_model()
        lc_messages = _to_langchain_messages(messages)

        kwargs: dict[str, Any] = {}
        if temperature != self._config.temperature:
            kwargs["temperature"] = temperature
        if max_tokens != self._config.max_tokens:
            kwargs["max_tokens"] = max_tokens

        try:
            async for chunk in model.astream(lc_messages, **kwargs):
                if isinstance(chunk, AIMessageChunk | AIMessage):
                    text = chunk.content if isinstance(chunk.content, str) else str(chunk.content)
                    if text:
                        yield text
        except Exception:
            logger.exception("[LLM:%s] Error during stream", self.provider)
            raise

    async def chat_json(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.3,
        task_type: str = "default",
    ) -> dict:
        """Send a chat request expecting JSON, parse and return as dict."""
        content = await self.chat(messages, temperature=temperature, task_type=task_type)
        try:
            return json.loads(content)
        except json.JSONDecodeError as e:
            start = content.find("{")
            end = content.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(content[start:end])
            raise ValueError(f"Could not parse JSON from LLM response: {content[:200]}") from e


def get_llm_client(
    provider: str | None = None,
    *,
    config: LLMConfig | None = None,
) -> LLMClient:
    """Create an LLMClient, optionally with a pre-built LLMConfig."""
    return LLMClient(provider=provider, config=config)
