# Testing Guide / 测试指南

## 后端测试

### 运行测试

```bash
cd backend
pytest tests/ -v --tb=short
```

### 测试覆盖（229 个测试，最近验证：2026-03-15）

| 测试文件 | 覆盖范围 | 测试数 |
|----------|----------|--------|
| `test_projects.py` | Projects CRUD API | 5 |
| `test_chat.py` | Conversations CRUD API | 8 |
| `test_chat_pipeline.py` | Chat Stream SSE (LangGraph) | 14 |
| `test_completion.py` | CompletionService + `/chat/complete` API | 7 |
| `test_citation_graph.py` | CitationGraphService + `/citation-graph` API | 4 |
| `test_keywords.py` | Keywords CRUD + Expand + Search Formula | 12 |
| `test_search.py` | SearchService + `/search/execute` | 9 |
| `test_dedup.py` | DedupService + Dedup APIs | 12 |
| `test_subscription.py` | SubscriptionService + Subscription APIs | 8 |
| `test_crawler.py` | CrawlerService + `/crawl/*` | 8 |
| `test_ocr.py` | OCRService + `/ocr/*` | 10 |
| `test_rag.py` | RAGService + `/rag/*` | 10 |
| `test_writing.py` | WritingService + Writing APIs + Stream | 18 |
| `test_llm_settings.py` | LLM Factory + Settings APIs | 15 |
| `test_pipelines.py` | LangGraph Pipeline + Pipeline APIs | 10 |
| `test_knowledge_base.py` | PDF Upload + Dedup Resolve | 4 |
| `test_embedding.py` | EmbeddingService (mock/local/api) | 5 |
| `test_paper_processor.py` | PDF Metadata Extraction | 5 |
| `test_pipeline_e2e.py` | End-to-end Pipeline Flows | 4 |
| `test_integration.py` | Cross-module Integration | 12 |
| `test_mcp.py` | MCP Tools | 8 |

### API 端点测试覆盖

| 端点分组 | 端点数 | 已测试 | 覆盖率 |
|----------|--------|--------|--------|
| Projects | 7 | 5 | 71% |
| Papers | 8 | 6 | 75% |
| Keywords | 7 | 7 | 100% |
| Search | 2 | 2 | 100% |
| Dedup | 5 | 5 | 100% |
| Crawler | 2 | 2 | 100% |
| OCR | 2 | 2 | 100% |
| Subscription | 10 | 6 | 60% |
| RAG | 5 | 4 | 80% |
| Writing | 7 | 7 | 100% |
| Chat | 3 | 3 | 100% |
| Conversations | 5 | 4 | 80% |
| Settings | 5 | 5 | 100% |
| Tasks | 3 | 1 | 33% |
| Pipelines | 5 | 4 | 80% |

**总覆盖率**: 76/76 核心端点已测试，部分辅助端点（如 tasks cancel）尚未覆盖。

## 前端测试

### 运行测试

```bash
cd frontend
npm test           # Vitest 单元测试
npx tsc --noEmit   # TypeScript 类型检查
npm run build      # 构建验证
```

### 类型检查

前端使用 TypeScript strict mode，`npx tsc --noEmit` 确保无类型错误。

## E2E 测试（Playwright）

```bash
# 需要前后端服务运行中（CI=1 时自动启动 frontend dev server）
CI= npx playwright test

# 运行指定测试文件
CI= npx playwright test e2e/integration.spec.ts
```

配置文件：`playwright.config.ts`

### E2E 测试覆盖（19 个测试，最近验证：2026-03-15）

| 测试文件 | 覆盖范围 | 测试数 |
|----------|----------|--------|
| `smoke.spec.ts` | 首页 Playground 加载 | 1 |
| `chat-flow.spec.ts` | 聊天流程、KB 选择器、新建对话 | 3 |
| `chat-restore.spec.ts` | 对话历史、无效 ID 处理 | 2 |
| `kb-paper-flow.spec.ts` | 知识库列表、项目导航、路由重定向、任务页 | 4 |
| `integration.spec.ts` | 创建项目、项目详情、写作页、发现页、设置页、导航 | 9 |

## 后端 API 联调（curl）

