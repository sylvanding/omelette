"""LLM Provider Factory — returns a LangChain BaseChatModel for any supported provider."""

from __future__ import annotations

import logging

from langchain_core.language_models.chat_models import BaseChatModel

from app.schemas.llm import LLMConfig

logger = logging.getLogger(__name__)

PROVIDER_REGISTRY: dict[str, type] = {}


def _ensure_registry() -> None:
    """Lazily populate the provider registry to avoid import-time overhead."""
    if PROVIDER_REGISTRY:
        return
    PROVIDER_REGISTRY.update(
        {
            "openai": _build_openai,
            "anthropic": _build_anthropic,
            "aliyun": _build_aliyun,
            "volcengine": _build_volcengine,
            "ollama": _build_ollama,
            "mock": _build_mock,
        }
    )


def get_chat_model(config: LLMConfig) -> BaseChatModel:
    """Resolve *config.provider* to a concrete ChatModel instance."""
    _ensure_registry()
    builder = PROVIDER_REGISTRY.get(config.provider)
    if builder is None:
        raise ValueError(f"Unknown LLM provider: {config.provider!r}. Available: {sorted(PROVIDER_REGISTRY)}")
    return builder(config)


def _build_openai(cfg: LLMConfig) -> BaseChatModel:
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        api_key=cfg.api_key,
        model=cfg.model or "gpt-4o-mini",
        temperature=cfg.temperature,
        max_tokens=cfg.max_tokens,
    )


def _build_anthropic(cfg: LLMConfig) -> BaseChatModel:
    from langchain_anthropic import ChatAnthropic

    return ChatAnthropic(
        api_key=cfg.api_key,
        model_name=cfg.model or "claude-sonnet-4-20250514",
        temperature=cfg.temperature,
        max_tokens=cfg.max_tokens,
    )


def _build_aliyun(cfg: LLMConfig) -> BaseChatModel:
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        api_key=cfg.api_key,
        base_url=cfg.base_url or "https://dashscope.aliyuncs.com/compatible-mode/v1",
        model=cfg.model or "qwen3.5-plus",
        temperature=cfg.temperature,
        max_tokens=cfg.max_tokens,
    )


def _build_volcengine(cfg: LLMConfig) -> BaseChatModel:
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        api_key=cfg.api_key,
        base_url=cfg.base_url or "https://ark.cn-beijing.volces.com/api/v3",
        model=cfg.model or "doubao-seed-1-6-flash-250828",
        temperature=cfg.temperature,
        max_tokens=cfg.max_tokens,
    )


def _build_ollama(cfg: LLMConfig) -> BaseChatModel:
    from langchain_ollama import ChatOllama

    return ChatOllama(
        base_url=cfg.base_url or "http://localhost:11434",
        model=cfg.model or "llama3",
        temperature=cfg.temperature,
        num_predict=cfg.max_tokens,
    )


def _build_mock(cfg: LLMConfig) -> BaseChatModel:
    from app.services.llm.adapters.mock_adapter import MockChatModel

    return MockChatModel()
