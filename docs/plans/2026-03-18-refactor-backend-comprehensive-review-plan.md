---
title: "refactor(backend): 全面代码审核改进 — 48 项修复"
type: refactor
status: active
date: 2026-03-18
origin: docs/brainstorms/2026-03-18-backend-comprehensive-review-brainstorm.md
---

# 全面代码审核改进 — 48 项修复

## Overview

基于对整个后端代码的四维度审核（服务层、API 层、配置/数据库/Pipeline、测试），共发现 48 项改进点（P0: 10, P1: 18, P2: 20）。本计划将修复全部问题，包含 1 个真实 Bug（ResolvedConflict 字段不匹配导致数据丢失）、Pipeline checkpoint 持久化、Paper 唯一约束迁移等。

## Problem Statement

详见 brainstorm: [docs/brainstorms/2026-03-18-backend-comprehensive-review-brainstorm.md](../brainstorms/2026-03-18-backend-comprehensive-review-brainstorm.md)

核心问题：
1. **真实 Bug**: `keep_new` pipeline action 因字段不匹配导致论文丢失
2. **安全隐患**: SSRF、未校验 project_id、GPU unload 无保护
3. **性能**: 3 处异步上下文中的阻塞调用
4. **资源泄漏**: fitz 文件句柄、Pipeline 全局状态
5. **代码质量**: 重复逻辑、不统一的输入验证、缺失测试

## Technical Considerations

### Key Decisions (see brainstorm)

| 决策 | 选择 | 理由 |
|------|------|------|
| 修复范围 | 全部 48 项 | 一次性全面提升 |
| Pipeline checkpoint | MemorySaver → AsyncSqliteSaver | 重启后状态不丢失 |
| Paper 唯一约束 | 添加 + Alembic 迁移 | 防止重复导入 |

### Implementation Phases

#### Phase 1: P0 Bug 修复 + 安全漏洞

**目标**: 修复影响运行时正确性和安全的 10 个高优先级问题

**任务**:

##### 1.1 ResolvedConflict 字段不匹配 Bug

- [ ] `app/api/v1/pipelines.py`: 在 `ResolvedConflict` 模型中添加 `new_paper: dict | None = None` 字段
- [ ] `app/pipelines/nodes.py`: `apply_resolution_node` 中同时支持 `new_paper` 和 `merged_paper` 字段（向后兼容）
- [ ] 添加测试：verify `keep_new` action 在 pipeline 中正确保留论文

##### 1.2 Pipeline 内存泄漏修复

- [ ] `app/api/v1/pipelines.py`: 在 `_run_pipeline` 完成/失败/取消时清理 `_cancelled[thread_id]` 和 `_running_tasks[thread_id]`
- [ ] 将 `_cancelled` dict 抽离到 `app/pipelines/cancellation.py` 共享模块，消除 nodes.py 对 API 层的反向依赖
- [ ] 添加测试：verify task cleanup

##### 1.3 异步阻塞调用修复

- [ ] `app/services/crawler_service.py:86`: `validate_url_safe(url)` → `await asyncio.to_thread(validate_url_safe, url)`
- [ ] `app/services/crawler_service.py:104`: 同上处理 `validate_url_safe(pdf_url)`
- [ ] `app/services/mineru_process_manager.py`: `_kill_process()` 中 `process.wait()` → `await asyncio.to_thread(...)` 或使用 `asyncio.create_subprocess_exec`
- [ ] `app/services/mineru_process_manager.py:193`: `process.stderr.read()` → `await asyncio.to_thread(...)`

##### 1.4 资源泄漏修复

- [ ] `app/services/ocr_service.py:177-187`: `fitz.open(pdf_path)` 改为 `with fitz.open(pdf_path) as pdf_doc:` 确保异常时关闭

##### 1.5 安全漏洞修复

