---
title: "Batch 2: 错误处理与用户体验"
type: fix
status: active
date: 2026-03-12
origin: docs/brainstorms/2026-03-12-codebase-quality-audit-brainstorm.md
---

# Batch 2：错误处理与用户体验

## Overview

改善后端异常处理策略、优化 N+1 数据库查询，同时在前端引入 toast 通知系统、修复 i18n 缺失、迁移到 Vercel AI SDK、统一 API 错误处理。此批次的目标是让用户能清楚感知每个操作的成功与失败。

## Problem Statement

1. **后端**：rag_service 中 `except Exception` 吞错返回字符串；项目和对话列表存在 N+1 查询
2. **前端**：CRUD 操作无任何用户反馈；mutation 失败静默忽略；i18n key 缺失导致显示 key 名；`confirm()` 不可访问；聊天流式用自定义 fetch 缺乏错误处理

## Proposed Solution

### 后端（3 项）

#### 1. 重构 rag_service 异常处理 — `backend/app/services/rag_service.py`

**当前问题**（4 处，lines 253-286）：

```python
except Exception as e:
    logger.error("LLM answer generation failed: %s", e)
    return f"Error generating answer: {e}"  # 吞错，返回字符串
```

**修改方案**：Service 层让异常传播，API 层统一处理。

```python
# backend/app/services/rag_service.py
# 删除 try/except，让异常自然传播

# backend/app/api/v1/rag.py — API 层捕获
from app.services.rag_service import RAGQueryError, RAGIndexError

@router.post("/{project_id}/rag/query")
async def query_rag(...):
    try:
        result = await rag_service.query(...)
        return ApiResponse(data=result)
    except RAGQueryError as e:
        raise HTTPException(status_code=500, detail=str(e))
```

**新增自定义异常**：

```python
# backend/app/services/exceptions.py
class RAGQueryError(Exception): ...
class RAGIndexError(Exception): ...
class PipelineError(Exception): ...
```

#### 2. 优化项目列表 N+1 查询 — `backend/app/api/v1/projects.py`

**当前问题**（lines 29-45）：每个项目 2 次额外查询。

**修改方案**：使用子查询一次获取。

```python
# backend/app/api/v1/projects.py

from sqlalchemy import func, select
from sqlalchemy.orm import aliased

paper_count_sq = (
    select(func.count(Paper.id))
    .where(Paper.project_id == Project.id)
    .correlate(Project)
    .scalar_subquery()
    .label("paper_count")
)
kw_count_sq = (
    select(func.count(Keyword.id))
    .where(Keyword.project_id == Project.id)
    .correlate(Project)
    .scalar_subquery()
    .label("keyword_count")
)

stmt = select(Project, paper_count_sq, kw_count_sq).order_by(Project.updated_at.desc())
result = await db.execute(stmt)
projects = [
    {**ProjectRead.model_validate(p).model_dump(), "paper_count": pc, "keyword_count": kc}
    for p, pc, kc in result.all()
]
```

#### 3. 优化对话列表 N+1 查询 — `backend/app/api/v1/conversations.py`

**当前问题**（lines 45-71）：每条对话 2 次额外查询。

**修改方案**：使用窗口函数或子查询。

```python
# 消息计数子查询
msg_count_sq = (
    select(func.count(Message.id))
    .where(Message.conversation_id == Conversation.id)
    .correlate(Conversation)
    .scalar_subquery()
    .label("message_count")
)

# 最后消息子查询（使用 lateral 或窗口函数）
last_msg_sq = (
    select(Message.content)
    .where(Message.conversation_id == Conversation.id)
    .order_by(Message.created_at.desc())
    .limit(1)
    .correlate(Conversation)
    .scalar_subquery()
    .label("last_message")
)

stmt = (
    select(Conversation, msg_count_sq, last_msg_sq)
    .order_by(Conversation.updated_at.desc())
    .limit(limit).offset(offset)
)
```

### 前端（10 项）

#### 4. 引入 Sonner toast 系统

```bash
# 安装
npm install sonner
```

```tsx
// frontend/src/App.tsx — 添加 Toaster
import { Toaster } from 'sonner'

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>...</Routes>
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </ErrorBoundary>
  )
}
```

#### 5. Mutation 添加 onError + toast

**影响文件**：`PapersPage.tsx`, `KeywordsPage.tsx`, `KnowledgeBasesPage.tsx`, `SubscriptionManager.tsx`, `ChatHistoryPage.tsx`

```tsx
// 示例：KnowledgeBasesPage.tsx
import { toast } from 'sonner'

const deleteMutation = useMutation({
  mutationFn: (id: number) => projectApi.delete(id),
  onSuccess: () => {
    toast.success(t('common.deleteSuccess'))
    queryClient.invalidateQueries({ queryKey: ['projects'] })
  },
  onError: (error: Error) => {
    toast.error(t('common.deleteFailed'), { description: error.message })
  },
})
```

#### 6. 替换 `confirm()` 为 AlertDialog

**影响文件**：`PapersPage.tsx:292`, `KnowledgeBasesPage.tsx:67`, `KeywordsPage.tsx:281`, `ChatHistoryPage.tsx:116`

