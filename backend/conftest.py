"""Shared pytest fixtures and configuration."""

import os

os.environ.setdefault("APP_ENV", "testing")
os.environ.setdefault("LLM_PROVIDER", "mock")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_omelette.db")
