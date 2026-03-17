---
title: "refactor: Backend Comprehensive Optimization"
type: refactor
status: active
date: 2026-03-17
origin: docs/brainstorms/2026-03-17-backend-comprehensive-review-brainstorm.md
---

# refactor: Backend Comprehensive Optimization

## Enhancement Summary

**Deepened on:** 2026-03-17
**Sections enhanced:** 6
**Research agents used:** kieran-python-reviewer, architecture-strategist, learnings-researcher, repo-research-analyst, Context7 (FastAPI docs)

### Key Improvements
1. Phase 1: 扩大 `asyncio.to_thread` 覆盖范围——补充 `get_stats`、`delete_paper`、`delete_index` 三处遗漏的 ChromaDB 同步调用
2. Phase 2: 明确使用显式导入（非 `import *`），并修正 CHAT_QA / RAG_ANSWER 提示词合并策略
3. Phase 3: `get_or_404` 改进——使用 `TypeVar` 泛型、`resource_id` 参数命名、`getattr` 替代 `hasattr`；并行 LLM 调用需加 semaphore 限流
4. Phase 3: conversation 列表 `knowledge_base_id` 过滤改用 SQLite `json_each` 子查询确保 `total` 准确

### New Considerations Discovered
- `delete_paper`、`delete_index`、`get_stats` 中的 ChromaDB 同步调用也需要包裹 `asyncio.to_thread`（原计划遗漏）
- `update_conversation` 和 `delete_conversation` 无需 `flush`，直接移除 `commit` 即可
- RAGService 的 count 缓存在 per-request 实例下只在单次请求内有效（仍有价值，因单次 query 调用 count 两次）
- 并行化 `summarize_papers` 时需考虑 LLM provider 速率限制，建议添加可配置的 semaphore

---

## Overview

对 Omelette 后端进行全面优化，涵盖四个阶段：修复异步阻塞和会话问题 → 提示词集中管理 → 架构级改进 → 代码清理。每个阶段独立可交付，可逐步推进。

## Problem Statement / Motivation

通过全面复盘（see brainstorm: `docs/brainstorms/2026-03-17-backend-comprehensive-review-brainstorm.md`）发现以下核心问题：

1. **运行时稳定性**：4 处同步阻塞调用在 async 代码中直接执行，阻塞事件循环
2. **数据一致性**：`conversations.py` 和 `persist_node` 中的手动 commit 与 `get_session()` 自动 commit 冲突
3. **可维护性**：16 个 LLM 提示词散落在 10+ 个文件中，存在重复和语言混用
4. **代码卫生**：API 层包含业务逻辑、缺少分页、硬编码配置、异常吞没

## Proposed Solution

分 4 个 Phase 依次修复，每个 Phase 完成后可独立提交和部署。

## Technical Approach

### Phase 1: 关键修复（运行时稳定性）

**目标**: 消除阻塞调用、修复双重提交、修复异常吞没

#### 1.1 修复异步中的同步阻塞

**文件**: `backend/app/services/subscription_service.py`
```python
# Before
feed = feedparser.parse(resp.text)

# After
feed = await asyncio.to_thread(feedparser.parse, resp.text)
```

**文件**: `backend/app/services/pdf_metadata.py`
```python
# Before (in async extract_metadata)
result = _extract_local(pdf_path)

# After
result = await asyncio.to_thread(_extract_local, pdf_path)
```

**文件**: `backend/app/services/rag_service.py`
- 将 `collection.count()` 调用包裹 `asyncio.to_thread()`
- 在 `query()` 和 `retrieve_only()` 中各出现两次（lines 220, 230, 299, 305）
- 考虑添加简单的实例级缓存（TTL=60s），避免每次 query 都访问两次 count
- **补充**: `get_stats()` (line 391)、`delete_paper()` (line 380)、`delete_index()` (line 371) 中的 ChromaDB 同步调用也需要包裹

