# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/), with [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Added

#### Phase 2 Features (FEAT-011 through FEAT-020)

- **Audio Overviews** — LLM-generated dialogue audio for paper collections with tone selection and focus areas (`FEAT-011`)
- **Browser Extension** — Chrome extension for one-click paper capture from academic sites (arXiv, PubMed, Semantic Scholar) (`FEAT-012`)
- **Reference Export** — BibTeX, RIS, EndNote, and Zotero export with two-tab dialog UI (`FEAT-013`)
- **Team Members** — Project team management with invite, role assignment (read/write/admin), and RBAC middleware (`FEAT-014`)
- **API Key Management** — SHA-256 hashed API keys with scope-based access control (`omk_` prefix) (`FEAT-015`)
- **Author Network** — d3-force directed graph visualization of co-authorship relationships with centrality metrics (`FEAT-016`)
- **Trend Analysis** — Year-binned topic trends, publication volume charts, emerging/declining topic detection (`FEAT-017`)
- **Gap Analysis** — LLM-powered research gap identification with novelty and feasibility scoring (`FEAT-018`)
- **Version Tracking** — Paper version history with Semantic Scholar polling, diff generation, and upgrade preservation (`FEAT-019`)
- **Collection Management** — Paper collections with custom tags and bulk operations (`FEAT-020`)

#### Cycle 18 Features (FEAT-026 through FEAT-030)

- **Audio Overviews Page** — Dedicated page for browsing, generating, playing, and deleting audio overviews (`FEAT-027`)
- **Search Page** — External academic search with similar papers discovery from library (`FEAT-028`)
- **Notifications** — In-app notification bell, dropdown panel, mark-all-read, and subscription alerts (`FEAT-029`)
- **Citation Tools** — Citation style picker (APA, MLA, Chicago, IEEE, GB/T 7714), bibliography builder, copy citation button (`FEAT-030`)
- **Notes Aggregation** — Project-wide notes dashboard with summary cards, global search, Markdown/LaTeX rendering, and paper cross-references (`FEAT-031`)

#### Analysis & Visualization

- **Analytics Dashboard** — Comprehensive project analytics with reading patterns, paper status distribution, and activity metrics
- **Concept Map** — Knowledge concept visualization with relationship graphs
- **Activity Feed** — Project activity timeline with filterable events
- **Paper Comparison** — Side-by-side paper comparison with diff highlighting
- **Evidence Consensus** — Structured data extraction visualization with recharts

#### Frontend Infrastructure

- **TypeScript** — Full TypeScript migration with strict mode
- **Testing** — Vitest + Testing Library + MSW (255 tests, 42 test files)
- **E2E** — Playwright E2E test suite for critical user flows
- **Bundle Optimization** — Code splitting with manual chunks for react-pdf, d3, katex, ai-sdk
- **PWA Support** — Service worker with offline caching, manifest.json for installability, Apple mobile web app meta tags
- **Mobile Optimization** — Horizontal scrollable nav for project pages on mobile, responsive grid layouts, safe-area-inset support

### Fixed

- TypeScript build errors across 15+ files (type mismatches, missing imports, null safety)
- D3 type compatibility issues in AuthorNetworkView and CitationGraphView
- ReviewsPage `useToastMutation` property naming (`successMsg` → `successMessage`)
- CollectionSidebar invalid `size` prop on native input elements
- TeamMembersManager EmptyState action type mismatch
- ExportDialog null/undefined preview state handling
- HighlightOverlay missing `useCallback` import
- PapersToolbar test missing new callback props

### Tests

- **255 frontend tests** passing (42 test files)
- **850+ backend tests** passing (46+ test files)

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