- [ ] `app/services/subscription_service.py`: `check_rss_feed` 中对 `feed_url` 调用 `validate_url_safe()` 做 SSRF 校验
- [ ] `app/api/v1/rag.py`: 为 `rag_query`、`index_stats`、`delete_index`、`build_index_stream` 添加 `Depends(get_project)` 依赖
- [ ] `app/api/v1/subscription.py`: 为 `check_rss`、`check_updates` 添加 `Depends(get_project)` 依赖
- [ ] `app/api/v1/search.py`: 为 `list_search_sources` 添加 `Depends(get_project)` 依赖
- [ ] `app/api/v1/gpu.py`: 为 `gpu_unload` 添加 API key 校验（复用现有 `ApiKeyMiddleware` 逻辑）

**参考文件**:
- 现有 `Depends(get_project)` 用法: `app/api/v1/papers.py`
- SSRF 校验: `app/services/url_validator.py`
- API key 中间件: `app/main.py`

**预估**: ~200 行代码修改 + ~100 行测试

---

#### Phase 2: 数据完整性 + Pipeline 持久化

**目标**: 添加 Paper 唯一约束 + Pipeline checkpoint 持久化

**任务**:

##### 2.1 Paper (project_id, doi) 唯一约束

- [ ] `app/models.py`: 在 Paper 模型中添加 `UniqueConstraint("project_id", "doi", name="uq_paper_project_doi")` 条件约束（SQLite 不支持部分索引，使用 `Index` + 应用层校验）
- [ ] 创建 Alembic 迁移: `alembic revision --autogenerate -m "add paper project_doi unique constraint"`
- [ ] 验证迁移在已有数据上的安全性（处理重复数据场景）
- [ ] 添加测试：verify 同 project 下重复 DOI 被拒绝

##### 2.2 Pipeline Checkpoint 持久化

- [ ] `backend/pyproject.toml`: 确认 `langgraph[sqlite]` 依赖已安装（或添加）
- [ ] `app/pipelines/graphs.py`: 将 `MemorySaver()` 替换为 `AsyncSqliteSaver` (使用 `settings.data_dir / "pipeline_checkpoints.db"`)
- [ ] `app/config.py`: 添加 `pipeline_checkpoint_db: str` 配置项
- [ ] `app/main.py` lifespan: 初始化 checkpoint DB 连接
- [ ] 添加测试：verify pipeline 中断后恢复

**参考文件**:
- 现有 pipeline 创建: `app/pipelines/graphs.py`
- 数据库迁移: `alembic/versions/`

**预估**: ~100 行代码 + 1 个 Alembic 迁移

---

#### Phase 3: 代码质量重构

**目标**: 消除重复、修复配置问题、改善代码结构

**任务**:

##### 3.1 GPU 内存清理逻辑复用

- [ ] 新建 `app/services/gpu_utils.py`，抽取公共函数 `release_gpu_memory(logger_name: str) -> None`
- [ ] 修改 `embedding_service.py:_cleanup_gpu_memory()` → 调用 `release_gpu_memory()`
- [ ] 修改 `ocr_service.py:close()` → 调用 `release_gpu_memory()`
- [ ] 修改 `gpu_model_manager.py:_do_unload()` → 调用 `release_gpu_memory()`

##### 3.2 OCR 调用一致性

- [ ] `app/services/pipeline_service.py:79-80`: 将 `asyncio.to_thread(ocr.process_pdf, ...)` 改为 `await ocr.process_pdf_async(...)` 以支持 MinerU 优先路径

##### 3.3 LLM 配置回退修复

- [ ] `app/services/llm_config_resolver.py:101-103`: temperature/max_tokens 从 `merged_settings` 获取而非 `settings`

##### 3.4 OCR 临时路径修复

- [ ] `app/services/ocr_service.py:182`: 将 `/tmp/omelette_ocr_page_{page_num}.png` 改为 `tempfile.gettempdir() / f"omelette_ocr_page_{page_num}.png"`

##### 3.5 Embedding service lambda 清理

- [ ] `app/services/embedding_service.py:124,127`: 将 `lambda` + `noqa: E731` 改为显式辅助函数

##### 3.6 应用生命周期完善

- [ ] `app/main.py`: shutdown 时添加 `await engine.dispose()`

**预估**: ~80 行代码修改

---

