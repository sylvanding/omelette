# Writing Assistant Module

LLM-powered writing assistance: summarization, citation generation, review outlines, gap analysis.

## Features

- **Summarize:** Paper summaries
- **Citations:** GB/T 7714, APA, MLA formats
- **Review outline:** Literature review structure
- **Gap analysis:** Research gaps and opportunities

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/{id}/writing/assist` | General writing assistance |
| POST | `/projects/{id}/writing/summarize` | Summarize paper(s) |
| POST | `/projects/{id}/writing/citations` | Generate citations |
| POST | `/projects/{id}/writing/review-outline` | Generate review outline |
| POST | `/projects/{id}/writing/gap-analysis` | Gap analysis |

## Usage Example

```bash
# Summarize
curl -X POST http://localhost:8000/api/v1/projects/1/writing/summarize \
  -H "Content-Type: application/json" \
  -d '{"paper_ids": [1, 2, 3]}'

# Generate citations (GB/T 7714)
curl -X POST http://localhost:8000/api/v1/projects/1/writing/citations \
  -H "Content-Type: application/json" \
  -d '{"paper_ids": [1, 2], "style": "gb7714"}'
```
