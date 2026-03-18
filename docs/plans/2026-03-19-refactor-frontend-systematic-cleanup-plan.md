---
title: "refactor: frontend systematic cleanup after redesign"
type: refactor
status: active
date: 2026-03-19
origin: docs/brainstorms/2026-03-19-frontend-systematic-cleanup-brainstorm.md
---

# Frontend 系统化清理与优化

前端重设计完成后的质量收尾，修复所有遗留 Bug、清理死代码、统一 API 层、补全缺失接口。

## Overview

前端完成了整体重设计（Design System First），但仍存在：
- 3 个 API 类型不匹配的严重 Bug
- 5+ 个不再被引用的死文件
- 3 个 package.json 中未使用的依赖
- 7 处硬编码 API 路径
- 5 个后端端点缺少前端 service 方法
- 8+ 处缺失 i18n
- 6+ 处不安全类型转换

（see brainstorm: docs/brainstorms/2026-03-19-frontend-systematic-cleanup-brainstorm.md）

---

## Phase 1: P0 Bug 修复

### 1.1 去重冲突操作值不匹配

**文件:** `frontend/src/components/knowledge-base/DedupConflictPanel.tsx`

- 将所有 `'keep_existing'` 替换为 `'keep_old'`
- 对齐后端 `Literal["keep_old", "keep_new", "merge", "skip"]`

### 1.2 Pipeline 上传请求字段名错误

**文件:** `frontend/src/services/pipeline-api.ts`

- `UploadPipelineRequest.file_paths` → `pdf_paths`
- 确认 `pipelineApi.startUpload` 发送正确字段

### 1.3 Pipeline ResolvedConflict 类型不匹配

**文件:** `frontend/src/services/pipeline-api.ts`

后端期望:
```typescript
interface ResolvedConflict {
  conflict_id: string;
  action: 'keep_old' | 'keep_new' | 'merge' | 'skip';
  merged_paper?: Record<string, unknown>;
  new_paper?: Record<string, unknown>;
}
```

前端当前:
```typescript
interface ResolvedConflict {
  paper_id: number;
  action: 'keep' | 'replace' | 'skip';
}
```

需要完全重写 `ResolvedConflict` 类型与后端对齐。

### 验收标准

- [ ] 去重 "保留旧版" 操作成功执行
- [ ] Pipeline 上传请求发送 `pdf_paths` 字段
- [ ] Pipeline HITL 冲突解决发送正确的 conflict schema

---

## Phase 2: P1 死代码清理 & 废弃依赖

### 2.1 删除未引用文件

| 文件 | 原因 |
|------|------|
| `src/components/playground/sidebar-utils.ts` | ChatHistorySidebar 已集成到 DualSidebar |
| `src/components/playground/SidebarToggleButton.tsx` | 同上 |
| `src/components/layout/PageHeader.tsx` | 已被 PageLayout 替代 |
| `src/components/layout/PageTransition.tsx` | 使用 framer-motion 且无引用 |
| `src/components/ui/skeletons.tsx` 中的 `PageHeaderSkeleton` | PageHeader 已删除 |

### 2.2 移除未使用的 npm 依赖

```bash
npm uninstall @a2ui-sdk/react react-force-graph-2d
# 检查 @a2ui-sdk/types 是否存在并移除
```

### 验收标准

- [ ] 删除的文件不被任何地方 import
- [ ] `npm run build` 成功
- [ ] Bundle 体积减小

---

## Phase 3: P1 API 层统一

### 3.1 创建 API 配置常量

**新文件:** `frontend/src/lib/api-config.ts`

```typescript
export const API_BASE_URL = '/api/v1';

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
```

### 3.2 替换 7 处硬编码路径

| 文件 | 当前硬编码 | 改为 |
|------|-----------|------|
| `services/api.ts` | `'/api/v1/projects/${projectId}/rag/index/stream'` | `apiUrl(...)` |
| `pages/project/WritingPage.tsx` | `'/api/v1/projects/${pid}/writing/review-draft/stream'` | `apiUrl(...)` |
| `hooks/use-pipeline-ws.ts` | `` `${protocol}//${host}/api/v1/pipelines/${threadId}/ws` `` | `apiUrl(...)` 构建 |
| `pages/project/PDFReaderPage.tsx` | `/api/v1/projects/${pid}/papers/${ppid}/pdf` | `apiUrl(...)` |
| `components/pdf-reader/SelectionQA.tsx` | `'/api/v1/chat/stream'` | `apiUrl(...)` |
| `lib/chat-transport.ts` | `'/api/v1/chat/stream'` | `apiUrl(...)` |
| `services/rewrite-api.ts` | `"/api/v1/chat/rewrite"` | `apiUrl(...)` |