```python
# rag_service.py — 添加 count 缓存
import time

class RAGService:
    def __init__(self, ...):
        ...
        self._count_cache: dict[int, tuple[int, float]] = {}

    async def _get_count(self, project_id: int) -> int:
        now = time.monotonic()
        cached = self._count_cache.get(project_id)
        if cached and now - cached[1] < 60.0:
            return cached[0]
        collection = self._get_collection(project_id)
        count = await asyncio.to_thread(collection.count)
        self._count_cache[project_id] = (count, now)
        return count

    def _invalidate_count(self, project_id: int) -> None:
        self._count_cache.pop(project_id, None)
```

在 `index_chunks`、`delete_index`、`delete_paper` 后调用 `_invalidate_count`。

> **Research Insight**: RAGService 是 per-request 实例，缓存在单次请求内生效。虽然 60s TTL 对 per-request 实例无意义，但缓存仍有价值——单次 `query()` 会调用 `count()` 两次。`get_stats()` 也应使用 `_get_count()` 而非直接调用 `collection.count()`。

#### 1.2 修复会话双重提交

**文件**: `backend/app/api/v1/conversations.py`

| 端点 | 当前 | 修复 |
|------|------|------|
| `create_conversation` (line 115) | `await db.commit()` | 改为 `await db.flush()` — 需要 flush 使 `conv.id` 可用 |
| `update_conversation` (line 154) | `await db.commit()` | 直接移除 — 无需 flush，`get_session` 自动 commit |
| `delete_conversation` (line 175) | `await db.commit()` | 直接移除 — 无需 flush，`get_session` 自动 commit |

```python
# conversations.py — create_conversation
db.add(conv)
await db.flush()  # ID available for the follow-up query
# await db.commit()  ← REMOVE
```

> **Research Insight** (FastAPI docs): FastAPI 官方推荐 `yield` 依赖管理 session 生命周期。`get_session` 的 try/yield/commit/except/rollback 模式完全符合最佳实践。手动 commit 只在需要提前获取 ID 时用 `flush` 替代。

**文件**: `backend/app/pipelines/chat/nodes.py`
- `persist_node` (line 430)：移除 `await db.commit()`，保留现有的 `await db.flush()` (line 413)
- 注意：persist_node 使用的 db session 来自 `Depends(get_db)` → `get_session()`，所以自动 commit 生效
- **边界情况**：如果 persist_node 在 flush 后抛异常，`get_session` 会自动 rollback，这是正确行为

#### 1.3 修复异常吞没

| 文件 | 行号 | 修复 |
|------|------|------|
| `rag_service.py` | 206-207 | `except Exception: pass` → `except Exception: logger.debug("Adjacent chunk fetch failed", exc_info=True)` |
| `rag_service.py` | 393-395 | 添加 `logger.warning("Failed to get stats for project %d", project_id, exc_info=True)` |
| `completion_service.py` | 69-71 | 已有 `logger.warning`，保留 |
| `main.py` | 74-75 | MCP mount 失败：`logger.warning` → `logger.error` |

### Phase 2: 提示词集中管理

**目标**: 建立 `app/prompts/` 模块，统一语言为英文，消除重复

#### 2.1 创建 `app/prompts/` 目录结构

```
backend/app/prompts/
├── __init__.py          # 统一导出所有 prompt 常量
├── chat.py              # Chat 管道 system prompts (5 个)
├── writing.py           # 写作助手 prompts (4 个 system + user 模板)
├── rag.py               # RAG 知识库 prompt (1 个)
├── dedup.py             # 去重 prompts (2 个: verify + auto_resolve)
├── keyword.py           # 关键词扩展 prompt (1 个)
├── completion.py        # 写作补全 prompt (1 个)
└── rewrite.py           # 文本改写 prompts (4 个)
```

#### 2.2 各文件内容

