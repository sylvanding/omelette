"""Tests for MCP server tools and resources."""

from unittest.mock import AsyncMock, patch

import pytest

from app.database import Base, async_session_factory, engine
from app.mcp_server import (
    add_paper_by_doi,
    analyze_gaps,
    find_citations,
    generate_review_outline,
    get_kb_detail,
    get_paper_chunks,
    get_paper_resource,
    get_paper_summary,
    list_kb_resource,
    list_knowledge_bases,
    lookup_paper,
    manage_keywords,
    search_knowledge_base,
    search_papers_by_keyword,
    summarize_papers,
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


# --- New Tool Tests ---


@pytest.mark.asyncio
@patch("app.services.rag_service.RAGService")
async def test_search_knowledge_base_success(mock_rag_cls, sample_kb):
    mock_rag = AsyncMock()
    mock_rag.query.return_value = {
        "answer": "Deep learning excels at NLP tasks.",
        "sources": [
            {"paper_title": "Deep Learning for NLP", "page_number": 1, "relevance_score": 0.95, "excerpt": "A survey."}
        ],
    }
    mock_rag_cls.return_value = mock_rag

    result = await search_knowledge_base(query="deep learning NLP", kb_id=sample_kb["project_id"])
    assert "Deep learning excels" in result
    assert "Deep Learning for NLP" in result
    assert "0.95" in result


@pytest.mark.asyncio
async def test_search_knowledge_base_invalid_top_k(sample_kb):
    result = await search_knowledge_base(query="test", kb_id=sample_kb["project_id"], top_k=0)
    assert "Error" in result

    result = await search_knowledge_base(query="test", kb_id=sample_kb["project_id"], top_k=51)
    assert "Error" in result


@pytest.mark.asyncio
@patch("app.services.rag_service.RAGService")
async def test_find_citations_success(mock_rag_cls, sample_kb):
    mock_rag = AsyncMock()
    mock_rag.query.return_value = {
        "answer": "",
        "sources": [
            {"paper_title": "Deep Learning for NLP", "relevance_score": 0.88, "page_number": 3, "excerpt": "Methods."}
        ],
    }
    mock_rag_cls.return_value = mock_rag

    result = await find_citations(text="Deep learning methods for text analysis", kb_id=sample_kb["project_id"])
    assert "Potential Citations" in result
    assert "Deep Learning for NLP" in result


@pytest.mark.asyncio
@patch("app.services.rag_service.RAGService")
async def test_find_citations_empty(mock_rag_cls, sample_kb):
    mock_rag = AsyncMock()
    mock_rag.query.return_value = {"answer": "", "sources": []}
    mock_rag_cls.return_value = mock_rag

    result = await find_citations(text="unrelated topic", kb_id=sample_kb["project_id"])
    assert "No potential citation" in result


@pytest.mark.asyncio
@patch("app.mcp_server._fetch_crossref_metadata")
async def test_add_paper_by_doi_success(mock_crossref, sample_kb):
    mock_crossref.return_value = {
        "title": "New Paper",
        "authors": [{"name": "Jane Doe"}],
        "year": 2025,
        "journal": "Science",
        "abstract": "Abstract text.",
    }
    result = await add_paper_by_doi(doi="10.5678/newpaper", kb_id=sample_kb["project_id"])
    assert "Paper Added" in result
    assert "New Paper" in result


@pytest.mark.asyncio
@patch("app.mcp_server._fetch_crossref_metadata")
async def test_add_paper_by_doi_duplicate(mock_crossref, sample_kb):
    result = await add_paper_by_doi(doi="10.1234/test", kb_id=sample_kb["project_id"])
    assert "already exists" in result
    mock_crossref.assert_not_called()


@pytest.mark.asyncio
async def test_add_paper_by_doi_invalid_doi(sample_kb):
    result = await add_paper_by_doi(doi="invalid-doi", kb_id=sample_kb["project_id"])
    assert "Error" in result


@pytest.mark.asyncio
async def test_add_paper_by_doi_kb_not_found():
    result = await add_paper_by_doi(doi="10.1234/valid", kb_id=99999)
    assert "not found" in result


@pytest.mark.asyncio
@patch("app.services.search_service.SearchService")
async def test_search_papers_by_keyword_success(mock_search_cls):
    mock_svc = AsyncMock()
    mock_svc.search.return_value = {
        "papers": [
            {"title": "Paper A", "authors": [{"name": "Auth1"}], "year": 2024, "doi": "10.1/a", "source": "arxiv"}
        ],
        "total": 1,
    }
    mock_search_cls.return_value = mock_svc

    result = await search_papers_by_keyword(query="machine learning")
    assert "Paper A" in result
    assert "Auth1" in result


@pytest.mark.asyncio
async def test_search_papers_by_keyword_invalid_max_results():
    result = await search_papers_by_keyword(query="test", max_results=0)
    assert "Error" in result

    result = await search_papers_by_keyword(query="test", max_results=101)
    assert "Error" in result


@pytest.mark.asyncio
@patch("app.services.writing_service.WritingService")
async def test_summarize_papers(mock_writing_cls, sample_kb):
    mock_svc = AsyncMock()
    mock_svc.summarize.return_value = {"content": "This is a summary of the papers."}
    mock_writing_cls.return_value = mock_svc

    result = await summarize_papers(kb_id=sample_kb["project_id"])
    assert "Summary" in result
    assert "summary of the papers" in result


@pytest.mark.asyncio
@patch("app.services.writing_service.WritingService")
async def test_generate_review_outline(mock_writing_cls, sample_kb):
    mock_svc = AsyncMock()
    mock_svc.generate_review_outline.return_value = {"outline": "1. Introduction\n2. Methods\n3. Results"}
    mock_writing_cls.return_value = mock_svc

    result = await generate_review_outline(kb_id=sample_kb["project_id"], topic="deep learning NLP")
    assert "Review Outline" in result
    assert "Introduction" in result


@pytest.mark.asyncio
@patch("app.services.writing_service.WritingService")
async def test_analyze_gaps(mock_writing_cls, sample_kb):
    mock_svc = AsyncMock()
    mock_svc.analyze_gaps.return_value = {"analysis": "Gap 1: Limited multimodal studies."}
    mock_writing_cls.return_value = mock_svc

    result = await analyze_gaps(kb_id=sample_kb["project_id"], research_topic="VR in biology")
    assert "Gap Analysis" in result
    assert "multimodal" in result


@pytest.mark.asyncio
async def test_manage_keywords_list_empty(sample_kb):
    result = await manage_keywords(kb_id=sample_kb["project_id"], action="list")
    assert "No keywords" in result


@pytest.mark.asyncio
async def test_manage_keywords_add_and_list(sample_kb):
    add_result = await manage_keywords(kb_id=sample_kb["project_id"], action="add", term="deep learning")
    assert "Added" in add_result

    list_result = await manage_keywords(kb_id=sample_kb["project_id"], action="list")
    assert "deep learning" in list_result


@pytest.mark.asyncio
async def test_manage_keywords_delete(sample_kb):
    await manage_keywords(kb_id=sample_kb["project_id"], action="add", term="to_delete")
    delete_result = await manage_keywords(kb_id=sample_kb["project_id"], action="delete", term="to_delete")
    assert "Deleted" in delete_result


@pytest.mark.asyncio
async def test_manage_keywords_delete_not_found(sample_kb):
    result = await manage_keywords(kb_id=sample_kb["project_id"], action="delete", term="nonexistent")
    assert "not found" in result


@pytest.mark.asyncio
async def test_manage_keywords_invalid_action(sample_kb):
    result = await manage_keywords(kb_id=sample_kb["project_id"], action="invalid")
    assert "Error" in result


@pytest.mark.asyncio
async def test_manage_keywords_add_requires_term(sample_kb):
    result = await manage_keywords(kb_id=sample_kb["project_id"], action="add")
    assert "Error" in result


@pytest.mark.asyncio
@patch("app.services.keyword_service.KeywordService")
async def test_manage_keywords_expand(mock_kw_cls, sample_kb):
    mock_svc = AsyncMock()
    mock_svc.expand_keywords.return_value = {"expanded_terms": [{"term": "neural networks", "relation": "synonym"}]}
    mock_kw_cls.return_value = mock_svc

    result = await manage_keywords(kb_id=sample_kb["project_id"], action="expand", term="deep learning")
    assert "Expanded" in result
    assert "neural networks" in result
