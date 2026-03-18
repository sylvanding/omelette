---
title: "refactor(backend): 代码质量与测试缺口修补"
type: refactor
status: completed
date: 2026-03-18
origin: docs/brainstorms/2026-03-18-backend-quality-testing-gaps-brainstorm.md
---

# refactor(backend): 代码质量与测试缺口修补

## Overview

在完成 21 项后端综合优化后，深度审计发现 4 个领域仍有缺口：代码质量（硬编码值、错误处理不一致、路径安全）、MCP 工具测试（7/11 无测试）、Pipeline 真实 PDF 集成测试（HITL 流程未覆盖）、Chat tool_mode 覆盖不全（仅测了 qa 模式）。

## Problem Statement / Motivation

- **MCP 工具**：11 个工具中 7 个无单元测试，任何改动都可能导致静默回归
- **Pipeline**：HITL 中断→恢复流程是核心功能，但只有 mock 级别的 graph 测试，无 API 层集成测试
- **代码质量**：硬编码值散落在多个文件中，`citation_graph_service` 返回 200 + `{"error": ...}` 违反统一的 `ApiResponse` 约定
- **Chat**：4 种 tool_mode 仅测了 qa，citation_lookup / review_outline / gap_analysis 从未经过测试验证

## Proposed Solution

分 4 个 Phase 实施，每个 Phase 独立可提交：

1. **Phase 1: 代码质量改进** — 配置提取、错误处理统一、路径安全、缺失服务测试
2. **Phase 2: MCP 工具测试补全** — 7 个工具的单元测试
3. **Phase 3: Pipeline 真实 PDF 集成测试** — Upload Pipeline + HITL + 状态查询
4. **Phase 4: Chat tool_mode 全覆盖** — citation_lookup / review_outline / gap_analysis

## Technical Considerations

### Architecture Impacts

- `citation_graph_service.get_citation_graph()` 从返回 dict 改为抛出 `HTTPException` → `papers.py` 的 `get_citation_graph` 端点需要同步更新
- 前端 citation graph 调用可能依赖 200 + error body → 需检查前端是否需要同步修改

### Key Decisions (see brainstorm: docs/brainstorms/2026-03-18-backend-quality-testing-gaps-brainstorm.md)

| 决策 | 选择 | 理由 |
|------|------|------|
| Citation graph 错误处理 | 改为 `HTTPException(404/502)` | 符合统一 `ApiResponse` 约定；前端本身应处理非 200 响应 |
| add_paper_by_doi Crossref 失败 | 保持当前行为（用最少元数据创建） | DOI 已知时允许记录跟踪是有价值的 |
| 路径验证 | 使用 `Path.is_relative_to()` 替代 `startswith` | 避免前缀匹配 bug（`/data/omelette_sub` 绕过 `/data/omelette`） |
| S2_MAX_PER_REQUEST | 保持 50（代码现值） | S2 API 默认限制 |
| upload.py MAX_FILE_SIZE_MB | 统一使用 `settings.max_upload_size_mb` | config.py 已有该字段 |
| 版本号 | 提取为 `APP_VERSION` 常量到 config.py | 单一来源 |
| Rewrite 异常处理 | 缩窄为 `httpx.HTTPError`, `ValueError`, `RuntimeError` | `CancelledError` 和 `TimeoutError` 已单独处理 |
| Pipeline 测试 PDF | 使用 `/data0/djx/omelette_pdf_test/` 最小的 PDF | `pytest.mark.skipif` 跳过无数据环境 |

## Acceptance Criteria

### Phase 1: 代码质量改进

- [ ] **1.1** `config.py` 新增字段：`s2_api_base`, `s2_timeout`, `s2_max_per_request`, `title_similarity_threshold`, `rewrite_timeout`, `app_version`
- [ ] **1.2** `upload.py` 移除 `MAX_FILE_SIZE_MB`，使用 `settings.max_upload_size_mb`；移除 `TITLE_SIMILARITY_THRESHOLD`，使用 `settings.title_similarity_threshold`
- [ ] **1.3** `citation_graph_service.py` 移除 `S2_*` 常量，使用 settings；`get_citation_graph` 对 "paper not found" 抛出 `HTTPException(404)`，对 "S2 未收录" 抛出 `HTTPException(502)`
- [ ] **1.4** `papers.py` 更新 `get_citation_graph` 端点，移除 `ApiResponse` 包装中的 error dict 处理
- [ ] **1.5** `rewrite.py` 移除 `REWRITE_TIMEOUT`，使用 `settings.rewrite_timeout`；缩窄 `except Exception` 为具体异常类型
- [ ] **1.6** `main.py` 使用 `settings.app_version` 替代硬编码 `"0.1.0"`
- [ ] **1.7** `pipelines.py` 路径验证使用 `Path.is_relative_to()` 替代 `str.startswith()`
- [ ] **1.8** 新增 `tests/test_llm_config_resolver.py`：测试 `from_env()` 各 provider、`from_merged()` 优先级
- [ ] **1.9** 新增 `tests/test_reranker_service.py`：mock `SentenceTransformerRerank`，测试 `get_reranker()`、`rerank_nodes()` 正常和降级路径

