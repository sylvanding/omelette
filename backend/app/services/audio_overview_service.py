"""Audio overview service: generates conversational dialogue scripts from paper content."""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from app.config import settings

if TYPE_CHECKING:
    from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)

DIALOGUE_SYSTEM_PROMPT = """You are an expert research communicator creating an engaging audio discussion between two hosts about academic papers.

Host 1 (Alex) is curious and asks clarifying questions.
Host 2 (Jordan) is knowledgeable and explains concepts clearly.

Create a natural, conversational dialogue that:
- Introduces the paper(s) and their main research question
- Explains the key methods and findings in accessible language
- Discusses implications and limitations
- Maintains scientific accuracy while being engaging

Return ONLY valid JSON with this structure:
{
  "title": "Overview title",
  "duration_estimate": "X min",
  "script": [
    {"speaker": "Alex|Jordan", "text": "dialogue line"},
    ...
  ],
  "summary": "Brief summary of the discussion"
}"""


class AudioOverviewService:
    """Generate audio overview dialogue scripts from paper content."""

    def __init__(self, llm: LLMClient | None):
        self.llm = llm

    async def generate_dialogue(
        self,
        papers: list[dict],
        tone: str = "conversational",
        focus_areas: list[str] | None = None,
    ) -> dict:
        """Generate a conversational dialogue script about the given papers.

        Args:
            papers: List of paper dicts with keys: title, abstract, authors, year
            tone: "formal" or "conversational"
            focus_areas: Optional list of topics to emphasize

        Returns:
            Dict with keys: title, duration_estimate, script, summary
        """
        if self.llm is None:
            return self._fallback_dialogue(papers)

        paper_context = "\n\n".join(
            f"Title: {p.get('title', 'Unknown')}\n"
            f"Authors: {', '.join(p.get('authors', []))}\n"
            f"Year: {p.get('year', 'N/A')}\n"
            f"Abstract: {p.get('abstract', '')}"
            for p in papers
        )

        tone_instruction = (
            "Use a formal, academic tone with precise terminology."
            if tone == "formal"
            else "Use a conversational, accessible tone like a podcast."
        )

        focus_instruction = ""
        if focus_areas:
            focus_instruction = f"\nPay special attention to: {', '.join(focus_areas)}"

        user_prompt = (
            f"Create an audio discussion about these paper(s):\n\n{paper_context}"
            f"\n\n{tone_instruction}{focus_instruction}"
            f"\n\nInclude {min(len(papers) * 5, 20)} exchanges between the hosts."
        )

        messages = [
            {"role": "system", "content": DIALOGUE_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]

        try:
            result = await asyncio.wait_for(
                self.llm.chat_json(
                    messages,
                    temperature=0.7,
                    task_type="audio_overview_dialogue",
                ),
                timeout=min(settings.rewrite_timeout, 15.0),
            )
            if not result or "script" not in result:
                logger.warning("LLM returned invalid dialogue format, using fallback")
                return self._fallback_dialogue(papers)
            return result
        except Exception:
            logger.exception("Failed to generate dialogue for %d papers", len(papers))
            return self._fallback_dialogue(papers)

    def _fallback_dialogue(self, papers: list[dict]) -> dict:
        """Generate a simple text-based fallback when LLM is unavailable."""
        titles = [p.get("title", "Unknown Paper") for p in papers]
        return {
            "title": f"Overview of {len(papers)} Paper(s)",
            "duration_estimate": "1 min",
            "summary": f"Discussion of: {'; '.join(titles)}",
            "script": [
                {
                    "speaker": "Alex",
                    "text": f"Today we're discussing {len(papers)} paper(s): {'; '.join(titles)}.",
                },
                {
                    "speaker": "Jordan",
                    "text": "This is an AI-generated placeholder. Configure an LLM provider to generate full audio dialogue scripts.",
                },
            ],
        }
