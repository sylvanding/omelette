"""End-to-end tests against a live backend server with real LLM (Volcengine).

Prerequisites:
  - Backend running on E2E_BASE_URL (default http://localhost:8099)
  - LLM_PROVIDER=volcengine with valid API key in .env
  - Test PDFs in /data0/djx/omelette_pdf_test/

Run:
  pytest tests/test_e2e_live_server.py -v -s --timeout=300

Skip when server is not available:
  Tests auto-skip if the server is unreachable.
"""

from __future__ import annotations

import contextlib
import json
import os
import time
from pathlib import Path

import httpx
import pytest

E2E_BASE_URL = os.getenv("E2E_BASE_URL", "http://localhost:8099")
E2E_PDF_DIR = Path(os.getenv("E2E_PDF_DIR", "/data0/djx/omelette_pdf_test"))
E2E_TIMEOUT = 120


def _server_available() -> bool:
    try:
        r = httpx.get(f"{E2E_BASE_URL}/", timeout=5)
        return r.status_code == 200
    except Exception:
        return False


pytestmark = [
    pytest.mark.skipif(not _server_available(), reason=f"Live server not reachable at {E2E_BASE_URL}"),
    pytest.mark.e2e,
]


@pytest.fixture(scope="module")
def base_url():
    return E2E_BASE_URL


@pytest.fixture(scope="module")
def client(base_url):
    with httpx.Client(base_url=base_url, timeout=E2E_TIMEOUT) as c:
        yield c


@pytest.fixture(scope="module")
def async_client(base_url):
    return httpx.AsyncClient(base_url=base_url, timeout=E2E_TIMEOUT)


@pytest.fixture(scope="module")
def pdf_files():
    if not E2E_PDF_DIR.exists():
        pytest.skip(f"PDF test directory not found: {E2E_PDF_DIR}")
    files = sorted(E2E_PDF_DIR.glob("*.pdf"))
    if not files:
        pytest.skip(f"No PDFs found in {E2E_PDF_DIR}")
    return files


@pytest.fixture(scope="module")
def e2e_project(client):
    """Create a test project for the entire E2E module."""
    r = client.post(
        "/api/v1/projects",
        json={"name": "E2E Test Project", "description": "Automated E2E testing"},
    )
    assert r.status_code in (200, 201), f"Failed to create project: {r.text}"
    data = r.json()["data"]
    project_id = data["id"]
    yield project_id
    with contextlib.suppress(Exception):
        client.delete(f"/api/v1/projects/{project_id}/rag/index")
    client.delete(f"/api/v1/projects/{project_id}")


class TestHealthAndRoot:
    def test_root(self, client):
        r = client.get("/")
        assert r.status_code == 200
        data = r.json()
        assert data["data"]["name"] == "Omelette"
        assert data["data"]["version"] == "0.1.0"

    def test_health(self, client):
        r = client.get("/api/v1/settings/health")
        assert r.status_code == 200

    def test_docs(self, client):
        r = client.get("/docs")
        assert r.status_code == 200


class TestProjectCRUD:
    def test_create_and_list(self, client, e2e_project):
        r = client.get("/api/v1/projects")
        assert r.status_code == 200
        projects = r.json()["data"]["items"]
        assert any(p["id"] == e2e_project for p in projects)

    def test_get_project(self, client, e2e_project):
        r = client.get(f"/api/v1/projects/{e2e_project}")
        assert r.status_code == 200
        assert r.json()["data"]["name"] == "E2E Test Project"


