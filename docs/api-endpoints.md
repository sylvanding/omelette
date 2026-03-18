# Omelette API Endpoints Reference

This document lists all API v1 endpoints exposed by the Omelette backend. Endpoints are grouped by module. Base URL: `/api/v1`.

**Legend:**
- 🤖 Involves LLM calls
- 📄 Involves file I/O (upload, download, PDF processing, vector store)
- 🔄 SSE streaming response

---

## Summary by Module

| Module | Endpoints | 🤖 LLM | 📄 File I/O | 🔄 SSE |
|--------|-----------|--------|-------------|--------|
| Projects | 6 | 0 | 2 | 0 |
| Papers | 9 | 0 | 2 | 0 |
| Upload | 2 | 0 | 2 | 0 |
| Keywords | 7 | 2 | 0 | 0 |
| Search | 2 | 0 | 0 | 0 |
| Dedup | 5 | 4 | 2 | 0 |
| Crawler | 2 | 0 | 1 | 0 |
| OCR | 2 | 0 | 1 | 0 |
| Subscriptions | 9 | 0 | 0 | 0 |
| RAG | 5 | 1 | 4 | 1 |
| Writing | 6 | 5 | 0 | 1 |
| Tasks | 3 | 0 | 0 | 0 |
| Settings | 5 | 1 | 0 | 0 |
| Conversations | 5 | 0 | 0 | 0 |
| Chat | 2 | 2 | 0 | 1 |
| Rewrite | 1 | 1 | 0 | 1 |
| Pipelines | 5 | 0 | 2 | 0 |
| **Total** | **76** | **16** | **14** | **4** |

---

## Projects

| Method | Path | Description | Params | Flags |
|--------|------|-------------|--------|-------|
| GET | `/api/v1/projects` | List projects with pagination | `page`, `page_size` | |
| POST | `/api/v1/projects` | Create a new project | Body: `ProjectCreate` (name, description, domain, settings) | |
| GET | `/api/v1/projects/{project_id}` | Get project by ID | `project_id` | |
| PUT | `/api/v1/projects/{project_id}` | Update project | `project_id`, Body: `ProjectUpdate` | |
| DELETE | `/api/v1/projects/{project_id}` | Delete project | `project_id` | |
| POST | `/api/v1/projects/{project_id}/pipeline/run` | Trigger crawl → OCR → index pipeline for all pending papers | `project_id` | 📄 |
| POST | `/api/v1/projects/{project_id}/pipeline/paper/{paper_id}` | Trigger pipeline for a single paper | `project_id`, `paper_id` | 📄 |

---

## Papers

| Method | Path | Description | Params | Flags |
|--------|------|-------------|--------|-------|
| GET | `/api/v1/projects/{project_id}/papers` | List papers with filters and pagination | `project_id`, `page`, `page_size`, `status`, `year`, `q`, `sort_by`, `order` | |
| POST | `/api/v1/projects/{project_id}/papers` | Create a paper | `project_id`, Body: `PaperCreate` | |
| POST | `/api/v1/projects/{project_id}/papers/bulk` | Bulk import papers | `project_id`, Body: `PaperBulkImport` (papers[]) | |
| GET | `/api/v1/projects/{project_id}/papers/{paper_id}` | Get paper by ID | `project_id`, `paper_id` | |
| PUT | `/api/v1/projects/{project_id}/papers/{paper_id}` | Update paper | `project_id`, `paper_id`, Body: `PaperUpdate` | |
| DELETE | `/api/v1/projects/{project_id}/papers/{paper_id}` | Delete paper | `project_id`, `paper_id` | |
| GET | `/api/v1/projects/{project_id}/papers/{paper_id}/pdf` | Serve PDF file | `project_id`, `paper_id` | 📄 |
| GET | `/api/v1/projects/{project_id}/papers/{paper_id}/citation-graph` | Get citation relationship graph via Semantic Scholar | `project_id`, `paper_id`, `depth`, `max_nodes` | |

---

## Upload (Papers)

| Method | Path | Description | Params | Flags |
|--------|------|-------------|--------|-------|
| POST | `/api/v1/projects/{project_id}/papers/upload` | Upload PDFs, extract metadata, run dedup check | `project_id`, `files` (multipart) | 📄 |
| POST | `/api/v1/projects/{project_id}/papers/process` | Trigger OCR + RAG indexing for papers | `project_id`, `paper_ids` (optional) | 📄 |

---

## Keywords

| Method | Path | Description | Params | Flags |
|--------|------|-------------|--------|-------|
| GET | `/api/v1/projects/{project_id}/keywords` | List keywords with pagination | `project_id`, `page`, `page_size`, `level` | |
| POST | `/api/v1/projects/{project_id}/keywords` | Create keyword | `project_id`, Body: `KeywordCreate` | |
| POST | `/api/v1/projects/{project_id}/keywords/bulk` | Bulk create keywords | `project_id`, Body: `KeywordCreate[]` | |
| GET | `/api/v1/projects/{project_id}/keywords/search-formula` | Generate boolean search formula from project keywords | `project_id`, `database` | 🤖 |
| PUT | `/api/v1/projects/{project_id}/keywords/{keyword_id}` | Update keyword | `project_id`, `keyword_id`, Body: `KeywordUpdate` | |
| DELETE | `/api/v1/projects/{project_id}/keywords/{keyword_id}` | Delete keyword | `project_id`, `keyword_id` | |
| POST | `/api/v1/projects/{project_id}/keywords/expand` | Expand seed keywords with synonyms via LLM | `project_id`, Body: `KeywordExpandRequest` | 🤖 |

