"""Mock chat model for testing without real LLM APIs."""

import json
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult

MOCK_RESPONSES: dict[str, str] = {
    "keyword_expand": json.dumps(
        {
            "expanded_terms": [
                {"term": "STED microscopy", "term_zh": "受激发射损耗显微"},
                {"term": "STORM imaging", "term_zh": "随机光学重建显微"},
                {"term": "PALM microscopy", "term_zh": "光激活定位显微"},
                {"term": "structured illumination", "term_zh": "结构光照明"},
            ]
        }
    ),
    "summarize": "This paper presents a novel approach to super-resolution microscopy...",
    "dedup_check": json.dumps({"is_duplicate": False, "confidence": 0.85, "reason": "Different methodology"}),
    "augmented_reading_highlights": json.dumps(
        {
            "highlights": [
                {
                    "category": "Goal",
                    "text": "This paper aims to improve super-resolution imaging",
                    "page": 1,
                    "start_offset": 0,
                    "end_offset": 55,
                },
                {
                    "category": "Method",
                    "text": "We propose a novel deep learning approach",
                    "page": 2,
                    "start_offset": 100,
                    "end_offset": 145,
                },
                {
                    "category": "Result",
                    "text": "Our method achieves 2x resolution improvement",
                    "page": 5,
                    "start_offset": 200,
                    "end_offset": 250,
                },
            ]
        }
    ),
    "augmented_reading_citation_cards": json.dumps(
        {
            "citations": [
                {
                    "paper_id": 1,
                    "paper_title": "Deep Learning for Microscopy",
                    "tldr": "This paper introduces a deep learning method for enhancing microscopy resolution. Using a novel neural architecture, the authors achieve 2x improvement over traditional methods.",
                    "doi": "10.1234/test",
                },
            ]
        }
    ),
    "augmented_reading_definitions": json.dumps(
        {
            "definitions": [
                {
                    "term": "Super-resolution",
                    "definition": "Imaging techniques that achieve resolution beyond the diffraction limit of light.",
                    "context": "Used in microscopy to observe sub-cellular structures",
                },
                {
                    "term": "Point spread function",
                    "definition": "The response of an imaging system to a point source or point object.",
                    "context": "Characterizes the blur in optical systems",
                },
            ]
        }
    ),
    "evidence_consensus": json.dumps(
        {
            "papers": [
                {
                    "paper_id": 1,
                    "paper_title": "Deep Learning for Microscopy",
                    "stance": "support",
                    "finding": "Deep learning methods significantly improve microscopy resolution by 2x.",
                    "source_quote": "Our method achieves 2x resolution improvement over traditional approaches",
                    "confidence": 0.85,
                },
                {
                    "paper_id": 2,
                    "paper_title": "Limitations of AI in Imaging",
                    "stance": "contradict",
                    "finding": "AI-based approaches introduce artifacts that limit practical resolution gains.",
                    "source_quote": "Neural reconstruction introduces systematic artifacts that degrade image fidelity",
                    "confidence": 0.72,
                },
                {
                    "paper_id": 3,
                    "paper_title": "Hybrid Imaging Methods",
                    "stance": "mixed",
                    "finding": "Combining traditional and AI methods shows promise but results vary by sample type.",
                    "source_quote": "Hybrid approaches demonstrate variable success depending on specimen characteristics",
                    "confidence": 0.65,
                },
            ]
        }
    ),
    "default": "This is a mock LLM response for testing purposes.",
}


class MockChatModel(BaseChatModel):
    """Deterministic mock for CI and offline testing."""

    task_type: str = "default"

    @property
    def _llm_type(self) -> str:
        return "mock"

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        content = MOCK_RESPONSES.get(self.task_type, MOCK_RESPONSES["default"])
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content=content))])
