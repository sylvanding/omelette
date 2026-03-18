"""Automatic pipeline: crawl → OCR → index for newly added papers."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Paper, PaperStatus
from app.models.chunk import PaperChunk
from app.services.crawler_service import CrawlerService
from app.services.ocr_service import OCRService
from app.services.rag_service import RAGService

logger = logging.getLogger(__name__)


class PipelineService:
    """Orchestrates the crawl → OCR → index pipeline for papers."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def process_paper(self, paper_id: int) -> dict:
        """Run the full pipeline for a single paper: download → OCR → index."""
        paper = await self.db.get(Paper, paper_id)
        if not paper:
            return {"error": f"Paper {paper_id} not found"}

        result = {"paper_id": paper_id, "steps": []}

        if paper.status in (PaperStatus.PENDING, PaperStatus.METADATA_ONLY) and paper.pdf_url:
            dl_result = await self._download(paper)
            result["steps"].append({"step": "download", **dl_result})

        if paper.status == PaperStatus.PDF_DOWNLOADED and paper.pdf_path:
            ocr_result = await self._ocr(paper)
            result["steps"].append({"step": "ocr", **ocr_result})

        if paper.status == PaperStatus.OCR_COMPLETE:
            idx_result = await self._index(paper)
            result["steps"].append({"step": "index", **idx_result})

        await self.db.flush()
        return result

    async def process_project_pending(self, project_id: int) -> dict:
        """Process all pending/unindexed papers in a project."""
        stmt = select(Paper).where(
            Paper.project_id == project_id,
            Paper.status.notin_([PaperStatus.INDEXED, PaperStatus.ERROR]),
        )
        papers = (await self.db.execute(stmt)).scalars().all()

        results = []
        for paper in papers:
            r = await self.process_paper(paper.id)
            results.append(r)

        return {
            "project_id": project_id,
            "processed": len(results),
            "results": results,
        }

    async def _download(self, paper: Paper) -> dict:
        try:
            crawler = CrawlerService()
            dl = await crawler.download_paper(paper)
            if dl.get("success"):
                paper.pdf_path = dl.get("path", "")
                paper.status = PaperStatus.PDF_DOWNLOADED
                return {"success": True, "path": paper.pdf_path}
            return {"success": False, "reason": dl.get("error", "Download failed")}
        except Exception as e:
            logger.warning("Download failed for paper %d: %s", paper.id, e)
            return {"success": False, "reason": str(e)}

    async def _ocr(self, paper: Paper) -> dict:
        try:
            with OCRService(use_gpu=True) as ocr:
                result = await ocr.process_pdf_async(paper.pdf_path)

            if result.get("error"):
                paper.status = PaperStatus.ERROR
                return {"success": False, "reason": result["error"]}

            chunks = []
            if result.get("method") == "mineru":
                mineru_chunks = ocr.chunk_mineru_markdown(result["md_content"])
                for i, c in enumerate(mineru_chunks):
                    if c.get("content", "").strip():
                        chunks.append(
                            {
                                "paper_id": paper.id,
                                "content": c["content"],
                                "page_number": c.get("page_number", 1),
                                "chunk_index": i,
                            }
                        )
            else:
                pages = result.get("pages", [])
                for page in pages:
                    if page.get("text", "").strip():
                        chunks.append(
                            {
                                "paper_id": paper.id,
                                "content": page["text"],
                                "page_number": page.get("page_number", 0),
                                "chunk_index": len(chunks),
                            }
                        )

            for chunk_data in chunks:
                chunk = PaperChunk(**chunk_data)
                self.db.add(chunk)

            paper.status = PaperStatus.OCR_COMPLETE
            await self.db.flush()
            return {"success": True, "chunks": len(chunks)}
        except Exception as e:
            logger.warning("OCR failed for paper %d: %s", paper.id, e)
            paper.status = PaperStatus.ERROR
            return {"success": False, "reason": str(e)}

    async def _index(self, paper: Paper) -> dict:
        try:
            stmt = select(PaperChunk).where(PaperChunk.paper_id == paper.id)
            chunks = (await self.db.execute(stmt)).scalars().all()

            if not chunks:
                return {"success": False, "reason": "No chunks to index"}

            chunk_dicts = [
                {
                    "paper_id": paper.id,
                    "paper_title": paper.title,
                    "content": c.content,
                    "page_number": c.page_number,
                    "chunk_index": c.chunk_index,
                }
                for c in chunks
            ]

            rag = RAGService()
            idx_result = await rag.index_chunks(paper.project_id, chunk_dicts)

            paper.status = PaperStatus.INDEXED
            return {"success": True, "indexed_chunks": idx_result.get("indexed", 0)}
        except Exception as e:
            logger.warning("Index failed for paper %d: %s", paper.id, e)
            return {"success": False, "reason": str(e)}
