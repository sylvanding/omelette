"""Shared pytest fixtures and configuration."""

import os
import tempfile

_test_data_dir = tempfile.mkdtemp(prefix="omelette_test_")
_test_db_path = os.path.join(_test_data_dir, "test_omelette.db")

os.environ.setdefault("APP_ENV", "testing")
os.environ.setdefault("LLM_PROVIDER", "mock")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_test_db_path}")
os.environ.setdefault("DATA_DIR", _test_data_dir)
