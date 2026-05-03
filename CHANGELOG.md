# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/), with [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Added (Cycle 18-36)

#### Features
- **Advanced Search** — Author and journal filters on paper list
- **Batch Operations** — Mark Read/Unread, batch paper update endpoint
- **Concept Persistence** — Concept extraction with database-backed storage
- **Notes Aggregation** — Project-wide notes dashboard with Markdown/LaTeX
- **Reading Goals** — Daily/weekly targets with streak tracking
- **Reading History** — Session tracking with time stats and pagination
- **Team Page** — Dedicated team management with invite dialog

#### Infrastructure
- **i18n** — 100% bilingual coverage (en/zh), zero missing keys
- **PWA** — Service worker, offline caching, manifest, mobile meta tags
- **Mobile** — Horizontal scrollable nav, responsive grids, safe-area-inset
- **CLAUDE.md** — Project conventions for autonomous development

### Fixed
- Reading sessions API 500 error (SQLAlchemy lazy loading)
- Feed API 500 error (Keyword model field name)
- Analytics heatmap duplicate React keys + month label width
- Non-existent project shows "Project not found" instead of loading forever
- AudioOverviewDialog and AuthorNetworkDialog missing Escape key handler
- 10 nav labels hardcoded in English → all use i18n
- CI TypeScript errors in test files and component props
- Export dialog overlay leak
- PWA manifest referencing non-existent icons

### Tests
- **273 frontend tests** (48 test files)
- **861 backend tests** (46 test files)
- **39 E2E tests** (Playwright)
- CI fully green

## [2.0.0] - 2026-03-11

### V2 Architecture Upgrade — Chat-Centric Scientific Assistant

#### Chat & LLM
- ChatGPT-style interface with SSE streaming and knowledge base selection
- Multi-provider LLM: OpenAI, Anthropic, Aliyun, Volcengine, Ollama, mock
- Conversation CRUD with message history

#### RAG & Pipeline
- LlamaIndex RAG Engine with ChromaDB and GPU-aware BAAI/bge-m3 embeddings
- LangGraph pipeline orchestration with HITL interrupt/resume
- Automatic pipeline service: crawl → OCR → index

#### Frontend
- shadcn/ui + Radix UI overhaul with Framer Motion
- Full Chinese/English i18n
- PDF upload dialog, search & add papers, dedup conflict panel
- Settings page with LLM provider management

#### Infrastructure
- Alembic migrations, new data models (Conversation, PaperChunk, Subscription)
- MCP protocol server for AI IDE clients
- Security audit, path traversal prevention, CORS tightening

## [1.0.0] - 2026-03-10

Initial release with 8 modules: Keywords, Search, Dedup, Subscription, Crawler, OCR, RAG, Writing.

[Unreleased]: https://github.com/sylvanding/omelette/compare/main...HEAD
[2.0.0]: https://github.com/sylvanding/omelette/compare/v1.0.0...main
[1.0.0]: https://github.com/sylvanding/omelette/releases/tag/v1.0.0
