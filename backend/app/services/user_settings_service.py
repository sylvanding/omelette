"""Service layer for user settings — CRUD, merge with env, API-key masking."""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings as env_settings
from app.models.user_settings import UserSettings
from app.schemas.llm import (
    LLMConfig,
    ProviderModelInfo,
    SettingsSchema,
    SettingsUpdateSchema,
)

logger = logging.getLogger(__name__)

SENSITIVE_KEYS = frozenset(
    {
        "openai_api_key",
        "anthropic_api_key",
        "aliyun_api_key",
        "volcengine_api_key",
        "semantic_scholar_api_key",
    }
)

AVAILABLE_PROVIDERS: list[ProviderModelInfo] = [
    ProviderModelInfo(
        provider="openai",
        display_name="OpenAI",
        models=["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "o3-mini"],
        requires_api_key=True,
    ),
    ProviderModelInfo(
        provider="anthropic",
        display_name="Anthropic",
        models=[
            "claude-sonnet-4-20250514",
            "claude-3-5-haiku-20241022",
            "claude-3-5-sonnet-20241022",
        ],
        requires_api_key=True,
    ),
    ProviderModelInfo(
        provider="aliyun",
        display_name="阿里云百炼",
        models=["qwen3.5-plus", "qwen-plus", "qwen-turbo", "qwen-max"],
        requires_api_key=True,
        requires_base_url=True,
        default_base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    ),
    ProviderModelInfo(
        provider="volcengine",
        display_name="火山引擎",
        models=[
            "doubao-seed-1-6-flash-250828",
            "doubao-seed-2-0-mini-260215",
            "doubao-1.5-pro-32k-250115",
        ],
        requires_api_key=True,
        requires_base_url=True,
        default_base_url="https://ark.cn-beijing.volces.com/api/v3",
    ),
    ProviderModelInfo(
        provider="ollama",
        display_name="Ollama (本地)",
        models=["llama3", "llama3.1", "mistral", "qwen2", "deepseek-r1"],
        requires_api_key=False,
        requires_base_url=True,
        default_base_url="http://localhost:11434",
    ),
    ProviderModelInfo(
        provider="mock",
        display_name="Mock (测试)",
        models=["mock-model"],
        requires_api_key=False,
    ),
]


def mask_api_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "***"
    return key[:4] + "***" + key[-4:]


class UserSettingsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all_db(self) -> dict[str, str]:
        result = await self.db.execute(select(UserSettings))
        rows = result.scalars().all()
        return {row.key: row.value for row in rows}

    async def get_db_value(self, key: str) -> str | None:
        result = await self.db.execute(select(UserSettings).where(UserSettings.key == key))
        row = result.scalar_one_or_none()
        return row.value if row else None

    async def set_db_value(self, key: str, value: str, category: str = "llm") -> None:
        result = await self.db.execute(select(UserSettings).where(UserSettings.key == key))
        row = result.scalar_one_or_none()
        if row:
            row.value = value
        else:
            self.db.add(UserSettings(key=key, value=value, category=category))
        await self.db.flush()

    async def update(self, payload: SettingsUpdateSchema) -> None:
        """Write all non-None fields from the payload into the DB."""
        for field_name, value in payload.model_dump(exclude_none=True).items():
            await self.set_db_value(field_name, str(value), category="llm")
        await self.db.commit()

    async def get_merged_settings(self, *, mask_sensitive: bool = True) -> SettingsSchema:
        """Merge .env defaults with DB overrides; optionally mask secrets."""
        db_vals = await self.get_all_db()

        def _resolve(key: str, env_val: str | float | int) -> str:
            db_v = db_vals.get(key, "")
            return db_v if db_v else str(env_val)

        schema = SettingsSchema(
            llm_provider=_resolve("llm_provider", env_settings.llm_provider),
            llm_model=_resolve("llm_model", ""),
            llm_temperature=float(_resolve("llm_temperature", env_settings.llm_temperature)),
            llm_max_tokens=int(_resolve("llm_max_tokens", env_settings.llm_max_tokens)),
            openai_api_key=_resolve("openai_api_key", env_settings.openai_api_key),
            openai_model=_resolve("openai_model", env_settings.openai_model),
            anthropic_api_key=_resolve("anthropic_api_key", env_settings.anthropic_api_key),
            anthropic_model=_resolve("anthropic_model", env_settings.anthropic_model),
            aliyun_api_key=_resolve("aliyun_api_key", env_settings.aliyun_api_key),
            aliyun_base_url=_resolve("aliyun_base_url", env_settings.aliyun_base_url),
            aliyun_model=_resolve("aliyun_model", env_settings.aliyun_model),
            volcengine_api_key=_resolve("volcengine_api_key", env_settings.volcengine_api_key),
            volcengine_base_url=_resolve("volcengine_base_url", env_settings.volcengine_base_url),
            volcengine_model=_resolve("volcengine_model", env_settings.volcengine_model),
            ollama_base_url=_resolve("ollama_base_url", env_settings.ollama_base_url),
            ollama_model=_resolve("ollama_model", env_settings.ollama_model),
            embedding_model=env_settings.embedding_model,
            reranker_model=env_settings.reranker_model,
            data_dir=env_settings.data_dir,
            cuda_visible_devices=env_settings.cuda_visible_devices,
            semantic_scholar_api_key=_resolve("semantic_scholar_api_key", env_settings.semantic_scholar_api_key),
            unpaywall_email=env_settings.unpaywall_email,
        )

        if mask_sensitive:
            for key in SENSITIVE_KEYS:
                raw = getattr(schema, key)
                if raw:
                    object.__setattr__(schema, key, mask_api_key(raw))

        return schema

    async def get_merged_llm_config(self) -> LLMConfig:
        """Build an LLMConfig from merged settings for the active provider."""
        merged = await self.get_merged_settings(mask_sensitive=False)
        provider = merged.llm_provider

        key_map: dict[str, tuple[str, str, str]] = {
            "openai": (merged.openai_api_key, "", merged.openai_model or "gpt-4o-mini"),
            "anthropic": (
                merged.anthropic_api_key,
                "",
                merged.anthropic_model or "claude-sonnet-4-20250514",
            ),
            "aliyun": (merged.aliyun_api_key, merged.aliyun_base_url, merged.aliyun_model),
            "volcengine": (
                merged.volcengine_api_key,
                merged.volcengine_base_url,
                merged.volcengine_model,
            ),
            "ollama": ("", merged.ollama_base_url, merged.ollama_model),
            "mock": ("", "", "mock-model"),
        }
        api_key, base_url, model = key_map.get(provider, ("", "", ""))

        if merged.llm_model:
            model = merged.llm_model

        return LLMConfig(
            provider=provider,
            api_key=api_key,
            base_url=base_url,
            model=model,
            temperature=merged.llm_temperature,
            max_tokens=merged.llm_max_tokens,
        )


def get_available_models() -> list[ProviderModelInfo]:
    return AVAILABLE_PROVIDERS