**`app/prompts/chat.py`**:
```python
CHAT_QA_SYSTEM = (
    "You are a scientific research assistant. Answer the question based on the provided context. "
    "Use inline citations like [1], [2] to reference source papers. "
    "If the context doesn't contain enough information, say so honestly. "
    "Structure your answer with clear paragraphs. "
    "Respond in the same language as the user's question."
)

CHAT_CITATION_SYSTEM = (
    "You are a citation finder. Given the user's text, identify and list the most relevant "
    "references from the provided context. Format as a numbered list with paper titles, authors, "
    "and brief explanations of relevance. Include DOI when available. "
    "Keep your own commentary minimal."
)

CHAT_OUTLINE_SYSTEM = (
    "You are a literature review expert. Based on the provided context, generate a structured "
    "review outline with sections, subsections, and key points. Use markdown headers for sections. "
    "Use citations like [1], [2] to reference sources. Suggest a logical flow and highlight key themes."
)

CHAT_GAP_SYSTEM = (
    "You are a research gap analyst. Based on the provided literature context, identify "
    "research gaps, unexplored areas, and potential future directions. Cite existing work "
    "using [1], [2] format. Organize by theme, not by individual papers. "
    "Be specific about what has been studied and what remains open."
)

CHAT_FALLBACK_SYSTEM = (
    "You are a scientific research assistant specializing in academic literature analysis. "
    "Answer questions clearly and accurately based on your knowledge. "
    "When the user's question is outside your expertise or you are uncertain, say so honestly. "
    "Respond in the same language as the user's question."
)

EXCERPT_CLEAN_SYSTEM = (
    "Clean up the following text extracted from an academic PDF. "
    "Fix OCR errors, add missing spaces between words, restore formatting. "
    "Keep the original meaning intact. Output only the cleaned text, nothing else."
)
```

**`app/prompts/writing.py`**:
```python
WRITING_SECTION_SYSTEM = (
    "You are an academic review writing expert. Write a review paragraph for the given section. "
    "Requirements: "
    "1. Use academic language with clear logic. "
    "2. Use [1][2] format for citations at appropriate positions. "
    "3. Every citation must correspond to a provided reference — do not fabricate. "
    "4. Paragraph length: 200-400 words."
)

WRITING_SUMMARIZE_SYSTEM = (
    "You are a scientific paper analyst. Provide structured, accurate summaries. "
    "Focus on empirical findings and methodology. "
    "Do not hallucinate information not present in the provided metadata."
)

WRITING_OUTLINE_SYSTEM = (
    "You are a scientific writing expert. Generate well-structured review outlines "
    "organized by research themes with clear section hierarchy."
)

WRITING_GAP_SYSTEM = (
    "You are a research gap analyst. Identify unexplored areas and innovation opportunities "
    "based on the provided literature."
)
```

**`app/prompts/rag.py`**:
```python
RAG_ANSWER_SYSTEM = (
    "You are a scientific research assistant. "
    "Answer questions based strictly on the provided context. "
    "Cite sources accurately using the format provided. "
    "Respond in the same language as the user's question."
)
```

**`app/prompts/dedup.py`**:
```python
DEDUP_VERIFY_SYSTEM = (
    "You are a scientific literature deduplication expert. "
    "Compare papers carefully based on title, authors, DOI, and journal. "
    "Return valid JSON only."
)

DEDUP_RESOLVE_SYSTEM = (
    "You are a scientific literature deduplication expert. "
    "Determine the best resolution for duplicate candidates. "
    "Return valid JSON only."
)
```

**`app/prompts/keyword.py`**:
```python
KEYWORD_EXPAND_SYSTEM = (
    "You are a scientific terminology expert. "
    "Generate related terms including synonyms, abbreviations, technical variants, "
    "and cross-disciplinary application terms. "
    "Return valid JSON only."
)
```