### Phase 2: MCP 工具测试补全

- [ ] **2.1** `test_mcp.py` 新增 `test_search_knowledge_base`：mock `RAGService.query`，验证正常返回和 top_k 验证
- [ ] **2.2** `test_mcp.py` 新增 `test_find_citations`：mock `RAGService.query`，验证引文返回格式
- [ ] **2.3** `test_mcp.py` 新增 `test_add_paper_by_doi`：mock `_fetch_crossref_metadata`，验证正常添加、重复检测、无效 DOI
- [ ] **2.4** `test_mcp.py` 新增 `test_search_papers_by_keyword`：mock `SearchService.search`，验证正常和 max_results 验证
- [ ] **2.5** `test_mcp.py` 新增 `test_summarize_papers`：mock `WritingService.summarize`
- [ ] **2.6** `test_mcp.py` 新增 `test_generate_review_outline`：mock `WritingService.generate_review_outline`
- [ ] **2.7** `test_mcp.py` 新增 `test_analyze_gaps`：mock `WritingService.analyze_gaps`
- [ ] **2.8** `test_mcp.py` 新增 `test_manage_keywords`：测试 list / add / delete（DB 操作）、expand（mock `KeywordService`）、无效 action

### Phase 3: Pipeline 真实 PDF 集成测试

- [ ] **3.1** 新增 `tests/test_pipeline_real_pdf.py`，含 `@pytest.mark.skipif` 当 PDF 目录不存在时跳过
- [ ] **3.2** Upload Pipeline 完整流程：选最小 PDF → 上传 → extract_metadata → 验证论文记录入库
- [ ] **3.3** HITL 流程测试：准备已有论文 → 上传同名 PDF → dedup 中断 → 解决冲突（skip/keep_new）→ 恢复
- [ ] **3.4** Pipeline 列表与状态查询：启动 pipeline → GET /pipelines → 验证列表包含该 pipeline
- [ ] **3.5** 路径安全测试：传入含 `..` 的路径 → 验证 400 拒绝

### Phase 4: Chat tool_mode 全覆盖

- [ ] **4.1** `test_chat_pipeline.py` 新增 `test_stream_citation_lookup_mode`：发送 `tool_mode="citation_lookup"` + `knowledge_base_ids=[kb_id]` → 验证 SSE 事件序列
- [ ] **4.2** `test_chat_pipeline.py` 新增 `test_stream_review_outline_mode`：发送 `tool_mode="review_outline"` → 验证 SSE 事件序列
- [ ] **4.3** `test_chat_pipeline.py` 新增 `test_stream_gap_analysis_mode`：发送 `tool_mode="gap_analysis"` → 验证 SSE 事件序列
- [ ] **4.4** 每个模式验证：`start` → `text-delta`（至少1个）→ `finish` → `[DONE]`，无 `error` 事件

## Implementation Details

### Phase 1 文件变更

**`backend/app/config.py`** — 新增字段：

```python
# Semantic Scholar API
s2_api_base: str = "https://api.semanticscholar.org/graph/v1"
s2_timeout: int = Field(default=15, ge=1, le=60)
s2_max_per_request: int = Field(default=50, ge=1, le=100)

# Upload
title_similarity_threshold: float = Field(default=0.85, ge=0.0, le=1.0)

# Rewrite
rewrite_timeout: float = Field(default=30.0, ge=5.0, le=120.0)

# App version
app_version: str = "0.1.0"
```

**`backend/app/services/citation_graph_service.py`** — 改用 settings + HTTPException：

```python
from fastapi import HTTPException
from app.config import settings

class CitationGraphService:
    async def get_citation_graph(self, paper_id, project_id, ...):
        paper = await self._db.get(Paper, paper_id)
        if not paper or paper.project_id != project_id:
            raise HTTPException(status_code=404, detail="Paper not found")

        s2_id = await self._resolve_s2_id(paper)
        if not s2_id:
            raise HTTPException(
                status_code=502,
                detail="无法获取引用数据：Semantic Scholar 未收录此论文"
            )
        # ... rest unchanged
```

**`backend/app/api/v1/pipelines.py`** — 路径验证：

```python
allowed_root = _Path(settings.pdf_dir).resolve()
for p in body.pdf_paths:
    resolved = _Path(p).resolve()
    try:
        resolved.relative_to(allowed_root)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Path not within allowed directory: {p}")
    safe_paths.append(str(resolved))
```

**`backend/tests/test_llm_config_resolver.py`**：

```python
async def test_from_env_default_mock():
    config = LLMConfigResolver.from_env()
    assert config.provider == "mock"

async def test_from_env_override_provider():
    config = LLMConfigResolver.from_env(provider="volcengine")
    assert config.provider == "volcengine"
    assert config.model == settings.volcengine_model

async def test_from_merged_user_overrides():
    merged = MergedSettings(llm_provider="anthropic", ...)
    config = LLMConfigResolver.from_merged(merged)
    assert config.provider == "anthropic"
```

