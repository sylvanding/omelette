"""Unified LLM configuration resolver.

All modules should obtain LLM instances through this resolver to ensure
consistent provider/model/temperature resolution.  Priority order:

    explicit parameter  >  user DB settings  >  env / config.py defaults
"""

from __future__ import annotations

import logging

from app.config import settings
from app.schemas.llm import LLMConfig

logger = logging.getLogger(__name__)

_PROVIDER_KEY_MAP_FIELDS: dict[str, tuple[str, str, str]] = {
    "openai": ("openai_api_key", "", "openai_model"),
    "anthropic": ("anthropic_api_key", "", "anthropic_model"),
    "aliyun": ("aliyun_api_key", "aliyun_base_url", "aliyun_model"),
    "volcengine": ("volcengine_api_key", "volcengine_base_url", "volcengine_model"),
    "ollama": ("", "ollama_base_url", "ollama_model"),
    "mock": ("", "", ""),
}


class LLMConfigResolver:
    """Centralised config builder so every module resolves LLM the same way."""

    @staticmethod
    def from_env(
        *,
        provider: str | None = None,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMConfig:
        """Build an ``LLMConfig`` from env / ``config.py`` defaults.

        Callers may override individual fields; anything left ``None`` falls
        back to the values declared in ``Settings``.
        """
        prov = provider or settings.llm_provider

        field_keys = _PROVIDER_KEY_MAP_FIELDS.get(prov, ("", "", ""))
        api_key_attr, base_url_attr, model_attr = field_keys

        api_key = getattr(settings, api_key_attr, "") if api_key_attr else ""
        base_url = getattr(settings, base_url_attr, "") if base_url_attr else ""
        default_model = getattr(settings, model_attr, "") if model_attr else "mock-model"

        return LLMConfig(
            provider=prov,
            api_key=api_key,
            base_url=base_url,
            model=model or default_model,
            temperature=temperature if temperature is not None else settings.llm_temperature,
            max_tokens=max_tokens if max_tokens is not None else settings.llm_max_tokens,
        )

    @staticmethod
    def from_merged(
        merged_settings,
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMConfig:
        """Build an ``LLMConfig`` from a ``MergedSettings`` object (user DB + env).

        Used by endpoints that honour per-user overrides (chat, rewrite, etc.).
        """
        provider = merged_settings.llm_provider

        key_map: dict[str, tuple[str, str, str]] = {
            "openai": (merged_settings.openai_api_key, "", merged_settings.openai_model or "gpt-4o-mini"),
            "anthropic": (
                merged_settings.anthropic_api_key,
                "",
                merged_settings.anthropic_model or "claude-sonnet-4-20250514",
            ),
            "aliyun": (merged_settings.aliyun_api_key, merged_settings.aliyun_base_url, merged_settings.aliyun_model),
            "volcengine": (
                merged_settings.volcengine_api_key,
                merged_settings.volcengine_base_url,
                merged_settings.volcengine_model,
            ),
            "ollama": ("", merged_settings.ollama_base_url, merged_settings.ollama_model),
            "mock": ("", "", "mock-model"),
        }
        api_key, base_url, model = key_map.get(provider, ("", "", ""))

        if merged_settings.llm_model:
            model = merged_settings.llm_model

        return LLMConfig(
            provider=provider,
            api_key=api_key,
            base_url=base_url,
            model=model,
            temperature=temperature if temperature is not None else settings.llm_temperature,
            max_tokens=max_tokens if max_tokens is not None else settings.llm_max_tokens,
        )
