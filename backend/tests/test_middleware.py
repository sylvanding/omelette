"""Tests for auth middleware and health check."""

from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.database import Base, engine
from app.main import app


@pytest.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_no_api_key_config_passes_all(client):
    with patch.object(settings, "api_secret_key", ""):
        resp = await client.get("/api/v1/projects")
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_missing_api_key_returns_401(client):
    with patch.object(settings, "api_secret_key", "test-key-123"):
        resp = await client.get("/api/v1/projects")
        assert resp.status_code == 401
        assert resp.json()["code"] == 401
        assert "API key" in resp.json()["message"]


@pytest.mark.asyncio
async def test_valid_header_api_key_passes(client):
    with patch.object(settings, "api_secret_key", "test-key-123"):
        resp = await client.get("/api/v1/projects", headers={"X-API-Key": "test-key-123"})
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_invalid_api_key_returns_401(client):
    with patch.object(settings, "api_secret_key", "test-key-123"):
        resp = await client.get("/api/v1/projects", headers={"X-API-Key": "wrong-key"})
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_exempt_paths_no_auth(client):
    with patch.object(settings, "api_secret_key", "test-key-123"):
        for path in ["/health", "/docs", "/"]:
            resp = await client.get(path)
            assert resp.status_code == 200, f"Failed for path {path}"


@pytest.mark.asyncio
async def test_options_no_auth(client):
    with patch.object(settings, "api_secret_key", "test-key-123"):
        resp = await client.options(
            "/api/v1/projects",
            headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
        )
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_query_param_api_key_rejected(client):
    with patch.object(settings, "api_secret_key", "test-key-123"):
        resp = await client.get("/api/v1/projects?api_key=test-key-123")
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_health_endpoint_returns_ok(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"] == 200
    assert data["data"]["status"] == "ok"


@pytest.mark.asyncio
async def test_error_format_consistent(client):
    resp = await client.get("/api/v1/projects/99999")
    assert resp.status_code == 404
    data = resp.json()
    assert data["code"] == 404
    assert "message" in data
    assert data["data"] is None


@pytest.mark.asyncio
async def test_validation_error_format(client):
    resp = await client.post("/api/v1/projects", json={})
    assert resp.status_code == 422
    data = resp.json()
    assert data["code"] == 422
    assert data["message"] == "Validation error"
    assert isinstance(data["data"], list)
