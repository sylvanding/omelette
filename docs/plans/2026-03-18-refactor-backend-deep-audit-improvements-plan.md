---
title: "refactor: 后端深度审计改进 — 21 项全面优化"
type: refactor
status: completed
date: 2026-03-18
origin: docs/brainstorms/2026-03-18-backend-deep-audit-brainstorm.md
---

# refactor: 后端深度审计改进 — 21 项全面优化

## Overview

对 Omelette 后端进行全面质量提升，覆盖安全加固、Bug 修复、性能优化、API 补全、MCP 扩展和 WebSocket 引入。共 21 项改进，分 5 个实施阶段依次交付。

## Problem Statement

经过对全部 17 个路由文件（76+ 端点）、18 个服务模块、10 个数据模型、12 个 Schema 文件、MCP Server 和 Pipeline 系统的深度审计，发现以下核心问题：

1. **安全隐患** — SSRF 风险、DOI 注入、API Key 暴露
2. **运行时 Bug** — OCR 阻塞事件循环、Pipeline 取消无效、Task 引用丢失
3. **接口一致性** — 错误响应格式不统一、输入验证缺失
4. **功能缺失** — 批量操作、Pipeline 列表、MCP 工具不全
5. **架构短板** — Pipeline 状态仅存内存、无 WebSocket 支持

## Proposed Solution

分 5 个 Phase 实施，每个 Phase 独立可交付、可测试：

| Phase | 名称 | 改进项 | 关键交付 |
|-------|------|--------|---------|
| 1 | 紧急修复 | P0 #1-4 | OCR async、Pipeline 取消、SSRF 防护、Task 引用 |
| 2 | 接口规范化 | P1 #5-7 | 错误格式统一、Schema 验证、DOI 校验 |
| 3 | API 补全 | P1 #8-10 + P2 部分 | Pipeline 持久化/列表、批量删除、复合索引 |
| 4 | MCP 与中间件 | P2 #11-16 | MCP 工具扩展、Rate Limit、Subscription 增强 |
| 5 | WebSocket 与收尾 | P3 #17-21 | WebSocket、项目导出/导入、CORS、测试 |

