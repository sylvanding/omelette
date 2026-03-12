# Writing API

Base path: `/api/v1/projects/{project_id}/writing`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/{id}/writing/assist` | General writing assistance |
| POST | `/projects/{id}/writing/summarize` | Summarize papers |
| POST | `/projects/{id}/writing/citations` | Generate citations |
| POST | `/projects/{id}/writing/review-outline` | Review outline |
| POST | `/projects/{id}/writing/gap-analysis` | Gap analysis |

## Assist (General)

`POST /projects/{id}/writing/assist` — AI-powered writing assistance for summarize, cite, outline, or gap analysis.

**Request body:**

```json
{
  "task": "summarize",
  "text": "",
  "paper_ids": [1, 2],
  "topic": "Literature Review",
  "style": "gb_t_7714",
  "language": "en"
}
```

- `task` — `summarize`, `cite`, `review_outline`, or `gap_analysis`
- `paper_ids` — Paper IDs (for summarize/cite)
- `topic` — Topic for outline/gap analysis
- `style` — Citation style (for cite task)
- `language` — Output language (default: `en`)

**Response:** `{ content, citations, suggestions }`

## Summarize Request

```json
{
  "paper_ids": [1, 2, 3]
}
```

## Citations Request

```json
{
  "paper_ids": [1, 2],
  "style": "gb_t_7714"
}
```

**Citation styles:** `gb_t_7714`, `apa`, `mla`
