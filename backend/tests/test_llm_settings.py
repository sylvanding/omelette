"""Tests for multi-provider LLM and Settings API."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Base, engine
from app.main import app
from app.schemas.llm import LLMConfig
from app.services.llm.adapters.mock_adapter import MockChatModel
from app.services.llm.client import LLMClient, get_llm_client
from app.services.llm.factory import get_chat_model


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


# --- Factory tests ---


def test_factory_mock():
    cfg = LLMConfig(provider="mock")
    model = get_chat_model(cfg)
    assert isinstance(model, MockChatModel)


def test_factory_unknown_provider():
    cfg = LLMConfig(provider="nonexistent")
    with pytest.raises(ValueError, match="Unknown LLM provider"):
        get_chat_model(cfg)


def test_factory_openai():
    cfg = LLMConfig(provider="openai", api_key="sk-test", model="gpt-4o-mini")
    model = get_chat_model(cfg)
    assert model is not None


def test_factory_anthropic():
    cfg = LLMConfig(provider="anthropic", api_key="sk-ant-test", model="claude-sonnet-4-20250514")
    model = get_chat_model(cfg)
    assert model is not None


def test_factory_ollama():
    cfg = LLMConfig(provider="ollama", base_url="http://localhost:11434", model="llama3")
    model = get_chat_model(cfg)
    assert model is not None


def test_factory_aliyun():
    cfg = LLMConfig(provider="aliyun", api_key="test", model="qwen-plus")
    model = get_chat_model(cfg)
    assert model is not None


def test_factory_volcengine():
    cfg = LLMConfig(provider="volcengine", api_key="test", model="doubao-seed-1-6-flash-250828")
    model = get_chat_model(cfg)
    assert model is not None


# --- LLMClient backward-compat tests ---


@pytest.mark.asyncio
async def test_client_mock_chat():
    client = LLMClient(provider="mock")
    result = await client.chat(
        [{"role": "user", "content": "test"}],
        task_type="default",
    )
    assert "mock LLM response" in result


@pytest.mark.asyncio
async def test_client_mock_chat_json():
    client = LLMClient(provider="mock")
    result = await client.chat_json(
        [{"role": "user", "content": "test"}],
        task_type="keyword_expand",
    )
    assert "expanded_terms" in result


@pytest.mark.asyncio
async def test_client_from_config():
    cfg = LLMConfig(provider="mock")
    client = get_llm_client(config=cfg)
    result = await client.chat([{"role": "user", "content": "hi"}])
    assert isinstance(result, str)


# --- Verify direct import path works ---


@pytest.mark.asyncio
async def test_direct_import_path():
    from app.services.llm.client import LLMClient as DirectLLMClient
    from app.services.llm.client import get_llm_client as direct_get

    assert DirectLLMClient is LLMClient
    assert direct_get is get_llm_client


# --- Settings API tests ---


@pytest.mark.asyncio
async def test_get_settings(client: AsyncClient):
    resp = await client.get("/api/v1/settings")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["llm_provider"] == "mock"
    for key in ["openai_api_key", "anthropic_api_key", "aliyun_api_key", "volcengine_api_key"]:
        val = data[key]
        assert "***" in val or val == ""


@pytest.mark.asyncio
async def test_put_settings(client: AsyncClient):
    resp = await client.put(
        "/api/v1/settings",
        json={"llm_provider": "openai", "llm_temperature": 0.5},
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["llm_provider"] == "openai"
    assert data["llm_temperature"] == 0.5

    resp2 = await client.get("/api/v1/settings")
    data2 = resp2.json()["data"]
    assert data2["llm_provider"] == "openai"
    assert data2["llm_temperature"] == 0.5


@pytest.mark.asyncio
async def test_list_models(client: AsyncClient):
    resp = await client.get("/api/v1/settings/models")
    assert resp.status_code == 200
    data = resp.json()["data"]
    providers = [p["provider"] for p in data]
    assert "openai" in providers
    assert "anthropic" in providers
    assert "mock" in providers


@pytest.mark.asyncio
async def test_test_connection_mock(client: AsyncClient):
    resp = await client.post("/api/v1/settings/test-connection")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["success"] is True


@pytest.mark.asyncio
async def test_settings_health(client: AsyncClient):
    resp = await client.get("/api/v1/settings/health")
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "healthy"
