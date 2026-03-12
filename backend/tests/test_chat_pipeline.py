"""Tests for the LangGraph chat pipeline nodes and stream_writer."""

from __future__ import annotations

import json

import pytest

from app.pipelines.chat.state import ChatMessageDict, ChatState, CitationDict
from app.pipelines.chat.stream_writer import (
    format_data_part,
    format_done,
    format_error,
    format_finish,
    format_start,
    format_text_delta,
    format_text_end,
    format_text_start,
)

# ---------------------------------------------------------------------------
# stream_writer format tests
# ---------------------------------------------------------------------------


class TestStreamWriter:
    def test_format_start(self):
        result = format_start("msg_abc")
        parsed = json.loads(result.removeprefix("data: ").strip())
        assert parsed["type"] == "start"
        assert parsed["messageId"] == "msg_abc"

    def test_format_start_auto_id(self):
        result = format_start()
        parsed = json.loads(result.removeprefix("data: ").strip())
        assert parsed["type"] == "start"
        assert parsed["messageId"].startswith("msg_")

    def test_format_text_start(self):
        result = format_text_start("text_1")
        parsed = json.loads(result.removeprefix("data: ").strip())
        assert parsed == {"type": "text-start", "id": "text_1"}

    def test_format_text_delta(self):
        result = format_text_delta("text_1", "hello")
        parsed = json.loads(result.removeprefix("data: ").strip())
        assert parsed == {"type": "text-delta", "id": "text_1", "delta": "hello"}

    def test_format_text_end(self):
        result = format_text_end("text_1")
        parsed = json.loads(result.removeprefix("data: ").strip())
        assert parsed == {"type": "text-end", "id": "text_1"}

    def test_format_data_part(self):
        result = format_data_part("citation", {"index": 1, "title": "Test"}, part_id="cit-1")
        parsed = json.loads(result.removeprefix("data: ").strip())
        assert parsed["type"] == "data-citation"
        assert parsed["id"] == "cit-1"
        assert parsed["data"]["index"] == 1

    def test_format_data_part_without_id(self):
        result = format_data_part("thinking", {"step": "understand"})
        parsed = json.loads(result.removeprefix("data: ").strip())
        assert parsed["type"] == "data-thinking"
        assert "id" not in parsed
        assert parsed["data"]["step"] == "understand"

    def test_format_error(self):
        result = format_error("something broke")
        parsed = json.loads(result.removeprefix("data: ").strip())
        assert parsed == {"type": "error", "errorText": "something broke"}

    def test_format_finish(self):
        result = format_finish()
        parsed = json.loads(result.removeprefix("data: ").strip())
        assert parsed == {"type": "finish"}

    def test_format_done(self):
        assert format_done() == "data: [DONE]\n\n"

    def test_unicode_in_data_part(self):
        result = format_data_part("citation", {"title": "超分辨率显微镜"})
        assert "超分辨率显微镜" in result


# ---------------------------------------------------------------------------
# State type tests
# ---------------------------------------------------------------------------


class TestChatState:
    def test_citation_dict(self):
        cit: CitationDict = {
            "index": 1,
            "paper_title": "Test Paper",
            "excerpt": "Some text",
            "relevance_score": 0.9,
            "chunk_type": "text",
        }
        assert cit["index"] == 1
        assert cit["paper_title"] == "Test Paper"

    def test_chat_message_dict(self):
        msg: ChatMessageDict = {"role": "user", "content": "Hello"}
        assert msg["role"] == "user"

    def test_chat_state_minimal(self):
        state: ChatState = {
            "message": "What is STED?",
            "knowledge_base_ids": [1],
            "tool_mode": "qa",
        }
        assert state["message"] == "What is STED?"

    def test_chat_state_full(self):
        state: ChatState = {
            "message": "Test",
            "knowledge_base_ids": [],
            "tool_mode": "qa",
            "conversation_id": None,
            "model": "mock",
            "rag_results": [],
            "citations": [],
            "all_contexts": [],
            "history_messages": [],
            "system_prompt": "You are helpful",
            "full_messages": [],
            "assistant_content": "",
            "new_conversation_id": None,
            "error": None,
        }
        assert state["error"] is None


# ---------------------------------------------------------------------------
# Graph compilation tests
# ---------------------------------------------------------------------------


class TestChatGraph:
    def test_graph_compiles(self):
        from app.pipelines.chat.graph import create_chat_pipeline

        pipeline = create_chat_pipeline()
        assert pipeline is not None

    def test_graph_has_expected_nodes(self):
        from app.pipelines.chat.graph import create_chat_pipeline

        pipeline = create_chat_pipeline()
        graph = pipeline.get_graph()
        node_names = set(graph.nodes.keys()) if isinstance(graph.nodes, dict) else {n for n in graph.nodes}
        expected = {"understand", "retrieve", "rank", "clean", "generate", "persist"}
        assert expected.issubset(node_names)