---

## Search

| Method | Path | Description | Params | Flags |
|--------|------|-------------|--------|-------|
| POST | `/api/v1/projects/{project_id}/search/execute` | Execute federated search (Semantic Scholar, OpenAlex, arXiv, Crossref) | `project_id`, `query`, `sources`, `max_results`, `auto_import` | |
| GET | `/api/v1/projects/{project_id}/search/sources` | List available search sources and status | `project_id` | |

---

## Dedup

| Method | Path | Description | Params | Flags |
|--------|------|-------------|--------|-------|
| POST | `/api/v1/projects/{project_id}/dedup/run` | Run deduplication pipeline | `project_id`, `strategy` (full, doi_only, title_only) | 🤖 |
| GET | `/api/v1/projects/{project_id}/dedup/candidates` | List potential duplicate pairs for manual review | `project_id` | 🤖 |
| POST | `/api/v1/projects/{project_id}/dedup/verify` | Use LLM to verify if two papers are duplicates | `project_id`, `paper_a_id`, `paper_b_id` | 🤖 |
| POST | `/api/v1/projects/{project_id}/dedup/resolve` | Resolve upload conflict (keep_old, keep_new, merge, skip) | `project_id`, Body: `ResolveConflictRequest` | 📄 |
| POST | `/api/v1/projects/{project_id}/dedup/auto-resolve` | Use LLM to suggest resolution for conflict pairs | `project_id`, Body: `AutoResolveRequest` | 🤖 📄 |

---

## Crawler

| Method | Path | Description | Params | Flags |
|--------|------|-------------|--------|-------|
| POST | `/api/v1/projects/{project_id}/crawl/start` | Start PDF download for papers needing PDFs | `project_id`, `priority`, `max_papers` | 📄 |
| GET | `/api/v1/projects/{project_id}/crawl/stats` | Return download statistics for project | `project_id` | |

---

## OCR

| Method | Path | Description | Params | Flags |
|--------|------|-------------|--------|-------|
| POST | `/api/v1/projects/{project_id}/ocr/process` | Run OCR/text extraction on downloaded PDFs | `project_id`, `paper_ids`, `force_ocr`, `use_gpu` | 📄 |
| GET | `/api/v1/projects/{project_id}/ocr/stats` | Return OCR processing statistics | `project_id` | |

---

## Subscriptions

| Method | Path | Description | Params | Flags |
|--------|------|-------------|--------|-------|
| GET | `/api/v1/projects/{project_id}/subscriptions/feeds` | List common academic RSS feed templates | `project_id` | |
| POST | `/api/v1/projects/{project_id}/subscriptions/check-rss` | Check RSS feed for new entries | `project_id`, `feed_url`, `since_days` | |
| POST | `/api/v1/projects/{project_id}/subscriptions/check-updates` | Check for new papers via API search | `project_id`, `query`, `sources`, `since_days`, `max_results` | |
| GET | `/api/v1/projects/{project_id}/subscriptions` | List subscriptions for project | `project_id` | |
| POST | `/api/v1/projects/{project_id}/subscriptions` | Create subscription | `project_id`, Body: `SubscriptionCreate` | |
| GET | `/api/v1/projects/{project_id}/subscriptions/{sub_id}` | Get subscription by ID | `project_id`, `sub_id` | |
| PUT | `/api/v1/projects/{project_id}/subscriptions/{sub_id}` | Update subscription | `project_id`, `sub_id`, Body: `SubscriptionUpdate` | |
| DELETE | `/api/v1/projects/{project_id}/subscriptions/{sub_id}` | Delete subscription | `project_id`, `sub_id` | |
| POST | `/api/v1/projects/{project_id}/subscriptions/{sub_id}/trigger` | Manually trigger subscription update | `project_id`, `sub_id`, `since_days` | |

---

## RAG

| Method | Path | Description | Params | Flags |
|--------|------|-------------|--------|-------|
| POST | `/api/v1/projects/{project_id}/rag/query` | Answer question using RAG over indexed literature | `project_id`, Body: `RAGQueryRequest` (question, top_k, use_reranker, include_sources) | 🤖 |
| POST | `/api/v1/projects/{project_id}/rag/index` | Build or rebuild vector index for processed papers | `project_id` | 📄 |
| POST | `/api/v1/projects/{project_id}/rag/index/stream` | SSE streaming index rebuild with progress events | `project_id` | 📄 🔄 |
| GET | `/api/v1/projects/{project_id}/rag/stats` | Return indexing statistics | `project_id` | |
| DELETE | `/api/v1/projects/{project_id}/rag/index` | Delete vector index for project | `project_id` | 📄 |

---

## Writing

