"""Review service: systematic review workflow with LLM data extraction."""

from __future__ import annotations

import csv
import io
import json
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)

EXTRACTION_SYSTEM = (
    "You are a research data extraction assistant. Given a scientific paper's title, abstract, "
    "and available content, extract structured data according to the specified column definitions. "
    "Each column has a name and description. Return ONLY valid JSON with the structure: "
    '{"extracted_data": {"column_name": "extracted_value"}, "confidence": 0.85}'
)


class ReviewService:
    """Service for managing systematic reviews and extracting data from papers."""

    def __init__(self, llm: LLMClient):
        self.llm = llm

    async def extract_paper_data(self, paper: dict, columns: list[dict]) -> dict:
        """Extract structured data from a single paper based on column definitions.

        Args:
            paper: Dict with paper_id, title, abstract, and optionally full_text.
            columns: List of dicts with 'name' and 'description' keys.

        Returns:
            Dict with extracted_data dict and confidence score.
        """
        column_descriptions = "\n".join(f"- {c['name']}: {c.get('description', '')}" for c in columns)
        column_names = [c["name"] for c in columns]

        paper_content = f"Title: {paper.get('title', '')}\nAbstract: {(paper.get('abstract') or '')[:2000]}"
        if paper.get("full_text"):
            paper_content += f"\n\nFull Text:\n{paper['full_text'][:5000]}"

        messages = [
            {"role": "system", "content": EXTRACTION_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"Extract the following columns from this paper:\n\n{column_descriptions}\n\n"
                    f"Paper:\n{paper_content}\n\n"
                    f"Return a JSON object with 'extracted_data' (keys: {', '.join(column_names)}) "
                    "and 'confidence' (float 0-1)."
                ),
            },
        ]

        try:
            result = await self.llm.chat_json(
                messages,
                temperature=0.3,
                task_type="review_extraction",
            )

            extracted_data = result.get("extracted_data", {})
            confidence = result.get("confidence", 0.0)

            # Validate extracted_data has all columns
            for col_name in column_names:
                if col_name not in extracted_data:
                    extracted_data[col_name] = ""

            return {"extracted_data": extracted_data, "confidence": float(confidence)}

        except Exception:
            logger.exception("Failed to extract data for paper %s", paper.get("paper_id"))
            return {
                "extracted_data": {c["name"]: "" for c in columns},
                "confidence": 0.0,
            }

    def export_to_csv(self, columns: list[dict], extractions: list[dict], papers: dict[int, dict]) -> str:
        """Export review data to CSV format.

        Args:
            columns: List of column definitions.
            extractions: List of extraction records with extracted_data.
            papers: Dict mapping paper_id to paper metadata.

        Returns:
            CSV string.
        """
        output = io.StringIO()
        writer = csv.writer(output)

        # Header row
        header = ["Paper ID", "Title", "Year", "Citation Count"] + [c["name"] for c in columns]
        writer.writerow(header)

        # Data rows
        for ext in extractions:
            paper_info = papers.get(ext.get("paper_id"), {})
            row = [
                ext.get("paper_id", ""),
                paper_info.get("title", ""),
                paper_info.get("year", ""),
                paper_info.get("citation_count", ""),
            ]
            extracted = ext.get("extracted_data", {})
            if isinstance(extracted, str):
                try:
                    extracted = json.loads(extracted)
                except json.JSONDecodeError:
                    extracted = {}
            for col in columns:
                row.append(extracted.get(col["name"], ""))
            writer.writerow(row)

        return output.getvalue()
