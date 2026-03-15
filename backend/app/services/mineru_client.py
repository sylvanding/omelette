"""MinerU API client — communicates with the standalone MinerU FastAPI service."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class MinerUClient:
    """Async HTTP client for the MinerU PDF parsing service."""

    def __init__(
        self,
        base_url: str | None = None,
        backend: str | None = None,
        timeout: int | None = None,
    ):
        self.base_url = (base_url or settings.mineru_api_url).rstrip("/")
        self.backend = backend or settings.mineru_backend
        self.timeout = timeout or settings.mineru_timeout

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"{self.base_url}/docs")
                return resp.status_code == 200
        except Exception:
            return False

    async def parse_pdf(
        self,
        pdf_path: str | Path,
        *,
        backend: str | None = None,
        formula_enable: bool = True,
        table_enable: bool = True,
        return_content_list: bool = False,
        lang_list: list[str] | None = None,
        start_page: int = 0,
        end_page: int = 99999,
    ) -> dict[str, Any]:
        """Send a PDF to MinerU for parsing and return the result.

        Returns dict with keys: md_content, content_list (optional), backend, version.
        On failure returns {"error": "..."}.
        """
        pdf_path = Path(pdf_path)
        if not pdf_path.exists():
            return {"error": f"File not found: {pdf_path}"}

        use_backend = backend or self.backend
        data: dict[str, Any] = {
            "backend": use_backend,
            "return_md": "true",
            "return_content_list": str(return_content_list).lower(),
            "return_images": "false",
            "formula_enable": str(formula_enable).lower(),
            "table_enable": str(table_enable).lower(),
            "start_page_id": str(start_page),
            "end_page_id": str(end_page),
        }
        if lang_list:
            for lang in lang_list:
                data.setdefault("lang_list", []).append(lang)

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                with pdf_path.open("rb") as f:
                    files = {"files": (pdf_path.name, f, "application/pdf")}
                    resp = await client.post(
                        f"{self.base_url}/file_parse",
                        data=data,
                        files=files,
                    )

                if resp.status_code != 200:
                    return {"error": f"MinerU API returned {resp.status_code}: {resp.text[:500]}"}

                body = resp.json()

                if isinstance(body, dict) and "error" in body:
                    return {"error": body["error"]}

                results = body.get("results", {})
                if not results:
                    return {"error": "MinerU returned empty results"}

                file_result = next(iter(results.values()))
                return {
                    "md_content": file_result.get("md_content", ""),
                    "content_list": file_result.get("content_list", []),
                    "backend": body.get("backend", use_backend),
                    "version": body.get("version", "unknown"),
                }

        except httpx.TimeoutException:
            return {"error": f"MinerU API timeout after {self.timeout}s"}
        except httpx.ConnectError:
            return {"error": f"Cannot connect to MinerU at {self.base_url}"}
        except Exception as e:
            logger.error("MinerU parse failed for %s: %s", pdf_path, e, exc_info=True)
            return {"error": str(e)}
