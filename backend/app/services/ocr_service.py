"""OCR service — extract text from PDFs using pdfplumber (native) and PaddleOCR (scanned)."""

import json
import logging
from pathlib import Path

import pdfplumber

from app.config import settings

logger = logging.getLogger(__name__)


class OCRService:
    """Extracts text from PDFs. Prioritizes native text layer, falls back to PaddleOCR."""

    def __init__(self, use_gpu: bool = True, gpu_id: int = 0):
        self.use_gpu = use_gpu
        self.gpu_id = gpu_id
        self._paddle_ocr = None
        self.output_dir = Path(settings.ocr_output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def extract_text_native(self, pdf_path: str) -> list[dict]:
        """Extract text from native (non-scanned) PDF using pdfplumber."""
        pages = []
        try:
            with pdfplumber.open(pdf_path) as pdf:
                for i, page in enumerate(pdf.pages):
                    text = page.extract_text() or ""
                    tables = page.extract_tables() or []

                    page_data = {
                        "page_number": i + 1,
                        "text": text,
                        "tables": tables,
                        "has_text": bool(text.strip()),
                        "char_count": len(text),
                    }
                    pages.append(page_data)
        except Exception as e:
            logger.error("Failed to extract text from %s: %s", pdf_path, e)
            return []

        return pages

    def _get_paddle_ocr(self):
        """Lazy-initialize PaddleOCR (heavy import)."""
        if self._paddle_ocr is not None:
            return self._paddle_ocr

        try:
            from paddleocr import PaddleOCR

            self._paddle_ocr = PaddleOCR(
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
                lang="en",
            )
            return self._paddle_ocr
        except ImportError:
            logger.warning("PaddleOCR not installed. OCR for scanned PDFs unavailable.")
            return None

    def extract_text_ocr(self, pdf_path: str) -> list[dict]:
        """Extract text from scanned PDF using PaddleOCR."""
        ocr = self._get_paddle_ocr()
        if ocr is None:
            return []

        pages = []
        try:
            # PaddleOCR 3.x uses predict(); 2.x uses ocr() with images
            if hasattr(ocr, "predict"):
                result = ocr.predict(pdf_path)
            else:
                # PaddleOCR 2.x: convert PDF to images via PyMuPDF
                import fitz

                pdf_doc = fitz.open(pdf_path)
                result = []
                for page_num in range(len(pdf_doc)):
                    page = pdf_doc[page_num]
                    pix = page.get_pixmap(dpi=150)
                    img_path = f"/tmp/omelette_ocr_page_{page_num}.png"
                    pix.save(img_path)
                    page_result = ocr.ocr(img_path, cls=False)
                    result.append(page_result[0] if page_result else [])
                    Path(img_path).unlink(missing_ok=True)
                pdf_doc.close()

            for i, page_result in enumerate(result):
                text_lines = []
                if hasattr(page_result, "rec_texts"):
                    text_lines = page_result.rec_texts
                elif isinstance(page_result, dict) and "rec_texts" in page_result:
                    text_lines = page_result["rec_texts"]
                elif isinstance(page_result, list):
                    text_lines = [
                        item[-1][0] if isinstance(item[-1], (list, tuple)) else str(item)
                        for item in page_result
                    ]

                pages.append({
                    "page_number": i + 1,
                    "text": "\n".join(text_lines) if text_lines else "",
                    "ocr_results": text_lines,
                    "has_text": bool(text_lines),
                    "method": "paddleocr",
                })
        except Exception as e:
            logger.error("PaddleOCR failed for %s: %s", pdf_path, e)

        return pages

    def process_pdf(self, pdf_path: str, force_ocr: bool = False) -> dict:
        """Process a PDF: try native extraction first, fall back to OCR if needed."""
        path = Path(pdf_path)
        if not path.exists():
            return {"error": f"File not found: {pdf_path}", "pages": []}

        # Try native extraction first
        if not force_ocr:
            pages = self.extract_text_native(pdf_path)

            # Check if native extraction yielded enough text
            total_chars = sum(p["char_count"] for p in pages)
            pages_with_text = sum(1 for p in pages if p["has_text"])

            if pages and pages_with_text >= len(pages) * 0.5 and total_chars > 100:
                return {
                    "method": "native",
                    "pages": pages,
                    "total_pages": len(pages),
                    "total_chars": total_chars,
                    "pages_with_text": pages_with_text,
                }

        # Fall back to OCR
        logger.info("Using OCR for %s", pdf_path)
        pages = self.extract_text_ocr(pdf_path)
        total_chars = sum(len(p.get("text", "")) for p in pages)

        return {
            "method": "paddleocr" if pages else "failed",
            "pages": pages,
            "total_pages": len(pages),
            "total_chars": total_chars,
            "pages_with_text": sum(1 for p in pages if p.get("has_text")),
        }

    def save_result(self, paper_id: int, result: dict) -> Path:
        """Save OCR result to JSON file."""
        output_path = self.output_dir / f"paper_{paper_id}.json"
        output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2))
        return output_path

    def chunk_text(self, pages: list[dict], chunk_size: int = 1024, overlap: int = 100) -> list[dict]:
        """Split extracted text into chunks for RAG indexing."""
        chunks = []
        current_chunk = ""
        current_page = 0
        chunk_index = 0

        for page in pages:
            text = page.get("text", "")
            if not text.strip():
                continue

            # Split by paragraphs first
            paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

            for para in paragraphs:
                if len(current_chunk) + len(para) > chunk_size and current_chunk:
                    chunks.append({
                        "content": current_chunk.strip(),
                        "page_number": current_page,
                        "chunk_index": chunk_index,
                        "chunk_type": "text",
                        "token_count": len(current_chunk.split()),
                    })
                    # Keep overlap
                    words = current_chunk.split()
                    overlap_text = " ".join(words[-overlap:]) if len(words) > overlap else ""
                    current_chunk = overlap_text + " " + para
                    chunk_index += 1
                else:
                    current_chunk += "\n\n" + para if current_chunk else para
                    current_page = page["page_number"]

        # Add final chunk
        if current_chunk.strip():
            chunks.append({
                "content": current_chunk.strip(),
                "page_number": current_page,
                "chunk_index": chunk_index,
                "chunk_type": "text",
                "token_count": len(current_chunk.split()),
            })

        # Also extract tables as separate chunks
        for page in pages:
            for table in page.get("tables", []):
                if table:
                    table_text = "\n".join([" | ".join(str(cell) for cell in row if cell) for row in table if row])
                    if table_text.strip():
                        chunk_index += 1
                        chunks.append({
                            "content": table_text,
                            "page_number": page["page_number"],
                            "chunk_index": chunk_index,
                            "chunk_type": "table",
                            "token_count": len(table_text.split()),
                        })

        return chunks
