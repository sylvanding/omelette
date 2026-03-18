# Frontend 系统化清理与优化

**日期:** 2026-03-19
**状态:** 已确认
**关联:** 前端重设计完成后的质量收尾

---

## 我们要做什么

对前端重设计之后遗留的所有问题进行系统化修复，按优先级从高到低逐步处理：

1. **修复严重 Bug** — API 类型不匹配导致功能失效
2. **清理死代码与废弃依赖** — 减少维护负担和 bundle 体积
3. **统一 API 层** — 提取 API_BASE_URL 常量，消除硬编码路径
4. **补全缺失的 API service 方法** — 确保前端可调用所有后端端点
5. **代码质量提升** — i18n 覆盖、类型安全改进

---

## 为什么选择这个方案

- 全部系统化处理：不留技术债
- 按优先级排序：先修 Bug 确保功能正确，再做清理和改进
- framer-motion 保持现状：不是优先项，聊天体验动画可接受
- API 硬编码地址：提取 `API_BASE_URL` 常量统一管理

---

## 关键决策

### 决策 1：Bug 修复（P0）

| Bug | 问题 | 修复方案 |
|-----|------|----------|
| 去重冲突操作 | 前端发 `keep_existing`，后端期望 `keep_old` | 将 `DedupConflictPanel.tsx` 中的 `keep_existing` 改为 `keep_old` |
| Pipeline 上传字段 | 前端用 `file_paths`，后端期望 `pdf_paths` | 修改 `pipeline-api.ts` 的 `UploadPipelineRequest` |
| Pipeline 冲突类型 | `ResolvedConflict` 前后端结构完全不同 | 与后端 schema 对齐：`conflict_id: str`, `action: 'keep_old' \| 'keep_new' \| 'merge' \| 'skip'` |

### 决策 2：死代码清理（P1）

删除以下不再被引用的文件：
- `frontend/src/components/playground/sidebar-utils.ts`
- `frontend/src/components/playground/SidebarToggleButton.tsx`
- `frontend/src/components/layout/PageHeader.tsx`
- `frontend/src/components/layout/PageTransition.tsx`

从 `package.json` 移除未使用的依赖：
- `@a2ui-sdk/react`
- `@a2ui-sdk/types`（如果存在）
- `react-force-graph-2d`

### 决策 3：API 层统一（P1）

提取 `API_BASE_URL` 常量到 `frontend/src/lib/api-config.ts`，替换以下 7 处硬编码：

| 文件 | 硬编码路径 |
|------|-----------|
| `services/api.ts` | RAG index stream |
| `pages/project/WritingPage.tsx` | Writing review draft stream |
| `hooks/use-pipeline-ws.ts` | Pipeline WebSocket |
| `pages/project/PDFReaderPage.tsx` | PDF URL |
| `components/pdf-reader/SelectionQA.tsx` | Chat stream |
| `lib/chat-transport.ts` | Chat stream |
| `services/rewrite-api.ts` | Rewrite stream |

### 决策 4：补全 API Service 方法（P2）

新增以下前端 service 方法对齐后端端点：

| 后端端点 | 前端 service |
|---------|-------------|
| `POST /projects/{id}/pipeline/run` | `pipelineApi.runAll(projectId)` |
| `POST /projects/{id}/pipeline/paper/{paperId}` | `pipelineApi.runPaper(projectId, paperId)` |
| `POST /projects/{id}/subscriptions/check-updates` | `subscriptionApi.checkUpdates(projectId)` |
| `POST /projects/{id}/dedup/verify` | `dedupApi.verify(projectId, ...)` |
| `POST /projects/{id}/writing/assist` | `writingApi.assist(projectId, task, ...)` |

### 决策 5：i18n 补全（P2）

补充以下硬编码字符串的 i18n key：
- DualSidebar: "Omelette" 标题、aria-labels
- DataTable / Pagination: aria-labels
- KeywordsPage: 数据库名称
- SearchPage: 数据源名称

### 决策 6：类型安全（P3）

逐步减少 `as any` / `as unknown` 使用：
- `MessageBubbleV2.tsx` 的 markdown components
- `PapersPage.tsx` 的 `GraphData` 转换
- `DedupConflictPanel.tsx` 的多处不安全转换

### 决策 7：保持现状

- **framer-motion**: 保留在 PlaygroundPage 和 playground 子组件中
- **DiscoveryPage 布局**: 当前可用，后续优化

---

## 已解决的问题

- Q: 侧边栏重复？ → 已修复，ChatHistorySidebar 集成到 DualSidebar
- Q: framer-motion 如何处理？ → 保持现状
- Q: 硬编码 URL 如何处理？ → 提取 API_BASE_URL 常量

---

## 开放问题

无
