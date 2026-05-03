# Configuration

Copy `.env.example` to `.env` and customize.

## LLM Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_PROVIDER` | `openai`, `anthropic`, `aliyun`, `volcengine`, `ollama`, or `mock` | `mock` |
| `OPENAI_API_KEY` | OpenAI API key | — |
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `ALIYUN_API_KEY` | Aliyun Bailian API key | — |
| `VOLCENGINE_API_KEY` | Volcengine Doubao API key | — |
| `LLM_MODEL_NAME` | Model name override | Provider default |
| `LLM_TEMPERATURE` | 0.0 - 2.0 | `0.7` |
| `LLM_MAX_TOKENS` | Max response tokens | `4096` |

## Embedding Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `EMBEDDING_PROVIDER` | `local` (GPU/CPU) or `api` | `local` |
| `EMBEDDING_MODEL` | HuggingFace model | `BAAI/bge-m3` |
| `RERANKER_MODEL` | Reranking model | `BAAI/bge-reranker-v2-m3` |
| `EMBEDDING_API_KEY` | API key (if using API provider) | — |

## GPU Management

| Variable | Description | Default |
|----------|-------------|---------|
| `GPU_MODE` | `conservative`, `balanced`, `aggressive` | `balanced` |
| `MODEL_TTL_SECONDS` | Auto-unload idle models after N seconds | `300` |
| `MINERU_AUTO_MANAGE` | Auto start/stop MinerU subprocess | `true` |
| `MINERU_CONDA_ENV` | Conda environment name for MinerU | `mineru` |

## Data & Storage

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | SQLite database path | `sqlite:///./data/omelette.db` |
| `DATA_DIR` | Base path for PDFs, OCR, ChromaDB | `data` |
| `CHROMA_PERSIST_DIR` | ChromaDB vector store path | `{DATA_DIR}/chroma` |

## PDF Processing

| Variable | Description | Default |
|----------|-------------|---------|
| `PDF_PARSER` | `auto`, `mineru`, or `pdfplumber` | `auto` |
| `OCR_ENGINE` | `paddle` or `tesseract` | `paddle` |
| `MINERU_API_URL` | MinerU service URL | `http://localhost:8010` |

## Academic Sources

| Variable | Description | Default |
|----------|-------------|---------|
| `SEMANTIC_SCHOLAR_API_KEY` | Higher rate limits (100 req/s) | — |
| `S2_API_BASE` | Semantic Scholar API | `https://api.semanticscholar.org/graph/v1` |
| `CROSSREF_API_BASE` | Crossref API | `https://api.crossref.org` |

## Server

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_ENV` | `development` or `production` | `development` |
| `APP_SECRET_KEY` | Session signing key | `change-me-to-a-random-secret-key` |
| `FRONTEND_URL` | CORS allowed origin | `http://localhost:3000` |
| `CORS_ORIGINS` | Comma-separated CORS origins | `http://localhost:3000` |

## Mock Mode

When `LLM_PROVIDER=mock`, Omelette returns preset responses. No API keys, no external calls. Use this for:
- Development without API costs
- Testing and CI
- Exploring the UI before configuring providers

The mock provider returns sensible placeholder data for all LLM-dependent features.
