# Brainstorm: 全面联调测试与项目审计

**日期**: 2026-03-15
**阶段**: Phase 5 完成后，进入联调阶段
**状态**: 已确认

## 我们要做什么

Phase 0-5 的功能已全部实现，现在需要：

1. **全面前后端联调测试** — 验证所有 API 端点在真实前后端交互中可正常工作
2. **项目配置审计** — 确保 `.env.example`、`pyproject.toml`、`package.json` 与实际代码一致
3. **文档质量修复** — 修复 VitePress 侧边栏缺失、过期内容、历史遗留问题
4. **测试覆盖验证** — 确保后端所有端点都有对应测试

## 审计发现的问题

### 问题 1: VitePress 侧边栏不完整

**严重程度**: 中
**描述**: API 文档侧边栏只展示了 7 个模块，实际有 16 个 API 文档文件。缺少 9 个入口：

- Chat (`/api/chat`)
- Conversations (`/api/conversations`)
- Pipelines (`/api/pipelines`)
- Subscription (`/api/subscription`)
- OCR (`/api/ocr`)
- Dedup (`/api/dedup`)
- Crawler (`/api/crawler`)
- Settings (`/api/settings`)
- Tasks (`/api/tasks`)

**修复**: 在 `docs/.vitepress/config.ts` 中补全 EN + ZH 两个 sidebar 配置。

### 问题 2: .env.example 可能缺少配置项

**严重程度**: 低
**描述**: `config.py` 中有一些默认参数未在 `.env.example` 中列出。需要核查：

| config.py 配置 | .env.example 是否存在 | 需要添加 |
|---|---|---|
| llm_temperature | ❌ | 可选，高级用户 |
| llm_max_tokens | ❌ | 可选，高级用户 |
| embedding_provider | ❌ | 可选，默认 mock |
| ocr_lang | ❌ | 可选，默认 ch |
| dedup_title_hard_threshold | ❌ | 可选，专家级 |
| dedup_title_llm_threshold | ❌ | 可选，专家级 |
| langgraph_checkpoint_dir | ❌ | 可选 |
| openai_api_key | ❌ | 按需 |
| anthropic_api_key | ❌ | 按需 |
| ollama_base_url | ❌ | 按需 |

**决策**: 将常用配置（llm_temperature, llm_max_tokens, embedding_provider, ocr_lang, openai/anthropic/ollama）添加到 `.env.example`，去重阈值等专家级参数不添加（避免信息过载）。

### 问题 3: 前端未调用部分后端 API

**严重程度**: 信息级
**描述**: 约 15 个后端 API 未被前端直接调用，包括：
- `pipelines/*`（LangGraph 流程状态轮询 — 未集成到前端 UI）
- `crawl/*`（PDF 下载 — 后端内部调用）
- `dedup/run`、`dedup/candidates`、`dedup/verify`（高级去重操作）
- `keywords/bulk`（批量关键词导入）
- `subscriptions/feeds`、`check-rss`、`check-updates`（订阅管理高级功能）
- `settings/health`（健康检查）
- `tasks/{id}/cancel`（任务取消）
- `papers/{id}` PUT（论文更新）

**决策**: 这些端点需要后端测试覆盖验证。前端未调用不代表不需要测试——通过 pytest 确保全部通过，对缺失测试的端点补写。

## 联调测试范围

### A. 后端 API 端点测试（全面）

按优先级分类：

**P0 — 核心流程（必须通过）**:
- Projects CRUD
- Papers CRUD + Upload + Process
- Chat Stream + Complete + Rewrite
- Conversations CRUD
- RAG Query + Index + Stats
- Writing Assist + Summarize + Citations + Review Outline + Gap + Review Draft Stream
- Settings GET/PUT + Models + Test Connection

**P1 — 知识库管理（必须通过）**:
- Keywords CRUD + Expand + Search Formula
- Search Execute + Sources
- Dedup Run + Candidates + Verify + Resolve + Auto-resolve
- Subscription CRUD + Trigger
- OCR Process + Stats
- Crawler Start + Stats

**P2 — 辅助功能**:
- Tasks List + Get + Cancel
- Pipelines Search + Upload + Status + Resume + Cancel
- Papers PDF Serve + Citation Graph
- Settings Health

### B. 前端页面交互验证

**验证方式**: 启动前后端开发服务器，通过浏览器自动化（MCP browser）逐页验证核心交互流程。使用 `LLM_PROVIDER=mock` 避免 LLM 调用费用。

| 页面 | 验证步骤 |
|------|----------|
| PlaygroundPage | 打开页面 → 发送消息 → 验证流式响应 → Tab 补全建议 → 改写功能 |
| KnowledgeBasesPage | 列表渲染 → 创建项目 → 进入项目详情 |
| PapersPage | 论文列表 → 手动添加论文 → 批量导入 → 点击"阅读 PDF" |
| PDFReaderPage | PDF 加载 → 缩放 → 翻页 → 选中文本 → AI 快捷操作 |
| DiscoveryPage | 关键词 CRUD → AI 扩展 → 搜索执行 → 订阅创建 |
| WritingPage | 切换各标签 → 生成摘要 → 生成引用 → 综述流式输出 → 停止/复制/下载 |
| SettingsPage | 加载配置 → 修改 provider → 测试连接 → 保存 |
| TasksPage | 任务列表渲染 → 状态显示 |
| ChatHistoryPage | 对话列表 → 点击打开 → 删除对话 |

### C. 未接入前端的端点验证

**验证方式**: 通过 pytest 确保后端测试全部通过，对无测试覆盖的端点用 curl/httpx 手动测试。

需要补充测试的端点：
- `POST /pipelines/search`、`POST /pipelines/upload` — 需要 LangGraph 完整状态机
- `POST /projects/{id}/pipeline/run` — 触发完整流程
- `GET /settings/health` — 简单健康检查

### D. 配置文件同步审计

- `.env.example` ↔ `config.py` 对齐
- `pyproject.toml` dependencies ↔ 实际 `pip list`
- `package.json` dependencies ↔ 实际 `node_modules`
- VitePress sidebar ↔ 实际文档文件
- i18n 翻译键 ↔ 前端使用的键
- Makefile 命令是否需要更新
- README.md API 列表是否与现有端点一致

## 关键决策

1. **前端联调通过浏览器自动化验证**，后端测试通过 pytest 全覆盖
2. **配置审计采用"常用暴露、专家级隐藏"策略**，避免 `.env.example` 信息过载
3. **VitePress 侧边栏补全所有 16 个 API 文档入口**
4. **Makefile 和 README 同步检查**，确保开发命令和 API 列表与实际一致
5. **测试结果文档化**到 `docs/guide/testing.md`，供后续参考

## 已解决问题

- ✅ Phase 5 全部完成（测试、性能、安全、文档）
- ✅ 51 个后端测试全部通过
- ✅ 零 lint 错误

## 下一步

进入 `/ce-plan` 创建详细实施计划，按以下顺序执行：

1. 配置文件审计与修复（.env.example, pyproject.toml, package.json, Makefile, README）
2. VitePress 侧边栏修复 + 文档内容质量检查
3. 后端 API 全面测试运行（pytest 全量 + 补缺）
4. 前端启动 + 浏览器自动化联调验证
5. 测试结果文档化 + 最终提交
