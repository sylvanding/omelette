"""Application configuration using Pydantic Settings."""

import os
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application
    app_env: Literal["development", "production", "testing"] = "development"
    app_debug: bool = True
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    app_secret_key: str = "change-me-to-a-random-secret-key"

    # Database
    database_url: str = Field(default="sqlite:///./data/omelette.db")

    # API Authentication (empty = no auth, suitable for local dev)
    api_secret_key: str = ""

    # Data Storage
    data_dir: str = "./data"
    pdf_dir: str = ""
    ocr_output_dir: str = ""
    chroma_db_dir: str = ""

    # LLM: Default Provider
    llm_provider: str = "mock"
    llm_temperature: float = 0.7
    llm_max_tokens: int = 4096

    # LLM: OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    # LLM: Anthropic
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"

    # LLM: Aliyun Bailian
    aliyun_api_key: str = ""
    aliyun_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    aliyun_model: str = "qwen3.5-plus"

    # LLM: Volcengine
    volcengine_api_key: str = ""
    volcengine_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    volcengine_model: str = "doubao-seed-1-6-flash-250828"

    # LLM: Ollama (local)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"

    # Embedding
    embedding_provider: str = "local"  # local | api | mock
    embedding_model: str = "BAAI/bge-m3"
    embedding_api_key: str = ""
    reranker_model: str = "BAAI/bge-reranker-v2-m3"

    # GPU
    cuda_visible_devices: str = "0,3"

    # Network Proxy
    http_proxy: str = ""
    https_proxy: str = ""

    # HuggingFace Mirror (for users in China, e.g. https://hf-mirror.com)
    hf_endpoint: str = ""

    # External APIs
    semantic_scholar_api_key: str = ""
    unpaywall_email: str = ""

    # Frontend
    frontend_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000,http://0.0.0.0:3000"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if not self.pdf_dir:
            self.pdf_dir = f"{self.data_dir}/pdfs"
        if not self.ocr_output_dir:
            self.ocr_output_dir = f"{self.data_dir}/ocr_output"
        if not self.chroma_db_dir:
            self.chroma_db_dir = f"{self.data_dir}/chroma_db"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()

# Propagate CUDA_VISIBLE_DEVICES to os.environ so PyTorch (which reads it
# at import time, before our code runs) respects the user's .env config.
if settings.cuda_visible_devices and "CUDA_VISIBLE_DEVICES" not in os.environ:
    os.environ["CUDA_VISIBLE_DEVICES"] = settings.cuda_visible_devices
