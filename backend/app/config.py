"""Application configuration using Pydantic Settings."""

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

    # Data Storage
    data_dir: str = "/data0/djx/omelette"
    pdf_dir: str = ""
    ocr_output_dir: str = ""
    chroma_db_dir: str = ""

    # LLM: Aliyun Bailian
    aliyun_api_key: str = ""
    aliyun_base_url: str = "https://coding.dashscope.aliyuncs.com/v1"
    aliyun_model: str = "qwen3.5-plus"

    # LLM: Volcengine
    volcengine_api_key: str = ""
    volcengine_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    volcengine_model: str = "doubao-seed-1-6-flash-250828"

    # Default LLM Provider
    llm_provider: Literal["aliyun", "volcengine", "mock"] = "mock"

    # Embedding
    embedding_model: str = "BAAI/bge-m3"
    reranker_model: str = "BAAI/bge-reranker-v2-m3"

    # GPU
    cuda_visible_devices: str = "0,3"

    # Network Proxy
    http_proxy: str = ""
    https_proxy: str = ""

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