#### Phase 4: 输入验证 + API 一致性

**目标**: 统一参数验证、强化输入校验

**任务**:

##### 4.1 统一分页参数

- [ ] `app/schemas/common.py`（新建或使用现有）: 定义 `PaginationParams` 类 (`page: int = Query(1, ge=1)`, `page_size: int = Query(20, ge=1, le=100)`)
- [ ] 修改 `projects.py`、`papers.py`、`keywords.py`、`subscription.py`、`dedup.py` 使用统一 `PaginationParams`

##### 4.2 Literal 类型约束

- [ ] `app/api/v1/dedup.py`: `strategy` 参数改为 `Literal["full", "doi_only", "title_only"]`
- [ ] `app/api/v1/crawler.py`: `priority` 参数改为 `Literal["high", "low"]`

##### 4.3 Search 请求体建模

- [ ] `app/schemas/search.py`（或内联）: 定义 `SearchExecuteRequest` Pydantic 模型
- [ ] `app/api/v1/search.py`: 将 `execute_search` 参数改为使用该模型

##### 4.4 Import 数据模型化

- [ ] `app/schemas/project.py`（或内联）: 为 `import_project` 的 papers、keywords、subscriptions 定义 Pydantic 模型
- [ ] `app/api/v1/projects.py`: 使用新模型替代 `list[dict]` 解包

**预估**: ~120 行代码修改

---

#### Phase 5: 测试补充

**目标**: 补充缺失的关键测试，统一 fixture

**任务**:

##### 5.1 pdf_metadata 服务测试

- [ ] 新建 `tests/test_pdf_metadata.py`: 测试 `extract_metadata()`
  - 正常 PDF 提取标题、DOI、作者
  - 损坏 PDF 返回 fallback
  - Crossref 元数据查询成功/失败
  - DOI 清洗和年份解析

##### 5.2 Papers API 测试

- [ ] 新建或扩展 `tests/test_api_papers_extended.py`:
  - `POST /papers/bulk` 批量导入
  - `GET /papers/{id}/chunks` 论文分块
  - 错误路径: 无效 PDF、不存在的 paper_id

##### 5.3 Fixture 统一

- [ ] 将 `setup_db`、`client`、`project_id`、`minimal_pdf_bytes` 从各测试文件迁移到 `conftest.py`
- [ ] 移除各文件中的重复定义

##### 5.4 错误路径测试补充

- [ ] OCR: PDF 损坏、超时场景
- [ ] Search: 网络超时、部分源失败
- [ ] Subscription: RSS 解析失败、无效 URL

**预估**: ~400 行新测试

---

#### Phase 6: P2 改进

**目标**: 文档完善、一致性、限流等低优先级改进

**任务**:

##### 6.1 OpenAPI 文档

- [ ] 为所有 endpoint 添加 `summary` 和 `description`
- [ ] 统一 Tags（`rewrite` 从 `["rewrite"]` 改为 `["chat"]`）
- [ ] 为 streaming 接口添加 `responses` 描述

##### 6.2 SSE 错误格式统一

- [ ] 定义统一 SSE 错误格式: `event: error\ndata: {"code": xxx, "message": "..."}`
- [ ] 修改 `chat.py`、`rewrite.py`、`rag.py`、`writing.py` 使用统一格式

##### 6.3 test_connection 状态码修复

- [ ] `app/api/v1/settings_api.py`: 异常时返回 `JSONResponse(status_code=500)` 而非 `ApiResponse(code=500)` + HTTP 200

##### 6.4 限流扩展

- [ ] 为 `upload`、`search/execute`、`dedup/run`、`writing` 添加限流（复用现有 slowapi 机制）

##### 6.5 列表接口分页

- [ ] `subscription.py:list_subscriptions` 添加分页
- [ ] `dedup.py:list_dedup_candidates` 添加分页

##### 6.6 其他小改进

