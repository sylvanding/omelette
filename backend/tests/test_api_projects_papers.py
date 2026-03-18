"""Comprehensive API tests for Projects, Papers, and Upload modules."""

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.database import Base, engine
from app.main import app

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
async def setup_db():
    """Create tables before each test, drop after."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client():
    """Async HTTP client for in-process testing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def project_id(client: AsyncClient) -> int:
    """Create a project and return its ID."""
    resp = await client.post("/api/v1/projects", json={"name": "Test Project", "domain": "optics"})
    assert resp.status_code == 201
    return resp.json()["data"]["id"]


def make_minimal_pdf() -> bytes:
    """Create a minimal valid PDF that PyMuPDF can open."""
    import fitz

    doc = fitz.open()
    doc.new_page()
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


@pytest.fixture
def minimal_pdf_bytes() -> bytes:
    """Minimal valid PDF bytes for upload tests."""
    return make_minimal_pdf()


# ---------------------------------------------------------------------------
# Projects API
# ---------------------------------------------------------------------------


class TestProjectsAPI:
    """Tests for /api/v1/projects endpoints."""

    @pytest.mark.asyncio
    async def test_list_projects_empty(self, client: AsyncClient):
        resp = await client.get("/api/v1/projects")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        assert body["data"]["items"] == []
        assert body["data"]["total"] == 0
        assert body["data"]["page"] == 1
        assert body["data"]["page_size"] == 20

    @pytest.mark.asyncio
    async def test_list_projects_paginated(self, client: AsyncClient):
        for i in range(5):
            await client.post("/api/v1/projects", json={"name": f"Project {i}"})

        resp = await client.get("/api/v1/projects?page=1&page_size=2")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        assert len(body["data"]["items"]) == 2
        assert body["data"]["total"] == 5
        assert body["data"]["page"] == 1
        assert body["data"]["page_size"] == 2
        assert body["data"]["total_pages"] == 3

    @pytest.mark.asyncio
    async def test_list_projects_page_2(self, client: AsyncClient):
        for i in range(5):
            await client.post("/api/v1/projects", json={"name": f"Project {i}"})

        resp = await client.get("/api/v1/projects?page=2&page_size=2")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["data"]["items"]) == 2
        assert body["data"]["page"] == 2

    @pytest.mark.asyncio
    async def test_create_project(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/projects",
            json={
                "name": "Super-Resolution Microscopy",
                "description": "Literature review for SRM techniques",
                "domain": "optics",
            },
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["code"] == 201
        assert body["data"]["name"] == "Super-Resolution Microscopy"
        assert body["data"]["description"] == "Literature review for SRM techniques"
        assert body["data"]["domain"] == "optics"
        assert body["data"]["id"] > 0

    @pytest.mark.asyncio
    async def test_create_project_validation_error_empty_name(self, client: AsyncClient):
        resp = await client.post("/api/v1/projects", json={"name": ""})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_get_project(self, client: AsyncClient):
        create_resp = await client.post("/api/v1/projects", json={"name": "Test Project"})
        project_id = create_resp.json()["data"]["id"]

        resp = await client.get(f"/api/v1/projects/{project_id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["name"] == "Test Project"
        assert body["data"]["paper_count"] == 0
        assert body["data"]["keyword_count"] == 0

    @pytest.mark.asyncio
    async def test_get_project_404(self, client: AsyncClient):
        resp = await client.get("/api/v1/projects/99999")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_update_project(self, client: AsyncClient):
        create_resp = await client.post("/api/v1/projects", json={"name": "Old Name"})
        project_id = create_resp.json()["data"]["id"]

        resp = await client.put(
            f"/api/v1/projects/{project_id}",
            json={"name": "New Name", "description": "Updated desc"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["name"] == "New Name"
        assert body["data"]["description"] == "Updated desc"

    @pytest.mark.asyncio
    async def test_update_project_partial(self, client: AsyncClient):
        create_resp = await client.post(
            "/api/v1/projects",
            json={"name": "Original", "description": "Keep this"},
        )
        project_id = create_resp.json()["data"]["id"]

        resp = await client.put(f"/api/v1/projects/{project_id}", json={"name": "Only Name Changed"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["name"] == "Only Name Changed"
        assert body["data"]["description"] == "Keep this"

    @pytest.mark.asyncio
    async def test_update_project_404(self, client: AsyncClient):
        resp = await client.put("/api/v1/projects/99999", json={"name": "New Name"})
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_project(self, client: AsyncClient):
        create_resp = await client.post("/api/v1/projects", json={"name": "To Delete"})
        project_id = create_resp.json()["data"]["id"]

        resp = await client.delete(f"/api/v1/projects/{project_id}")
        assert resp.status_code == 200
        assert resp.json().get("message") == "Project deleted"

        resp = await client.get(f"/api/v1/projects/{project_id}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_project_404(self, client: AsyncClient):
        resp = await client.delete("/api/v1/projects/99999")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Papers API
# ---------------------------------------------------------------------------


class TestPapersAPI:
    """Tests for /api/v1/projects/{project_id}/papers endpoints."""

    @pytest.mark.asyncio
    async def test_list_papers_empty(self, client: AsyncClient, project_id: int):
        resp = await client.get(f"/api/v1/projects/{project_id}/papers")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        assert body["data"]["items"] == []
        assert body["data"]["total"] == 0

    @pytest.mark.asyncio
    async def test_list_papers_paginated(self, client: AsyncClient, project_id: int):
        for i in range(5):
            await client.post(
                f"/api/v1/projects/{project_id}/papers",
                json={"title": f"Paper {i}", "abstract": f"Abstract {i}"},
            )

        resp = await client.get(f"/api/v1/projects/{project_id}/papers?page=1&page_size=2")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["data"]["items"]) == 2
        assert body["data"]["total"] == 5
        assert body["data"]["page"] == 1
        assert body["data"]["page_size"] == 2

    @pytest.mark.asyncio
    async def test_list_papers_search(self, client: AsyncClient, project_id: int):
        await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Machine Learning in Biology", "abstract": "ML techniques"},
        )
        await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Deep Learning", "abstract": "Neural networks"},
        )

        resp = await client.get(f"/api/v1/projects/{project_id}/papers?q=Biology")
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["total"] == 1
        assert "Biology" in body["data"]["items"][0]["title"]

    @pytest.mark.asyncio
    async def test_list_papers_filter_status(self, client: AsyncClient, project_id: int):
        await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Paper 1", "abstract": "A1"},
        )
        resp = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Paper 2", "abstract": "A2"},
        )
        paper_id = resp.json()["data"]["id"]

        await client.put(
            f"/api/v1/projects/{project_id}/papers/{paper_id}",
            json={"status": "indexed"},
        )

        resp = await client.get(f"/api/v1/projects/{project_id}/papers?status=indexed")
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["total"] == 1
        assert body["data"]["items"][0]["status"] == "indexed"

    @pytest.mark.asyncio
    async def test_list_papers_filter_year(self, client: AsyncClient, project_id: int):
        await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Paper 2020", "abstract": "A", "year": 2020},
        )
        await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Paper 2021", "abstract": "A", "year": 2021},
        )

        resp = await client.get(f"/api/v1/projects/{project_id}/papers?year=2020")
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["total"] == 1
        assert body["data"]["items"][0]["year"] == 2020

    @pytest.mark.asyncio
    async def test_list_papers_sort(self, client: AsyncClient, project_id: int):
        await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Alpha", "abstract": "A"},
        )
        await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Beta", "abstract": "B"},
        )

        resp = await client.get(f"/api/v1/projects/{project_id}/papers?sort_by=title&order=asc")
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["items"][0]["title"] == "Alpha"

    @pytest.mark.asyncio
    async def test_create_paper(self, client: AsyncClient, project_id: int):
        resp = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={
                "title": "Deep Learning for Microscopy",
                "abstract": "We present a novel approach.",
                "doi": "10.1234/test",
                "year": 2024,
                "journal": "Nature Methods",
            },
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["code"] == 201
        assert body["data"]["title"] == "Deep Learning for Microscopy"
        assert body["data"]["doi"] == "10.1234/test"
        assert body["data"]["year"] == 2024
        assert body["data"]["project_id"] == project_id

    @pytest.mark.asyncio
    async def test_create_paper_validation_error_empty_title(self, client: AsyncClient, project_id: int):
        resp = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "", "abstract": "A"},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_get_paper(self, client: AsyncClient, project_id: int):
        create_resp = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Test Paper", "abstract": "Abstract"},
        )
        paper_id = create_resp.json()["data"]["id"]

        resp = await client.get(f"/api/v1/projects/{project_id}/papers/{paper_id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["title"] == "Test Paper"

    @pytest.mark.asyncio
    async def test_get_paper_404(self, client: AsyncClient, project_id: int):
        resp = await client.get(f"/api/v1/projects/{project_id}/papers/99999")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_get_nonexistent_paper_404(self, client: AsyncClient, project_id: int):
        """Request non-existent paper returns 404."""
        resp = await client.get(f"/api/v1/projects/{project_id}/papers/99999")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_list_paper_chunks_empty(self, client: AsyncClient, project_id: int):
        """Get chunks for paper with no chunks returns empty list."""
        create_resp = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Paper Without Chunks", "abstract": "A"},
        )
        paper_id = create_resp.json()["data"]["id"]

        resp = await client.get(f"/api/v1/projects/{project_id}/papers/{paper_id}/chunks")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        assert body["data"]["items"] == []
        assert body["data"]["total"] == 0

    @pytest.mark.asyncio
    async def test_get_paper_wrong_project(self, client: AsyncClient, project_id: int):
        other_resp = await client.post("/api/v1/projects", json={"name": "Other Project"})
        other_project_id = other_resp.json()["data"]["id"]

        create_resp = await client.post(
            f"/api/v1/projects/{other_project_id}/papers",
            json={"title": "Other Paper", "abstract": "A"},
        )
        paper_id = create_resp.json()["data"]["id"]

        resp = await client.get(f"/api/v1/projects/{project_id}/papers/{paper_id}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_update_paper(self, client: AsyncClient, project_id: int):
        create_resp = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Original", "abstract": "A"},
        )
        paper_id = create_resp.json()["data"]["id"]

        resp = await client.put(
            f"/api/v1/projects/{project_id}/papers/{paper_id}",
            json={"title": "Updated Title", "notes": "My notes"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["title"] == "Updated Title"
        assert body["data"]["notes"] == "My notes"

    @pytest.mark.asyncio
    async def test_update_paper_404(self, client: AsyncClient, project_id: int):
        resp = await client.put(
            f"/api/v1/projects/{project_id}/papers/99999",
            json={"title": "Updated"},
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_paper(self, client: AsyncClient, project_id: int):
        create_resp = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "To Delete", "abstract": "A"},
        )
        paper_id = create_resp.json()["data"]["id"]

        resp = await client.delete(f"/api/v1/projects/{project_id}/papers/{paper_id}")
        assert resp.status_code == 200

        resp = await client.get(f"/api/v1/projects/{project_id}/papers/{paper_id}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_paper_404(self, client: AsyncClient, project_id: int):
        resp = await client.delete(f"/api/v1/projects/{project_id}/papers/99999")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_serve_pdf_success(self, client: AsyncClient, project_id: int, minimal_pdf_bytes: bytes):
        pdf_dir = Path(settings.pdf_dir)
        project_pdf_dir = pdf_dir / str(project_id)
        project_pdf_dir.mkdir(parents=True, exist_ok=True)
        pdf_path = project_pdf_dir / "test_paper.pdf"
        pdf_path.write_bytes(minimal_pdf_bytes)

        create_resp = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={
                "title": "Paper With PDF",
                "abstract": "A",
            },
        )
        paper_id = create_resp.json()["data"]["id"]

        from app.database import async_session_factory
        from app.models import Paper

        async with async_session_factory() as session:
            from sqlalchemy import select

            result = await session.execute(select(Paper).where(Paper.id == paper_id))
            paper = result.scalar_one()
            paper.pdf_path = str(pdf_path)
            await session.commit()

        resp = await client.get(f"/api/v1/projects/{project_id}/papers/{paper_id}/pdf")
        assert resp.status_code == 200
        assert resp.headers.get("content-type") == "application/pdf"
        assert resp.content == minimal_pdf_bytes

    @pytest.mark.asyncio
    async def test_serve_pdf_not_found(self, client: AsyncClient, project_id: int):
        create_resp = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "No PDF", "abstract": "A"},
        )
        paper_id = create_resp.json()["data"]["id"]

        resp = await client.get(f"/api/v1/projects/{project_id}/papers/{paper_id}/pdf")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_serve_pdf_paper_404(self, client: AsyncClient, project_id: int):
        resp = await client.get(f"/api/v1/projects/{project_id}/papers/99999/pdf")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_list_papers_project_404(self, client: AsyncClient):
        resp = await client.get("/api/v1/projects/99999/papers")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Upload API
