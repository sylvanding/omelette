---
title: "Batch 3: 代码质量与一致性"
type: refactor
status: active
date: 2026-03-12
origin: docs/brainstorms/2026-03-12-codebase-quality-audit-brainstorm.md
---

# Batch 3：代码质量与一致性

## Overview

消除重复代码、统一编码风格、拆分大组件、引入性能优化（memoization、code splitting）、修复硬编码文本和颜色。此批次不改变功能，纯粹提升代码可维护性和一致性。

## Problem Statement

1. **后端**：`_ensure_project` 在 9 个模块中复制粘贴；f-string 日志不符合最佳实践；硬编码数据目录；API 响应不一致
2. **前端**：3 个组件超过 350 行；消息列表无 memoization；无路由级代码分割；大量硬编码文本和颜色；列表使用 index 做 key

## Proposed Solution

### 后端（7 项）

#### 1. 抽取 `_ensure_project` 到共享模块 — `backend/app/api/deps.py`

**当前**：9 个 API 模块各自定义了相同的 `_ensure_project` 辅助函数。

**修改**：移到 `deps.py`，改为 FastAPI Depends 兼容。

```python
# backend/app/api/deps.py

async def get_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
) -> Project:
    """获取项目，不存在则 404"""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project
```

**各模块修改**：删除本地 `_ensure_project`，端点参数中使用 `project: Project = Depends(get_project)`。

**影响文件**：`upload.py`, `papers.py`, `pipelines.py`, `subscription.py`, `dedup.py`, `crawler.py`, `keywords.py`, `ocr.py`, `search.py`

#### 2. update_project 响应补全 — `backend/app/api/v1/projects.py`

**修改位置**：`projects.py:111-121`

修改 `update_project` 在返回前查询 paper_count 和 keyword_count，与 list/get 保持一致。

#### 3. 根端点 ApiResponse — `backend/app/main.py`

**修改位置**：`main.py:61-68`

```python
@app.get("/")
async def root():
    return ApiResponse(data={
        "name": "Omelette",
        "version": "0.1.0",
        "docs": "/docs",
    })
```

#### 4. 修复 f-string 日志 — 多处

**影响文件**：`keyword_service.py:72`, `crawler_service.py:39`

```python
# 修改前
logger.error(f"Keyword expansion failed: {e}")
# 修改后
logger.error("Keyword expansion failed: %s", e)
```

全局搜索 `logger\.\w+\(f"` 确保无遗漏。

#### 5. Pipeline 静默异常 → warning — `backend/app/api/v1/pipelines.py`

**修改位置**：`pipelines.py:196-197`

```python
# 修改前
except Exception:
    pass
# 修改后
except Exception:
    logger.warning("Failed to read pipeline state for task %s", task_id, exc_info=True)
```

#### 6. 硬编码数据目录 → 环境变量 — `backend/app/config.py`

**修改位置**：`config.py:31`

```python
# 修改前
data_dir: str = "/data0/djx/omelette"
# 修改后
data_dir: str = "./data"
```

同步更新 `.env.example` 和 `.env`：`DATA_DIR=/data0/djx/omelette`

#### 7. 返回具体类型 — `backend/app/services/rag_service.py`

**修改位置**：`rag_service.py:72`

```python
# 修改前
def _get_vector_store(self, project_id: int) -> Any:
# 修改后
def _get_vector_store(self, project_id: int) -> ChromaVectorStore:
```

### 前端（12 项）

#### 8. 拆分 SubscriptionManager (461 行)

拆分为：
- `SubscriptionManager.tsx` — 主容器 + 列表（~150 行）
- `SubscriptionCard.tsx` — 单个订阅卡片（~100 行）
- `SubscriptionForm.tsx` — 创建/编辑表单（~120 行）
- `SubscriptionDetail.tsx` — 详情展开区域（~80 行）

#### 9. 拆分 SearchAddDialog (389 行)

拆分为：
- `SearchAddDialog.tsx` — 主容器 + 步骤路由（~80 行）
- `SearchQueryStep.tsx` — 步骤 1：输入查询（~100 行）
- `SearchResultsStep.tsx` — 步骤 2：查看结果（~100 行）
- `SearchSelectStep.tsx` — 步骤 3：选择论文（~80 行）

#### 10. 拆分 SettingsPage (372 行)

拆分为：
- `SettingsPage.tsx` — 主容器 + 标签页（~80 行）
- `LLMProviderSettings.tsx` — 模型提供商配置（~120 行）
- `EmbeddingSettings.tsx` — Embedding 配置（~80 行）
- `SystemSettings.tsx` — 系统设置（~60 行）

#### 11. MessageBubble memoization

```tsx
// frontend/src/components/playground/MessageBubble.tsx
export const MessageBubble = memo(function MessageBubble({ message, citations }: Props) {
  // ...现有实现
})
```

#### 12. 路由级代码分割 — `App.tsx`

