> ⚠️ 本文档的中文翻译正在进行中。以下为英文原文。

# Upload API

Base path: `/api/v1/projects/{project_id}`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/{id}/upload` | Upload files (general) |
| POST | `/projects/{id}/upload/browser` | Upload from browser extension |

## General Upload

`POST /projects/{id}/upload` — Upload and process paper files.

Accepts `multipart/form-data` with PDF files. Extracts metadata, runs dedup check, and queues processing for new papers.

## Browser Extension Upload

`POST /projects/{id}/upload/browser` — Accept papers captured via the Chrome browser extension.

**Query parameters:**
- `url` — URL of the paper
- `doi` — DOI (optional)
- `arxiv_id` — arXiv identifier (optional)
- `title` — Paper title (optional)
- `tags` — Comma-separated tags (optional)

The extension detects academic papers on sites like arXiv, Semantic Scholar, and PubMed, then injects a "Save to Omelette" button. This endpoint receives the captured paper data.
