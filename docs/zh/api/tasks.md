# 任务 API

基础路径：`/api/v1/tasks`

## 简介

任务 API 用于管理后台处理任务：search、dedup、crawl、ocr、index、keyword_expand。任务由流水线及其他服务创建；本 API 提供列表、详情查询和取消功能。

## 端点概览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/tasks` | 任务列表 |
| GET | `/tasks/{id}` | 任务详情 |
| POST | `/tasks/{id}/cancel` | 取消运行中的任务 |

---

## GET /api/v1/tasks

**说明：** 列出任务，支持可选过滤。结果按 `created_at` 降序排列。

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project_id` | int | 否 | 按项目 ID 过滤 |
| `status` | string | 否 | 按状态过滤：`pending`、`running`、`completed`、`failed`、`cancelled` |
| `limit` | int | 否 | 最大条数（默认：50） |

**响应：** `ApiResponse[list[TaskSchema]]`

### TaskSchema（列表视图）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 任务 ID |
| `project_id` | int | 项目 ID |
| `task_type` | string | `search`、`dedup`、`crawl`、`ocr`、`index`、`keyword_expand` |
| `status` | string | `pending`、`running`、`completed`、`failed`、`cancelled` |
| `progress` | int | 当前进度 |
| `total` | int | 总步数 |
| `created_at` | string | ISO 8601 时间 |

### 列表示例

```bash
curl -X GET "http://localhost:8000/api/v1/tasks?project_id=1&status=running&limit=20"
```

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": 42,
      "project_id": 1,
      "task_type": "search",
      "status": "running",
      "progress": 30,
      "total": 100,
      "created_at": "2025-03-12T10:00:00"
    }
  ]
}
```

---

## GET /api/v1/tasks/{id}

**说明：** 获取任务完整详情，包括 params、result、error_message。

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | int | 任务 ID |

**响应：** `ApiResponse[TaskDetailSchema]`

### TaskDetailSchema 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 任务 ID |
| `project_id` | int | 项目 ID |
| `task_type` | string | 任务类型 |
| `status` | string | 任务状态 |
| `progress` | int | 当前进度 |
| `total` | int | 总步数 |
| `params` | object | 输入参数 |
| `result` | object | 输出结果（完成时） |
| `error_message` | string | 错误信息（失败时） |
| `created_at` | string | ISO 8601 时间 |
| `started_at` | string | ISO 8601 时间（可为空） |
| `completed_at` | string | ISO 8601 时间（可为空） |

### 详情示例

```bash
curl -X GET "http://localhost:8000/api/v1/tasks/42"
```

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 42,
    "project_id": 1,
    "task_type": "search",
    "status": "completed",
    "progress": 100,
    "total": 100,
    "params": {"query": "machine learning", "sources": ["semantic_scholar"]},
    "result": {"papers_found": 15, "imported": 10},
    "error_message": "",
    "created_at": "2025-03-12T10:00:00",
    "started_at": "2025-03-12T10:00:01",
    "completed_at": "2025-03-12T10:02:30"
  }
}
```

---

## POST /api/v1/tasks/{id}/cancel

**说明：** 取消运行中或待处理的任务。处于 `completed`、`failed`、`cancelled` 状态的任务不可取消。

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | int | 任务 ID |

**响应：** `ApiResponse`（无 data）

### 取消示例

```bash
curl -X POST "http://localhost:8000/api/v1/tasks/42/cancel"
```

```json
{
  "code": 200,
  "message": "Task cancelled",
  "data": null
}
```

---

## 错误码

| 错误码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 无法取消任务（已处于 completed/failed/cancelled 状态） |
| 404 | 任务不存在 |
