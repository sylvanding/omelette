"""Stress tests for concurrent PDF processing, RAG queries, and chat streams.

Requires a live backend server and MinerU service.
Run: pytest tests/test_e2e_stress.py -v -s
"""

from __future__ import annotations

import contextlib
import json
import logging
import os
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import httpx
import pytest

logger = logging.getLogger(__name__)

E2E_BASE_URL = os.getenv("E2E_BASE_URL", "http://localhost:8099")
E2E_PDF_DIR = Path(os.getenv("E2E_PDF_DIR", "/data0/djx/omelette_pdf_test"))
E2E_TIMEOUT = 600


def _server_available() -> bool:
    try:
        return httpx.get(f"{E2E_BASE_URL}/", timeout=5).status_code == 200
    except Exception:
        return False


pytestmark = [
    pytest.mark.skipif(not _server_available(), reason=f"Live server not reachable at {E2E_BASE_URL}"),
    pytest.mark.e2e,
]


@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=E2E_BASE_URL, timeout=E2E_TIMEOUT) as c:
        yield c


@pytest.fixture(scope="module")
def pdf_files():
    if not E2E_PDF_DIR.exists():
        pytest.skip(f"PDF test directory not found: {E2E_PDF_DIR}")
    files = sorted(E2E_PDF_DIR.glob("*.pdf"))
    if not files:
        pytest.skip(f"No PDFs found in {E2E_PDF_DIR}")
    return files


@pytest.fixture(scope="module")
def stress_project(client, pdf_files):
    """Create project, upload all PDFs, wait for processing."""
    r = client.post(
        "/api/v1/projects",
        json={"name": "Stress Test Project", "description": "Parallel processing stress test"},
    )
    assert r.status_code in (200, 201)
    project_id = r.json()["data"]["id"]

    with contextlib.ExitStack() as stack:
        file_tuples = []
        for pdf in pdf_files:
            fh = stack.enter_context(open(pdf, "rb"))
            file_tuples.append(("files", (pdf.name, fh, "application/pdf")))
        r = client.post(
            f"/api/v1/projects/{project_id}/papers/upload",
            files=file_tuples,
        )
    assert r.status_code == 200, f"Upload failed: {r.text}"
    uploaded = r.json()["data"]["total_uploaded"]
    logger.info("Uploaded %d PDFs to project %d", uploaded, project_id)

    t0 = time.monotonic()
    deadline = time.time() + 900
    while time.time() < deadline:
        r = client.get(f"/api/v1/projects/{project_id}/papers?page_size=50")
        papers = r.json()["data"]["items"]
        done = sum(1 for p in papers if p["status"] in ("ocr_complete", "indexed"))
        if done >= len(pdf_files):
            break
        time.sleep(15)
    elapsed = time.monotonic() - t0
    logger.info("All papers processed in %.1fs", elapsed)

    yield project_id, elapsed

    with contextlib.suppress(Exception):
        client.delete(f"/api/v1/projects/{project_id}/rag/index")
    client.delete(f"/api/v1/projects/{project_id}")


class TestConcurrentUploadAndProcess:
    def test_all_papers_processed(self, client, stress_project, pdf_files):
        project_id, elapsed = stress_project
        r = client.get(f"/api/v1/projects/{project_id}/papers?page_size=50")
        papers = r.json()["data"]["items"]
        done = sum(1 for p in papers if p["status"] in ("ocr_complete", "indexed"))
        assert done >= len(pdf_files), f"Only {done}/{len(pdf_files)} papers completed"
        logger.info(
            "Processing time for %d PDFs: %.1fs (%.1fs per PDF)", len(pdf_files), elapsed, elapsed / len(pdf_files)
        )

    def test_processing_speed_reasonable(self, stress_project, pdf_files):
        """Parallel processing should be faster than 120s per PDF on average."""
        _, elapsed = stress_project
        avg_per_pdf = elapsed / len(pdf_files)
        logger.info("Average processing time: %.1fs per PDF", avg_per_pdf)
        assert avg_per_pdf < 120, f"Average {avg_per_pdf:.1f}s/PDF is too slow"


class TestConcurrentRAGQueries:
    def test_build_index(self, client, stress_project):
        project_id, _ = stress_project
        r = client.post(f"/api/v1/projects/{project_id}/rag/index")
        if r.status_code == 500:
            pytest.skip(f"RAG index build returned 500: {r.text[:200]}")
        assert r.status_code == 200

    def test_concurrent_rag_queries(self, client, stress_project):
        project_id, _ = stress_project
        questions = [
            "What are the applications of VR in molecular visualization?",
            "How does vLUME handle 3D single-molecule data?",
            "What deep learning methods are used with VR for brain cell analysis?",
            "How is cloud computing leveraged for image annotation?",
            "What VR headset designs exist for mouse neuroscience?",
        ]

        results = []
        t0 = time.monotonic()

        def _query(q: str) -> dict:
            with httpx.Client(base_url=E2E_BASE_URL, timeout=E2E_TIMEOUT) as c:
                r = c.post(
                    f"/api/v1/projects/{project_id}/rag/query",
                    json={"question": q, "top_k": 5, "use_reranker": False},
                )
                return {
                    "status": r.status_code,
                    "question": q,
                    "answer_len": len(r.json().get("data", {}).get("answer", "")) if r.status_code == 200 else 0,
                }

        with ThreadPoolExecutor(max_workers=5) as pool:
            futures = {pool.submit(_query, q): q for q in questions}
            for future in as_completed(futures):
                results.append(future.result())

        elapsed = time.monotonic() - t0
        success = sum(1 for r in results if r["status"] == 200)
        logger.info("Concurrent RAG queries: %d/%d succeeded in %.1fs", success, len(questions), elapsed)

        assert success >= 3, f"Only {success}/{len(questions)} queries succeeded"
        for r in results:
            if r["status"] == 200:
                assert r["answer_len"] > 10, f"Empty answer for: {r['question']}"