**`backend/tests/test_reranker_service.py`**：

```python
async def test_rerank_nodes_empty():
    result = await rerank_nodes([], "query", top_n=5)
    assert result == []

async def test_rerank_nodes_fallback_on_import_error(monkeypatch):
    monkeypatch.setattr(..., side_effect=ImportError)
    result = await rerank_nodes(mock_nodes, "query", top_n=3)
    assert len(result) == 3  # falls back to original order

async def test_get_reranker_caches(monkeypatch):
    # mock _load_reranker, call get_reranker twice, assert loaded once
```

### Phase 2 Mock 策略

| MCP Tool | Mock Target | 返回值 |
|----------|-------------|--------|
| search_knowledge_base | `RAGService.query` | `{"answer": "...", "sources": [...]}` |
| find_citations | `RAGService.query` | 同上 |
| add_paper_by_doi | `_fetch_crossref_metadata` | `{"title": "...", "authors": [...], ...}` |
| search_papers_by_keyword | `SearchService.search` | `{"papers": [...], "total": N}` |
| summarize_papers | `WritingService.summarize` | `{"content": "..."}` |
| generate_review_outline | `WritingService.generate_review_outline` | `{"outline": "..."}` |
| analyze_gaps | `WritingService.analyze_gaps` | `{"analysis": "..."}` |
| manage_keywords (expand) | `KeywordService.expand_keywords` | `{"expanded_terms": [...]}` |

### Phase 3 测试结构

```python
PDF_TEST_DIR = "/data0/djx/omelette_pdf_test"
PDF_DIR_EXISTS = os.path.isdir(PDF_TEST_DIR)

pytestmark = pytest.mark.skipif(not PDF_DIR_EXISTS, reason="Test PDF directory not available")

@pytest.fixture
def smallest_pdf():
    """Find the smallest PDF in the test directory."""
    pdfs = sorted(Path(PDF_TEST_DIR).glob("*.pdf"), key=lambda p: p.stat().st_size)
    return str(pdfs[0]) if pdfs else pytest.skip("No PDFs found")
```

### Phase 4 测试模式

```python
@pytest.mark.parametrize("tool_mode", ["citation_lookup", "review_outline", "gap_analysis"])
async def test_stream_tool_modes(client, tool_mode):
    resp = await client.post(
        "/api/v1/chat/stream",
        json={"message": "分析这个主题", "knowledge_base_ids": [], "tool_mode": tool_mode},
    )
    assert resp.status_code == 200
    # 解析 SSE 事件序列
    event_types = parse_sse_events(resp.text)
    assert "start" in event_types
    assert "text-delta" in event_types
    assert "finish" in event_types
    assert "[DONE]" in event_types
    assert "error" not in event_types
```

## Dependencies & Risks

| 风险 | 影响 | 缓解 |
|------|------|------|
| Citation graph 改为 HTTPException 可能影响前端 | 前端 citation graph 面板报错 | 检查前端代码，必要时同步更新 |
| 真实 PDF 测试依赖特定路径 | CI 环境无 PDF 目录 | `pytest.mark.skipif` + 环境变量 `E2E_PDF_DIR` |
| RerankerService mock 可能不够精确 | 测试通过但真实行为不同 | mock SentenceTransformerRerank 的 `postprocess_nodes` |
| MCP WritingService/KeywordService mock | LLM 行为变化可能导致集成问题 | 现有 E2E 测试覆盖真实 LLM 路径 |

## Success Metrics

- 全部新测试通过（`pytest tests/ -v`）
- 现有 409+ 测试不回归
- `ruff check` 零报错
- MCP 工具测试覆盖从 4/11 提升到 11/11
- Chat tool_mode 测试覆盖从 1/4 提升到 4/4

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-18-backend-quality-testing-gaps-brainstorm.md](../brainstorms/2026-03-18-backend-quality-testing-gaps-brainstorm.md)
  - 关键决策：4 个改进方向、真实 PDF 使用已有测试数据、MCP 使用 mock

### Internal References

- Config 模式: `backend/app/config.py` (Settings with Field)
- MCP 测试模式: `backend/tests/test_mcp.py` (setup_db + sample_kb + direct call)
- Pipeline 测试模式: `backend/tests/test_pipelines.py` (monkeypatch + MemorySaver + snapshot.next)
- Chat 测试模式: `backend/tests/test_chat_pipeline.py` (mock_services + SSE parsing)
- 错误处理约定: `backend/app/main.py` (HTTPException + RequestValidationError handlers)
- 路径验证: `backend/app/api/v1/pipelines.py:178-184`

### Institutional Learnings

- `docs/solutions/integration-testing/` — AsyncClient + ASGITransport, 不用 TestClient
- `docs/solutions/integration-issues/langgraph-hitl-interrupt-api-snapshot-next.md` — 用 `snapshot.next` 检测 HITL 中断
- `docs/solutions/test-failures/test-database-pollution-tempfile-mkdtemp.md` — 测试 DB 使用 tempfile
