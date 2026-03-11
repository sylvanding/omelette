"""Tests for MCP server tools and resources."""

import pytest

from app.database import Base, async_session_factory, engine
from app.mcp_server import (
    get_kb_detail,
    get_paper_chunks,
    get_paper_resource,
    get_paper_summary,
    list_kb_resource,
    list_knowledge_bases,
    lookup_paper,
)
from app.models import Paper, Project


@pytest.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def sample_kb():
    async with async_session_factory() as db:
        project = Project(name="Test KB", description="For MCP testing", domain="AI")
        db.add(project)
        await db.flush()
        paper = Paper(
            project_id=project.id,
            title="Deep Learning for NLP",
            doi="10.1234/test",
            abstract="A survey of deep learning methods for NLP.",
            authors=[{"name": "Zhang Wei"}],
            journal="Nature",
            year=2024,
        )
        db.add(paper)
        await db.flush()
        await db.refresh(project)
        await db.refresh(paper)
        await db.commit()
        return {"project_id": project.id, "paper_id": paper.id}


# --- Tool Tests ---


@pytest.mark.asyncio
async def test_list_knowledge_bases_empty():
    result = await list_knowledge_bases()
    assert "No knowledge bases" in result


@pytest.mark.asyncio
async def test_list_knowledge_bases_with_data(sample_kb):
    result = await list_knowledge_bases()
    assert "Test KB" in result
    assert "1" in result


@pytest.mark.asyncio
async def test_lookup_paper_by_doi(sample_kb):
    result = await lookup_paper(doi="10.1234/test")
    assert "Deep Learning for NLP" in result
    assert "Zhang Wei" in result


@pytest.mark.asyncio
async def test_lookup_paper_by_title(sample_kb):
    result = await lookup_paper(title="Deep Learning")
    assert "Deep Learning for NLP" in result


@pytest.mark.asyncio
async def test_lookup_paper_not_found():
    result = await lookup_paper(doi="10.9999/nonexistent")
    assert "No paper found" in result


@pytest.mark.asyncio
async def test_lookup_paper_no_args():
    result = await lookup_paper()
    assert "Error" in result


@pytest.mark.asyncio
async def test_get_paper_summary(sample_kb):
    result = await get_paper_summary(paper_id=sample_kb["paper_id"])
    assert "survey of deep learning" in result


@pytest.mark.asyncio
async def test_get_paper_summary_not_found():
    result = await get_paper_summary(paper_id=99999)
    assert "not found" in result


# --- Resource Tests ---


@pytest.mark.asyncio
async def test_list_kb_resource(sample_kb):
    result = await list_kb_resource()
    assert "Test KB" in result
    assert "AI" in result


@pytest.mark.asyncio
async def test_get_kb_detail(sample_kb):
    result = await get_kb_detail(kb_id=sample_kb["project_id"])
    assert "Test KB" in result
    assert "paper_count" in result


@pytest.mark.asyncio
async def test_get_paper_resource(sample_kb):
    result = await get_paper_resource(paper_id=sample_kb["paper_id"])
    assert "Deep Learning" in result
    assert "10.1234/test" in result


@pytest.mark.asyncio
async def test_get_paper_chunks_empty(sample_kb):
    result = await get_paper_chunks(paper_id=sample_kb["paper_id"])
    assert "No chunks found" in result or '"chunks": []' in result
