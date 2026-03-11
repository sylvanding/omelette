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

Set `LLM_PROVIDER` to one of: `openai`, `anthropic`, `aliyun`, `volcengine`, `ollama`, `mock`.

### OpenAI

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENAI_MODEL` | Model name (default: `gpt-4o-mini`) |

### Anthropic

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `ANTHROPIC_MODEL` | Model name (default: `claude-sonnet-4-20250514`) |

### Aliyun Bailian

| Variable | Description |
|----------|-------------|
| `ALIYUN_API_KEY` | Aliyun API key |
| `ALIYUN_BASE_URL` | OpenAI-compatible endpoint |
| `ALIYUN_MODEL` | Model name (e.g. `qwen3.5-plus`) |

### Volcengine Doubao

| Variable | Description |
|----------|-------------|
| `VOLCENGINE_API_KEY` | Volcengine API key |
| `VOLCENGINE_BASE_URL` | OpenAI-compatible endpoint |
| `VOLCENGINE_MODEL` | Model name |

### Ollama (local)

| Variable | Description |
|----------|-------------|
| `OLLAMA_BASE_URL` | Ollama server URL (default: `http://localhost:11434`) |
| `OLLAMA_MODEL` | Model name (default: `llama3`) |

### Mock

Use `LLM_PROVIDER=mock` for testing without API keys. No additional variables required.

## Embeddings

| Variable | Description | Default |
|----------|-------------|---------|
| `EMBEDDING_PROVIDER` | `local`, `api`, or `mock` | `local` |
| `EMBEDDING_MODEL` | Model name (local: HuggingFace; api: OpenAI-compatible) | `BAAI/bge-m3` |

- **local**: Uses sentence-transformers with GPU auto-detection
- **api**: Uses OpenAI-compatible embedding API
- **mock**: Deterministic mock for tests

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

## Frontend Settings

LLM provider, model, temperature, and API keys can be configured via the **Settings** page at `/settings` in the web UI. These settings override environment variables for the current user and are stored in the database. Use this for per-user customization without editing `.env`.