### 验收标准

- [ ] 所有 API 路径通过 `apiUrl()` 或 `API_BASE_URL` 构建
- [ ] 无硬编码 `/api/v1` 字符串残留
- [ ] 所有流式请求和 WebSocket 连接正常工作

---

## Phase 4: P2 补全缺失 API Service 方法

### 4.1 新增 service 方法

**文件:** `frontend/src/services/api.ts` 和 `frontend/src/services/pipeline-api.ts`

| 后端端点 | 前端方法 |
|---------|---------|
| `POST /projects/{id}/pipeline/run` | `pipelineApi.runAll(projectId)` |
| `POST /projects/{id}/pipeline/paper/{paperId}` | `pipelineApi.runPaper(projectId, paperId)` |
| `POST /projects/{id}/subscriptions/check-updates` | `subscriptionApi.checkUpdates(projectId)` |
| `POST /projects/{id}/dedup/verify` | `dedupApi.verify(projectId, paperId1, paperId2)` |
| `POST /projects/{id}/writing/assist` | `writingApi.assist(projectId, task, params)` |

### 4.2 对应 query-keys

在 `frontend/src/lib/query-keys.ts` 中添加新的 mutation/query key。

### 验收标准

- [ ] 每个后端端点都有对应的前端 service 方法
- [ ] TypeScript 类型完整

---

## Phase 5: P2 i18n 补全

### 5.1 需要添加的 i18n key

| 位置 | 硬编码 | 建议 key |
|------|--------|---------|
| `DualSidebar.tsx` | `"Omelette"` | `app.name` |
| `DualSidebar.tsx` | `aria-label="Collapse sidebar"` | `sidebar.collapse` |
| `DualSidebar.tsx` | `aria-label="Expand sidebar"` | `sidebar.expand` |
| `data-table.tsx` | `aria-label="Expand"` | `common.expand` |
| `pagination.tsx` | `aria-label="Previous/Next page"` | `pagination.previous` / `pagination.next` |
| `KeywordsPage.tsx` | 数据库名 "Web of Science" 等 | `keywords.databases.wos` 等 |
| `SearchPage.tsx` | 数据源名 "Semantic Scholar" 等 | `search.sources.semanticScholar` 等 |

### 验收标准

- [ ] 无硬编码的用户可见文字（数据库/数据源名称可保留英文原名）
- [ ] aria-labels 使用 t()

---

## Phase 6: P3 类型安全改进

### 6.1 减少不安全转换

| 文件 | 问题 | 改进 |
|------|------|------|
| `MessageBubbleV2.tsx` | `}) as any` on markdown components | 定义正确的 component 类型 |
| `PapersPage.tsx` | `r as unknown as GraphData` | 确保 API 返回正确类型 |
| `AddPaperDialog.tsx` | `res?.papers as unknown as SearchResult[]` | 在 API 层处理类型转换 |
| `DedupConflictPanel.tsx` | 多处 `as unknown as Record` | 定义具体类型 |

### 验收标准

- [ ] 减少 50%+ 的 `as any` / `as unknown` 使用
- [ ] `npx tsc --noEmit` 零错误

---

## 成功指标

- [ ] `npm run build` 零错误零警告
- [ ] `npx tsc --noEmit` 零错误
- [ ] 所有 P0 Bug 修复（3个）
- [ ] 死代码和废弃依赖清除
- [ ] API 路径统一管理

## Sources

- **Origin brainstorm:** [docs/brainstorms/2026-03-19-frontend-systematic-cleanup-brainstorm.md](docs/brainstorms/2026-03-19-frontend-systematic-cleanup-brainstorm.md)
- **Frontend audit agent:** Dead code, pattern inconsistencies, i18n gaps, type safety
- **API alignment agent:** Backend-frontend endpoint mismatches, hardcoded URLs
