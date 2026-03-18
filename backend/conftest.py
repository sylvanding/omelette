"""Shared pytest fixtures and configuration."""

import os
import tempfile

import pytest

_test_data_dir = tempfile.mkdtemp(prefix="omelette_test_")
_test_db_path = os.path.join(_test_data_dir, "test_omelette.db")

os.environ.setdefault("APP_ENV", "testing")
os.environ.setdefault("LLM_PROVIDER", "mock")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_test_db_path}")
os.environ.setdefault("DATA_DIR", _test_data_dir)

REAL_LLM_AVAILABLE = os.environ.get("LLM_PROVIDER", "mock") != "mock"

real_llm = pytest.mark.skipif(
    not REAL_LLM_AVAILABLE,
    reason="Real LLM not configured (set LLM_PROVIDER=volcengine)",
)


# ---------------------------------------------------------------------------
# Shared fixtures (for tests that need DB + HTTP client)
# Tests with local fixtures of the same name will use their own (no override).
# ---------------------------------------------------------------------------


@pytest.fixture
async def setup_db():
    """Create tables before each test, drop after. Request explicitly or use local override."""
    from app.database import Base, engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client():
    """Async HTTP client for in-process testing."""
    from httpx import ASGITransport, AsyncClient

    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def project_id(client):
    """Create a project and return its ID. Depends on client."""
    resp = await client.post("/api/v1/projects", json={"name": "Test Project", "domain": "optics"})
    assert resp.status_code == 201
    return resp.json()["data"]["id"]
