"""Shared pytest fixtures and configuration."""

import os
import tempfile

_test_data_dir = tempfile.mkdtemp(prefix="omelette_test_")

os.environ.setdefault("APP_ENV", "testing")
os.environ.setdefault("LLM_PROVIDER", "mock")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_omelette.db")
os.environ.setdefault("DATA_DIR", _test_data_dir)
