"""Tests for CompletionService and POST /chat/complete endpoint."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Base, engine
from app.main import app
from app.services.completion_service import CompletionService


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


class TestCompletionService:
    """Unit tests for CompletionService logic."""

    async def test_prefix_too_short_returns_empty(self):
        mock_llm = AsyncMock()
        svc = CompletionService(llm=mock_llm)

        result = await svc.complete(prefix="short")
        assert result["completion"] == ""
        assert result["confidence"] == 0.0
        mock_llm.chat.assert_not_called()

    async def test_prefix_whitespace_only_returns_empty(self):
        mock_llm = AsyncMock()
        svc = CompletionService(llm=mock_llm)

        result = await svc.complete(prefix="          ")
        assert result["completion"] == ""
        assert result["confidence"] == 0.0

    async def test_normal_completion(self):
        mock_llm = AsyncMock()
        mock_llm.chat = AsyncMock(return_value="在自然语言处理领域有广泛应用")
        svc = CompletionService(llm=mock_llm)

        result = await svc.complete(prefix="深度学习技术目前已经")
        assert result["completion"] != ""
        assert result["confidence"] > 0.0
        mock_llm.chat.assert_called_once()

    async def test_completion_strips_prefix_echo(self):
        prefix = "深度学习技术目前已经"
        mock_llm = AsyncMock()
        mock_llm.chat = AsyncMock(return_value=f"{prefix}在很多领域有应用")
        svc = CompletionService(llm=mock_llm)

        result = await svc.complete(prefix=prefix)
        assert not result["completion"].startswith(prefix)

    async def test_completion_truncated_to_80_chars(self):
        mock_llm = AsyncMock()
        mock_llm.chat = AsyncMock(return_value="A" * 200)
        svc = CompletionService(llm=mock_llm)

        result = await svc.complete(prefix="深度学习技术目前已经开始广泛")
        assert len(result["completion"]) <= 80

    async def test_llm_error_returns_empty(self):
        mock_llm = AsyncMock()
        mock_llm.chat = AsyncMock(side_effect=Exception("LLM timeout"))
        svc = CompletionService(llm=mock_llm)

        result = await svc.complete(prefix="深度学习技术目前已经开始广泛应用")
        assert result["completion"] == ""
        assert result["confidence"] == 0.0

    async def test_recent_messages_included(self):
        mock_llm = AsyncMock()
        mock_llm.chat = AsyncMock(return_value="补全内容")
        svc = CompletionService(llm=mock_llm)

        recent = [
            {"role": "user", "content": "什么是深度学习？"},
            {"role": "assistant", "content": "深度学习是一种机器学习方法..."},
        ]
        await svc.complete(prefix="深度学习的主要应用场景", recent_messages=recent)

        call_args = mock_llm.chat.call_args
        messages = call_args[0][0]
        assert len(messages) >= 3


class TestCompletionAPI:
    """API endpoint tests for POST /chat/complete."""

    @pytest.mark.asyncio
    async def test_complete_endpoint_success(self, client: AsyncClient):
        with patch("app.services.completion_service.CompletionService") as mock_svc_cls:
            instance = mock_svc_cls.return_value
            instance.complete = AsyncMock(return_value={"completion": "补全文本", "confidence": 0.8})

            resp = await client.post(
                "/api/v1/chat/complete",
                json={
                    "prefix": "深度学习在自然语言处理领域",
                    "knowledge_base_ids": [],
                },
            )
            assert resp.status_code == 200
            data = resp.json()["data"]
            assert "completion" in data
            assert "confidence" in data

    @pytest.mark.asyncio
    async def test_complete_endpoint_prefix_too_short(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/chat/complete",
            json={"prefix": "短"},
        )
        assert resp.status_code == 422