**`app/prompts/completion.py`**:
```python
COMPLETION_SYSTEM = (
    "You are a scientific writing assistant. Predict and complete the user's text. "
    "Return only the completion (do not repeat the user's input), max 50 characters. "
    "If you cannot reasonably predict, return an empty string. "
    "Return plain text only — no quotes, explanations, or formatting."
)
```

**`app/prompts/rewrite.py`**:
```python
REWRITE_SIMPLIFY = (
    "Rewrite the following academic text in plain, accessible language. "
    "Keep the core meaning and key concepts intact, but make it understandable "
    "to a general audience. Output only the rewritten text, no explanations."
)

REWRITE_ACADEMIC = (
    "Rewrite the following text in formal academic style. "
    "Use precise terminology, passive voice where appropriate, and proper "
    "academic conventions. Maintain the original meaning. Output only the rewritten text."
)

REWRITE_TRANSLATE_EN = (
    "Translate the following text into English. "
    "Preserve academic terminology and the original meaning. "
    "Output only the translation, no explanations."
)

REWRITE_TRANSLATE_ZH = (
    "Translate the following text into Chinese. "
    "Preserve academic terminology and the original meaning. "
    "Output only the translation, no explanations."
)
```

#### 2.3 迁移步骤

1. 创建 `app/prompts/` 目录和所有文件
2. 逐个文件替换（使用显式导入，**不要用 `import *`**）：
   - `pipelines/chat/nodes.py`: 导入 `from app.prompts.chat import CHAT_QA_SYSTEM, CHAT_CITATION_SYSTEM, ...`，删除本地 `TOOL_MODE_PROMPTS` 和 `EXCERPT_CLEAN_PROMPT`
   - `services/writing_service.py`: 导入 writing prompts，删除 `SECTION_SYSTEM_PROMPT` 和内联 system prompt
   - `services/rag_service.py`: 导入 `RAG_ANSWER_SYSTEM`
   - `services/dedup_service.py`: 导入 `DEDUP_VERIFY_SYSTEM`
   - `services/keyword_service.py`: 导入 `KEYWORD_EXPAND_SYSTEM`
   - `services/completion_service.py`: 导入 `COMPLETION_SYSTEM`
   - `api/v1/rewrite.py`: 导入 rewrite prompts
3. 将 `api/v1/dedup.py` 中的 `auto_resolve_conflict` LLM 逻辑移到 `DedupService.auto_resolve()`
4. 将 `api/v1/keywords.py` 中的 `expand_keywords` LLM 逻辑移到 `KeywordService.expand_keywords_with_llm()`（已有此方法，统一调用即可）

### Phase 3: 架构级改进

#### 3.1 添加分页

**文件**: `backend/app/api/v1/keywords.py`
```python
@router.get("", response_model=ApiResponse[PaginatedData[KeywordRead]])
async def list_keywords(
    project_id: int,
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Keyword).where(Keyword.project_id == project_id)
    count = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    items = (await db.execute(
        stmt.order_by(Keyword.level, Keyword.id)
        .offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()

    return ApiResponse(data=PaginatedData(
        items=[KeywordRead.model_validate(k) for k in items],
        total=count,
        page=page,
        page_size=page_size,
        total_pages=(count + page_size - 1) // page_size or 1,
    ))
```

同理应用到 `subscription.py` 和 `tasks.py`。

#### 3.2 并行化写作服务 LLM 调用

**文件**: `backend/app/services/writing_service.py`
```python
_summarize_semaphore = asyncio.Semaphore(5)

async def summarize_papers(self, paper_ids: list[int], language: str = "en") -> list[dict]:
    # ... load papers ...

    async def _summarize_one(paper: Paper) -> dict:
        async with _summarize_semaphore:
            prompt = f"Summarize this scientific paper in {language}: ..."
            summary = await self.llm.chat(messages=[...], temperature=0.3, task_type="summarize")
            return {"paper_id": paper.id, "title": paper.title, "summary": summary}

    tasks = [_summarize_one(papers[pid]) for pid in paper_ids if pid in papers]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return [r for r in results if not isinstance(r, Exception)]
```

