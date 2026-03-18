"""Schemas for LLM configuration and provider metadata."""

from pydantic import BaseModel, Field


class LLMConfig(BaseModel):
    """Resolved LLM configuration (merged from env + DB)."""

    provider: str = "mock"
    api_key: str = ""
    base_url: str = ""
    model: str = ""
    temperature: float = 0.7
    max_tokens: int = 4096


class ProviderModelInfo(BaseModel):
    """Available models for a single provider."""

    provider: str
    display_name: str
    models: list[str]
    requires_api_key: bool = True
    requires_base_url: bool = False
    default_base_url: str = ""


class SettingsSchema(BaseModel):
    """Settings returned to frontend (API keys masked)."""

    llm_provider: str = "mock"
    llm_model: str = ""
    llm_temperature: float = 0.7
    llm_max_tokens: int = 4096

    openai_api_key: str = ""
    openai_model: str = ""

    anthropic_api_key: str = ""
    anthropic_model: str = ""

    aliyun_api_key: str = ""
    aliyun_base_url: str = ""
    aliyun_model: str = ""

    volcengine_api_key: str = ""
    volcengine_base_url: str = ""
    volcengine_model: str = ""

    ollama_base_url: str = ""
    ollama_model: str = ""

    embedding_model: str = ""
    reranker_model: str = ""
    data_dir: str = ""
    cuda_visible_devices: str = ""
    semantic_scholar_api_key: str = ""
    unpaywall_email: str = ""


class SettingsUpdateSchema(BaseModel):
    """Payload for PUT /settings — only non-None fields are updated."""

    llm_provider: str | None = None
    llm_model: str | None = None
    llm_temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    llm_max_tokens: int | None = Field(default=None, ge=1, le=128000)

    openai_api_key: str | None = Field(default=None, max_length=500)
    openai_model: str | None = Field(default=None, max_length=200)

    anthropic_api_key: str | None = Field(default=None, max_length=500)
    anthropic_model: str | None = Field(default=None, max_length=200)

    aliyun_api_key: str | None = Field(default=None, max_length=500)
    aliyun_base_url: str | None = Field(default=None, max_length=500)
    aliyun_model: str | None = Field(default=None, max_length=200)

    volcengine_api_key: str | None = Field(default=None, max_length=500)
    volcengine_base_url: str | None = Field(default=None, max_length=500)
    volcengine_model: str | None = Field(default=None, max_length=200)

    ollama_base_url: str | None = Field(default=None, max_length=500)
    ollama_model: str | None = Field(default=None, max_length=200)