---

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                   main.py                           │
│  ┌─────────┐ ┌──────────┐ ┌──────────────────────┐ │
│  │ HTTPExc │ │ ValidErr │ │ Global Exception     │ │
│  │ Handler │ │ Handler  │ │ Handler (existing)   │ │
│  └─────────┘ └──────────┘ └──────────────────────┘ │
│  ┌──────────────────────────────────────────────┐   │
│  │ ApiKeyMiddleware │ CORSMiddleware │ RateLimit│   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │            API Router /api/v1                │   │
│  │  ┌────────┐ ┌──────────┐ ┌────────────────┐ │   │
│  │  │papers  │ │pipelines │ │ ws/pipelines/* │ │   │
│  │  │(batch) │ │(list,ws) │ │ (WebSocket)    │ │   │
│  │  └────────┘ └──────────┘ └────────────────┘ │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │               Services                       │   │
│  │  ┌─────────┐ ┌──────────────┐ ┌───────────┐ │   │
│  │  │url_safe │ │pipeline_mgr  │ │ws_manager │ │   │
│  │  │(SSRF)   │ │(Task persist)│ │(rooms)    │ │   │
│  │  └─────────┘ └──────────────┘ └───────────┘ │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │     MCP Server (expanded tools)              │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Implementation Phases

---

#### Phase 1: 紧急修复 (P0)

**目标**: 修复影响安全和稳定性的 4 个关键问题。

##### 1.1 OCR 阻塞事件循环修复

**文件**: `backend/app/api/v1/ocr.py`, `backend/app/services/pipeline_service.py`

```python
# ocr.py — 修复前
ocr_result = service.process_pdf(paper.pdf_path, force_ocr=force_ocr)

# ocr.py — 修复后
ocr_result = await asyncio.to_thread(service.process_pdf, paper.pdf_path, force_ocr=force_ocr)
```

**验收标准**:
- [ ] `ocr.py:54` 使用 `asyncio.to_thread()` 包裹 `process_pdf`
- [ ] `pipeline_service.py` 中同理修复 OCR 调用
- [ ] 并发 OCR 请求不阻塞 chat/RAG 端点

##### 1.2 Pipeline 取消机制修复

**文件**: `backend/app/api/v1/pipelines.py`, `backend/app/pipelines/nodes.py`

**方案**: 使用共享的 `_cancelled` 字典，Pipeline 节点在开头检查。

```python
# pipelines.py
_cancelled: dict[str, bool] = {}

@router.post("/{thread_id}/cancel")
async def cancel_pipeline(thread_id: str):
    task = _running_tasks.get(thread_id)
    if not task:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    if task["status"] == "completed":
        raise HTTPException(status_code=400, detail="Pipeline already completed")
    _cancelled[thread_id] = True
    task["status"] = "cancelled"
    asyncio_task = task.get("asyncio_task")
    if asyncio_task and not asyncio_task.done():
        asyncio_task.cancel()
    return ApiResponse(data={"thread_id": thread_id, "status": "cancelled"})
```

```python
# nodes.py — 每个节点开头添加
def _check_cancelled(state: PipelineState) -> bool:
    from app.api.v1.pipelines import _cancelled
    thread_id = state.get("thread_id", "")
    return _cancelled.get(thread_id, False)

async def search_node(state: PipelineState) -> dict:
    if _check_cancelled(state):
        return {"stage": "cancelled", "cancelled": True}
    # ... 原有逻辑
```

**验收标准**:
- [ ] 取消后 Pipeline 实际停止运行
- [ ] 取消已完成的 Pipeline 返回 400
- [ ] 取消后尝试 resume 返回 400
- [ ] `cancel_pipeline` 同时取消 asyncio Task

##### 1.3 SSRF 防护

**文件**: `backend/app/services/crawler_service.py`, `backend/app/services/url_validator.py` (新建)

**方案**: 创建 `url_validator.py` 工具模块，在所有 URL 请求前验证。

```python
# backend/app/services/url_validator.py
import ipaddress
import socket
from urllib.parse import urlparse

BLOCKED_HOSTNAMES = frozenset({
    "metadata.google.internal",
    "metadata.amazonaws.com",
})

def validate_url_safe(url: str) -> str:
    """Validate URL is safe for server-side fetch. Raises ValueError if unsafe."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Unsupported scheme: {parsed.scheme}")
    hostname = parsed.hostname
    if not hostname:
        raise ValueError("Invalid URL: no hostname")
    if hostname in BLOCKED_HOSTNAMES:
        raise ValueError(f"Blocked hostname: {hostname}")
    addrinfos = socket.getaddrinfo(hostname, None)
    for info in addrinfos:
        ip_str = info[4][0]
        ip = ipaddress.ip_address(ip_str)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise ValueError(f"Blocked: {ip_str} resolves to private/reserved address")
    return url
```

**集成点**:
- `crawler_service.py` — 在 `_download_pdf()` 前调用
- `mcp_server.py` — 在 Crossref API 调用前验证 DOI 格式
- `subscription_service.py` — 在 RSS feed URL 请求前调用

**验收标准**:
- [ ] 私有 IP / localhost / 元数据地址被拒绝
- [ ] DOI 格式验证 `^10\.\d{4,9}/[-._;()/:A-Z0-9]+$` (大小写不敏感)
- [ ] Unpaywall / Semantic Scholar 返回的 URL 也经过验证
- [ ] `ValueError` 被正确捕获并返回友好错误

##### 1.4 asyncio.create_task 引用保存

**文件**: `backend/app/api/v1/pipelines.py`

```python
# 修复前
asyncio.create_task(_run())

# 修复后
task_ref = asyncio.create_task(_run())
_running_tasks[thread_id]["asyncio_task"] = task_ref
```

**验收标准**:
- [ ] 所有 3 处 `create_task` 保存引用到 `_running_tasks`
- [ ] 大量并发 Pipeline 不会被 GC 静默取消

##### Phase 1 测试

```python
# tests/test_p0_fixes.py

class TestOCRAsync:
    async def test_concurrent_ocr_no_blocking(self, client, setup_db):
        """5 concurrent OCR requests shouldn't block other endpoints."""

class TestPipelineCancel:
    async def test_cancel_stops_pipeline(self, client, setup_db):
        """Cancel mid-pipeline → status becomes cancelled, nodes stop."""
    async def test_cancel_completed_returns_400(self, client, setup_db):
        """Cancel completed pipeline returns 400."""
    async def test_resume_cancelled_returns_400(self, client, setup_db):
        """Resume cancelled pipeline returns 400."""

class TestSSRF:
    async def test_private_ip_blocked(self):
        """pdf_url pointing to 169.254.169.254 raises ValueError."""
    async def test_localhost_blocked(self):
        """pdf_url pointing to 127.0.0.1 raises ValueError."""
    async def test_valid_url_passes(self):
        """Valid academic URL passes validation."""

class TestTaskReference:
    async def test_task_stored_in_running_tasks(self, client, setup_db):
        """asyncio.Task stored in _running_tasks after pipeline start."""
```

---

#### Phase 2: 接口规范化 (P1 前半)

**目标**: 统一错误响应格式，加强输入验证。

##### 2.1 错误处理统一

**文件**: `backend/app/main.py`

```python
from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.status_code, "message": exc.detail, "data": None},
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"code": 422, "message": "Validation error", "data": exc.errors()},
    )
```

**附加修复**:
- `writing.py:87-91` — 返回 `HTTPException(400)` 而非 200 + `code=400`

**验收标准**:
- [ ] 所有 HTTPException 返回 `{"code", "message", "data"}` 格式
- [ ] 所有 422 验证错误返回统一格式，`data` 包含错误详情
- [ ] 前端无需兼容 `detail` 字段

##### 2.2 Schema 输入验证加强

**文件**: 多个 schema 文件

| 文件 | 修改 |
|------|------|
| `schemas/paper.py` | `PaperCreate`: `title` 加 `max_length=2000`; `abstract` 加 `max_length=50000`; `year` 加 `ge=1800, le=2100`; `citation_count` 加 `ge=0`; `pdf_url` 用 `AnyHttpUrl \| str = ""`; `PaperBulkImport.papers` 加 `max_length=500`; `PaperUpdate.status` 用 `Literal[...]` |
| `schemas/subscription.py` | `frequency` 用 `Literal["daily", "weekly", "monthly"]` |
| `schemas/conversation.py` | `tool_mode` 用 `Literal["qa", "citation_lookup", "review_outline", "gap_analysis"]` |
| `schemas/knowledge_base.py` | `ResolveConflictRequest.action` 用 `Literal["keep_old", "keep_new", "merge", "skip"]`; `NewPaperData.title` 加 `max_length=2000` |
| `schemas/keyword.py` | `KeywordExpandRequest.seed_terms` 加 `max_length=50` |
| `schemas/llm.py` | API key 字段加 `max_length=500` |

##### 2.3 DOI 格式验证

**文件**: `backend/app/services/url_validator.py`（已在 Phase 1 创建，添加 DOI 验证）

```python
import re

DOI_PATTERN = re.compile(r"^10\.\d{4,9}/[-._;()/:A-Za-z0-9]+$")

def validate_doi(doi: str) -> str:
    """Validate DOI format. Raises ValueError if invalid."""
    if not DOI_PATTERN.match(doi):
        raise ValueError(f"Invalid DOI format: {doi}")
    return doi
```

**集成点**: `mcp_server.py` 的 `add_paper_by_doi`、`_fetch_crossref_metadata`

**验收标准**:
- [ ] 全部 15 个 Schema 字段添加约束
- [ ] 无效枚举值返回 422
- [ ] 超长字符串被拒绝
- [ ] DOI 格式不合法返回清晰错误

##### Phase 2 测试

```python
# tests/test_p1_error_handling.py

class TestErrorFormat:
    async def test_404_returns_api_response(self, client):
        resp = await client.get("/api/v1/projects/99999")
        assert resp.json()["code"] == 404
        assert "message" in resp.json()
        assert "data" in resp.json()

    async def test_422_returns_api_response(self, client):
        resp = await client.post("/api/v1/projects", json={})
        assert resp.json()["code"] == 422
        assert resp.json()["data"]  # contains error details

class TestSchemaValidation:
    async def test_paper_year_range(self, client, setup_db, project_id):
        resp = await client.post(f"/api/v1/projects/{project_id}/papers",
                                 json={"title": "Test", "year": 1000})
        assert resp.status_code == 422

    async def test_invalid_tool_mode(self, client, setup_db):
        resp = await client.post("/api/v1/chat/stream",
                                 json={"message": "test", "tool_mode": "invalid"})
        assert resp.status_code == 422

class TestDOIValidation:
    async def test_valid_doi_accepted(self):
        assert validate_doi("10.1038/nature12373") == "10.1038/nature12373"

    async def test_invalid_doi_rejected(self):
        with pytest.raises(ValueError):
            validate_doi("not-a-doi")
```

---

#### Phase 3: API 补全与持久化 (P1 后半 + P2 部分)

**目标**: 补全缺失接口，Pipeline 状态持久化，数据库索引优化。

##### 3.1 Pipeline 状态持久化

**文件**: `backend/app/api/v1/pipelines.py`

**方案**: Pipeline 启动时创建 Task 记录，状态变更同步到 DB。

```python
async def start_search_pipeline(body: SearchPipelineRequest, db: AsyncSession = Depends(get_db)):
    # ... 现有逻辑 ...
    # 创建 Task 记录
    task_record = Task(
        project_id=body.project_id,
        task_type=TaskType.SEARCH,
        status=TaskStatus.RUNNING,
        progress=0,
        result={"thread_id": thread_id, "pipeline_type": "search"},
    )
    db.add(task_record)
    await db.flush()
    _running_tasks[thread_id]["task_id"] = task_record.id
    # ... 启动 pipeline ...
```

##### 3.2 Pipeline 列表端点

**文件**: `backend/app/api/v1/pipelines.py`

```python
@router.get("", response_model=ApiResponse[list[dict]])
async def list_pipelines(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List all pipelines (running, interrupted, completed, failed)."""
    data = []
    for thread_id, task in _running_tasks.items():
        if status and task["status"] != status:
            continue
        data.append({
            "thread_id": thread_id,
            "status": task["status"],
            "task_id": task.get("task_id"),
        })
    return ApiResponse(data=data)
```

##### 3.3 批量删除论文

**文件**: `backend/app/api/v1/papers.py`, `backend/app/schemas/paper.py`

```python
# schemas/paper.py
class PaperBatchDeleteRequest(BaseModel):
    paper_ids: list[int] = Field(..., min_length=1, max_length=500)

# papers.py
@router.post("/{project_id}/papers/batch-delete", response_model=ApiResponse[dict])
async def batch_delete_papers(
    project_id: int,
    body: PaperBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    stmt = select(Paper).where(
        Paper.project_id == project_id,
        Paper.id.in_(body.paper_ids),
    )
    result = await db.execute(stmt)
    papers = list(result.scalars().all())
    for paper in papers:
        await db.delete(paper)
    await db.flush()
    return ApiResponse(data={"deleted": len(papers), "requested": len(body.paper_ids)})
```

##### 3.4 数据库复合索引

**文件**: `backend/app/models/paper.py`, `backend/app/models/task.py`

```python
# paper.py — 添加到 Paper 类
__table_args__ = (
    Index("ix_paper_project_status", "project_id", "status"),
)

# task.py — 添加到 Task 类
__table_args__ = (
    Index("ix_task_project_status", "project_id", "status"),
)
```

需要创建对应的 Alembic 迁移文件。

##### 3.5 ResumeRequest 类型约束

**文件**: `backend/app/api/v1/pipelines.py`

```python
class ResolvedConflict(BaseModel):
    conflict_id: str
    action: Literal["keep_old", "keep_new", "merge", "skip"]
    merged_paper: dict | None = None

class ResumeRequest(BaseModel):
    resolved_conflicts: list[ResolvedConflict] = []
```

**验收标准**:
- [ ] Pipeline 状态写入 Task 表
- [ ] `GET /pipelines` 返回所有 Pipeline 列表
- [ ] 批量删除端点正常工作
- [ ] 复合索引创建并有对应迁移文件
- [ ] ResumeRequest 有严格类型约束

##### Phase 3 测试

```python
# tests/test_p1_api_completion.py

class TestBatchDelete:
    async def test_batch_delete_papers(self, client, setup_db, project_id):
        """Create 5 papers, batch delete 3."""

class TestPipelineList:
    async def test_list_pipelines(self, client, setup_db):
        """Start pipeline, list shows it running."""

class TestPipelinePersistence:
    async def test_pipeline_creates_task_record(self, client, setup_db, project_id):
        """Starting pipeline creates Task in DB."""
```

---

#### Phase 4: MCP 扩展与中间件 (P2)

**目标**: 扩展 MCP 工具覆盖，优化中间件配置。

##### 4.1 MCP 新工具

**文件**: `backend/app/mcp_server.py`

| 工具 | 调用的 Service | 功能 |
|------|---------------|------|
| `summarize_papers` | `WritingService.summarize` | 论文摘要总结 |
| `generate_review_outline` | `WritingService.review_outline` | 综述大纲 |
| `analyze_gaps` | `WritingService.gap_analysis` | 研究空白分析 |
| `manage_keywords` | `KeywordService` | 关键词 CRUD + 扩展 |

```python
@mcp.tool()
async def summarize_papers(kb_id: int, paper_ids: list[int] | None = None, language: str = "en") -> str:
    """Summarize papers in a knowledge base."""
    from app.services.writing_service import WritingService
    svc = WritingService()
    result = await svc.summarize(project_id=kb_id, paper_ids=paper_ids, language=language)
    return f"## Summary\n\n{result.get('content', 'No summary generated.')}"
```

##### 4.2 MCP 输入验证

```python
@mcp.tool()
async def search_knowledge_base(
    query: str,
    kb_id: int,
    top_k: int = 5,  # 添加验证
) -> str:
    if top_k < 1 or top_k > 50:
        return "Error: top_k must be between 1 and 50."
    # ...
```

##### 4.3 Rate Limiting 分端点配置

**文件**: `backend/app/api/v1/rag.py`, `backend/app/api/v1/chat.py`, `backend/app/api/v1/upload.py`

```python
from app.middleware.rate_limit import limiter

@router.post("/index", response_model=ApiResponse[dict])
@limiter.limit("5/minute")
async def build_index(...):
    ...
```

| 端点类别 | 限速 |
|----------|------|
| RAG 建索引 | 5/minute |
| Chat stream | 30/minute |
| PDF 上传 | 10/minute |
| OCR 处理 | 5/minute |
| Pipeline 启动 | 10/minute |
| 其他 | 120/minute (全局默认) |

##### 4.4 Subscription trigger 自动导入

**文件**: `backend/app/api/v1/subscription.py`

```python
@router.post("/{sub_id}/trigger", response_model=ApiResponse[SubscriptionRunResult])
async def trigger_subscription(
    ...
    auto_import: bool = Query(False, description="Auto-import new papers into project"),
):
    # ... 现有检查逻辑 ...
    if auto_import and new_papers:
        for paper_data in new_papers:
            paper = Paper(project_id=project_id, **paper_data)
            db.add(paper)
        await db.flush()
    # ...
```

##### 4.5 LLM 客户端入口统一

**文件**: `backend/app/services/llm_client.py` (删除), `backend/app/api/deps.py`

- 删除 `services/llm_client.py` shim
- `deps.py` 直接导入 `from app.services.llm.client import get_llm_client`
- 全局搜索替换所有 `from app.services.llm_client import` 引用

##### 4.6 Schema 导出完善

**文件**: `backend/app/schemas/__init__.py`

统一导出所有公开 Schema。

**验收标准**:
- [ ] MCP 新增 4 个 writing/keyword 工具
- [ ] MCP 输入参数有边界检查
- [ ] 重操作端点有独立限速
- [ ] Subscription trigger 支持 `auto_import`
- [ ] LLM 客户端入口唯一
- [ ] Schema `__init__.py` 导出完整

---

#### Phase 5: WebSocket 与收尾 (P3)

**目标**: 引入 WebSocket 支持 Pipeline 状态推送，完善剩余改进。

##### 5.1 WebSocket ConnectionManager

**文件**: `backend/app/websocket/__init__.py`, `backend/app/websocket/manager.py` (新建)

```python
# backend/app/websocket/manager.py
import asyncio
import logging
from collections import defaultdict
from fastapi import WebSocket

logger = logging.getLogger(__name__)

class PipelineConnectionManager:
    def __init__(self):
        self.rooms: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, websocket: WebSocket, thread_id: str):
        await websocket.accept()
        self.rooms[thread_id].add(websocket)

    def disconnect(self, websocket: WebSocket, thread_id: str):
        if thread_id in self.rooms:
            self.rooms[thread_id].discard(websocket)
            if not self.rooms[thread_id]:
                del self.rooms[thread_id]

    async def broadcast_to_room(self, thread_id: str, message: dict):
        if thread_id not in self.rooms:
            return
        dead = []
        for conn in list(self.rooms[thread_id]):
            try:
                await conn.send_json(message)
            except Exception:
                dead.append(conn)
        for conn in dead:
            self.rooms[thread_id].discard(conn)

pipeline_manager = PipelineConnectionManager()
```

##### 5.2 WebSocket 端点

**文件**: `backend/app/api/v1/pipelines.py`

```python
from fastapi import WebSocket, WebSocketDisconnect, Query
from app.websocket.manager import pipeline_manager

@router.websocket("/{thread_id}/ws")
async def pipeline_status_websocket(
    websocket: WebSocket,
    thread_id: str,
    api_key: str | None = Query(default=None),
):
    if settings.api_secret_key and api_key != settings.api_secret_key:
        await websocket.close(code=4008)
        return
    await pipeline_manager.connect(websocket, thread_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pipeline_manager.disconnect(websocket, thread_id)
```

**Pipeline 节点广播**: 在 `_run()` 中添加状态广播。

```python
async def _run():
    try:
        result = await pipeline.ainvoke(initial_state, config=config)
        # ... 状态更新 ...
        await pipeline_manager.broadcast_to_room(thread_id, {
            "type": "status",
            "status": _running_tasks[thread_id]["status"],
            "stage": result.get("stage", ""),
            "progress": result.get("progress", 0),
        })
    except Exception as e:
        await pipeline_manager.broadcast_to_room(thread_id, {
            "type": "error", "message": str(e),
        })
```

##### 5.3 健康检查路由统一

**文件**: `backend/app/main.py`, `backend/app/middleware/auth.py`

```python
# main.py — 添加根级健康检查
@app.get("/health")
async def health():
    return ApiResponse(data={"status": "ok"})
```

Auth exempt 保持 `/health` 和 `/api/v1/settings/health` 并存。

##### 5.4 CORS 配置完善

**文件**: `backend/app/main.py`

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Process-Time"],
    max_age=600,
)
```

##### 5.5 项目导出/导入

**文件**: `backend/app/api/v1/projects.py`

```python
@router.get("/{project_id}/export", response_model=ApiResponse[dict])
async def export_project(project_id: int, db: AsyncSession = Depends(get_db), project: Project = Depends(get_project)):
    """Export project data as JSON (papers, keywords, subscriptions)."""

@router.post("/import", response_model=ApiResponse[dict], status_code=201)
async def import_project(data: dict, db: AsyncSession = Depends(get_db)):
    """Import a previously exported project."""
```

##### 5.6 中间件专项测试

**文件**: `backend/tests/test_middleware.py` (新建)

```python
class TestAuthMiddleware:
    async def test_missing_api_key_returns_401(self, client):
        """Request without API key when key is configured returns 401."""
    async def test_exempt_paths_no_auth(self, client):
        """Health, docs, MCP paths don't require auth."""
    async def test_valid_api_key_passes(self, client):
        """Valid X-API-Key header grants access."""
    async def test_query_param_api_key_removed(self, client):
        """Query param api_key is no longer accepted."""

class TestRateLimiting:
    async def test_rate_limit_exceeded(self, client):
        """Exceeding rate limit returns 429."""
```

##### 5.7 API Key 仅 Header 传递

**文件**: `backend/app/middleware/auth.py`

```python
# 修复前
api_key = request.headers.get("X-API-Key") or request.query_params.get("api_key")

# 修复后
api_key = request.headers.get("X-API-Key")
```

WebSocket 端点单独处理 query param（浏览器不支持 WS header），但 REST API 仅接受 Header。

**验收标准**:
- [ ] WebSocket 端点可接收 Pipeline 状态推送
- [ ] `/health` 路由存在且无需认证
- [ ] CORS 配置完整
- [ ] 项目导出/导入功能可用
- [ ] 中间件有专项测试
- [ ] REST API Key 仅通过 Header 传递

---

## System-Wide Impact

### Interaction Graph

1. **Error handler 添加** → 所有 HTTPException 路径变更响应格式 → 前端 `error.response?.data?.message` 始终可用 → 无需 fallback 到 `detail`
2. **Schema 验证加强** → 部分之前接受的请求会被拒绝（422）→ 前端需要处理新的验证错误
3. **Pipeline 取消** → cancel API → `_cancelled` dict → 节点检查 → asyncio.Task.cancel() → 资源释放
4. **WebSocket** → Pipeline 启动 → 节点广播 → ConnectionManager → 前端 WS 客户端

### Error & Failure Propagation

| 层级 | 错误类型 | 处理 |
|------|---------|------|
| Schema 验证 | `RequestValidationError` | `validation_exception_handler` → 422 ApiResponse |
| 路由层 | `HTTPException` | `http_exception_handler` → 4xx ApiResponse |
| 服务层 | `ValueError` (URL/DOI) | 端点 try/except → HTTPException(400) |
| 服务层 | 其他 Exception | `global_exception_handler` → 500 ApiResponse |
| WebSocket | `WebSocketDisconnect` | `disconnect()` 清理连接 |

### State Lifecycle Risks

| 操作 | 风险 | 缓解 |
|------|------|------|
| Pipeline 取消 mid-crawl | 部分论文已下载 | 状态标记，不删除已下载文件 |
| 批量删除 | Paper chunks 和 ChromaDB 向量不一致 | cascade delete chunks；ChromaDB 需单独清理 |
| 项目导出 mid-write | 导出不完整 | 使用数据库快照/事务 |

### API Surface Parity

| 接口 | REST API | MCP Tool | 需要同步 |
|------|---------|----------|---------|
| 论文摘要 | `POST /writing/summarize` | `summarize_papers` (Phase 4) | ✅ |
| 综述大纲 | `POST /writing/review-outline` | `generate_review_outline` (Phase 4) | ✅ |
| 批量删除 | `POST /papers/batch-delete` (Phase 3) | — | 后续 |
| Pipeline 列表 | `GET /pipelines` (Phase 3) | — | 后续 |

---

## Acceptance Criteria

### Functional Requirements

- [ ] OCR 端点使用 `asyncio.to_thread()`，不阻塞事件循环
- [ ] Pipeline 取消后节点停止执行
- [ ] SSRF 防护拦截私有 IP / localhost / 元数据地址
- [ ] asyncio.Task 引用保存
- [ ] HTTPException 和 ValidationError 统一 ApiResponse 格式
- [ ] 15 个 Schema 字段添加验证约束
- [ ] DOI 格式验证
- [ ] Pipeline 状态持久化到 Task 表
- [ ] 批量删除论文端点
- [ ] Pipeline 列表端点
- [ ] MCP 新增 4 个 writing/keyword 工具
- [ ] Rate Limiting 分端点配置
- [ ] Subscription trigger 支持 auto_import
- [ ] WebSocket Pipeline 状态推送
- [ ] 项目导出/导入
- [ ] 健康检查路由统一
- [ ] CORS 配置完善

### Non-Functional Requirements

- [ ] 并发 5 个 OCR 请求不影响 chat 响应时间
- [ ] 所有新增端点有对应测试
- [ ] SSRF 验证对正常请求增加 < 50ms 延迟
- [ ] WebSocket 支持 100+ 并发连接
- [ ] 零破坏性变更（向后兼容）

### Quality Gates

- [ ] `ruff check` 和 `ruff format` 通过
- [ ] `mypy` 无新增错误
- [ ] 全部现有测试通过
- [ ] 新增测试 ≥ 30 个
- [ ] Alembic 迁移文件可正常执行

---

## Dependencies & Prerequisites

| 依赖 | 类型 | 用途 |
|------|------|------|
| 无新增外部依赖 (Phase 1-3) | — | SSRF 用 stdlib 实现 |
| `websockets` (已存在) | Python | WebSocket (Phase 5) |

---

## Risk Analysis & Mitigation

| 风险 | 影响 | 概率 | 缓解 |
|------|------|------|------|
| Schema 加严导致现有请求失败 | 高 | 中 | 宽松的 max_length 值；先部署后端再更新前端 |
| Pipeline 取消中断活跃数据库事务 | 高 | 低 | 节点在安全检查点检查取消状态 |
| SSRF 验证误拦正常 URL | 中 | 低 | 仅检查 IP，不做域名白名单 |
| WebSocket 连接泄露 | 中 | 低 | disconnect 清理 + 定时心跳 |
| Alembic 迁移冲突 | 低 | 低 | Phase 3 单独迁移，不修改现有列 |

---

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-18-backend-deep-audit-brainstorm.md](docs/brainstorms/2026-03-18-backend-deep-audit-brainstorm.md) — 21 项改进发现、优先级排序、WebSocket/单用户决策

### Internal References

- Async blocking fix: `docs/solutions/performance-issues/blocking-sync-calls-asyncio-to-thread.md`
- HITL pattern: `docs/solutions/integration-issues/langgraph-hitl-interrupt-api-snapshot-next.md`
- Test DB isolation: `docs/solutions/test-failures/test-database-pollution-tempfile-mkdtemp.md`
- Integration testing: `docs/solutions/integration-testing/2026-03-16-fastapi-langgraph-integration-testing-best-practices.md`
- Backend rules: `.cursor/rules/python-backend.mdc`
- Pipeline rules: `.cursor/rules/langgraph-pipelines.mdc`
- MCP rules: `.cursor/rules/mcp-server.mdc`

### External References

- FastAPI WebSocket: raw WebSocket with room-based ConnectionManager，保持 SSE 用于 chat/RAG
- SSRF 防护: stdlib `ipaddress` + `socket.getaddrinfo()` 验证，阻止私有/保留/环回地址
- OWASP SSRF Prevention Cheat Sheet
