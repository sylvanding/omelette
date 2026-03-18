"""Comprehensive API tests for Chat, RAG, Writing, Completion, and Rewrite modules."""

from __future__ import annotations

import json

import chromadb
import pytest
from httpx import ASGITransport, AsyncClient
from llama_index.core.embeddings import MockEmbedding

from app.api.v1.rag import get_rag_service
from app.database import Base, async_session_factory, engine
from app.main import app
from app.models import Paper, PaperChunk, PaperStatus, Project
from app.services.rag_service import RAGService

MOCK_EMBED = MockEmbedding(embed_dim=128)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


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
def rag_service():
    """RAGService with ephemeral ChromaDB and mock embedding for fast tests."""
    return RAGService(
        chroma_client=chromadb.EphemeralClient(),
        embed_model=MOCK_EMBED,
    )


@pytest.fixture(autouse=True)
def override_rag_dependency(rag_service):
    """Override RAG dependency to use ephemeral ChromaDB."""
    app.dependency_overrides[get_rag_service] = lambda: rag_service
    yield
    app.dependency_overrides.pop(get_rag_service, None)


@pytest.fixture(autouse=True)
def mock_chat_services(monkeypatch):
    """Mock _init_services so Chat stream uses mock LLM/RAG without DB lookups."""
    import app.api.v1.chat as chat_module
    from app.services.llm.client import LLMClient

    async def _mock_init_services(db):
        from app.services.rag_service import RAGService

        llm = LLMClient(provider="mock")
        rag = RAGService(llm=llm, embed_model=MockEmbedding(embed_dim=128))
        return {"llm": llm, "rag": rag}

    monkeypatch.setattr(chat_module, "_init_services", _mock_init_services)


@pytest.fixture
async def project_with_chunks():
    """Create a project with OCR-complete papers and chunks for RAG tests."""
    async with async_session_factory() as session:
        project = Project(name="RAG Test Project", domain="optics")
        session.add(project)
        await session.flush()

        paper = Paper(
            project_id=project.id,
            title="Super-Resolution Microscopy Review",
            abstract="A review of super-resolution techniques.",
            journal="Nature",
            year=2023,
            status=PaperStatus.OCR_COMPLETE,
        )
        session.add(paper)
        await session.flush()

        chunk1 = PaperChunk(
            paper_id=paper.id,
            content="Super-resolution microscopy enables imaging beyond the diffraction limit.",
            chunk_type="text",
            page_number=1,
            chunk_index=0,
        )
        chunk2 = PaperChunk(
            paper_id=paper.id,
            content="STED and STORM are two major techniques for nanoscale imaging.",
            chunk_type="text",
            page_number=2,
            chunk_index=1,
        )
        session.add(chunk1)
        session.add(chunk2)
        await session.commit()
        return project.id


@pytest.fixture
async def project_with_papers():
    """Create a project with papers for writing tests."""
    async with async_session_factory() as session:
        project = Project(name="Writing Test Project", domain="optics")
        session.add(project)
        await session.flush()

        paper1 = Paper(
            project_id=project.id,
            title="Super-Resolution Microscopy",
            abstract="A comprehensive review of super-resolution techniques.",
            journal="Nature",
            year=2023,
            authors=[{"name": "Alice Smith"}, {"name": "Bob Jones"}],
            citation_count=100,
            status=PaperStatus.INDEXED,
        )
        paper2 = Paper(
            project_id=project.id,
            title="STED Imaging Methods",
            abstract="Stimulated emission depletion microscopy for nanoscale imaging.",
            journal="Science",
            year=2022,
            authors=[{"name": "Carol Lee"}],
            doi="10.1234/test",
            citation_count=50,
            status=PaperStatus.INDEXED,
        )
        session.add(paper1)
        session.add(paper2)
        await session.flush()
        paper_ids = [paper1.id, paper2.id]
        await session.commit()
        return project.id, paper_ids


