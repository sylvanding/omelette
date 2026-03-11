"""Tests for Chat and Conversation API endpoints."""

import chromadb
import pytest
from httpx import ASGITransport, AsyncClient
from llama_index.core.embeddings import MockEmbedding

from app.api.v1.chat import _get_rag_service_for_chat
from app.database import Base, async_session_factory, engine
from app.main import app
from app.models import PaperStatus, Project
from app.models.chunk import PaperChunk
from app.models.paper import Paper
from app.services.llm.client import LLMClient
from app.services.rag_service import RAGService


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


@pytest.fixture
def mock_rag_llm():
    """Provide mock RAG service and LLM client."""
    llm = LLMClient(provider="mock")
    rag = RAGService(
        llm=llm,
        chroma_client=chromadb.EphemeralClient(),
        embed_model=MockEmbedding(embed_dim=128),
    )
    return rag, llm


@pytest.fixture(autouse=True)
def override_chat_deps(mock_rag_llm):
    rag, llm = mock_rag_llm

    async def _mock_get_rag_service(db):
        return rag, llm

    app.dependency_overrides[_get_rag_service_for_chat] = _mock_get_rag_service
    import app.api.v1.chat as chat_module

    _original = chat_module._get_rag_service_for_chat
    chat_module._get_rag_service_for_chat = _mock_get_rag_service
    yield
    chat_module._get_rag_service_for_chat = _original
    app.dependency_overrides.clear()


@pytest.fixture
async def project_id():
    async with async_session_factory() as session:
        proj = Project(name="Chat Test", domain="test")
        session.add(proj)
        await session.flush()

        paper = Paper(
            project_id=proj.id,
            title="Test Paper",
            abstract="Test abstract",
            status=PaperStatus.INDEXED,
        )
        session.add(paper)
        await session.flush()

        chunk = PaperChunk(
            paper_id=paper.id,
            content="Super-resolution microscopy enables imaging beyond the diffraction limit.",
            chunk_type="text",
            page_number=1,
            chunk_index=0,
        )
        session.add(chunk)
        await session.commit()
        return proj.id


# --- Conversation CRUD tests ---


@pytest.mark.asyncio
async def test_create_conversation(client: AsyncClient):
    resp = await client.post(
        "/api/v1/conversations",
        json={"title": "Test Chat", "knowledge_base_ids": [1], "tool_mode": "qa"},
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["title"] == "Test Chat"
    assert data["knowledge_base_ids"] == [1]
    assert data["tool_mode"] == "qa"


@pytest.mark.asyncio
async def test_list_conversations(client: AsyncClient):
    await client.post("/api/v1/conversations", json={"title": "A"})
    await client.post("/api/v1/conversations", json={"title": "B"})

    resp = await client.get("/api/v1/conversations")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["total"] == 2
    assert len(data["items"]) == 2


@pytest.mark.asyncio
async def test_get_conversation(client: AsyncClient):
    create_resp = await client.post("/api/v1/conversations", json={"title": "Detail"})
    conv_id = create_resp.json()["data"]["id"]

    resp = await client.get(f"/api/v1/conversations/{conv_id}")
    assert resp.status_code == 200
    assert resp.json()["data"]["title"] == "Detail"
    assert resp.json()["data"]["messages"] == []


@pytest.mark.asyncio
async def test_get_conversation_not_found(client: AsyncClient):
    resp = await client.get("/api/v1/conversations/99999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_conversation(client: AsyncClient):
    create_resp = await client.post("/api/v1/conversations", json={"title": "Old"})
    conv_id = create_resp.json()["data"]["id"]

    resp = await client.put(f"/api/v1/conversations/{conv_id}", json={"title": "New"})
    assert resp.status_code == 200
    assert resp.json()["data"]["title"] == "New"


@pytest.mark.asyncio
async def test_delete_conversation(client: AsyncClient):
    create_resp = await client.post("/api/v1/conversations", json={"title": "Deleteme"})
    conv_id = create_resp.json()["data"]["id"]

    resp = await client.delete(f"/api/v1/conversations/{conv_id}")
    assert resp.status_code == 200
    assert resp.json()["data"]["deleted"] is True

    resp2 = await client.get(f"/api/v1/conversations/{conv_id}")
    assert resp2.status_code == 404


# --- SSE Chat Stream tests ---


@pytest.mark.asyncio
async def test_chat_stream_creates_conversation(client: AsyncClient, project_id: int):
    resp = await client.post(
        "/api/v1/chat/stream",
        json={
            "knowledge_base_ids": [project_id],
            "message": "What is STED?",
        },
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")

    text = resp.text
    assert "event: message_start" in text
    assert "event: text_delta" in text
    assert "event: message_end" in text
    assert "conversation_id" in text


@pytest.mark.asyncio
async def test_chat_stream_continues_conversation(client: AsyncClient, project_id: int):
    create_resp = await client.post(
        "/api/v1/conversations",
        json={"title": "Stream Test", "knowledge_base_ids": [project_id]},
    )
    conv_id = create_resp.json()["data"]["id"]

    resp = await client.post(
        "/api/v1/chat/stream",
        json={
            "conversation_id": conv_id,
            "knowledge_base_ids": [project_id],
            "message": "Tell me more",
        },
    )
    assert resp.status_code == 200
    text = resp.text
    assert "event: message_end" in text

    detail_resp = await client.get(f"/api/v1/conversations/{conv_id}")
    messages = detail_resp.json()["data"]["messages"]
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"


@pytest.mark.asyncio
async def test_chat_stream_tool_modes(client: AsyncClient, project_id: int):
    for mode in ["qa", "citation_lookup", "review_outline", "gap_analysis"]:
        resp = await client.post(
            "/api/v1/chat/stream",
            json={
                "knowledge_base_ids": [project_id],
                "message": "Test",
                "tool_mode": mode,
            },
        )
        assert resp.status_code == 200
        assert "event: message_end" in resp.text


@pytest.mark.asyncio
async def test_chat_stream_missing_kb(client: AsyncClient):
    resp = await client.post(
        "/api/v1/chat/stream",
        json={
            "knowledge_base_ids": [],
            "message": "Test",
        },
    )
    assert resp.status_code == 422
