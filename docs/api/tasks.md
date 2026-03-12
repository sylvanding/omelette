# Tasks API

Base path: `/api/v1/tasks`

## Overview

The Tasks API manages background processing jobs: search, dedup, crawl, OCR, index, keyword expansion. Tasks are created by pipelines and other services; this API provides listing, detail retrieval, and cancellation.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tasks` | List tasks |
| GET | `/tasks/{id}` | Get task detail |
| POST | `/tasks/{id}/cancel` | Cancel a running task |

---

## GET /api/v1/tasks

**Description:** List tasks with optional filters. Results are ordered by `created_at` descending.

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | int | No | Filter by project ID |
| `status` | string | No | Filter by status: `pending`, `running`, `completed`, `failed`, `cancelled` |
| `limit` | int | No | Max results (default: 50) |

**Response:** `ApiResponse[list[TaskSchema]]`

### TaskSchema (list view)

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Task ID |
| `project_id` | int | Project ID |
| `task_type` | string | `search`, `dedup`, `crawl`, `ocr`, `index`, `keyword_expand` |
| `status` | string | `pending`, `running`, `completed`, `failed`, `cancelled` |
| `progress` | int | Current progress |
| `total` | int | Total steps |
| `created_at` | string | ISO 8601 datetime |

### List Example

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

**Description:** Get full task detail including params, result, and error message.

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | int | Task ID |

**Response:** `ApiResponse[TaskDetailSchema]`

### TaskDetailSchema

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Task ID |
| `project_id` | int | Project ID |
| `task_type` | string | Task type |
| `status` | string | Task status |
| `progress` | int | Current progress |
| `total` | int | Total steps |
| `params` | object | Input parameters |
| `result` | object | Output result (when completed) |
| `error_message` | string | Error message (when failed) |
| `created_at` | string | ISO 8601 datetime |
| `started_at` | string | ISO 8601 datetime (nullable) |
| `completed_at` | string | ISO 8601 datetime (nullable) |

### Detail Example

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

**Description:** Cancel a running or pending task. Tasks in `completed`, `failed`, or `cancelled` state cannot be cancelled.

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | int | Task ID |

**Response:** `ApiResponse` (no data)

### Cancel Example

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

## Error Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Cannot cancel task (already completed/failed/cancelled) |
| 404 | Task not found |
