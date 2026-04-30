"""Tests for API key CRUD and authentication."""

import hashlib

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Base, engine
from app.main import app
from app.models.api_key import APIKeyScope
from app.services.api_key_service import APIKeyService, generate_api_key

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
async def setup_db():
    """Create tables before each test, drop after."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client():
    """Async HTTP client for in-process testing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def db_session():
    """Provide a clean database session."""
    from app.database import async_session_factory

    async with async_session_factory() as session:
        yield session


@pytest.fixture
async def api_key_service(db_session):
    return APIKeyService(db_session)


# ---------------------------------------------------------------------------
# API Key CRUD Tests
# ---------------------------------------------------------------------------


class TestAPIKeyCRUD:
    """Integration tests for the API key endpoints."""

    @pytest.mark.asyncio
    async def test_list_keys_empty(self, client: AsyncClient):
        """Verify listing keys returns empty list initially."""
        resp = await client.get("/api/v1/api-keys")
        assert resp.status_code == 200
        assert resp.json()["data"] == []

    @pytest.mark.asyncio
    async def test_create_key_default_scope(self, client: AsyncClient):
        """Verify creating a key defaults to read scope."""
        resp = await client.post("/api/v1/api-keys", json={"name": "test-key"})
        assert resp.status_code == 201
        data = resp.json()["data"]
        assert data["name"] == "test-key"
        assert data["scope"] == "read"
        assert data["key"].startswith("omk_")
        assert data["id"] is not None

    @pytest.mark.asyncio
    async def test_create_key_with_scope(self, client: AsyncClient):
        """Verify creating a key with explicit scope."""
        resp = await client.post("/api/v1/api-keys", json={"name": "admin-key", "scope": "admin"})
        assert resp.status_code == 201
        assert resp.json()["data"]["scope"] == "admin"

    @pytest.mark.asyncio
    async def test_create_key_invalid_scope(self, client: AsyncClient):
        """Verify creating a key with invalid scope is rejected."""
        resp = await client.post("/api/v1/api-keys", json={"name": "bad", "scope": "superadmin"})
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_list_keys_after_create(self, client: AsyncClient):
        """Verify listing keys shows created keys."""
        await client.post("/api/v1/api-keys", json={"name": "key-1"})
        await client.post("/api/v1/api-keys", json={"name": "key-2"})
        resp = await client.get("/api/v1/api-keys")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data) == 2
        assert {k["name"] for k in data} == {"key-1", "key-2"}

    @pytest.mark.asyncio
    async def test_revoke_key(self, client: AsyncClient):
        """Verify revoking a key marks it inactive."""
        create_resp = await client.post("/api/v1/api-keys", json={"name": "revoke-me"})
        key_id = create_resp.json()["data"]["id"]

        resp = await client.post(f"/api/v1/api-keys/{key_id}/revoke")
        assert resp.status_code == 200
        assert resp.json()["data"]["is_active"] is False

    @pytest.mark.asyncio
    async def test_revoke_already_revoked(self, client: AsyncClient):
        """Verify revoking an already-revoked key returns error."""
        create_resp = await client.post("/api/v1/api-keys", json={"name": "double-revoke"})
        key_id = create_resp.json()["data"]["id"]

        await client.post(f"/api/v1/api-keys/{key_id}/revoke")
        resp = await client.post(f"/api/v1/api-keys/{key_id}/revoke")
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_delete_key(self, client: AsyncClient):
        """Verify deleting a key removes it permanently."""
        create_resp = await client.post("/api/v1/api-keys", json={"name": "delete-me"})
        key_id = create_resp.json()["data"]["id"]

        resp = await client.delete(f"/api/v1/api-keys/{key_id}")
        assert resp.status_code == 200

        list_resp = await client.get("/api/v1/api-keys")
        assert len(list_resp.json()["data"]) == 0

    @pytest.mark.asyncio
    async def test_key_hash_not_exposed(self, client: AsyncClient):
        """Verify the key hash is never returned in responses."""
        resp = await client.post("/api/v1/api-keys", json={"name": "security-check"})
        data = resp.json()["data"]
        assert "key_hash" not in data
        assert "key_prefix" in data
        # The raw key is only returned at creation time
        assert data["key"].startswith("omk_")


# ---------------------------------------------------------------------------
# API Key Authentication Tests
# ---------------------------------------------------------------------------


class TestAPIKeyAuth:
    """Tests for API key authentication via the dependency."""

    @pytest.mark.asyncio
    async def test_validate_key(self, api_key_service: APIKeyService):
        """Verify a generated key validates successfully."""
        _, raw_key = await api_key_service.create_key("auth-test", "read")

        validated = await api_key_service.validate_key(raw_key)
        assert validated is not None
        assert validated.name == "auth-test"
        assert validated.is_active is True

    @pytest.mark.asyncio
    async def test_revoked_key_rejected(self, api_key_service: APIKeyService):
        """Verify a revoked key fails validation."""
        api_key, raw_key = await api_key_service.create_key("revoke-auth", "read")
        await api_key_service.revoke_key(api_key.id)

        validated = await api_key_service.validate_key(raw_key)
        assert validated is None

    @pytest.mark.asyncio
    async def test_invalid_key_rejected(self, api_key_service: APIKeyService):
        """Verify a random string fails validation."""
        validated = await api_key_service.validate_key("omk_invalidkey123")
        assert validated is None


# ---------------------------------------------------------------------------
# API Key Service Unit Tests
# ---------------------------------------------------------------------------


class TestAPIKeyServiceUnit:
    """Unit tests for the APIKeyService class."""

    @pytest.mark.asyncio
    async def test_generate_key_format(self):
        """Verify generated key has correct prefix and length."""
        raw_key, key_hash, key_prefix = generate_api_key()
        assert raw_key.startswith("omk_")
        assert len(raw_key) == len("omk_") + 32
        assert len(key_hash) == 64  # SHA-256 hex
        assert key_prefix == raw_key[:12]

    @pytest.mark.asyncio
    async def test_generate_key_uniqueness(self):
        """Verify each generated key is unique."""
        keys = {generate_api_key()[0] for _ in range(100)}
        assert len(keys) == 100

    @pytest.mark.asyncio
    async def test_key_hash_matches_raw(self):
        """Verify the stored hash matches the raw key."""
        raw_key, key_hash, _ = generate_api_key()
        expected_hash = hashlib.sha256(raw_key.encode()).hexdigest()
        assert key_hash == expected_hash

    @pytest.mark.asyncio
    async def test_scopes_constant(self):
        """Verify API key scopes are defined correctly."""
        from app.models.api_key import API_KEY_SCOPES

        assert "read" in API_KEY_SCOPES
        assert "write" in API_KEY_SCOPES
        assert "admin" in API_KEY_SCOPES

    @pytest.mark.asyncio
    async def test_scope_class(self):
        """Verify APIKeyScope class constants."""
        assert APIKeyScope.READ == "read"
        assert APIKeyScope.WRITE == "write"
        assert APIKeyScope.ADMIN == "admin"
