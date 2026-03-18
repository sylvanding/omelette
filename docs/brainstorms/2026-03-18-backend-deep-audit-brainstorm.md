# 后端深度审计：接口补充与代码改进

**日期**: 2026-03-18
**状态**: 已审核
**分支**: `refactor/backend-comprehensive-optimization`

---

## 我们要解决什么

对 Omelette 后端全部代码进行深度扫描，识别需要补充的接口、需要修复的 Bug、安全隐患、性能瓶颈和代码质量问题，形成可操作的改进清单。

## 审计方法

- 逐模块扫描全部 API 路由（17 个路由文件，76+ 端点）
- 检查全部 Service（18 个服务模块）
- 检查全部 Model（10 个数据模型）
- 检查全部 Schema（12 个 schema 文件）
- 检查 MCP Server（7 个 Tool + 4 个 Resource + 2 个 Prompt）
- 检查中间件、配置、Pipeline 系统
- 交叉比对前后端接口需求

---

## 一、错误处理一致性 [高优先级]

### 问题
后端约定所有响应使用 `ApiResponse` 格式 `{"code": ..., "message": ..., "data": ...}`，但 `HTTPException` 和 Pydantic `RequestValidationError` 使用 FastAPI 默认格式 `{"detail": "..."}`，导致前端需要处理两种错误格式。

### 具体表现

| 场景 | 当前行为 | 期望行为 |
|------|---------|---------|
| `HTTPException(404)` | `{"detail": "Not found"}` | `{"code": 404, "message": "Not found", "data": null}` |
| Pydantic 验证失败(422) | `{"detail": [{...}]}` | `{"code": 422, "message": "Validation error", "data": [{...}]}` |
| 全局异常(500) | ApiResponse 格式 ✓ | 已正确 |
| Auth 中间件(401) | ApiResponse 格式 ✓ | 已正确 |

### 建议
在 `main.py` 添加 `HTTPException` 和 `RequestValidationError` 的自定义 handler：

```python
from fastapi.exceptions import RequestValidationError

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.status_code, "message": exc.detail, "data": None},
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    return JSONResponse(
        status_code=422,
        content={"code": 422, "message": "Validation error", "data": exc.errors()},
    )
```

### 附加问题
- `writing.py:87-91`：未知 task 返回 200 + `code=400`，应该改为 `HTTPException(400)`
- `delete_paper` 返回 200，REST 惯例为 204 No Content

---

## 二、输入验证加强 [高优先级]

### Schema 缺失验证

| Schema | 字段 | 问题 | 建议 |
|--------|------|------|------|
| `PaperCreate` | `title` | 无 `max_length` | 加 `max_length=2000` |
| `PaperCreate` | `abstract` | 无长度限制 | 加 `max_length=50000` |
| `PaperCreate` | `year` | 无范围限制 | 加 `ge=1800, le=2100` |
| `PaperCreate` | `citation_count` | 无上界 | 加 `ge=0` |
| `PaperCreate` | `authors` | `list[dict[str, str]]` 无结构约束 | 定义 `AuthorSchema(name: str, affiliation: str = "")` |
| `PaperCreate` | `pdf_url` | 无 URL 格式验证 | 加 `HttpUrl` 类型或正则验证 |
| `PaperBulkImport` | `papers` | 无列表长度限制 | 加 `max_length=500` |
| `PaperUpdate` | `status` | 纯 `str`，可任意值 | 用 `Literal[...]` 或 `PaperStatus` 枚举 |
| `SubscriptionCreate` | `frequency` | 纯 `str` | 用 `Literal["daily", "weekly", "monthly"]` |
| `ConversationCreateSchema` | `tool_mode` | 纯 `str` | 用 `Literal["qa", "citation_lookup", "review_outline", "gap_analysis"]` |
| `ResolveConflictRequest` | `action` | 纯 `str` | 用 `Literal["keep_old", "keep_new", "merge", "skip"]` |
| `KeywordExpandRequest` | `seed_terms` | 无 `max_length` | 加 `max_length=50` 防止过大 LLM 调用 |
| `SettingsUpdateSchema` | API key 字段 | 无长度限制 | 加 `max_length=500` |
| `NewPaperData` | `title` | 无 `max_length` | 加 `max_length=2000` |
| `ChatStreamRequest` | `tool_mode` | 纯 `str` | 用 `Literal[...]` 约束 |

---

## 三、安全问题 [高优先级]

### 3.1 SSRF 风险
- **位置**: `crawler_service.py`、`mcp_server.py`
- **描述**: 用户可通过 `pdf_url` 字段传入内网地址（如 `http://169.254.169.254/`、`http://localhost:6379/`），Crawler 会直接请求
- **建议**: 添加 URL 安全验证函数，禁止私有 IP 和 localhost

