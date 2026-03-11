# Getting Started

This guide walks you through setting up Omelette from scratch.

## Prerequisites

- [Conda](https://docs.conda.io/) or Miniconda
- Node.js 22+
- (Optional) CUDA for GPU-accelerated OCR and embeddings
- (Optional) API keys: OpenAI, Anthropic, Aliyun Bailian, or Volcengine for LLM; Semantic Scholar for higher search limits

## 1. Clone the Repository

```bash
git clone git@github.com:sylvanding/omelette.git
cd omelette
```

## 2. Set Up Conda Environment

```bash
conda env create -f environment.yml
conda activate omelette
```

## 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys (LLM, Semantic Scholar, etc.)
```

Use `LLM_PROVIDER=mock` for testing without API keys.

## 4. Start the Backend

```bash
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Note:** Alembic migrations run automatically on startup. The database schema is brought up to date before the server accepts requests.

## 5. Start the Frontend

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

## 6. Open the Application

Visit [http://localhost:3000](http://localhost:3000).

## LLM Provider Options

Set `LLM_PROVIDER` in `.env` to one of:

| Provider | Description |
|----------|-------------|
| `openai` | OpenAI API (GPT-4, etc.) — set `OPENAI_API_KEY`, `OPENAI_MODEL` |
| `anthropic` | Anthropic Claude — set `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |
| `aliyun` | Aliyun Bailian (Coding Plan) — set `ALIYUN_API_KEY`, `ALIYUN_BASE_URL`, `ALIYUN_MODEL` |
| `volcengine` | Volcengine Doubao — set `VOLCENGINE_API_KEY`, `VOLCENGINE_BASE_URL`, `VOLCENGINE_MODEL` |
| `ollama` | Local Ollama — set `OLLAMA_BASE_URL`, `OLLAMA_MODEL` |
| `mock` | No real LLM calls; returns preset responses for testing |

## MCP Usage

Omelette exposes an MCP server for AI IDEs (Claude Code, Codex, Cursor). To connect:

1. **Start the backend** so the MCP endpoint is available at `http://localhost:8000/mcp`.

2. **Configure your AI IDE** to add Omelette as an MCP server:
   - **Claude Code / Codex**: Add a remote MCP server with URL `http://localhost:8000/mcp`
   - **Cursor**: Add Omelette in MCP settings with the same URL

3. Once connected, you can use tools like `search_knowledge_base`, `lookup_paper`, and `add_paper_by_doi` directly from your AI assistant.

## Optional: OCR and Embeddings

For full OCR and embedding support:

```bash
conda activate omelette
cd backend
pip install -e ".[ocr,ml]"
```

- **OCR:** PaddleOCR (GPU recommended via `paddlepaddle-gpu`)
- **Embeddings:** sentence-transformers with BAAI/bge-m3 (downloads on first use)

## Running Tests

```bash
cd backend
pytest tests/ -v
```

The test suite includes 178 tests covering API endpoints, services, and pipelines.
