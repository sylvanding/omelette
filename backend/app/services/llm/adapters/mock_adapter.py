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
