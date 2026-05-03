> ⚠️ 本文档的中文翻译正在进行中。以下为英文原文。

# Reviews API

Base path: `/api/v1/projects/{project_id}/reviews`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects/{id}/reviews` | List paper reviews |
| POST | `/projects/{id}/reviews` | Create a review |
| PUT | `/projects/{id}/reviews/{id}` | Update a review |
| DELETE | `/projects/{id}/reviews/{id}` | Delete a review |

## Reviews

Reviews allow users to evaluate and annotate papers in their project collection.

**Review schema fields:**
- `id` — Review ID
- `paper_id` — Associated paper
- `rating` — Numeric rating
- `notes` — Review notes
- `status` — Review status
- `created_at`, `updated_at` — Timestamps