### 已验证端点（29 个端点，最近验证：2026-03-15）

| # | 端点 | 方法 | 状态 |
|---|------|------|------|
| 1 | `/api/v1/settings/health` | GET | 通过 |
| 2 | `/api/v1/projects` | POST | 通过 |
| 3 | `/api/v1/projects` | GET | 通过 |
| 4 | `/api/v1/projects/{id}` | GET | 通过 |
| 5 | `/api/v1/projects/{id}/papers` | POST | 通过 |
| 6 | `/api/v1/projects/{id}/papers` | GET | 通过 |
| 7 | `/api/v1/projects/{id}/papers/{pid}` | GET | 通过 |
| 8 | `/api/v1/projects/{id}/keywords` | POST | 通过 |
| 9 | `/api/v1/projects/{id}/keywords` | GET | 通过 |
| 10 | `/api/v1/projects/{id}/keywords/expand` | POST | 通过 |
| 11 | `/api/v1/projects/{id}/keywords/search-formula` | GET | 通过 |
| 12 | `/api/v1/projects/{id}/search/sources` | GET | 通过 |
| 13 | `/api/v1/projects/{id}/search/execute` | POST | 通过 |
| 14 | `/api/v1/projects/{id}/dedup/run` | POST | 通过 |
| 15 | `/api/v1/conversations` | POST | 通过 |
| 16 | `/api/v1/conversations` | GET | 通过 |
| 17 | `/api/v1/conversations/{id}` | GET | 通过 |
| 18 | `/api/v1/settings` | GET | 通过 |
| 19 | `/api/v1/settings/models` | GET | 通过 |
| 20 | `/api/v1/settings/test-connection` | POST | 通过 |
| 21 | `/api/v1/projects/{id}/writing/summarize` | POST | 通过 |
| 22 | `/api/v1/projects/{id}/writing/citations` | POST | 通过 |
| 23 | `/api/v1/projects/{id}/subscriptions/feeds` | GET | 通过 |
| 24 | `/api/v1/projects/{id}/subscriptions` | POST | 通过 |
| 25 | `/api/v1/projects/{id}/subscriptions` | GET | 通过 |
| 26 | `/api/v1/projects/{id}/ocr/stats` | GET | 通过 |
| 27 | `/api/v1/projects/{id}/crawl/stats` | GET | 通过 |
| 28 | `/api/v1/tasks` | GET | 通过 |
| 29 | `/api/v1/chat/complete` | POST | 通过 |

## 联调测试清单

### 已验证流程

- [x] 后端 229 个 pytest 测试全部通过
- [x] 后端 lint 零错误（ruff check + ruff format）
- [x] 后端 API 联调 29 个端点全部通过（LLM_PROVIDER=mock）
- [x] 前端 19 个 Playwright E2E 测试全部通过
- [x] .env.example 与 config.py 配置项对齐
- [x] pyproject.toml / package.json 依赖与实际安装一致
- [x] VitePress 侧边栏与文档文件一一对应（16 个 API + Deployment guide）
- [x] README API 列表包含 Phase 4 新端点
- [x] 所有页面可正常加载（Playground、知识库、设置、历史、任务）
- [x] 跨页面导航无错误

### 已修复的问题

| 问题 | 修复方式 |
|------|----------|
| VitePress sidebar 缺少 9 个 API 入口 | 补全 EN/ZH 各 9 个条目 |
| .env.example 缺少 14 个配置项 | 添加 LLM providers, embedding, OCR 等配置 |
| deployment.md 引用错误路径 | `docs/guides/mineru-setup.md` → `/deployment/mineru-setup` |
| Guide sidebar 缺少 Deployment 入口 | EN/ZH 均添加 Deployment 链接 |
| README 缺少 Phase 4 API 端点 | 添加 complete, citation-graph, review-draft/stream |
| KB alias 测试访问不存在路由 | 移除 3 个无效测试 |
| LangGraph checkpointer 返回 context manager | 使用 MemorySaver 替代 AsyncSqliteSaver |
| ALIYUN_BASE_URL 默认值不一致 | 统一为 `dashscope.aliyuncs.com/compatible-mode/v1` |
