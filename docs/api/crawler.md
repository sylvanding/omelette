# Crawler API

爬虫模块 API，用于为待下载文献执行 PDF 下载（Unpaywall 等多源回退）。

**Base path:** `/api/v1/projects/{project_id}/crawl`

---

## Endpoints

| Method | Path | Description |
|--------|------|--------------|
| POST | `/start` | 启动 PDF 下载任务 |
| GET | `/stats` | 获取下载统计 |

---

## POST /start

对项目内待下载文献启动 PDF 下载。仅处理 `pending` 或 `metadata_only` 状态文献。

**Query Parameters**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `priority` | string | `"high"` | 优先级：`high` 按引用数排序，`low` 按创建时间排序 |
| `max_papers` | int | 50 | 单次处理最大文献数 |

**Response**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "total": 10,
    "success": 8,
    "failed": 2,
    "details": [
      {
        "paper_id": 1,
        "success": true,
        "file_path": "/data0/djx/omelette/.../1.pdf"
      }
    ]
  }
}
```

**Example**

```bash
curl -X POST "http://localhost:8000/api/v1/projects/1/crawl/start?priority=high&max_papers=50"
```

---

## GET /stats

返回项目内下载相关统计。

**Response**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "pending": 20,
    "metadata_only": 5,
    "pdf_downloaded": 80,
    "ocr_complete": 60,
    "indexed": 50,
    "error": 3,
    "storage": {
      "total_mb": 1024,
      "used_mb": 512
    }
  }
}
```

- 各状态字段：文献数量
- `storage`：存储统计（可选，由 CrawlerService 提供）

**Example**

```bash
curl "http://localhost:8000/api/v1/projects/1/crawl/stats"
```

---

## Error Codes

| Code | Description |
|------|-------------|
| 404 | 项目不存在 |