# ---------------------------------------------------------------------------
# Chat API tests
# ---------------------------------------------------------------------------


class TestChatStream:
    """Tests for POST /api/v1/chat/stream (SSE)."""

    @pytest.mark.asyncio
    async def test_stream_returns_sse(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/chat/stream",
            json={"message": "Hello", "knowledge_base_ids": []},
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")

        text = resp.text
        lines = [line for line in text.split("\n") if line.startswith("data: ")]

        event_types = []
        for line in lines:
            payload = line.removeprefix("data: ").strip()
            if payload == "[DONE]":
                event_types.append("[DONE]")
                continue
            try:
                parsed = json.loads(payload)
                event_types.append(parsed.get("type", "unknown"))
            except json.JSONDecodeError:
                pass

        assert "start" in event_types
        assert "text-delta" in event_types
        assert "finish" in event_types
        assert "[DONE]" in event_types

    @pytest.mark.asyncio
    async def test_stream_with_rag_top_k_and_use_reranker(self, client: AsyncClient):
        """Chat stream accepts rag_top_k (1-50) and use_reranker."""
        resp = await client.post(
            "/api/v1/chat/stream",
            json={
                "message": "What is super-resolution?",
                "knowledge_base_ids": [1],
                "rag_top_k": 15,
                "use_reranker": True,
            },
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        assert "data:" in resp.text

    @pytest.mark.asyncio
    async def test_stream_rag_top_k_validation_min_fails(self, client: AsyncClient):
        """rag_top_k=0 should fail validation."""
        resp = await client.post(
            "/api/v1/chat/stream",
            json={"message": "Hello", "knowledge_base_ids": [], "rag_top_k": 0},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_stream_rag_top_k_validation_max_fails(self, client: AsyncClient):
        """rag_top_k=51 should fail validation."""
        resp = await client.post(
            "/api/v1/chat/stream",
            json={"message": "Hello", "knowledge_base_ids": [], "rag_top_k": 51},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_stream_message_required(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/chat/stream",
            json={"message": "", "knowledge_base_ids": []},
        )
        assert resp.status_code == 422


class TestChatComplete:
    """Tests for POST /api/v1/chat/complete (Completion)."""

    @pytest.mark.asyncio
    async def test_complete_success(self, client: AsyncClient):
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
    async def test_complete_prefix_too_short_fails(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/chat/complete",
            json={"prefix": "short"},
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# RAG API tests
# ---------------------------------------------------------------------------


class TestRAGQuery:
    """Tests for POST /api/v1/projects/{project_id}/rag/query."""

    @pytest.mark.asyncio
    async def test_query_empty_index(self, client: AsyncClient, project_with_chunks: int):
        resp = await client.post(
            f"/api/v1/projects/{project_with_chunks}/rag/query",
            json={"question": "What is super-resolution?", "top_k": 5},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        assert "answer" in body["data"]
        assert "sources" in body["data"]
        assert "confidence" in body["data"]

    @pytest.mark.asyncio
    async def test_query_with_use_reranker(self, client: AsyncClient, project_with_chunks: int):
        resp = await client.post(
            f"/api/v1/projects/{project_with_chunks}/rag/query",
            json={
                "question": "What is super-resolution?",
                "top_k": 5,
                "use_reranker": True,
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "answer" in body["data"]

    @pytest.mark.asyncio
    async def test_query_without_reranker(self, client: AsyncClient, project_with_chunks: int):
        resp = await client.post(
            f"/api/v1/projects/{project_with_chunks}/rag/query",
            json={
                "question": "What is super-resolution?",
                "top_k": 5,
                "use_reranker": False,
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "answer" in body["data"]

    @pytest.mark.asyncio
    async def test_query_top_k_validation_min_fails(self, client: AsyncClient, project_with_chunks: int):
        """top_k=0 should fail validation."""
        resp = await client.post(
            f"/api/v1/projects/{project_with_chunks}/rag/query",
            json={"question": "test", "top_k": 0},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_query_top_k_validation_max_fails(self, client: AsyncClient, project_with_chunks: int):
        """top_k=51 should fail validation."""
        resp = await client.post(
            f"/api/v1/projects/{project_with_chunks}/rag/query",
            json={"question": "test", "top_k": 51},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_query_after_index(self, client: AsyncClient, project_with_chunks: int):
        await client.post(f"/api/v1/projects/{project_with_chunks}/rag/index")

        resp = await client.post(
            f"/api/v1/projects/{project_with_chunks}/rag/query",
            json={"question": "What is super-resolution microscopy?", "top_k": 5},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        assert "answer" in body["data"]
        assert "sources" in body["data"]
        assert "confidence" in body["data"]


class TestRAGIndex:
    """Tests for POST /api/v1/projects/{project_id}/rag/index."""

    @pytest.mark.asyncio
    async def test_build_index(self, client: AsyncClient, project_with_chunks: int):
        resp = await client.post(f"/api/v1/projects/{project_with_chunks}/rag/index")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        assert "indexed" in body["data"]
        assert body["data"]["indexed"] >= 0


class TestRAGIndexStream:
    """Tests for POST /api/v1/projects/{project_id}/rag/index/stream (SSE)."""

    @pytest.mark.asyncio
    async def test_index_stream_returns_sse(self, client: AsyncClient, project_with_chunks: int):
        resp = await client.post(f"/api/v1/projects/{project_with_chunks}/rag/index/stream")
        assert resp.status_code == 200
        assert resp.headers.get("content-type", "").startswith("text/event-stream")

        text = resp.text
        assert "event:" in text
        assert "data:" in text

        # Should have progress and complete events
        lines = text.split("\n")
        event_lines = [line for line in lines if line.startswith("event:")]
        assert len(event_lines) >= 1


class TestRAGStats:
    """Tests for GET /api/v1/projects/{project_id}/rag/stats."""

    @pytest.mark.asyncio
    async def test_stats(self, client: AsyncClient, project_with_chunks: int):
        resp = await client.get(f"/api/v1/projects/{project_with_chunks}/rag/stats")
        assert resp.status_code == 200
        body = resp.json()
        assert "total_chunks" in body["data"]
        assert "collection_name" in body["data"]


class TestRAGDeleteIndex:
    """Tests for DELETE /api/v1/projects/{project_id}/rag/index."""

    @pytest.mark.asyncio
    async def test_delete_index(self, client: AsyncClient, project_with_chunks: int):
        resp = await client.delete(f"/api/v1/projects/{project_with_chunks}/rag/index")
        assert resp.status_code == 200
        body = resp.json()
        assert "deleted" in body["data"]


# ---------------------------------------------------------------------------
# Writing API tests
# ---------------------------------------------------------------------------


class TestWritingSummarize:
    """Tests for POST /api/v1/projects/{project_id}/writing/summarize."""

    @pytest.mark.asyncio
    async def test_summarize(self, client: AsyncClient, project_with_papers):
        project_id, paper_ids = project_with_papers
        resp = await client.post(
            f"/api/v1/projects/{project_id}/writing/summarize",
            json={"paper_ids": paper_ids, "language": "en"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        assert "summaries" in body["data"]
        assert len(body["data"]["summaries"]) == 2


class TestWritingCitations:
    """Tests for POST /api/v1/projects/{project_id}/writing/citations."""

    @pytest.mark.asyncio
    async def test_citations(self, client: AsyncClient, project_with_papers):
        project_id, paper_ids = project_with_papers
        resp = await client.post(
            f"/api/v1/projects/{project_id}/writing/citations",
            json={"paper_ids": paper_ids, "style": "gb_t_7714"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        assert "citations" in body["data"]
        assert body["data"]["style"] == "gb_t_7714"
        assert len(body["data"]["citations"]) == 2


class TestWritingReviewOutline:
    """Tests for POST /api/v1/projects/{project_id}/writing/review-outline."""

    @pytest.mark.asyncio
    async def test_review_outline(self, client: AsyncClient, project_with_papers):
        project_id, _ = project_with_papers
        resp = await client.post(
            f"/api/v1/projects/{project_id}/writing/review-outline",
            json={"topic": "Super-resolution imaging", "language": "en"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        assert "outline" in body["data"]
        assert "paper_count" in body["data"]


class TestWritingGapAnalysis:
    """Tests for POST /api/v1/projects/{project_id}/writing/gap-analysis."""

    @pytest.mark.asyncio
    async def test_gap_analysis(self, client: AsyncClient, project_with_papers):
        project_id, _ = project_with_papers
        resp = await client.post(
            f"/api/v1/projects/{project_id}/writing/gap-analysis",
            json={"research_topic": "Nanoscale microscopy"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        assert "analysis" in body["data"]
        assert "papers_analyzed" in body["data"]


class TestWritingReviewDraftStream:
    """Tests for POST /api/v1/projects/{project_id}/writing/review-draft/stream (SSE)."""

    @pytest.mark.asyncio
    async def test_review_draft_stream_returns_sse(self, client: AsyncClient, project_with_papers):
        project_id, _ = project_with_papers
        resp = await client.post(
            f"/api/v1/projects/{project_id}/writing/review-draft/stream",
            json={
                "topic": "Super-resolution microscopy",
                "style": "narrative",
                "citation_format": "numbered",
                "language": "en",
            },
        )
        assert resp.status_code == 200
        assert resp.headers.get("content-type", "").startswith("text/event-stream")

        text = resp.text
        assert "event:" in text
        assert "data:" in text

    @pytest.mark.asyncio
    async def test_review_draft_stream_invalid_style_fails(self, client: AsyncClient, project_with_papers):
        project_id, _ = project_with_papers
        resp = await client.post(
            f"/api/v1/projects/{project_id}/writing/review-draft/stream",
            json={"topic": "test", "style": "invalid_style"},
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Rewrite API tests (POST /api/v1/chat/rewrite)
# ---------------------------------------------------------------------------


class TestRewrite:
    """Tests for POST /api/v1/chat/rewrite (SSE)."""

    @pytest.mark.asyncio
    async def test_rewrite_stream_returns_sse(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/chat/rewrite",
            json={
                "excerpt": "This is a sample excerpt to simplify for testing.",
                "style": "simplify",
            },
        )
        assert resp.status_code == 200
        assert resp.headers.get("content-type", "").startswith("text/event-stream")

        text = resp.text
        assert "event:" in text
        assert "data:" in text

        # Parse SSE events
        lines = text.split("\n")
        event_types = []
        for line in lines:
            if line.startswith("event:"):
                event_types.append(line.replace("event:", "").strip())

        assert "rewrite_delta" in event_types or "rewrite_end" in event_types or "error" in event_types

    @pytest.mark.asyncio
    async def test_rewrite_academic_style(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/chat/rewrite",
            json={
                "excerpt": "This is a simple sentence.",
                "style": "academic",
            },
        )
        assert resp.status_code == 200
        assert "data:" in resp.text

    @pytest.mark.asyncio
    async def test_rewrite_excerpt_too_long_fails(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/chat/rewrite",
            json={
                "excerpt": "x" * 2001,
                "style": "simplify",
            },
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_rewrite_custom_requires_prompt(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/chat/rewrite",
            json={
                "excerpt": "Sample text",
                "style": "custom",
            },
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_rewrite_custom_with_prompt(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/chat/rewrite",
            json={
                "excerpt": "Sample text to rewrite.",
                "style": "custom",
                "custom_prompt": "Rewrite this in a formal tone.",
            },
        )
        assert resp.status_code == 200
        assert "data:" in resp.text
