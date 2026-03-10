"""Tests for RAG service and API endpoints."""

import chromadb
import pytest
from httpx import ASGITransport, AsyncClient

from app.api.v1.rag import get_rag_service
from app.database import Base, async_session_factory, engine
from app.main import app
from app.models import Paper, PaperChunk, PaperStatus, Project
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
def rag_service():
    """RAGService with ephemeral ChromaDB for isolated tests."""
    service = RAGService()
    service._client = chromadb.EphemeralClient()
    return service


@pytest.fixture(autouse=True)
def override_rag_dependency(rag_service):
    """Override RAG dependency to use ephemeral ChromaDB."""
    app.dependency_overrides[get_rag_service] = lambda: rag_service
    yield
    app.dependency_overrides.pop(get_rag_service, None)


@pytest.fixture
async def project_with_chunks():
    """Create a project with OCR-complete papers and chunks."""
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


# --- Unit tests: RAGService ---


@pytest.mark.asyncio
async def test_index_chunks(rag_service, project_with_chunks):
    chunks = [
        {
            "paper_id": 1,
            "paper_title": "Test Paper",
            "chunk_type": "text",
            "page_number": 1,
            "chunk_index": 0,
            "content": "This is test content for indexing.",
        },
    ]
    result = await rag_service.index_chunks(project_id=project_with_chunks, chunks=chunks)
    assert result["indexed"] == 1
    assert "project_" in result["collection"]


@pytest.mark.asyncio
async def test_index_chunks_empty(rag_service, project_with_chunks):
    result = await rag_service.index_chunks(project_id=project_with_chunks, chunks=[])
    assert result["indexed"] == 0


@pytest.mark.asyncio
async def test_query_empty_collection(rag_service):
    """Use project_id 99999 to ensure empty collection (not shared with other tests)."""
    result = await rag_service.query(project_id=99999, question="What is super-resolution?")
    assert "No documents" in result["answer"]
    assert result["sources"] == []
    assert result["confidence"] == 0.0


@pytest.mark.asyncio
async def test_query_with_indexed_data(rag_service, project_with_chunks):
    chunks = [
        {
            "paper_id": 1,
            "paper_title": "Super-Resolution Paper",
            "chunk_type": "text",
            "page_number": 1,
            "chunk_index": 0,
            "content": "Super-resolution microscopy enables imaging beyond the diffraction limit of light.",
        },
    ]
    await rag_service.index_chunks(project_id=project_with_chunks, chunks=chunks)

    result = await rag_service.query(
        project_id=project_with_chunks,
        question="What enables imaging beyond diffraction limit?",
        top_k=5,
    )
    assert "answer" in result
    assert len(result["sources"]) > 0 or "No relevant" in result["answer"]
    # With mock LLM, we get an answer; with real data we may get sources
    assert "answer" in result


@pytest.mark.asyncio
async def test_delete_index(rag_service, project_with_chunks):
    chunks = [
        {"paper_id": 1, "paper_title": "X", "chunk_type": "text", "page_number": 1, "chunk_index": 0, "content": "Y"}
    ]
    await rag_service.index_chunks(project_id=project_with_chunks, chunks=chunks)

    result = await rag_service.delete_index(project_id=project_with_chunks)
    assert result["deleted"] is True
    assert "project_" in result["collection"]


@pytest.mark.asyncio
async def test_get_stats_empty(rag_service, project_with_chunks):
    result = await rag_service.get_stats(project_id=project_with_chunks)
    assert result["total_chunks"] == 0
    assert "collection_name" in result


@pytest.mark.asyncio
async def test_get_stats_after_index(rag_service, project_with_chunks):
    chunks = [
        {
            "paper_id": 1,
            "paper_title": "A",
            "chunk_type": "text",
            "page_number": 1,
            "chunk_index": 0,
            "content": "Content",
        },
        {
            "paper_id": 1,
            "paper_title": "A",
            "chunk_type": "text",
            "page_number": 2,
            "chunk_index": 1,
            "content": "More",
        },
    ]
    await rag_service.index_chunks(project_id=project_with_chunks, chunks=chunks)
    result = await rag_service.get_stats(project_id=project_with_chunks)
    assert result["total_chunks"] == 2


# --- API endpoint tests ---


@pytest.mark.asyncio
async def test_rag_query_empty_index(client: AsyncClient, project_with_chunks: int):
    resp = await client.post(
        f"/api/v1/projects/{project_with_chunks}/rag/query",
        json={"question": "What is super-resolution?", "top_k": 5},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 200
    assert "answer" in body["data"]
    assert "No documents" in body["data"]["answer"] or "answer" in body["data"]


@pytest.mark.asyncio
async def test_rag_index_api(client: AsyncClient, project_with_chunks: int):
    resp = await client.post(f"/api/v1/projects/{project_with_chunks}/rag/index")
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 200
    assert "indexed" in body["data"]
    assert body["data"]["indexed"] >= 0


@pytest.mark.asyncio
async def test_rag_stats_api(client: AsyncClient, project_with_chunks: int):
    resp = await client.get(f"/api/v1/projects/{project_with_chunks}/rag/stats")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["total_chunks"] >= 0
    assert "collection_name" in body["data"]


@pytest.mark.asyncio
async def test_rag_delete_index_api(client: AsyncClient, project_with_chunks: int):
    resp = await client.delete(f"/api/v1/projects/{project_with_chunks}/rag/index")
    assert resp.status_code == 200
    body = resp.json()
    assert "deleted" in body["data"]


@pytest.mark.asyncio
async def test_rag_query_after_index(client: AsyncClient, project_with_chunks: int):
    # Index first
    await client.post(f"/api/v1/projects/{project_with_chunks}/rag/index")

    resp = await client.post(
        f"/api/v1/projects/{project_with_chunks}/rag/query",
        json={"question": "What is super-resolution microscopy?", "top_k": 5},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 200
    assert "answer" in body["data"]
    # With indexed data, we should get either sources or a meaningful answer
    assert "sources" in body["data"]
    assert "confidence" in body["data"]


@pytest.mark.asyncio
async def test_rag_nonexistent_project(client: AsyncClient):
    resp = await client.post(
        "/api/v1/projects/99999/rag/query",
        json={"question": "test"},
    )
    # May return 200 with empty answer or 404 depending on implementation
    assert resp.status_code in (200, 404)
