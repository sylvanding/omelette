# PDF Crawler Module

Multi-channel PDF download: Unpaywall → arXiv → direct URL fallback.

## Features

- **Unpaywall:** Open-access links (requires `UNPAYWALL_EMAIL`)
- **arXiv:** Preprint PDFs for arXiv papers
- **Direct URL:** Fallback when available
- **Async task:** Progress and retry support

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/{id}/crawler/start` | Start PDF crawl |
| GET | `/projects/{id}/crawler/stats` | Crawl statistics |

## Usage Example

```bash
# Start crawl for project papers
curl -X POST http://localhost:8000/api/v1/projects/1/crawler/start

# Get stats
curl http://localhost:8000/api/v1/projects/1/crawler/stats
```