```tsx
// frontend/src/components/ui/confirm-dialog.tsx
// 使用 shadcn AlertDialog 封装可复用的确认对话框
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface ConfirmDialogProps {
  trigger: React.ReactNode
  title: string
  description: string
  onConfirm: () => void
  destructive?: boolean
}

export function ConfirmDialog({ trigger, title, description, onConfirm, destructive }: ConfirmDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={destructive ? 'bg-destructive text-destructive-foreground' : ''}>
            {t('common.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

#### 7. 修复 i18n 缺失 key

**`frontend/src/i18n/locales/zh.json`** 和 **`en.json`** 需新增：

```json
{
  "kb": {
    "searchAdd": {
      "stepQuery": "输入查询",
      "stepResults": "查看结果",
      "stepSelect": "选择论文",
      "keywords": "关键词",
      "sources": "数据源"
    }
  },
  "common": {
    "deleteSuccess": "删除成功",
    "deleteFailed": "删除失败",
    "createSuccess": "创建成功",
    "createFailed": "创建失败",
    "updateSuccess": "更新成功",
    "updateFailed": "更新失败",
    "confirm": "确认",
    "cancel": "取消"
  }
}
```

#### 8. 修复 prop drilling — `SubscriptionManager.tsx`

移除 `SubscriptionCard` 的 `t` prop，在子组件内调用 `useTranslation()`。

#### 9. 修复不安全类型断言 — `PlaygroundPage.tsx`

**当前**：`const citation = event.data as unknown as Citation`

**修改**：添加 type guard。

```typescript
function isCitation(data: unknown): data is Citation {
  return (
    typeof data === 'object' && data !== null &&
    'paper_title' in data && 'text' in data
  )
}

// 使用
if (isCitation(event.data)) {
  setCitations(prev => [...prev, event.data])
}
```

#### 10. API 服务添加类型 — `frontend/src/services/api.ts`

为所有 API 方法添加返回类型，使用 `ApiResponse<T>`。

```typescript
// frontend/src/services/api.ts
import type { ApiResponse } from '@/lib/api'
import type { Project, Paper, Keyword } from '@/types'

export const projectApi = {
  list: (): Promise<ApiResponse<{ items: Project[]; total: number }>> =>
    api.get('/projects'),
  get: (id: number): Promise<ApiResponse<Project>> =>
    api.get(`/projects/${id}`),
  // ...
}
```

#### 11. 迁移聊天到 Vercel AI SDK

```bash
npm install ai @ai-sdk/react
```

**后端调整**：确保 SSE 格式兼容 AI SDK 的流协议。AI SDK 期望特定的 SSE 数据格式。需要在 `backend/app/api/v1/chat.py` 中适配。

**前端替换**：

```tsx
// frontend/src/pages/PlaygroundPage.tsx
import { useChat } from '@ai-sdk/react'

const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
  api: '/api/v1/chat/stream',
  body: { knowledge_base_ids: selectedKBs, tool_mode: toolMode },
  onError: (error) => toast.error(t('chat.error'), { description: error.message }),
})
```

**注意**：需验证后端 SSE 事件格式是否兼容 AI SDK。如不兼容，需在后端添加适配层或使用 AI SDK 的 custom provider。

#### 12. 修复 axios 拦截器解包 — `frontend/src/lib/api.ts`

统一错误拦截器，添加类型声明：

```typescript
// frontend/src/lib/api.ts
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.message || error.message || 'Unknown error'
    toast.error(message)
    return Promise.reject(new Error(message))
  }
)
```

#### 13. KB picker 加载状态 — `PlaygroundPage.tsx`

```tsx
{isLoadingProjects ? (
  <div className="p-2 text-sm text-muted-foreground">{t('common.loading')}</div>
) : projects.length === 0 ? (
  <div className="p-2 text-sm text-muted-foreground">{t('chat.noKnowledgeBases')}</div>
) : (
  projects.map(kb => ...)
)}
```

## Acceptance Criteria

- [ ] rag_service 异常不再返回字符串，API 层返回适当 HTTP 状态码
- [ ] 项目列表页仅执行 1 条 SQL（无 N+1）
- [ ] 对话列表页仅执行 1 条 SQL（无 N+1）
- [ ] 所有 CRUD 操作（创建、更新、删除）成功/失败都有 toast 反馈
- [ ] `confirm()` 已被替换为 AlertDialog
- [ ] `SearchAddDialog` 所有 i18n key 在 zh.json 和 en.json 中存在
- [ ] `SubscriptionCard` 不再接收 `t` prop
- [ ] PlaygroundPage citation 数据有 runtime 校验
- [ ] 所有 API 方法有明确的 TypeScript 返回类型
- [ ] 聊天流式使用 Vercel AI SDK `useChat` hook
- [ ] axios 错误拦截器统一 toast 提示
- [ ] KB picker 在加载时显示 loading 状态
- [ ] 双语切换无缺失 key 警告

## Technical Considerations

- Vercel AI SDK 的 `useChat` 期望后端返回特定的流协议格式（Data Stream Protocol 或 text stream）。需仔细检查后端 SSE 事件是否兼容，可能需要适配层
- N+1 查询优化使用关联子查询，在 SQLite 上性能良好，但需确认 SQLAlchemy async 对 scalar_subquery 的支持
- Sonner toast 默认 auto-dismiss，需确认长消息的展示时间

## Dependencies & Risks

- **新增依赖**：`sonner`, `ai`, `@ai-sdk/react`
- **风险**：AI SDK 流协议不兼容 —— 备选方案：保持自定义 fetch，仅修复错误处理
- **风险**：N+1 修复可能影响分页逻辑 —— 需验证 limit/offset 与子查询的交互
- **前置**：Batch 1 完成（Error Boundary、axios 拦截器已修复）

## Sources

- **Origin brainstorm**: [docs/brainstorms/2026-03-12-codebase-quality-audit-brainstorm.md](../brainstorms/2026-03-12-codebase-quality-audit-brainstorm.md)
- Issues: B4-B6, F5-F13 from brainstorm
- Vercel AI SDK docs: https://sdk.vercel.ai/docs
- Sonner docs: https://sonner.emilkowal.dev/