# ---------------------------------------------------------------------------
# Config helpers tests
# ---------------------------------------------------------------------------


class TestConfigHelpers:
    def test_get_chat_db(self):
        from app.pipelines.chat.config_helpers import get_chat_db

        mock_db = object()
        config = {"configurable": {"db": mock_db}}
        assert get_chat_db(config) is mock_db

    def test_set_and_get_services(self):
        from app.pipelines.chat.config_helpers import (
            get_chat_llm,
            get_chat_rag,
            set_chat_services,
        )

        config = {"configurable": {"db": "x"}}
        mock_llm = object()
        mock_rag = object()
        set_chat_services(config, llm=mock_llm, rag=mock_rag)
        assert get_chat_llm(config) is mock_llm
        assert get_chat_rag(config) is mock_rag

    def test_services_shared_across_config_copies(self):
        """Verify that shallow config copies share the _services dict."""
        from app.pipelines.chat.config_helpers import (
            get_chat_llm,
            set_chat_services,
        )

        config = {"configurable": {"db": "x"}}
        set_chat_services(config, llm="test_llm", rag="test_rag")

        config_copy = {**config, "configurable": config["configurable"]}
        assert get_chat_llm(config_copy) == "test_llm"


# ---------------------------------------------------------------------------
# Integration test: full endpoint (requires DB)
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
async def setup_db():
    from app.database import Base, engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture(autouse=True)
def mock_services(monkeypatch):
    """Mock _init_services so endpoint tests use mock LLM/RAG without DB lookups."""
    import app.api.v1.chat as chat_module
    from app.services.llm.client import LLMClient

    async def _mock_init_services(db):
        from llama_index.core.embeddings import MockEmbedding

        from app.services.rag_service import RAGService

        llm = LLMClient(provider="mock")
        rag = RAGService(llm=llm, embed_model=MockEmbedding(embed_dim=128))
        return {"llm": llm, "rag": rag}

    monkeypatch.setattr(chat_module, "_init_services", _mock_init_services)


@pytest.fixture
async def client():
    from httpx import ASGITransport, AsyncClient

    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_stream_endpoint_data_stream_protocol(client):
    """Verify the /stream endpoint emits Data Stream Protocol events."""
    resp = await client.post(
        "/api/v1/chat/stream",
        json={"message": "Hello", "knowledge_base_ids": []},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")

    text = resp.text
    lines = [line for line in text.split("\n") if line.startswith("data: ")]

    event_types = []
    error_text = None
    for line in lines:
        payload = line.removeprefix("data: ").strip()
        if payload == "[DONE]":
            event_types.append("[DONE]")
            continue
        try:
            parsed = json.loads(payload)
            etype = parsed.get("type", "unknown")
            event_types.append(etype)
            if etype == "error":
                error_text = parsed.get("errorText", "")
        except json.JSONDecodeError:
            pass

    assert error_text is None, f"Stream returned error: {error_text}"
    assert "start" in event_types
    assert "text-delta" in event_types
    assert "finish" in event_types
    assert "[DONE]" in event_types


@pytest.mark.asyncio
async def test_stream_endpoint_no_kb_skips_rag(client):
    """Without knowledge_base_ids, the pipeline skips RAG nodes."""
    resp = await client.post(
        "/api/v1/chat/stream",
        json={"message": "What is 2+2?", "knowledge_base_ids": []},
    )
    assert resp.status_code == 200
    text = resp.text
    assert "data-citation" not in text
    assert "text-delta" in text


@pytest.mark.asyncio
async def test_stream_endpoint_persists_conversation(client):
    """Verify that the stream creates a conversation and persists messages."""
    resp = await client.post(
        "/api/v1/chat/stream",
        json={"message": "Tell me about AI", "knowledge_base_ids": []},
    )
    assert resp.status_code == 200

    lines = [line for line in resp.text.split("\n") if line.startswith("data: ")]
    conv_id = None
    for line in lines:
        payload = line.removeprefix("data: ").strip()
        if payload == "[DONE]":
            continue
        try:
            parsed = json.loads(payload)
            if parsed.get("type") == "data-conversation":
                conv_id = parsed["data"]["conversation_id"]
        except json.JSONDecodeError:
            pass

    assert conv_id is not None

    detail_resp = await client.get(f"/api/v1/conversations/{conv_id}")
    assert detail_resp.status_code == 200
    messages = detail_resp.json()["data"]["messages"]
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"