```tsx
// frontend/src/App.tsx
import { lazy, Suspense } from 'react'

const PlaygroundPage = lazy(() => import('./pages/PlaygroundPage'))
const KnowledgeBasesPage = lazy(() => import('./pages/KnowledgeBasesPage'))
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'))
const ChatHistoryPage = lazy(() => import('./pages/ChatHistoryPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

// Routes 中使用 Suspense
<Suspense fallback={<LoadingSpinner />}>
  <Routes>
    <Route path="/" element={<PlaygroundPage />} />
    {/* ... */}
  </Routes>
</Suspense>
```

**注意**：页面组件需改为 default export。

#### 13. 列表 key 修复

**`RAGChatPage.tsx`**：`key={i}` → `key={msg.id || \`msg-${i}\`}`

**`SearchAddDialog.tsx`**：`key={i}` → `key={paper.source_id || paper.doi || \`paper-${i}\`}`

#### 14-16. 硬编码文本国际化

**SearchAddDialog.tsx** — 数据源名称：

```typescript
// 修改前
const sources = [{ id: 'semantic_scholar', name: 'Semantic Scholar' }, ...]
// 修改后
const sources = [{ id: 'semantic_scholar', name: t('sources.semanticScholar') }, ...]
```

**KeywordsPage.tsx** — 数据库名称同理。

**WritingPage.tsx** — 引用格式名称同理。

**SettingsPage.tsx** — 硬编码中文冒号 `：` 改为 `t('settings.testSuccessWithResponse', { response })`。

**新增 i18n key**：

```json
{
  "sources": {
    "semanticScholar": "Semantic Scholar",
    "openAlex": "OpenAlex",
    "arxiv": "arXiv",
    "crossref": "Crossref"
  },
  "databases": {
    "wos": "Web of Science",
    "scopus": "Scopus",
    "pubmed": "PubMed"
  },
  "citationStyles": {
    "gb_t_7714": "GB/T 7714",
    "apa": "APA",
    "mla": "MLA",
    "chicago": "Chicago"
  }
}
```

#### 17. subscription-api 添加类型

```typescript
// frontend/src/services/subscription-api.ts
import type { ApiResponse } from '@/lib/api'
import type { Subscription, SubscriptionCreate } from '@/types'

export const subscriptionApi = {
  list: (projectId: number): Promise<ApiResponse<Subscription[]>> =>
    api.get(`/projects/${projectId}/subscriptions`),
  create: (projectId: number, data: SubscriptionCreate): Promise<ApiResponse<Subscription>> =>
    api.post(`/projects/${projectId}/subscriptions`, data),
  // ...
}
```

#### 18. DedupConflictPanel 类型修复

扩展 `NewPaperData` 类型而非使用 `as unknown as Record`：

```typescript
// frontend/src/types/index.ts
interface NewPaperData {
  title: string
  authors?: string
  year?: number
  doi?: string
  abstract?: string
  [key: string]: unknown  // 允许额外字段
}
```

#### 19. PdfUploadDialog 使用封装 API

```typescript
// 修改前
await api.post(`/projects/${projectId}/upload`, formData)
// 修改后
await kbApi.uploadPdfs(projectId, formData)
```

#### 20. startRebuild 依赖数组修复

```tsx
// frontend/src/pages/project/RAGChatPage.tsx
const activeRef = useRef(indexProgress.active)
activeRef.current = indexProgress.active

const startRebuild = useCallback(() => {
  if (activeRef.current) return
  // ...
}, [pid, queryClient, t])  // 移除 indexProgress.active
```

## Acceptance Criteria

- [ ] `_ensure_project` 在 `deps.py` 中只有 1 份实现
- [ ] `rg "_ensure_project" backend/app/api/v1/` 仅在 import 中出现
- [ ] `rg 'logger\.\w+\(f"' backend/` 返回 0 条结果
- [ ] `update_project` 响应包含 paper_count 和 keyword_count
- [ ] data_dir 默认值为 `./data` 而非硬编码路径
- [ ] 无单文件组件超过 250 行
- [ ] MessageBubble 被 React.memo 包裹
- [ ] 路由组件使用 React.lazy 延迟加载
- [ ] 列表中无 `key={i}` 使用 index 做 key
- [ ] 所有数据源名、数据库名、引用格式名有 i18n key
- [ ] 所有涉及文件的 mypy 错误已修复
- [ ] `npm run build` 和 `npm run lint` 通过

## Technical Considerations

- 组件拆分后需确保状态管理正确传递（lift state vs props vs context）
- React.lazy 需要组件使用 default export，可能需要调整导出方式
- i18n key 新增后需在两个 locale 文件中同步

## Dependencies & Risks

- **无新增依赖**
- **风险**：组件拆分可能引入 props 传递错误 —— 需逐一验证
- **前置**：Batch 1 + Batch 2 完成

## Sources

- **Origin brainstorm**: [docs/brainstorms/2026-03-12-codebase-quality-audit-brainstorm.md](../brainstorms/2026-03-12-codebase-quality-audit-brainstorm.md)
- Issues: B9-B15, F14-F25 from brainstorm