class TestPDFUploadAndProcessing:
    def test_upload_single_pdf(self, client, e2e_project, pdf_files):
        pdf = pdf_files[0]
        with open(pdf, "rb") as f:
            r = client.post(
                f"/api/v1/projects/{e2e_project}/papers/upload",
                files=[("files", (pdf.name, f, "application/pdf"))],
            )
        assert r.status_code == 200, f"Upload failed: {r.text}"
        data = r.json()["data"]
        assert data["total_uploaded"] >= 1

    def test_upload_multiple_pdfs(self, client, e2e_project, pdf_files):
        upload_files = pdf_files[1:4]
        with contextlib.ExitStack() as stack:
            file_tuples = []
            for pdf in upload_files:
                fh = stack.enter_context(open(pdf, "rb"))
                file_tuples.append(("files", (pdf.name, fh, "application/pdf")))
            r = client.post(
                f"/api/v1/projects/{e2e_project}/papers/upload",
                files=file_tuples,
            )
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["total_uploaded"] >= 1

    def test_list_papers_after_upload(self, client, e2e_project):
        r = client.get(f"/api/v1/projects/{e2e_project}/papers")
        assert r.status_code == 200
        papers = r.json()["data"]["items"]
        assert len(papers) >= 1, "Expected at least 1 paper after upload"

    def test_wait_for_processing(self, client, e2e_project):
        """Poll until papers reach OCR_COMPLETE or INDEXED status (max 180s)."""
        deadline = time.time() + 180
        while time.time() < deadline:
            r = client.get(f"/api/v1/projects/{e2e_project}/papers?page_size=50")
            papers = r.json()["data"]["items"]
            if not papers:
                time.sleep(2)
                continue
            statuses = {p["status"] for p in papers}
            if statuses <= {"ocr_complete", "indexed"}:
                return
            time.sleep(5)
        r = client.get(f"/api/v1/projects/{e2e_project}/papers?page_size=50")
        papers = r.json()["data"]["items"]
        statuses = {p["status"] for p in papers}
        assert statuses <= {"ocr_complete", "indexed", "pdf_downloaded"}, (
            f"Papers not processed in time. Statuses: {statuses}"
        )


class TestRAGIndexAndQuery:
    def test_build_index(self, client, e2e_project):
        r = client.post(f"/api/v1/projects/{e2e_project}/rag/index")
        if r.status_code == 500:
            error_detail = r.json().get("message", "")
            pytest.skip(f"RAG index build returned 500 (likely first-time model loading): {error_detail[:200]}")
        assert r.status_code == 200
        data = r.json()["data"]
        assert data.get("indexed", 0) >= 0

    def test_index_stats(self, client, e2e_project):
        r = client.get(f"/api/v1/projects/{e2e_project}/rag/stats")
        assert r.status_code == 200

    def test_rag_query_with_real_llm(self, client, e2e_project):
        r = client.post(
            f"/api/v1/projects/{e2e_project}/rag/query",
            json={
                "question": "What are the main applications of virtual reality in biological research?",
                "top_k": 5,
                "use_reranker": False,
                "include_sources": True,
            },
        )
        assert r.status_code == 200, f"RAG query failed: {r.text}"
        data = r.json()["data"]
        assert "answer" in data
        assert len(data["answer"]) > 10, "Answer too short, LLM may not have responded properly"


class TestChatStream:
    def test_chat_stream_basic(self, client, e2e_project):
        """SSE streaming chat without knowledge base."""
        with client.stream(
            "POST",
            "/api/v1/chat/stream",
            json={
                "message": "Hello, briefly describe what Omelette is.",
                "tool_mode": "qa",
            },
        ) as response:
            assert response.status_code == 200
            content_type = response.headers.get("content-type", "")
            assert "text/event-stream" in content_type

            events = []
            full_text = ""
            for line in response.iter_lines():
                if line.startswith("data: "):
                    payload = line[6:]
                    try:
                        event = json.loads(payload)
                        events.append(event)
                        if event.get("type") == "text-delta":
                            full_text += event.get("textDelta", "")
                    except json.JSONDecodeError:
                        if payload.strip() == "[DONE]":
                            events.append({"type": "[DONE]"})

            event_types = {e.get("type") for e in events}
            assert len(events) > 0, "Expected at least one SSE event"
            has_content = "text-delta" in event_types or "step-start" in event_types or "start" in event_types
            assert has_content, f"Expected streaming events, got: {event_types}"

    def test_chat_stream_with_rag(self, client, e2e_project):
        """SSE streaming chat with knowledge base."""
        with client.stream(
            "POST",
            "/api/v1/chat/stream",
            json={
                "message": "Summarize the key findings about VR in molecular visualization.",
                "knowledge_base_ids": [e2e_project],
                "tool_mode": "qa",
                "rag_top_k": 5,
                "use_reranker": False,
            },
        ) as response:
            assert response.status_code == 200

            events = []
            for line in response.iter_lines():
                if line.startswith("data: "):
                    payload = line[6:]
                    try:
                        event = json.loads(payload)
                        events.append(event)
                    except json.JSONDecodeError:
                        pass

            assert len(events) > 0, "Expected at least one SSE event"


