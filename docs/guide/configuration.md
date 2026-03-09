# Configuration

Omelette is configured via environment variables. Copy `.env.example` to `.env` and customize.

## Application

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_ENV` | `development`, `production`, or `testing` | `development` |
| `APP_DEBUG` | Enable debug mode | `true` |
| `APP_HOST` | Backend bind address | `0.0.0.0` |
| `APP_PORT` | Backend port | `8000` |

## Database

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | SQLite connection string | `sqlite:///./data/omelette.db` |

## Data Storage

| Variable | Description |
|----------|-------------|
| `DATA_DIR` | Base path for PDFs, OCR output, ChromaDB |
| `PDF_DIR` | PDF storage (default: `{DATA_DIR}/pdfs`) |
| `OCR_OUTPUT_DIR` | OCR output (default: `{DATA_DIR}/ocr_output`) |
| `CHROMA_DB_DIR` | ChromaDB path (default: `{DATA_DIR}/chroma_db`) |

## LLM Provider

Set `LLM_PROVIDER` to one of:

- **`aliyun`** — Aliyun Bailian (Coding Plan). Set `ALIYUN_API_KEY`, `ALIYUN_BASE_URL`, `ALIYUN_MODEL`.
- **`volcengine`** — Volcengine Doubao. Set `VOLCENGINE_API_KEY`, `VOLCENGINE_BASE_URL`, `VOLCENGINE_MODEL`.
- **`mock`** — No real LLM calls; returns preset responses for testing.

## GPU

| Variable | Description | Default |
|----------|-------------|---------|
| `CUDA_VISIBLE_DEVICES` | Comma-separated GPU IDs for OCR/embeddings | `0,3` |

## Proxy

| Variable | Description |
|----------|-------------|
| `HTTP_PROXY` | HTTP proxy URL |
| `HTTPS_PROXY` | HTTPS proxy URL |

Example: `HTTP_PROXY=http://127.0.0.1:20171/`

## External APIs

| Variable | Description |
|----------|-------------|
| `SEMANTIC_SCHOLAR_API_KEY` | Optional; increases Semantic Scholar rate limit |
| `UNPAYWALL_EMAIL` | Required for Unpaywall PDF lookup |