### 3.2 DOI 注入
- **位置**: `mcp_server.py:244` — `f"https://api.crossref.org/works/{doi}"`
- **描述**: 畸形 DOI 可能影响 URL 构造
- **建议**: 用正则验证 DOI 格式 `^10\.\d{4,9}/[-._;()/:A-Z0-9]+$`

### 3.3 API Key 通过 Query 参数传输
- **位置**: `middleware/auth.py`
- **描述**: 支持 `?api_key=xxx` 查询参数传递 API key，会记录在访问日志和浏览器历史中
- **建议**: 仅允许 `X-API-Key` Header 传递

### 3.4 CORS 配置不完整
- **位置**: `main.py:45-51`
- **描述**: 未设置 `expose_headers`（自定义 Header 对前端不可见）和 `max_age`（每次预检请求都重新发）
- **建议**: 添加 `expose_headers=["X-Request-ID"]`, `max_age=600`

---

## 四、性能问题 [中优先级]

### 4.1 OCR 阻塞事件循环
- **位置**: `ocr.py:54`
- **描述**: `service.process_pdf()` 是同步方法，在 async 端点中直接调用会阻塞事件循环
- **建议**: 改用 `await asyncio.to_thread(service.process_pdf, ...)` 或 `service.process_pdf_async()`

### 4.2 数据库缺少复合索引
- **位置**: `models/paper.py`, `models/task.py`
- **描述**: `papers` 表常按 `(project_id, status)` 查询，`tasks` 表常按 `(project_id, status)` 查询，但缺少复合索引
- **建议**: 添加复合索引：
  - `Index("ix_paper_project_status", "project_id", "status")`
  - `Index("ix_task_project_status", "project_id", "status")`
  - `Index("ix_conversation_updated_at", "updated_at")` （列表排序用）

### 4.3 OCR 临时文件清理
- **位置**: `ocr_service.py:150-155`
- **描述**: 创建 `/tmp/omelette_ocr_page_*.png` 但若异常发生在 `unlink` 前文件不会清理
- **建议**: 改用 `try/finally` 或 `tempfile.NamedTemporaryFile`

### 4.4 Rate Limiting 不区分端点
- **位置**: `middleware/rate_limit.py`
- **描述**: 全局统一限速（120/min），重操作（RAG 建索引、chat stream、upload）和轻操作共享同一限额
- **建议**: 对重操作添加单独限速 `@limiter.limit("10/minute")`

### 4.5 Rate Limiting 内存存储
- **位置**: `rate_limit.py:18`
- **描述**: `storage_uri="memory://"` 不持久、不支持多 worker
- **建议**: 短期可接受（单进程），长期换 Redis

---

## 五、Pipeline 系统问题 [中优先级]

### 5.1 状态仅在内存中
- **位置**: `pipelines.py:18` — `_running_tasks: dict[str, dict] = {}`
- **描述**: 所有 Pipeline 状态存在内存中，进程重启后全部丢失
- **建议**: 将状态写入 Task 表，利用已有的 `tasks` 模型

### 5.2 取消操作实际无效
- **位置**: `pipelines.py:240-248`
- **描述**: `cancel_pipeline` 只设置 `task["status"] = "cancelled"`，但 Pipeline 节点不检查此状态，Graph 仍在运行
- **建议**: 在 state 中设置 `cancelled=True`，并在每个节点开头检查 `if state.get("cancelled"): return state`

### 5.3 ResumeRequest 缺乏类型约束
- **位置**: `pipelines.py:33-34`
- **描述**: `resolved_conflicts: list[dict] = []` 没有任何 schema 约束
- **建议**: 定义 `ResolvedConflict(conflict_id: str, action: Literal[...], merged_paper: dict | None)`

### 5.4 Pipeline 无列表端点
- **描述**: 无法查看所有正在运行/已中断的 Pipeline
- **建议**: 添加 `GET /api/v1/pipelines` 列表端点

### 5.5 asyncio.create_task 未保存引用
- **位置**: `pipelines.py:86, 153, 235`
- **描述**: `asyncio.create_task(_run())` 创建的 Task 无引用，如果 GC 回收会静默取消
- **建议**: 保存 task 引用到 `_running_tasks[thread_id]["asyncio_task"]`

---

## 六、MCP Server 工具补全 [中优先级]

### 当前覆盖
- ✅ 知识库列表/搜索
- ✅ 论文查找/添加/摘要
- ✅ 引用查找
- ✅ 关键词搜索

### 缺失工具

