> ⚠️ 本文档的中文翻译正在进行中。以下为英文原文。

# Concepts API

Base path: `/api/v1/projects/{project_id}/concepts`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects/{id}/concepts` | List knowledge concepts/topics in a project |

## Concepts

`GET /projects/{id}/concepts` — Retrieve the knowledge concepts/topics extracted from project papers.

Returns a list of conceptual topics or themes found across the papers in the project, useful for understanding the subject matter coverage of a research collection.
