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

---

## Literature Review Draft (Streaming)

### POST /api/v1/projects/{project_id}/writing/review-draft/stream

Generate a structured literature review draft via SSE (Server-Sent Events).

**Request Body:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| topic | string | "" | Review topic (empty for auto-detection) |
| style | string | "narrative" | Review style: narrative, systematic, thematic |
| citation_format | string | "numbered" | Citation format: numbered, apa, gb_t_7714 |
| language | string | "zh" | Output language: zh, en |

**SSE Events:**

| Event | Data | Description |
|-------|------|-------------|
| progress | {step, message} | Progress update |
| outline | {sections: string[]} | Generated outline sections |
| section-start | {title, section_index} | Section generation begins |
| text-delta | {delta, section_index} | Text chunk for current section |
| section-end | {section_index} | Section generation complete |
| citation-map | {citations: {[num]: {paper_id, title, number}}} | Reference mapping |
| done | {total_sections} | Generation complete |
| error | {message} | Error occurred |

**Example:**

```bash
curl -X POST http://localhost:8000/api/v1/projects/1/writing/review-draft/stream \
  -H "Content-Type: application/json" \
  -d '{"topic": "deep learning in NLP", "style": "narrative"}' \
  --no-buffer
```