# ---------------------------------------------------------------------------


class TestUploadAPI:
    """Tests for /api/v1/projects/{project_id}/papers/upload endpoint."""

    @pytest.mark.asyncio
    async def test_upload_single_pdf(self, client: AsyncClient, project_id: int, minimal_pdf_bytes: bytes):
        files = [("files", ("test.pdf", minimal_pdf_bytes, "application/pdf"))]
        resp = await client.post(
            f"/api/v1/projects/{project_id}/papers/upload",
            files=files,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        assert body["data"]["total_uploaded"] == 1
        assert len(body["data"]["papers"]) == 1
        assert body["data"]["conflicts"] == []

    @pytest.mark.asyncio
    async def test_upload_multiple_pdfs(self, client: AsyncClient, project_id: int, minimal_pdf_bytes: bytes):
        files = [
            ("files", ("paper1.pdf", minimal_pdf_bytes, "application/pdf")),
            ("files", ("paper2.pdf", minimal_pdf_bytes, "application/pdf")),
            ("files", ("paper3.pdf", minimal_pdf_bytes, "application/pdf")),
        ]
        resp = await client.post(
            f"/api/v1/projects/{project_id}/papers/upload",
            files=files,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        assert body["data"]["total_uploaded"] == 3
        assert len(body["data"]["papers"]) == 3

    @pytest.mark.asyncio
    async def test_upload_empty_file_422(self, client: AsyncClient, project_id: int):
        files = [("files", ("empty.pdf", b"", "application/pdf"))]
        resp = await client.post(
            f"/api/v1/projects/{project_id}/papers/upload",
            files=files,
        )
        assert resp.status_code == 422
        body = resp.json()
        assert "empty" in body.get("message", "").lower()

    @pytest.mark.asyncio
    async def test_upload_file_exceeds_size_limit_413(
        self, client: AsyncClient, project_id: int, minimal_pdf_bytes: bytes
    ):
        # Upload endpoint limits to 50MB
        oversized = minimal_pdf_bytes + b"x" * (51 * 1024 * 1024)
        files = [("files", ("huge.pdf", oversized, "application/pdf"))]
        resp = await client.post(
            f"/api/v1/projects/{project_id}/papers/upload",
            files=files,
        )
        assert resp.status_code == 413

    @pytest.mark.asyncio
    async def test_upload_non_pdf_skipped(self, client: AsyncClient, project_id: int, minimal_pdf_bytes: bytes):
        files = [
            ("files", ("paper.pdf", minimal_pdf_bytes, "application/pdf")),
            ("files", ("readme.txt", b"not a pdf", "text/plain")),
        ]
        resp = await client.post(
            f"/api/v1/projects/{project_id}/papers/upload",
            files=files,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["total_uploaded"] == 1
        assert len(body["data"]["papers"]) == 1

    @pytest.mark.asyncio
    async def test_upload_project_404(self, minimal_pdf_bytes: bytes):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            files = [("files", ("test.pdf", minimal_pdf_bytes, "application/pdf"))]
            resp = await client.post(
                "/api/v1/projects/99999/papers/upload",
                files=files,
            )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_upload_creates_papers_in_db(self, client: AsyncClient, project_id: int, minimal_pdf_bytes: bytes):
        files = [("files", ("test.pdf", minimal_pdf_bytes, "application/pdf"))]
        await client.post(
            f"/api/v1/projects/{project_id}/papers/upload",
            files=files,
        )

        resp = await client.get(f"/api/v1/projects/{project_id}/papers")
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["total"] == 1
        assert body["data"]["items"][0]["status"] == "pdf_downloaded"
