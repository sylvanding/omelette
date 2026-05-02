# Analytics API

Base path: `/api/v1/projects/{project_id}/analysis`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects/{id}/analysis/knowledge-gaps` | Identify knowledge gaps based on paper distribution |

## Knowledge Gaps

`GET /projects/{id}/analysis/knowledge-gaps` — Identify underrepresented topics based on paper distribution.

Uses analytics service to analyze topic coverage and identify gaps in the project's paper collection. Returns a structured analysis of topic gaps with recommendations.