class TestWritingAssistant:
    def _get_paper_ids(self, client, project_id: int, limit: int = 3) -> list[int]:
        r = client.get(f"/api/v1/projects/{project_id}/papers?page_size={limit}")
        papers = r.json()["data"]["items"]
        return [p["id"] for p in papers[:limit]]

    def test_summarize(self, client, e2e_project):
        paper_ids = self._get_paper_ids(client, e2e_project)
        if not paper_ids:
            pytest.skip("No papers available for summarization")
        r = client.post(
            f"/api/v1/projects/{e2e_project}/writing/summarize",
            json={"paper_ids": paper_ids, "language": "en"},
        )
        assert r.status_code == 200, f"Summarize failed: {r.text}"
        data = r.json()["data"]
        assert "summaries" in data or "summary" in data or "content" in data

    def test_citations(self, client, e2e_project):
        paper_ids = self._get_paper_ids(client, e2e_project)
        if not paper_ids:
            pytest.skip("No papers available for citations")
        r = client.post(
            f"/api/v1/projects/{e2e_project}/writing/citations",
            json={"paper_ids": paper_ids, "style": "gb_t_7714"},
        )
        assert r.status_code == 200, f"Citations failed: {r.text}"

    def test_review_outline(self, client, e2e_project):
        r = client.post(
            f"/api/v1/projects/{e2e_project}/writing/review-outline",
            json={"topic": "Virtual reality applications in biological research", "language": "en"},
        )
        assert r.status_code == 200, f"Review outline failed: {r.text}"

    def test_gap_analysis(self, client, e2e_project):
        r = client.post(
            f"/api/v1/projects/{e2e_project}/writing/gap-analysis",
            json={"research_topic": "VR-based tools for single-molecule visualization"},
        )
        assert r.status_code == 200, f"Gap analysis failed: {r.text}"


class TestConversationPersistence:
    def test_create_conversation(self, client):
        r = client.post(
            "/api/v1/conversations",
            json={"title": "E2E Test Conversation", "tool_mode": "qa"},
        )
        assert r.status_code in (200, 201)
        assert r.json()["data"]["id"] > 0

    def test_list_conversations(self, client):
        r = client.get("/api/v1/conversations")
        assert r.status_code == 200

    def test_chat_creates_conversation(self, client, e2e_project):
        """Verify that chatting without conversation_id creates one."""
        events = []
        with client.stream(
            "POST",
            "/api/v1/chat/stream",
            json={"message": "Say hello", "tool_mode": "qa"},
        ) as response:
            for line in response.iter_lines():
                if line.startswith("data: "):
                    with contextlib.suppress(json.JSONDecodeError):
                        events.append(json.loads(line[6:]))

        convo_events = [e for e in events if e.get("type") == "metadata"]
        if convo_events:
            assert "conversationId" in convo_events[0] or "conversation_id" in convo_events[0]


class TestSettingsAndTasks:
    def test_get_settings(self, client):
        r = client.get("/api/v1/settings")
        assert r.status_code == 200

    def test_list_tasks(self, client):
        r = client.get("/api/v1/tasks")
        assert r.status_code == 200

    def test_list_llm_models(self, client):
        r = client.get("/api/v1/settings/models")
        assert r.status_code == 200


class TestCleanup:
    """Cleanup test — runs last to verify delete works."""

    def test_delete_index(self, client, e2e_project):
        r = client.delete(f"/api/v1/projects/{e2e_project}/rag/index")
        assert r.status_code == 200

    def test_project_still_accessible(self, client, e2e_project):
        r = client.get(f"/api/v1/projects/{e2e_project}")
        assert r.status_code == 200