- [ ] `citation_graph_service.py`: 中文错误信息提取到常量或 i18n key
- [ ] `pdf_metadata.py`: Crossref User-Agent fallback 邮箱移到 config
- [ ] `reranker_service.py`: 注释说明 `top_n` 和 `batch_size` 关系
- [ ] `config.py`: `cuda_visible_devices` 默认值改为 `""` 或 `"0"`
- [ ] `models.py`: 为 Keyword `parent_id` 添加索引
- [ ] `test_new_features.py`: 改用 `monkeypatch` 替代直接修改全局状态

**预估**: ~300 行代码修改

---

#### Phase 7: Lint + 全量测试 + 提交

- [ ] `ruff check` + `ruff format`
- [ ] 运行全量 mock 测试
- [ ] 运行 real_llm 测试（`LLM_PROVIDER=volcengine`）
- [ ] 运行 E2E live server 测试
- [ ] 提交所有更改

## System-Wide Impact

### Interaction Graph

1. Phase 1.1 (ResolvedConflict): Pipeline HITL resume → `apply_resolution_node` → 论文保留/丢弃
2. Phase 1.5 (SSRF): API request → `subscription_service.check_rss_feed` → `httpx.get(feed_url)` → 外部网络
3. Phase 2.2 (Checkpoint): Pipeline start → `AsyncSqliteSaver.aput()` → SQLite → Pipeline resume → `AsyncSqliteSaver.aget()`

### Error & Failure Propagation

| 场景 | 处理 |
|------|------|
| 唯一约束冲突（重复 DOI） | `IntegrityError` → 返回 409 Conflict |
| AsyncSqliteSaver 连接失败 | 降级回 MemorySaver + warning |
| SSRF 校验阻塞（DNS 慢） | `asyncio.to_thread` 包装，不影响 event loop |

### State Lifecycle Risks

| 风险 | 缓解 |
|------|------|
| Alembic 迁移在有重复 DOI 数据时失败 | 迁移前先检测并清理重复数据 |
| AsyncSqliteSaver checkpoint 文件损坏 | SQLite WAL 模式 + 定期清理旧 checkpoint |

## Acceptance Criteria

### Functional Requirements

- [ ] `keep_new` pipeline action 正确保留论文（修复前为空 dict）
- [ ] Pipeline 重启后可恢复中断的任务
- [ ] 同一项目下重复 DOI 的 Paper 被拒绝
- [ ] SSRF 攻击向量被阻断
- [ ] RAG/subscription/search API 校验 project 存在性
- [ ] 异步上下文中无阻塞调用

### Non-Functional Requirements

- [ ] 所有 endpoint 有 OpenAPI summary/description
- [ ] 统一的分页、限流、SSE 错误格式
- [ ] pdf_metadata、bulk_import、list_paper_chunks 有测试覆盖

### Quality Gates

- [ ] `ruff check` + `ruff format` 通过
- [ ] 全量 mock 测试通过
- [ ] Real LLM 测试通过
- [ ] E2E live server 测试通过

## Dependencies & Prerequisites

- `langgraph[sqlite]` — AsyncSqliteSaver 所需
- Alembic — Paper 唯一约束迁移
- 现有 `slowapi` — 限流扩展

## Risk Analysis & Mitigation

| 风险 | 可能性 | 影响 | 缓解 |
|------|--------|------|------|
| Alembic 迁移在已有重复数据上失败 | 中 | 部署阻断 | 迁移脚本先清理重复 |
| AsyncSqliteSaver API 与 MemorySaver 不兼容 | 低 | Pipeline 创建失败 | 查阅 LangGraph 文档确认 API |
| SSRF 校验误判合法 URL | 低 | 功能降级 | 白名单机制 |

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-18-backend-comprehensive-review-brainstorm.md](../brainstorms/2026-03-18-backend-comprehensive-review-brainstorm.md)
  - 关键决策：全部 48 项修复、Pipeline 持久化、Paper 唯一约束

### Internal References

- 现有 `Depends(get_project)`: `app/api/v1/papers.py`
- SSRF 校验: `app/services/url_validator.py`
- Pipeline 图: `app/pipelines/graphs.py`
- 数据库模型: `app/models.py`
- Alembic 配置: `alembic.ini`, `alembic/env.py`
