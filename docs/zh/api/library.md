> ⚠️ 本文档的中文翻译正在进行中。以下为英文原文。

# Library API

Base path: `/api/v1/projects/{project_id}/library`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects/{id}/library` | List library papers |
| POST | `/projects/{id}/library` | Add papers to library |
| DELETE | `/projects/{id}/library/{paper_id}` | Remove paper from library |

## Library

`GET /projects/{id}/library` — List papers in the project's personal library collection.

Library papers are the curated set of papers the user has intentionally saved to their project, as opposed to all papers that may have been imported or discovered.

**Query parameters:**
- `page`, `page_size` — Pagination

**Response fields:**
- `items[]` — Paper metadata
- `total` — Total papers in the library
