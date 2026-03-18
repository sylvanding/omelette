"""Application configuration using Pydantic Settings."""

import os
from enum import StrEnum
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class GpuMode(StrEnum):
    CONSERVATIVE = "conservative"
    BALANCED = "balanced"
    AGGRESSIVE = "aggressive"


GPU_MODE_PRESETS: dict[GpuMode, dict[str, int]] = {
    GpuMode.CONSERVATIVE: {
        "ocr_parallel_limit": 1,
        "embed_batch_size": 1,
        "rerank_batch_size": 1,
        "reranker_concurrency_limit": 1,
    },
    GpuMode.BALANCED: {
        "ocr_parallel_limit": 0,
        "embed_batch_size": 8,
        "rerank_batch_size": 16,
        "reranker_concurrency_limit": 1,
    },
    GpuMode.AGGRESSIVE: {
        "ocr_parallel_limit": 0,
        "embed_batch_size": 32,
        "rerank_batch_size": 50,
        "reranker_concurrency_limit": 2,
    },
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application
    app_env: Literal["development", "production", "testing"] = "development"
    app_debug: bool = False
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
    embedding_model: str = "Qwen/Qwen3-Embedding-0.6B"
    embedding_api_key: str = ""
    reranker_model: str = "tomaarsen/Qwen3-Reranker-0.6B-seq-cls"

    # OCR
    ocr_lang: str = "ch"  # PaddleOCR language: ch (Chinese+English) | en (English only)

    # PDF Parsing / MinerU
    pdf_parser: str = "mineru"  # auto | mineru | pdfplumber
    mineru_api_url: str = "http://localhost:8010"
    mineru_backend: str = "pipeline"  # pipeline | hybrid-auto-engine | vlm-auto-engine
    mineru_timeout: int = 8000
    mineru_auto_manage: bool = Field(default=True, description="Auto start/stop MinerU subprocess")
    mineru_conda_env: str = Field(default="mineru", description="Conda env name for MinerU")
    mineru_ttl_seconds: int = Field(default=600, ge=0, description="Stop MinerU after N seconds idle. 0=disable")
    mineru_startup_timeout: int = Field(default=120, ge=10, le=600, description="MinerU startup timeout")
    mineru_gpu_ids: str = Field(default="", description="GPU IDs for MinerU. Empty=inherit cuda_visible_devices")

    # Semantic Scholar API
    s2_api_base: str = "https://api.semanticscholar.org/graph/v1"
    s2_timeout: int = Field(default=15, ge=1, le=60)
    s2_max_per_request: int = Field(default=50, ge=1, le=100)

    # Upload
    title_similarity_threshold: float = Field(default=0.85, ge=0.0, le=1.0)

    # Rewrite
    rewrite_timeout: float = Field(default=30.0, ge=5.0, le=120.0)

    # Dedup thresholds
    dedup_title_hard_threshold: float = 0.90
    dedup_title_llm_threshold: float = 0.80

    # App
    app_version: str = "0.1.0"

    # Concurrency limits
    max_upload_size_mb: int = Field(default=50, ge=1, le=500)
    rate_limit: str = Field(default="120/minute", description="API rate limit")
    clean_semaphore_limit: int = Field(default=3, ge=1)
    rewrite_semaphore_limit: int = Field(default=3, ge=1)
    llm_parallel_limit: int = Field(default=5, ge=1, description="Max parallel LLM calls for batch operations")
    ocr_parallel_limit: int = Field(
        default=0,
        ge=0,
        le=16,
        description="Max parallel OCR tasks. 0=auto (GPU count or 1 for CPU)",
    )

    # RAG retrieval
    rag_default_top_k: int = Field(default=10, ge=1, le=100, description="Default retrieval top-k")
    rag_oversample_factor: int = Field(default=3, ge=1, le=10, description="Multiplier for oversampling before rerank")
    rag_mmr_threshold: float = Field(
        default=0.5, ge=0.0, le=1.0, description="MMR diversity threshold (0=max diversity, 1=max relevance)"
    )
    reranker_concurrency_limit: int = Field(default=1, ge=1, le=4, description="Max concurrent reranker calls")

    # LangGraph
    langgraph_checkpoint_dir: str = ""
    pipeline_checkpoint_db: str = ""  # SQLite checkpoint DB path; defaults to {data_dir}/pipeline_checkpoints.db
    pid_file: str = ""  # PID file path; defaults to {data_dir}/omelette.pid

    # GPU
    cuda_visible_devices: str = ""  # Empty = use all available GPUs
    model_ttl_seconds: int = Field(
        default=300, ge=0, description="Auto-unload GPU models after N seconds idle. 0=disable"
    )
    model_ttl_check_interval: int = Field(default=30, ge=5, le=300, description="TTL check interval in seconds")
    gpu_mode: GpuMode = Field(default=GpuMode.BALANCED, description="GPU preset: conservative/balanced/aggressive")
    embed_batch_size: int = Field(default=0, ge=0, le=128, description="Embedding batch size. 0=follow GPU_MODE")
    rerank_batch_size: int = Field(default=0, ge=0, le=128, description="Reranker internal top_n. 0=follow GPU_MODE")
    embed_gpu_id: int = Field(default=-1, ge=-1, le=15, description="Pin embedding to GPU N. -1=auto select")
    rerank_gpu_id: int = Field(default=-1, ge=-1, le=15, description="Pin reranker to GPU N. -1=auto select")
    ocr_gpu_ids: str = Field(default="", description="Comma-separated GPU IDs for OCR. Empty=all")

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

    @model_validator(mode="after")
    def _apply_gpu_mode_defaults(self) -> "Settings":
        """Fill zero-valued GPU params from the active GPU_MODE preset."""
        preset = GPU_MODE_PRESETS.get(self.gpu_mode, GPU_MODE_PRESETS[GpuMode.BALANCED])
        if self.embed_batch_size == 0:
            self.embed_batch_size = preset["embed_batch_size"]
        if self.rerank_batch_size == 0:
            self.rerank_batch_size = preset["rerank_batch_size"]
        if self.ocr_parallel_limit == 0:
            self.ocr_parallel_limit = preset["ocr_parallel_limit"]
        if self.reranker_concurrency_limit == 1 and preset["reranker_concurrency_limit"] != 1:
            self.reranker_concurrency_limit = preset["reranker_concurrency_limit"]
        return self

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if not self.pdf_dir:
            self.pdf_dir = f"{self.data_dir}/pdfs"
        if not self.ocr_output_dir:
            self.ocr_output_dir = f"{self.data_dir}/ocr_output"
        if not self.chroma_db_dir:
            self.chroma_db_dir = f"{self.data_dir}/chroma_db"
        if not self.langgraph_checkpoint_dir:
            self.langgraph_checkpoint_dir = f"{self.data_dir}/langgraph_checkpoints"
        if not self.pipeline_checkpoint_db:
            self.pipeline_checkpoint_db = f"{self.data_dir}/pipeline_checkpoints.db"
        if not self.pid_file:
            self.pid_file = f"{self.data_dir}/omelette.pid"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()

# Propagate CUDA_VISIBLE_DEVICES to os.environ so PyTorch (which reads it
# at import time, before our code runs) respects the user's .env config.
if settings.cuda_visible_devices and "CUDA_VISIBLE_DEVICES" not in os.environ:
    os.environ["CUDA_VISIBLE_DEVICES"] = settings.cuda_visible_devices
