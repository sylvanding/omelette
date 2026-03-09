# Deduplication Module

Three-stage pipeline: DOI hard dedup, title similarity, LLM-verified dedup.

## Features

- **DOI hard dedup:** Exact DOI match removes duplicates
- **Title similarity:** Jaccard/edit distance for papers without DOI
- **LLM verify:** Optional LLM-assisted judgment for ambiguous pairs
- **Async task:** Returns task_id for progress polling

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/{id}/dedup/run` | Run deduplication |
| GET | `/projects/{id}/dedup/candidates` | Preview dedup candidates |
| POST | `/projects/{id}/dedup/verify` | LLM-verify candidate pair |

## Usage Example

```bash
# Run dedup
curl -X POST http://localhost:8000/api/v1/projects/1/dedup/run

# Preview candidates before running
curl http://localhost:8000/api/v1/projects/1/dedup/candidates

# Poll task status
curl http://localhost:8000/api/v1/tasks/{task_id}
```
