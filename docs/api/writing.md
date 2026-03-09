# Writing API

Base path: `/api/v1/projects/{project_id}/writing`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/{id}/writing/assist` | General assistance |
| POST | `/projects/{id}/writing/summarize` | Summarize papers |
| POST | `/projects/{id}/writing/citations` | Generate citations |
| POST | `/projects/{id}/writing/review-outline` | Review outline |
| POST | `/projects/{id}/writing/gap-analysis` | Gap analysis |

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
  "style": "gb7714"
}
```

Styles: `gb7714`, `apa`, `mla`