> **Research Insight**: 添加 semaphore 防止并行 LLM 调用过多导致 provider 速率限制。使用 `return_exceptions=True` 实现部分成功——单篇摘要失败不影响其他。

#### 3.3 抽取通用 404 依赖

**文件**: `backend/app/api/deps.py` — 添加：
```python
from typing import TypeVar
from app.database import Base

T = TypeVar("T", bound=Base)

async def get_or_404(
    db: AsyncSession,
    model: type[T],
    resource_id: int,
    *,
    project_id: int | None = None,
    detail: str = "Resource not found",
) -> T:
    obj = await db.get(model, resource_id)
    if not obj:
        raise HTTPException(status_code=404, detail=detail)
    obj_project_id = getattr(obj, "project_id", None)
    if project_id is not None and obj_project_id is not None and obj_project_id != project_id:
        raise HTTPException(status_code=404, detail=detail)
    return obj
```

> **Research Insight**: 使用 `TypeVar` 保持返回类型信息，`resource_id` 避免遮蔽内置 `id`，`getattr` 替代 `hasattr` 更安全。

#### 3.4 修复 conversation 列表的内存过滤

**文件**: `backend/app/api/v1/conversations.py`

将 `knowledge_base_id` 过滤移到 SQL 层。使用 SQLite `json_each` (需要 SQLite 3.38+):

```python
from sqlalchemy import text

if knowledge_base_id is not None:
    kb_filter = text(
        "EXISTS (SELECT 1 FROM json_each(conversations.knowledge_base_ids) WHERE value = :kb_id)"
    )
    stmt = stmt.where(kb_filter).params(kb_id=knowledge_base_id)
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0
```

> **Research Insight**: 不要使用 `contains(f"[{kb_id}]")`，因为 `"[1]"` 会匹配 `"[12]"` 或 `"[21]"`。`json_each` 是精确匹配的正确方案。同时修复 `total` 计算，确保分页准确。

#### 3.5 健康检查免认证

**文件**: `backend/app/middleware/auth.py`
```python
EXEMPT_PATHS = {"/health", "/api/v1/settings/health"}
```

### Phase 4: 代码清理

#### 4.1 硬编码配置移入 config

**文件**: `backend/app/config.py` — 添加（使用 `Field` 进行验证）：
```python
from pydantic import Field

max_upload_size_mb: int = Field(default=50, ge=1, le=500)
rate_limit: str = Field(default="120/minute", description="API rate limit")
clean_semaphore_limit: int = Field(default=3, ge=1)
rewrite_semaphore_limit: int = Field(default=3, ge=1)
llm_parallel_limit: int = Field(default=5, ge=1, description="Max parallel LLM calls for batch operations")
```

#### 4.2 清理未使用依赖

**文件**: `backend/pyproject.toml` — 移除 `aiohttp>=3.11.0`

#### 4.3 统一 MCP 挂载错误处理

**文件**: `backend/app/main.py`
```python
try:
    from app.mcp_server import mcp
    app.mount("/mcp", mcp.streamable_http_app())
except Exception:
    logger.error("Failed to mount MCP server", exc_info=True)
```

## System-Wide Impact

- **API 兼容性**: Phase 1-2 不改变任何 API 接口，Phase 3 的分页为向后兼容的新增参数
- **Error propagation**: 修复异常吞没后，某些之前静默失败的场景会开始记录日志，但不会改变 API 响应
- **State lifecycle**: 修复双重 commit 后，事务边界更清晰，不会有意外的提前提交
- **Pipeline behavior**: Chat pipeline 的 persist_node 行为不变（flush 保证 ID 可用）

## Acceptance Criteria