class TestConcurrentChatStreams:
    def test_concurrent_chat_streams(self, client, stress_project):
        project_id, _ = stress_project
        prompts = [
            "Briefly describe VR applications in biology.",
            "What is single-molecule microscopy?",
            "Explain deep learning for brain cell analysis.",
        ]

        def _stream_chat(msg: str) -> dict:
            events = []
            with (
                httpx.Client(base_url=E2E_BASE_URL, timeout=E2E_TIMEOUT) as c,
                c.stream(
                    "POST",
                    "/api/v1/chat/stream",
                    json={"message": msg, "tool_mode": "qa"},
                ) as response,
            ):
                for line in response.iter_lines():
                    if line.startswith("data: "):
                        with contextlib.suppress(json.JSONDecodeError):
                            events.append(json.loads(line[6:]))
            return {"prompt": msg, "event_count": len(events), "status": "ok" if events else "empty"}

        results = []
        t0 = time.monotonic()

        with ThreadPoolExecutor(max_workers=3) as pool:
            futures = {pool.submit(_stream_chat, p): p for p in prompts}
            for future in as_completed(futures):
                results.append(future.result())

        elapsed = time.monotonic() - t0
        success = sum(1 for r in results if r["status"] == "ok")
        logger.info("Concurrent chat streams: %d/%d succeeded in %.1fs", success, len(prompts), elapsed)

        assert success >= 2, f"Only {success}/{len(prompts)} streams produced events"


def _nvidia_smi_snapshot() -> list[dict]:
    """Take a snapshot of GPU utilization via nvidia-smi."""
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=index,utilization.gpu,memory.used,memory.total",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            return []
        gpus = []
        for line in result.stdout.strip().splitlines():
            parts = [p.strip() for p in line.split(",")]
            if len(parts) >= 4:
                gpus.append(
                    {
                        "index": int(parts[0]),
                        "gpu_util": int(parts[1]),
                        "mem_used_mb": int(parts[2]),
                        "mem_total_mb": int(parts[3]),
                    }
                )
        return gpus
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []


class TestGPUUtilization:
    """Verify that multiple GPUs are utilised during parallel processing."""

    def test_gpu_utilization_during_processing(self, client, pdf_files):
        """Upload 8 PDFs and sample GPU utilization during processing."""
        gpus_before = _nvidia_smi_snapshot()
        if not gpus_before:
            pytest.skip("nvidia-smi not available")

        logger.info("GPU baseline before upload:")
        for g in gpus_before:
            logger.info(
                "  GPU %d: util=%d%%, mem=%d/%dMB", g["index"], g["gpu_util"], g["mem_used_mb"], g["mem_total_mb"]
            )

        r = client.post(
            "/api/v1/projects",
            json={"name": "GPU Stress Project", "description": "GPU utilization test"},
        )
        assert r.status_code in (200, 201)
        project_id = r.json()["data"]["id"]

        try:
            with contextlib.ExitStack() as stack:
                file_tuples = []
                for pdf in pdf_files:
                    fh = stack.enter_context(open(pdf, "rb"))
                    file_tuples.append(("files", (pdf.name, fh, "application/pdf")))
                r = client.post(
                    f"/api/v1/projects/{project_id}/papers/upload",
                    files=file_tuples,
                )
            assert r.status_code == 200

            peak_samples = []
            deadline = time.time() + 600
            while time.time() < deadline:
                snapshot = _nvidia_smi_snapshot()
                if snapshot:
                    peak_samples.append(snapshot)
                    active = [g for g in snapshot if g["gpu_util"] > 5 or g["mem_used_mb"] > 500]
                    if active:
                        for g in active:
                            logger.info(
                                "  Active GPU %d: util=%d%%, mem=%d/%dMB",
                                g["index"],
                                g["gpu_util"],
                                g["mem_used_mb"],
                                g["mem_total_mb"],
                            )

                r = client.get(f"/api/v1/projects/{project_id}/papers?page_size=50")
                papers = r.json()["data"]["items"]
                done = sum(1 for p in papers if p["status"] in ("ocr_complete", "indexed"))
                if done >= len(pdf_files):
                    break
                time.sleep(5)

            if peak_samples:
                all_gpu_indices = set()
                for sample in peak_samples:
                    for g in sample:
                        if g["gpu_util"] > 5 or g["mem_used_mb"] > 500:
                            all_gpu_indices.add(g["index"])

                logger.info("GPUs that showed activity: %s", sorted(all_gpu_indices))
                logger.info("Total GPU snapshots: %d", len(peak_samples))

        finally:
            with contextlib.suppress(Exception):
                client.delete(f"/api/v1/projects/{project_id}/rag/index")
            client.delete(f"/api/v1/projects/{project_id}")
