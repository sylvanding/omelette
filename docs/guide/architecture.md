# Architecture

## System Overview

Omelette follows a pipeline architecture where data flows through sequential modules:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Omelette Pipeline                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  Keywords → Search → Dedup → Crawler → OCR → RAG → Writing                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Chat & RAG Flow

The chat and RAG subsystem uses a layered stack:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Chat & RAG Architecture                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  Chat UI → LLM (LangChain) → RAG (LlamaIndex) → Vector Store (ChromaDB)      │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Chat UI** — React frontend with conversation history
- **LLM** — LangChain for chat orchestration (OpenAI, Anthropic, Aliyun, Volcengine, Ollama, mock)
- **RAG** — LlamaIndex for retrieval-augmented generation and hybrid search
- **Vector Store** — ChromaDB for embeddings and semantic search

## LangGraph Pipeline Orchestration

Literature ingestion is orchestrated by **LangGraph** pipelines:

- **Search Pipeline**: `search → dedup → [HITL if conflicts] → apply_resolution → import → crawl → ocr → index`
- **Upload Pipeline**: `extract_metadata → dedup → [HITL if conflicts] → apply_resolution → import → ocr → index`

Both pipelines support conditional flows: when deduplication detects conflicts, a human-in-the-loop (HITL) step allows manual resolution before papers are imported into the project.

## MCP Integration

Omelette exposes an **MCP (Model Context Protocol)** server for AI IDEs:

- **Streamable HTTP**: Mounted at `/mcp` when the backend runs; connect from Claude Code, Codex, or Cursor via `http://host:port/mcp`
- **Tools**: `search_knowledge_base`, `lookup_paper`, `add_paper_by_doi`, etc.
- **Resources**: Project metadata, paper details
- **Prompts**: Predefined templates for literature review and citation lookup

See [Getting Started](./getting-started#mcp-usage) for connection instructions.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | FastAPI, SQLAlchemy 2 (async), Pydantic v2 |
| Frontend | React 19, Vite 7, TypeScript, Tailwind CSS, shadcn/ui |
| Database | SQLite, Alembic (migrations) |
| Vector DB | ChromaDB |
| OCR | PaddleOCR |
| LLM | LangChain (OpenAI, Anthropic, Aliyun, Volcengine, Ollama, mock) |
| RAG | LlamaIndex |
| Pipeline | LangGraph |
| Orchestration | MCP (Model Context Protocol) |
| Embeddings | BAAI/bge-m3 (sentence-transformers) |

## Directory Structure

```
omelette/
├── backend/              # FastAPI application
│   ├── app/
│   │   ├── api/v1/       # REST endpoints (keywords, search, dedup, crawler, ocr, rag, writing)
│   │   ├── models/       # SQLAlchemy models (Project, Paper, Keyword, Task, etc.)
│   │   ├── schemas/      # Pydantic request/response schemas
│   │   ├── services/     # Business logic (LLM, search, crawler, OCR, RAG, writing)
│   │   ├── pipelines/    # LangGraph pipeline definitions
│   │   ├── mcp_server.py # MCP server (tools, resources, prompts)
│   │   └── main.py       # App entry, lifespan, CORS
│   ├── alembic/          # Database migrations
│   └── tests/
├── frontend/             # React SPA
│   └── src/
│       ├── pages/        # Dashboard, ProjectDetail, Settings
│       ├── components/   # Layout, shared UI (shadcn/ui)
│       ├── stores/       # Zustand state
│       └── lib/          # API client, utils
├── docs/                 # VitePress documentation
├── environment.yml       # Conda environment
├── .env.example         # Configuration template
└── .github/workflows/   # CI and docs deploy
```
