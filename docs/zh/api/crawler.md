# Crawler API

路径：`/api/v1/projects/{project_id}/crawl`

## 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /projects/{id}/crawl/start | 启动 PDF 下载 |
| GET | /projects/{id}/crawl/stats | 下载统计 |

## POST /start

对项目内待下载文献启动 PDF 下载（Unpaywall 等多源回退）。仅处理 `pending` 或 `metadata_only` 状态文献。

**查询参数：** `priority`（high/low）、`max_papers`（默认 50）

## GET /stats

返回项目内各状态文献数量及存储统计。
