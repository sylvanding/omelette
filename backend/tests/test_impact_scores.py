"""Tests for ImpactScoreService and impact scores API endpoint."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Base, async_session_factory, engine
from app.main import app
from app.models import Paper, Project


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
    async with async_session_factory() as session:
        project = Project(name="Impact Score Test", domain="AI")
        session.add(project)
        await session.flush()

        papers = [
            Paper(
                project_id=project.id,
                title="Seminal Deep Learning Paper",
                doi="10.1234/sdl1",
                source_id="s2:sdl1",
                authors=[{"name": "Alice"}],
                year=2024,
                journal="Nature",
                citation_count=500,
                quality_tags=["high_quality"],
                rating=5,
            ),
            Paper(
                project_id=project.id,
                title="Recent Survey",
                doi="10.1234/rs1",
                source_id="s2:rs1",
                authors=[{"name": "Bob"}],
                year=2025,
                journal="Nature",
                citation_count=50,
                rating=3,
            ),
            Paper(
                project_id=project.id,
                title="Old Classic",
                doi="10.1234/oc1",
                source_id="s2:oc1",
                authors=[{"name": "Carol"}],
                year=2015,
                journal="Science",
                citation_count=1000,
                quality_tags=["weak_evidence"],
                rating=2,
            ),
            Paper(
                project_id=project.id,
                title="Untitled Draft",
                source_id="s2:draft1",
                authors=[],
                year=None,
                journal="",
                citation_count=0,
                rating=0,
            ),
        ]
        for p in papers:
            session.add(p)
        await session.commit()
        return {"project_id": project.id}


class TestImpactScoreService:
    """Unit tests for ImpactScoreService."""

    async def test_returns_scores_for_all_papers(self, project_with_papers):
        from app.services.impact_score_service import ImpactScoreService

        info = project_with_papers
        async with async_session_factory() as session:
            svc = ImpactScoreService(session)
            result = await svc.compute_scores(info["project_id"])

        assert len(result) == 4
        for entry in result:
            assert "paper_id" in entry
            assert "title" in entry
            assert "score" in entry
            assert "factors" in entry

    async def test_score_bounded_0_to_100(self, project_with_papers):
        from app.services.impact_score_service import ImpactScoreService

        info = project_with_papers
        async with async_session_factory() as session:
            svc = ImpactScoreService(session)
            result = await svc.compute_scores(info["project_id"])

        for entry in result:
            assert 0 <= entry["score"] <= 100, f"Score {entry['score']} out of bounds"

    async def test_high_citation_paper_scores_higher_on_citations(self, project_with_papers):
        from app.services.impact_score_service import ImpactScoreService

        info = project_with_papers
        async with async_session_factory() as session:
            svc = ImpactScoreService(session)
            result = await svc.compute_scores(info["project_id"])

        high_cite = next(e for e in result if e["paper_id"] == 3)
        low_cite = next(e for e in result if e["paper_id"] == 4)

        assert high_cite["factors"]["citations"]["normalized"] > low_cite["factors"]["citations"]["normalized"]

    async def test_recent_paper_scores_higher_on_recency(self, project_with_papers):
        from app.services.impact_score_service import ImpactScoreService

        info = project_with_papers
        async with async_session_factory() as session:
            svc = ImpactScoreService(session)
            result = await svc.compute_scores(info["project_id"])

        recent = next(e for e in result if e["paper_id"] == 2)
        old = next(e for e in result if e["paper_id"] == 3)

        assert recent["factors"]["recency"]["normalized"] > old["factors"]["recency"]["normalized"]

    async def test_positive_quality_tags_boost_evidence_score(self, project_with_papers):
        from app.services.impact_score_service import ImpactScoreService

        info = project_with_papers
        async with async_session_factory() as session:
            svc = ImpactScoreService(session)
            result = await svc.compute_scores(info["project_id"])

        positive = next(e for e in result if e["paper_id"] == 1)
        negative = next(e for e in result if e["paper_id"] == 3)

        assert (
            positive["factors"]["evidence_consensus"]["normalized"]
            > negative["factors"]["evidence_consensus"]["normalized"]
        )

    async def test_factor_breakdown_contains_all_factors(self, project_with_papers):
        from app.services.impact_score_service import ImpactScoreService

        info = project_with_papers
        async with async_session_factory() as session:
            svc = ImpactScoreService(session)
            result = await svc.compute_scores(info["project_id"])

        expected_factors = {"citations", "recency", "journal", "evidence_consensus", "field_percentile"}
        for entry in result:
            assert set(entry["factors"].keys()) == expected_factors

    async def test_empty_project_returns_empty_list(self):
        from app.services.impact_score_service import ImpactScoreService

        async with async_session_factory() as session:
            project = Project(name="Empty Impact Project", domain="AI")
            session.add(project)
            await session.commit()
            project_id = project.id

        async with async_session_factory() as session:
            svc = ImpactScoreService(session)
            result = await svc.compute_scores(project_id)

        assert result == []

    async def test_paper_without_year_has_recency_score(self, project_with_papers):
        from app.services.impact_score_service import ImpactScoreService

        info = project_with_papers
        async with async_session_factory() as session:
            svc = ImpactScoreService(session)
            result = await svc.compute_scores(info["project_id"])

        no_year = next(e for e in result if e["factors"]["recency"]["year"] is None)
        assert 0 < no_year["factors"]["recency"]["normalized"] < 1

    async def test_composite_score_uses_correct_weights(self, project_with_papers):
        from app.services.impact_score_service import (
            CITATION_WEIGHT,
            EVIDENCE_WEIGHT,
            FIELD_WEIGHT,
            JOURNAL_WEIGHT,
            RECENCY_WEIGHT,
        )

        assert CITATION_WEIGHT == 0.30
        assert RECENCY_WEIGHT == 0.20
        assert JOURNAL_WEIGHT == 0.20
        assert EVIDENCE_WEIGHT == 0.15
        assert FIELD_WEIGHT == 0.15
        assert abs(CITATION_WEIGHT + RECENCY_WEIGHT + JOURNAL_WEIGHT + EVIDENCE_WEIGHT + FIELD_WEIGHT - 1.0) < 0.001


class TestImpactScoresAPI:
    """API endpoint tests for impact scores."""

    @pytest.mark.asyncio
    async def test_impact_scores_endpoint(self, client: AsyncClient, project_with_papers):
        info = project_with_papers
        resp = await client.get(f"/api/v1/projects/{info['project_id']}/analysis/impact-scores")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "scores" in data
        assert "total" in data
        assert "avg_score" in data
        assert "top_paper_id" in data
        assert data["total"] == 4

    @pytest.mark.asyncio
    async def test_impact_scores_empty_project(self, client: AsyncClient):
        async with async_session_factory() as session:
            project = Project(name="Empty API Project", domain="AI")
            session.add(project)
            await session.commit()
            project_id = project.id

        resp = await client.get(f"/api/v1/projects/{project_id}/analysis/impact-scores")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total"] == 0
        assert data["scores"] == []

    @pytest.mark.asyncio
    async def test_impact_scores_project_not_found(self, client: AsyncClient):
        resp = await client.get("/api/v1/projects/99999/analysis/impact-scores")
        assert resp.status_code in (404, 500)
