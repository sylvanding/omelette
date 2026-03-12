# 流水线 API

基础路径：`/api/v1/pipelines`

## 简介

流水线 API 用于编排 LangGraph 工作流：关键词检索（search → dedup → crawl → OCR → index）和 PDF 上传（extract → dedup → OCR → index）。流水线异步执行，支持 HITL（人机协同）中断以处理去重冲突。使用 `thread_id` 轮询状态、在 HITL 后恢复或取消流水线。

## 端点概览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/pipelines/search` | 运行检索流水线（支持 HITL） |
| POST | `/pipelines/upload` | 运行上传流水线 |
| GET | `/pipelines/{thread_id}/status` | 获取流水线状态 |
| POST | `/pipelines/{thread_id}/resume` | 恢复 HITL 中断的流水线 |
| POST | `/pipelines/{thread_id}/cancel` | 取消流水线 |

---

## POST /api/v1/pipelines/search

**说明：** 启动关键词检索流水线：search → dedup → crawl → OCR → index。发现去重冲突时可能中断以等待 HITL 处理。

**请求体：** `SearchPipelineRequest`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project_id` | int | 是 | 项目 ID |
| `query` | string | 否 | 检索词（默认：`""`） |
| `sources` | string[] | 否 | 检索源（如 `["semantic_scholar", "openalex"]`） |
| `max_results` | int | 否 | 最大结果数（1–200，默认：50） |

**响应：** `ApiResponse[dict]`

| 字段 | 类型 | 说明 |
|------|------|------|
| `thread_id` | string | 流水线线程 ID（如 `search_a1b2c3d4e5f6`） |
| `status` | string | `running` |
| `project_id` | int | 项目 ID |

### 检索流水线示例

```bash
curl -X POST "http://localhost:8000/api/v1/pipelines/search" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": 1,
    "query": "transformer attention",
    "sources": ["semantic_scholar"],
    "max_results": 30
  }'
```

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "thread_id": "search_a1b2c3d4e5f6",
    "status": "running",
    "project_id": 1
  }
}
```

---

## POST /api/v1/pipelines/upload

**说明：** 启动 PDF 上传流水线：提取元数据 → dedup → OCR → index。接受允许目录内的本地文件路径。

**请求体：** `UploadPipelineRequest`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project_id` | int | 是 | 项目 ID |
| `pdf_paths` | string[] | 是 | PDF 文件的绝对路径（需在配置的 `pdf_dir` 下） |

**响应：** `ApiResponse[dict]`

| 字段 | 类型 | 说明 |
|------|------|------|
| `thread_id` | string | 流水线线程 ID（如 `upload_x1y2z3a4b5c6`） |
| `status` | string | `running` |
| `project_id` | int | 项目 ID |

### 上传流水线示例

```bash
curl -X POST "http://localhost:8000/api/v1/pipelines/upload" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": 1,
    "pdf_paths": [
      "/data0/djx/omelette/pdfs/paper1.pdf",
      "/data0/djx/omelette/pdfs/paper2.pdf"
    ]
  }'
```

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "thread_id": "upload_x1y2z3a4b5c6",
    "status": "running",
    "project_id": 1
  }
}
```

---

## GET /api/v1/pipelines/{thread_id}/status

**说明：** 获取流水线执行状态。当 `status` 为 `interrupted` 时，包含 `conflicts` 用于 HITL 处理。

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `thread_id` | string | 流水线线程 ID |

**响应：** `ApiResponse[dict]`

| 字段 | 类型 | 说明 |
|------|------|------|
| `thread_id` | string | 线程 ID |
| `status` | string | `running`、`interrupted`、`completed`、`failed`、`cancelled` |
| `stage` | string | 当前阶段（若可用） |
| `progress` | int | 进度 0–100 |
| `conflicts` | object[] | 去重冲突（`interrupted` 时） |
| `interrupted_at` | string[] | 中断节点 ID（`interrupted` 时） |
| `result` | object | 最终结果（`completed` 时） |
| `error` | string | 错误信息（`failed` 时） |

### 状态查询示例

```bash
curl -X GET "http://localhost:8000/api/v1/pipelines/search_a1b2c3d4e5f6/status"
```

**运行中：**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "thread_id": "search_a1b2c3d4e5f6",
    "status": "running"
  }
}
```

**HITL 中断：**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "thread_id": "search_a1b2c3d4e5f6",
    "status": "interrupted",
    "conflicts": [
      {
        "existing": {"id": 1, "title": "Paper A", "doi": "10.1234/abc"},
        "new": {"title": "Paper A (preprint)", "doi": "10.1234/abc"}
      }
    ],
    "stage": "dedup",
    "progress": 45,
    "interrupted_at": ["dedup_resolve"]
  }
}
```

**已完成：**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "thread_id": "search_a1b2c3d4e5f6",
    "status": "completed",
    "stage": "completed",
    "progress": 100,
    "result": {"papers_imported": 12}
  }
}
```

---

## POST /api/v1/pipelines/{thread_id}/resume

**说明：** 使用已解决的冲突恢复 HITL 中断的流水线。仅在 `status` 为 `interrupted` 时有效。

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `thread_id` | string | 流水线线程 ID |

**请求体：** `ResumeRequest`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `resolved_conflicts` | object[] | 否 | 已解决的冲突决策（默认：`[]`） |

**响应：** `ApiResponse[dict]`

| 字段 | 类型 | 说明 |
|------|------|------|
| `thread_id` | string | 线程 ID |
| `status` | string | `running` |

### 恢复流水线示例

```bash
curl -X POST "http://localhost:8000/api/v1/pipelines/search_a1b2c3d4e5f6/resume" \
  -H "Content-Type: application/json" \
  -d '{
    "resolved_conflicts": [
      {"conflict_id": 0, "action": "keep_existing"},
      {"conflict_id": 1, "action": "import_new"}
    ]
  }'
```

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "thread_id": "search_a1b2c3d4e5f6",
    "status": "running"
  }
}
```

---

## POST /api/v1/pipelines/{thread_id}/cancel

**说明：** 取消运行中或已中断的流水线。

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `thread_id` | string | 流水线线程 ID |

**响应：** `ApiResponse[dict]`

| 字段 | 类型 | 说明 |
|------|------|------|
| `thread_id` | string | 线程 ID |
| `status` | string | `cancelled` |

### 取消流水线示例

```bash
curl -X POST "http://localhost:8000/api/v1/pipelines/search_a1b2c3d4e5f6/cancel"
```

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "thread_id": "search_a1b2c3d4e5f6",
    "status": "cancelled"
  }
}
```

---

## 错误码

| 错误码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求错误（如路径不在允许目录内、流水线未处于中断状态） |
| 404 | 流水线不存在（thread_id 未知或已完成且已清理） |