| Method | Path | Description | Params | Flags |
|--------|------|-------------|--------|-------|
| POST | `/api/v1/projects/{project_id}/writing/assist` | AI writing assistance (summarize, cite, outline, gap analysis) | `project_id`, Body: `WritingAssistRequest` | 🤖 |
| POST | `/api/v1/projects/{project_id}/writing/summarize` | Generate summaries for selected papers | `project_id`, Body: `SummarizeRequest` | 🤖 |
| POST | `/api/v1/projects/{project_id}/writing/citations` | Generate formatted citations | `project_id`, Body: `CitationsRequest` | |
| POST | `/api/v1/projects/{project_id}/writing/review-outline` | Generate literature review outline | `project_id`, Body: `ReviewOutlineRequest` | 🤖 |
| POST | `/api/v1/projects/{project_id}/writing/gap-analysis` | Analyze research gaps | `project_id`, Body: `GapAnalysisRequest` | 🤖 |
| POST | `/api/v1/projects/{project_id}/writing/review-draft/stream` | Stream literature review draft via SSE | `project_id`, Body: `ReviewDraftRequest` | 🤖 🔄 |

---

## Tasks

| Method | Path | Description | Params | Flags |
|--------|------|-------------|--------|-------|
| GET | `/api/v1/tasks/{task_id}` | Get task status and details | `task_id` | |
| GET | `/api/v1/tasks` | List tasks with pagination | `project_id`, `status`, `page`, `page_size` | |
| POST | `/api/v1/tasks/{task_id}/cancel` | Cancel a running task | `task_id` | |

---

## Settings

| Method | Path | Description | Params | Flags |
|--------|------|-------------|--------|-------|
| GET | `/api/v1/settings` | Get merged settings (DB overrides .env); API keys masked | | |
| PUT | `/api/v1/settings` | Update user settings and persist to DB | Body: `SettingsUpdateSchema` | |
| GET | `/api/v1/settings/models` | List available LLM providers and models | | |
| POST | `/api/v1/settings/test-connection` | Test LLM configuration with simple prompt | | 🤖 |
| GET | `/api/v1/settings/health` | Simple health check | | |

---

## Conversations

| Method | Path | Description | Params | Flags |
|--------|------|-------------|--------|-------|
| GET | `/api/v1/conversations` | List conversations, newest first | `page`, `page_size`, `knowledge_base_id` | |
| POST | `/api/v1/conversations` | Create new conversation | Body: `ConversationCreateSchema` | |
| GET | `/api/v1/conversations/{conversation_id}` | Get conversation with all messages | `conversation_id` | |
| PUT | `/api/v1/conversations/{conversation_id}` | Update conversation title or settings | `conversation_id`, Body: `ConversationUpdateSchema` | |
| DELETE | `/api/v1/conversations/{conversation_id}` | Delete conversation and messages | `conversation_id` | |

---

## Chat

| Method | Path | Description | Params | Flags |
|--------|------|-------------|--------|-------|
| POST | `/api/v1/chat/stream` | Data Stream Protocol (Vercel AI SDK 5.0) chat endpoint | Body: `ChatStreamRequest` | 🤖 🔄 |
| POST | `/api/v1/chat/complete` | Short text completion for autocomplete | Body: `CompletionRequest` | 🤖 |

---

## Rewrite

| Method | Path | Description | Params | Flags |
|--------|------|-------------|--------|-------|
| POST | `/api/v1/chat/rewrite` | SSE streaming excerpt rewrite (simplify, academic, translate, custom) | Body: `RewriteRequest` | 🤖 🔄 |

---

## Pipelines

| Method | Path | Description | Params | Flags |
|--------|------|-------------|--------|-------|
| POST | `/api/v1/pipelines/search` | Start keyword-search pipeline (search → dedup → crawl → OCR → index) | Body: `SearchPipelineRequest` | 📄 |
| POST | `/api/v1/pipelines/upload` | Start PDF-upload pipeline (extract → dedup → OCR → index) | Body: `UploadPipelineRequest` | 📄 |
| GET | `/api/v1/pipelines/{thread_id}/status` | Get pipeline execution status | `thread_id` | |
| POST | `/api/v1/pipelines/{thread_id}/resume` | Resume interrupted pipeline with resolved conflicts | `thread_id`, Body: `ResumeRequest` | |
| POST | `/api/v1/pipelines/{thread_id}/cancel` | Cancel running pipeline | `thread_id` | |

---

## Authentication

The API uses **optional API key authentication** via `API_SECRET_KEY` (configured in `.env`).

- **When `API_SECRET_KEY` is set:** All requests must include the key via:
  - Header: `X-API-Key: <your-secret-key>`
  - Or query param: `?api_key=<your-secret-key>`

- **Exempt paths** (no auth required):
  - `/` — Root
  - `/health` — Health check
  - `/api/v1/settings/health` — Settings health check
  - `/docs` — Swagger UI
  - `/openapi.json` — OpenAPI spec
  - `/redoc` — ReDoc
  - Any path under `/mcp` — MCP server

- **When `API_SECRET_KEY` is unset:** All endpoints are accessible without authentication.
