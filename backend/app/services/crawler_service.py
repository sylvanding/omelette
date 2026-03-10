"""PDF crawler service — download papers via Unpaywall, arXiv, and direct URLs."""

import hashlib
import logging
from pathlib import Path

import httpx

from app.config import settings
from app.models import Paper, PaperStatus

logger = logging.getLogger(__name__)


def _get_proxy() -> str | None:
    return settings.http_proxy or None


class CrawlerService:
    """Downloads PDFs with priority-based multi-channel fallback."""

    def __init__(self):
        self.pdf_dir = Path(settings.pdf_dir)
        self.pdf_dir.mkdir(parents=True, exist_ok=True)

    async def download_paper(self, paper: Paper) -> dict:
        """Try multiple channels to download a PDF for a paper."""
        channels = self._get_channels(paper)

        for channel_name, url in channels:
            if not url:
                continue
            try:
                result = await self._download_pdf(url, paper)
                if result["success"]:
                    result["channel"] = channel_name
                    return result
            except Exception as e:
                logger.warning(f"Channel {channel_name} failed for paper {paper.id}: {e}")
                continue

        return {"success": False, "error": "All download channels failed", "paper_id": paper.id}

    def _get_channels(self, paper: Paper) -> list[tuple[str, str]]:
        """Determine download channels in priority order."""
        channels = []

        # 1. Direct PDF URL (if already known)
        if paper.pdf_url:
            channels.append(("direct", paper.pdf_url))

        # 2. Unpaywall (requires DOI)
        if paper.doi:
            unpaywall_url = self._build_unpaywall_url(paper.doi)
            channels.append(("unpaywall", unpaywall_url))

        # 3. arXiv (if source is arXiv)
        if paper.source == "arxiv" and paper.source_id:
            arxiv_id = paper.source_id.replace("arxiv:", "")
            channels.append(("arxiv", f"https://arxiv.org/pdf/{arxiv_id}.pdf"))

        # 4. Semantic Scholar PDF (if available in metadata)
        if paper.extra_metadata:
            oa = paper.extra_metadata.get("openAccessPdf")
            url = oa.get("url") if isinstance(oa, dict) else oa
            if url:
                channels.append(("semantic_scholar", url))

        return channels

    def _build_unpaywall_url(self, doi: str) -> str:
        """Build Unpaywall API URL for a DOI."""
        email = settings.unpaywall_email or "test@example.com"
        return f"https://api.unpaywall.org/v2/{doi}?email={email}"

    async def _download_pdf(self, url: str, paper: Paper) -> dict:
        """Download a PDF from a URL and save to disk."""
        proxy = _get_proxy()
        timeout = httpx.Timeout(60.0, connect=15.0)

        async with httpx.AsyncClient(proxy=proxy, timeout=timeout, follow_redirects=True) as client:
            # If Unpaywall, first get the OA URL
            if "api.unpaywall.org" in url:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
                best_oa = data.get("best_oa_location", {})
                pdf_url = best_oa.get("url_for_pdf") or best_oa.get("url") if best_oa else None
                if not pdf_url:
                    return {"success": False, "error": "No open access PDF found"}
                url = pdf_url

            # Download the actual PDF
            resp = await client.get(
                url,
                headers={"User-Agent": "Omelette/0.1 (Scientific Literature Manager)"},
            )
            resp.raise_for_status()

            content_type = resp.headers.get("content-type", "")
            if "pdf" not in content_type and resp.content[:5] != b"%PDF-":
                return {"success": False, "error": f"Not a PDF: {content_type}"}

            # Save file
            file_path = self._get_file_path(paper)
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_bytes(resp.content)

            # Verify integrity
            md5 = hashlib.md5(resp.content).hexdigest()
            file_size = len(resp.content)

            return {
                "success": True,
                "paper_id": paper.id,
                "file_path": str(file_path),
                "file_size": file_size,
                "md5": md5,
            }

    def _get_file_path(self, paper: Paper) -> Path:
        """Generate file path: pdfs/{year}/{sanitized_doi_or_id}.pdf"""
        year = str(paper.year) if paper.year else "unknown"
        safe_name = paper.doi.replace("/", "_").replace(":", "_") if paper.doi else f"paper_{paper.id}"
        return self.pdf_dir / year / f"{safe_name}.pdf"

    async def batch_download(self, papers: list[Paper], max_concurrent: int = 5) -> dict:
        """Download PDFs for multiple papers with concurrency control."""
        import asyncio

        semaphore = asyncio.Semaphore(max_concurrent)
        results = {"success": 0, "failed": 0, "skipped": 0, "details": []}

        async def _download_one(paper: Paper):
            if paper.status in (
                PaperStatus.PDF_DOWNLOADED,
                PaperStatus.OCR_COMPLETE,
                PaperStatus.INDEXED,
            ):
                results["skipped"] += 1
                return

            async with semaphore:
                result = await self.download_paper(paper)
                results["details"].append(result)
                if result["success"]:
                    results["success"] += 1
                else:
                    results["failed"] += 1

        tasks = [_download_one(p) for p in papers]
        await asyncio.gather(*tasks, return_exceptions=True)

        return results

    def get_storage_stats(self) -> dict:
        """Return storage statistics."""
        if not self.pdf_dir.exists():
            return {"total_files": 0, "total_size_mb": 0}

        total_files = 0
        total_size = 0
        for f in self.pdf_dir.rglob("*.pdf"):
            total_files += 1
            total_size += f.stat().st_size

        return {
            "total_files": total_files,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "storage_path": str(self.pdf_dir),
        }
