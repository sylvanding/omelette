"""Tests for Writing service and API endpoints."""

from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Base, async_session_factory, engine
from app.main import app
from app.models import Paper, PaperStatus, Project


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


# --- Unit tests: WritingService ---


@pytest.mark.asyncio
async def test_summarize_papers(project_with_papers):
    from app.services.llm.client import LLMClient
    from app.services.writing_service import WritingService

    project_id, paper_ids = project_with_papers
    async with async_session_factory() as session:
        llm = LLMClient(provider="mock")
        svc = WritingService(db=session, llm=llm)
        summaries = await svc.summarize_papers(paper_ids=paper_ids, language="en")

    assert len(summaries) == 2
    assert all("paper_id" in s and "title" in s and "summary" in s for s in summaries)
    assert summaries[0]["summary"]  # Mock returns content


@pytest.mark.asyncio
async def test_generate_citations_gb_t_7714(project_with_papers):
    from app.services.llm.client import LLMClient
    from app.services.writing_service import WritingService

    project_id, paper_ids = project_with_papers
    async with async_session_factory() as session:
        svc = WritingService(db=session, llm=LLMClient(provider="mock"))
        citations = await svc.generate_citations(paper_ids=paper_ids, style="gb_t_7714")

    assert len(citations) == 2
    for c in citations:
        assert c["style"] == "gb_t_7714"
        assert "citation" in c
        assert "paper_id" in c
        assert "Smith" in c["citation"] or "Jones" in c["citation"] or "Lee" in c["citation"]
        assert "Nature" in c["citation"] or "Science" in c["citation"]


@pytest.mark.asyncio
async def test_generate_citations_apa(project_with_papers):
    from app.services.llm.client import LLMClient
    from app.services.writing_service import WritingService

    project_id, paper_ids = project_with_papers
    async with async_session_factory() as session:
        svc = WritingService(db=session, llm=LLMClient(provider="mock"))
        citations = await svc.generate_citations(paper_ids=paper_ids, style="apa")

    assert len(citations) == 2
    for c in citations:
        assert c["style"] == "apa"
        assert "(" in c["citation"]  # APA has (year)


@pytest.mark.asyncio
async def test_generate_citations_mla(project_with_papers):
    from app.services.llm.client import LLMClient
    from app.services.writing_service import WritingService

    project_id, paper_ids = project_with_papers
    async with async_session_factory() as session:
        svc = WritingService(db=session, llm=LLMClient(provider="mock"))
        citations = await svc.generate_citations(paper_ids=paper_ids, style="mla")

    assert len(citations) == 2
    for c in citations:
        assert c["style"] == "mla"
        assert '"' in c["citation"]  # MLA uses quotes for title


@pytest.mark.asyncio
async def test_generate_review_outline(project_with_papers):
    from app.services.llm.client import LLMClient
    from app.services.writing_service import WritingService

    project_id, paper_ids = project_with_papers
    async with async_session_factory() as session:
        svc = WritingService(db=session, llm=LLMClient(provider="mock"))
        result = await svc.generate_review_outline(
            project_id=project_id,
            topic="Super-resolution microscopy",
            language="en",
        )

    assert "topic" in result
    assert result["topic"] == "Super-resolution microscopy"
    assert "outline" in result
    assert result["paper_count"] >= 1
    assert result["outline"]  # Mock returns content


@pytest.mark.asyncio
async def test_analyze_gaps(project_with_papers):
    from app.services.llm.client import LLMClient
    from app.services.writing_service import WritingService

    project_id, paper_ids = project_with_papers
    async with async_session_factory() as session:
        svc = WritingService(db=session, llm=LLMClient(provider="mock"))
        result = await svc.analyze_gaps(
            project_id=project_id,
            research_topic="Nanoscale imaging",
        )

    assert "topic" in result
    assert result["topic"] == "Nanoscale imaging"
    assert "analysis" in result
    assert result["papers_analyzed"] >= 1
    assert result["analysis"]  # Mock returns content


# --- API endpoint tests ---


@pytest.mark.asyncio
async def test_summarize_api(client: AsyncClient, project_with_papers):
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


@pytest.mark.asyncio
async def test_citations_api(client: AsyncClient, project_with_papers):
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


