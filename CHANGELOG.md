# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/), with [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

## [2.0.0] - 2026-03-11

### V2 Architecture Upgrade

A complete overhaul of Omelette from a project-centric tool collection into a **chat-centric scientific assistant**.

### Added

#### Chat & LLM

- **Chat Playground** — ChatGPT-style interface with SSE streaming, knowledge base selection, and tool modes (QA, citation lookup, review outline, gap analysis) (`6d55784`)
- **Multi-Provider LLM** — LangChain abstraction supporting OpenAI, Anthropic, Aliyun Bailian, Volcengine Doubao, Ollama, and mock providers with per-session switching (`445cbf9`)
- **Conversation Management** — CRUD API for conversations with message history and knowledge base association

#### RAG & Embeddings

- **LlamaIndex RAG Engine** — Upgraded from raw ChromaDB to LlamaIndex with `VectorStoreIndex`, `SentenceSplitter`, and hybrid retrieval (`6cf27d6`)
- **GPU-Aware Embeddings** — `HuggingFaceEmbedding` with `BAAI/bge-m3`, automatic CUDA detection, multi-GPU support
- **Reranking** — `BAAI/bge-reranker-v2-m3` for improved retrieval quality

#### Pipeline Orchestration

- **LangGraph Pipeline Engine** — `StateGraph`-based orchestration for search and upload workflows with conditional edges (`cee2946`)
- **HITL Conflict Resolution** — `interrupt()` / `Command(resume=...)` for deduplication conflicts with Git-style UI
- **Checkpointing** — `MemorySaver` for state persistence (SqliteSaver planned for production)
- **Pipeline API** — Start, status, resume, and cancel endpoints (`/api/v1/pipelines/*`)
- **Automatic Pipeline Service** — crawl → OCR → index background processing (`27f12ae`)

#### Knowledge Base & Subscriptions

- **Knowledge Base Alias Routes** — `/api/v1/knowledge-bases/{id}/*` aliases for project-based endpoints (`121a840`)
- **PDF Upload API** — Multi-file upload with metadata extraction and dedup checking
- **Subscription Management** — CRUD API and frontend UI for RSS/API incremental updates (`8a470d6`)

#### MCP Integration

- **MCP Protocol Server** — Tools (search, lookup, add papers), resources (knowledge bases, papers, chunks), and prompts for AI IDE clients (`a533c00`)
- **Streamable HTTP** — Mounted at `/mcp` on the FastAPI app

#### Frontend

- **UI Overhaul** — shadcn/ui + Radix primitives, Framer Motion animations, icon sidebar, responsive layout (`eabda7b`)
- **i18n** — Full Chinese/English bilingual support with react-i18next and automatic language detection (`e582ff6`)
- **PDF Upload Dialog** — Drag-and-drop multi-file upload with progress tracking
- **Search & Add** — Keyword search with source selection, result preview, and batch import
- **Dedup Conflict Panel** — Side-by-side paper comparison with keep/replace/skip actions
- **Settings Page** — LLM provider selection, API key management, system configuration

#### Infrastructure

- **Alembic Migrations** — Formal database migration system with auto-upgrade on startup (`994b20d`)
- **New Data Models** — `Conversation`, `ConversationMessage`, `PaperChunk`, `Subscription`

### Fixed

- VitePress hero image double base path `/omelette/omelette/` → `/omelette/` (`cc1e7b3`)
- Test database creating stale `.db` files in project root — moved to `tempfile` (`cc1e7b3`)
- Crawler return key mismatch (`file_path` → `path`) causing empty `pdf_path` (`cc1e7b3`)
- CORS wildcard `["*"]` removed — now uses only configured origins (`cc1e7b3`)
- Upload pipeline path traversal vulnerability — validate paths against allowed directory (`cc1e7b3`)
- Uploaded filename sanitization — strip path components (`cc1e7b3`)
- Blocking sync calls in RAG query/index — wrapped in `asyncio.to_thread` (`cc1e7b3`)
- Blocking OCR call in pipeline node — wrapped in `asyncio.to_thread` (`cc1e7b3`)
- `sort_by` restricted to allowed column whitelist in papers list (`cc1e7b3`)
- Frontend TypeScript build errors (unused variables, implicit `any`, type mismatches) (`6ae7798`)

### Security

- Security audit completed with documented findings (`docs/security/SECURITY-AUDIT-2025-03-11.md`)
- Path traversal prevention on upload pipeline and dedup resolve endpoints
- Filename sanitization on PDF upload
- CORS tightened to configured origins only

### Documentation

- README (EN/ZH) updated with V2 architecture, new features, and API overview
- VitePress docs updated: architecture, getting-started, configuration
- New doc pages: Chat Playground, LangGraph Pipeline, MCP Integration (EN/ZH)
- Security audit report added

### Tests

- **178 backend tests** passing (up from ~50 in V1)
- New test suites: pipelines, chat, conversations, subscriptions, upload, MCP
- Test database isolation via `tempfile.mkdtemp()`

### Dependencies Added

- `langchain-core`, `langchain-openai`, `langchain-anthropic`, `langchain-community`
- `llama-index-core`, `llama-index-vector-stores-chroma`, `llama-index-embeddings-huggingface`
- `langgraph`, `langgraph-checkpoint-sqlite`
- `mcp>=1.26`
- `alembic`
- Frontend: `@radix-ui/*`, `framer-motion`, `react-i18next`, `i18next`, `react-markdown`, `remark-math`, `rehype-katex`

---

## [1.0.0] - 2026-03-10

### Added

- Initial release with 8 modules: Keywords, Search, Dedup, Subscription, Crawler, OCR, RAG, Writing
- FastAPI backend with SQLAlchemy async + SQLite
- React 18 frontend with TypeScript + Vite + TailwindCSS
- VitePress documentation (bilingual EN/ZH)
- GitHub Actions CI (ruff, pytest, tsc, docs build)
- Pre-commit hooks (trailing whitespace, ruff, conventional commits)

[Unreleased]: https://github.com/sylvanding/omelette/compare/main...HEAD
[2.0.0]: https://github.com/sylvanding/omelette/compare/v1.0.0...main
[1.0.0]: https://github.com/sylvanding/omelette/releases/tag/v1.0.0