### Phase 1
- [ ] `subscription_service.py`: `feedparser.parse` 包裹 `asyncio.to_thread`
- [ ] `pdf_metadata.py`: `_extract_local` 调用包裹 `asyncio.to_thread`
- [ ] `rag_service.py`: `collection.count()` 包裹 `asyncio.to_thread` + 添加 `_get_count` 缓存
- [ ] `rag_service.py`: `delete_paper`、`delete_index`、`get_stats` 中的 ChromaDB 同步调用也包裹 `asyncio.to_thread`
- [ ] `rag_service.py`: `get_stats` 使用 `_get_count` 复用缓存
- [ ] `conversations.py`: `create` 改 `commit` 为 `flush`；`update`/`delete` 直接移除 `commit`
- [ ] `pipelines/chat/nodes.py`: `persist_node` 移除手动 `db.commit()`
- [ ] `rag_service.py`: `except Exception: pass` 添加日志
- [ ] `main.py`: MCP 挂载失败改为 `logger.error`
- [ ] 所有现有测试通过

### Phase 2
- [ ] 创建 `app/prompts/` 目录，包含 8 个文件
- [ ] 所有提示词统一为英文
- [ ] 消除所有重复的提示词定义
- [ ] `dedup.py` 的 `auto_resolve_conflict` 逻辑移入 `DedupService`
- [ ] `keywords.py` 的 `expand_keywords` 统一使用 `KeywordService`
- [ ] 所有现有测试通过

### Phase 3
- [ ] `keywords.py`: 添加分页（`page`, `page_size` 参数）
- [ ] `subscription.py`: 添加分页
- [ ] `tasks.py`: 添加分页
- [ ] `writing_service.py`: `summarize_papers` 并行化（含 semaphore 限流 + `return_exceptions=True`）
- [ ] `deps.py`: 添加 `get_or_404` 通用依赖（TypeVar 泛型 + `resource_id` 命名）
- [ ] `conversations.py`: `knowledge_base_id` 过滤改用 `json_each` 子查询，修复 `total` 计算
- [ ] `auth.py`: 健康检查端点免认证

### Phase 4
- [ ] 硬编码配置值移入 `config.py`
- [ ] `pyproject.toml`: 移除 `aiohttp`
- [ ] `main.py`: MCP 挂载错误处理统一

## Success Metrics

- 所有 178+ 现有测试保持通过
- 无 ruff lint 错误
- 提示词文件数从 10+ 减少到 `app/prompts/` 下的 8 个
- 无重复的 LLM system prompt 定义
- 零同步阻塞调用在 async 代码路径中

## Dependencies & Risks

| 风险 | 缓解措施 |
|------|---------|
| 双重 commit 修复可能影响事务行为 | 先跑完整测试，重点关注 conversation CRUD 和 chat pipeline |
| 提示词措辞变化可能影响 LLM 输出质量 | 改动尽量保守，主要是语言统一和微调，不做大幅重写 |
| 分页添加需要前端配合 | 新增参数有默认值，不影响现有前端调用 |
| `asyncio.to_thread` 增加线程池压力 | `feedparser` 和 `fitz` 调用频率低，不会成为瓶颈 |

## Sources & References

### Origin

- **Brainstorm document**: [docs/brainstorms/2026-03-17-backend-comprehensive-review-brainstorm.md](docs/brainstorms/2026-03-17-backend-comprehensive-review-brainstorm.md) — Key decisions: prompts unified to English, centralized to `app/prompts/`, no user customization needed, API layer should not call LLM directly

### Internal References

- **Async pattern**: `docs/solutions/performance-issues/blocking-sync-calls-asyncio-to-thread.md`
- **Chat rewrite**: `docs/solutions/integration-issues/2026-03-12-chat-routing-chain-langgraph-aisdk-rewrite.md`
- **Quality audit**: `docs/solutions/compound-issues/codebase-quality-audit-4-batch-remediation.md`
- **Pagination pattern**: `backend/app/api/v1/projects.py:18-19`, `backend/app/schemas/common.py:17-29`
- **Session lifecycle**: `backend/app/database.py:45-51`