@pytest.mark.asyncio
async def test_citations_apa_api(client: AsyncClient, project_with_papers):
    project_id, paper_ids = project_with_papers
    resp = await client.post(
        f"/api/v1/projects/{project_id}/writing/citations",
        json={"paper_ids": paper_ids, "style": "apa"},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["style"] == "apa"


@pytest.mark.asyncio
async def test_review_outline_api(client: AsyncClient, project_with_papers):
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


@pytest.mark.asyncio
async def test_gap_analysis_api(client: AsyncClient, project_with_papers):
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


@pytest.mark.asyncio
async def test_assist_summarize(client: AsyncClient, project_with_papers):
    project_id, paper_ids = project_with_papers
    resp = await client.post(
        f"/api/v1/projects/{project_id}/writing/assist",
        json={"task": "summarize", "paper_ids": paper_ids, "language": "en"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["content"]


@pytest.mark.asyncio
async def test_assist_cite(client: AsyncClient, project_with_papers):
    project_id, paper_ids = project_with_papers
    resp = await client.post(
        f"/api/v1/projects/{project_id}/writing/assist",
        json={"task": "cite", "paper_ids": paper_ids, "style": "apa"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["content"] or body["data"]["citations"]


@pytest.mark.asyncio
async def test_assist_review_outline(client: AsyncClient, project_with_papers):
    project_id, _ = project_with_papers
    resp = await client.post(
        f"/api/v1/projects/{project_id}/writing/assist",
        json={"task": "review_outline", "topic": "Microscopy advances"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["content"]


@pytest.mark.asyncio
async def test_assist_gap_analysis(client: AsyncClient, project_with_papers):
    project_id, _ = project_with_papers
    resp = await client.post(
        f"/api/v1/projects/{project_id}/writing/assist",
        json={"task": "gap_analysis", "topic": "Imaging techniques"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["content"]


@pytest.mark.asyncio
async def test_assist_unknown_task(client: AsyncClient, project_with_papers):
    project_id, _ = project_with_papers
    resp = await client.post(
        f"/api/v1/projects/{project_id}/writing/assist",
        json={"task": "unknown_task"},
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["code"] == 400
    assert "Unknown task" in body["message"]


# --- Review Draft Stream tests ---


@pytest.mark.asyncio
async def test_review_draft_stream_endpoint(client: AsyncClient, project_with_papers):
    project_id, _ = project_with_papers

    async def mock_stream(*args, **kwargs):
        yield 'event: progress\ndata: {"step": 1, "message": "analyzing"}\n\n'
        yield 'event: done\ndata: {"total_sections": 0}\n\n'

    with patch(
        "app.services.writing_service.WritingService.generate_literature_review",
        side_effect=mock_stream,
    ):
        resp = await client.post(
            f"/api/v1/projects/{project_id}/writing/review-draft/stream",
            json={"topic": "Super-resolution microscopy", "style": "narrative", "language": "en"},
        )
    assert resp.status_code == 200
    assert resp.headers.get("content-type", "").startswith("text/event-stream")

    text = resp.text
    assert "event:" in text
    assert "data:" in text


@pytest.mark.asyncio
async def test_review_draft_stream_invalid_style(client: AsyncClient, project_with_papers):
    project_id, _ = project_with_papers
    resp = await client.post(
        f"/api/v1/projects/{project_id}/writing/review-draft/stream",
        json={"topic": "test", "style": "invalid_style"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_parse_outline_sections():
    from app.services.writing_service import _parse_outline_sections

    outline = """## Introduction
Background and context.

## Methods
Review of methodologies.

## Results
Key findings.
"""
    sections = _parse_outline_sections(outline)
    assert len(sections) == 3
    assert sections[0]["title"] == "Introduction"
    assert sections[1]["title"] == "Methods"
    assert sections[2]["title"] == "Results"


@pytest.mark.asyncio
async def test_parse_outline_sections_empty():
    from app.services.writing_service import _parse_outline_sections

    sections = _parse_outline_sections("No headings here, just plain text.")
    assert len(sections) == 0


@pytest.mark.asyncio
async def test_sse_helper():
    import json

    from app.services.writing_service import _sse

    result = _sse("test-event", {"key": "value"})
    assert result.startswith("event: test-event\n")
    assert "data:" in result
    data_line = result.split("\n")[1]
    parsed = json.loads(data_line.replace("data: ", ""))
    assert parsed["key"] == "value"
