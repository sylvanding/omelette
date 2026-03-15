"""Smart autocomplete service for chat input predictions."""

from __future__ import annotations

import logging

from app.services.llm.client import LLMClient, get_llm_client

logger = logging.getLogger(__name__)

COMPLETION_SYSTEM_PROMPT = (
    "你是一个科研写作助手。根据用户已输入的文本，预测并补全后续内容。\n"
    "只返回补全的部分（不要重复用户已输入的内容），最多50个字符。\n"
    "如果无法合理预测，返回空字符串。\n"
    "不要添加任何解释、引号或格式标记，只返回纯文本补全内容。"
)


class CompletionService:
    """Generates short text completions for chat input autocomplete."""

    def __init__(self, llm: LLMClient | None = None):
        self._llm = llm or get_llm_client()

    async def complete(
        self,
        prefix: str,
        *,
        conversation_id: int | None = None,
        knowledge_base_ids: list[int] | None = None,
        recent_messages: list[dict] | None = None,
    ) -> dict:
        """Generate a completion suggestion for the given prefix.

        Returns {"completion": str, "confidence": float}.
        """
        if len(prefix.strip()) < 10:
            return {"completion": "", "confidence": 0.0}

        messages: list[dict[str, str]] = [
            {"role": "system", "content": COMPLETION_SYSTEM_PROMPT},
        ]

        if recent_messages:
            for msg in recent_messages[-3:]:
                messages.append(
                    {
                        "role": msg.get("role", "user"),
                        "content": msg.get("content", ""),
                    }
                )

        messages.append({"role": "user", "content": prefix})

        try:
            result = await self._llm.chat(
                messages,
                temperature=0.3,
                max_tokens=50,
                task_type="completion",
            )
            completion = result.strip().strip('"').strip("'")
            if completion.startswith(prefix):
                completion = completion[len(prefix) :]
            completion = completion[:80]

            confidence = 0.8 if completion else 0.0
            return {"completion": completion, "confidence": confidence}
        except Exception:
            logger.warning("Completion request failed", exc_info=True)
            return {"completion": "", "confidence": 0.0}
