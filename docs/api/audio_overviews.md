# Audio Overviews API

Base path: `/api/v1/projects/{project_id}/audio-overviews`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/{id}/audio-overviews` | Generate audio overview dialogue |
| GET | `/projects/{id}/audio-overviews` | List audio overviews for a project |
| DELETE | `/projects/{id}/audio-overviews/{overview_id}` | Delete an audio overview |

## Generate Audio Overview

`POST /projects/{id}/audio-overviews` — Generate a conversational dialogue script summarizing selected papers.

**Request body:**
```json
{
  "paper_ids": [1, 2, 3],
  "tone": "conversational",
  "focus_areas": ["methodology", "results"]
}
```

**Parameters:**
- `paper_ids` — List of paper IDs to include (required, minimum 1)
- `tone` — `"formal"` or `"conversational"` (default: `"conversational"`)
- `focus_areas` — Optional list of focus area tags

**Response fields:**
- `title` — Overview title
- `duration_estimate` — Estimated listening time
- `summary` — Short summary of the overview
- `script[]` — Dialogue entries with `speaker` and `text`
- `paper_count` — Number of papers included

## List Audio Overviews

`GET /projects/{id}/audio-overviews` — List all generated audio overviews for the project.

**Response fields:**
- `items[]` — Each with `id`, `title`, `summary`, `duration_estimate`, `tone`, `paper_count`, `paper_ids`, `created_at`
- `total` — Total number of overviews

## Delete Audio Overview

`DELETE /projects/{id}/audio-overviews/{overview_id}` — Permanently delete a specific audio overview.
