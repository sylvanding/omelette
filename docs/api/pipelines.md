# Pipelines API

Base path: `/api/v1/pipelines`

## Overview

LangGraph pipeline orchestration for search and upload workflows. Pipelines run asynchronously and support HITL (human-in-the-loop) interrupt for conflict resolution.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/pipelines/search` | Start keyword-search pipeline |
| POST | `/pipelines/upload` | Start PDF-upload pipeline |
| GET | `/pipelines/{thread_id}/status` | Get pipeline status |
| POST | `/pipelines/{thread_id}/resume` | Resume interrupted pipeline |
| POST | `/pipelines/{thread_id}/cancel` | Cancel running pipeline |

## Search Pipeline

`POST /pipelines/search` — Start search → dedup → crawl → OCR → index pipeline.

**Request body:**

```json
{
  "project_id": 1,
  "query": "transformer attention",
  "sources": ["semantic_scholar", "openalex"],
  "max_results": 50
}
```

**Response:** `{ thread_id, status, project_id }`

## Upload Pipeline

`POST /pipelines/upload` — Start extract → dedup → OCR → index pipeline for local PDF paths.

**Request body:**

```json
{
  "project_id": 1,
  "pdf_paths": ["/path/to/paper1.pdf", "/path/to/paper2.pdf"]
}
```

Paths must be within the configured `PDF_DIR` (see settings).

**Response:** `{ thread_id, status, project_id }`

## Status

`GET /pipelines/{thread_id}/status` — Returns `status` (`running`, `interrupted`, `completed`, `failed`, `cancelled`). When `interrupted`, includes `conflicts` for HITL resolution.

## Resume

`POST /pipelines/{thread_id}/resume` — Resume interrupted pipeline with resolved conflicts.

**Request body:**

```json
{
  "resolved_conflicts": []
}
```

## Cancel

`POST /pipelines/{thread_id}/cancel` — Cancel a running pipeline.