| 工具名 | 功能 | 重要性 |
|--------|------|--------|
| `summarize_papers` | 对知识库中的论文进行摘要总结 | 高 |
| `generate_review_outline` | 生成综述大纲 | 高 |
| `analyze_gaps` | 研究空白分析 | 中 |
| `manage_keywords` | 关键词管理（创建/扩展/搜索公式） | 中 |
| `start_pipeline` | 启动搜索/上传 Pipeline | 中 |
| `manage_subscriptions` | 订阅管理 | 低 |
| `run_dedup` | 运行去重 | 低 |

### 输入验证
- `top_k` 和 `max_results` 无上下界
- `summary_type` 不校验合法值
- DOI 无格式验证

---

## 七、缺失的 API 端点 [中优先级]

| 端点 | 用途 | 建议路径 |
|------|------|---------|
| 批量删除论文 | 前端批量操作 | `POST /projects/{id}/papers/batch-delete` |
| Pipeline 列表 | 查看所有运行中 Pipeline | `GET /pipelines` |
| 项目统计 | 仪表盘数据聚合 | `GET /projects/{id}/stats` |
| 项目导出 | 备份/迁移 | `GET /projects/{id}/export` |
| 项目导入 | 恢复 | `POST /projects/import` |
| 论文标签管理 | 批量打标签 | `POST /projects/{id}/papers/batch-tag` |
| Subscription trigger 导入论文 | 订阅触发后自动导入 | 增强 `trigger_subscription` |
| 健康检查根路由 | 与 auth exempt 一致 | `GET /health` |

### Subscription trigger 不导入论文
- **位置**: `subscription.py:139-173`
- **描述**: `trigger_subscription` 检查到新论文后只更新计数，不会将论文导入到项目中
- **建议**: 增加自动导入选项 `auto_import: bool = False`

---

## 八、代码质量与一致性 [低优先级]

### 8.1 LLM 客户端双入口
- `services/llm_client.py` 是 `services/llm/client.py` 的 shim
- `api/deps.py` 用 `llm_client`，`chat pipeline` 用 `llm.client`
- **建议**: 统一入口，删除 shim 文件

### 8.2 Conversation 与 Project 无 FK 关系
- `Conversation.knowledge_base_ids` 存储项目 ID 列表（JSON），但无外键约束
- 使用 `json_each` 原始 SQL 查询
- **建议**: 短期可接受（多对多用 JSON 存储），但考虑添加关联表

### 8.3 Schema 导出不完整
- `schemas/__init__.py` 未导出部分 schema（`SubscriptionRead`, `ConversationSchema`, `ChunkRead` 等）
- **建议**: 统一在 `__init__.py` 导出所有公开 schema

### 8.4 Auth Exempt 路径不一致
- `/health` 在 exempt 列表中但不存在该路由
- 实际健康检查在 `/api/v1/settings/health`
- **建议**: 删除不存在的路径，或添加 `/health` 路由

---

## 九、测试覆盖空白 [低优先级]

### 缺少专项测试的模块

| 模块 | 当前状态 | 建议 |
|------|---------|------|
| `middleware/auth.py` | 无专项测试 | 添加 auth 中间件测试 |
| `middleware/rate_limit.py` | 无专项测试 | 添加限速测试 |
| `reranker_service.py` | 仅通过 RAG 测试间接覆盖 | 添加独立测试 |
| Pipeline 取消/恢复 | 部分覆盖 | 增强取消和恢复的边界测试 |
| MCP 工具输入验证 | 部分覆盖 | 增加边界值和异常输入测试 |

---

## 改进优先级排序

### P0 — 应立即修复
1. OCR 阻塞事件循环（影响并发性能）
2. Pipeline 取消操作无效（用户体验 Bug）
3. SSRF 风险（安全问题）
4. asyncio.create_task 未保存引用（潜在任务丢失）

### P1 — 本迭代完成
5. HTTPException / ValidationError 统一为 ApiResponse 格式
6. Schema 输入验证加强（Literal 枚举 + 长度限制 + 范围限制）
7. DOI 格式验证
8. Pipeline 状态持久化到 Task 表
9. 批量删除论文接口
10. Pipeline 列表接口

### P2 — 下一迭代
11. MCP 工具扩展（writing, keywords, pipelines）
12. 数据库复合索引
13. Rate Limiting 分端点配置
14. Subscription trigger 自动导入论文
15. LLM 客户端入口统一
16. Schema 导出完善

### P3 — 长期改进
17. 项目导出/导入
18. 健康检查路由统一
19. CORS expose_headers / max_age
20. Conversation-Project 关联表
21. 中间件专项测试

---

## 已解决问题

1. **WebSocket** — 增加 WebSocket 支持，与 SSE 共存。Pipeline 长时间运行和实时状态推送使用 WS。
2. **API 版本管理** — 保持 v1，暂不规划 v2。
3. **用户系统** — 保持单用户设计，不实施多用户。

## 实施范围

尽可能完成所有改进（P0 + P1 + P2 + P3），优先级从高到低依次实施。
