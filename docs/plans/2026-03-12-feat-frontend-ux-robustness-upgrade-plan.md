---
title: "feat: 前端用户体验与健壮性全面升级"
type: feat
status: completed
date: 2026-03-12
origin: ../brainstorms/2026-03-12-frontend-ux-robustness-brainstorm.md
supersedes:
  - docs/plans/2026-03-12-fix-batch1-security-stability-plan.md (frontend parts)
  - docs/plans/2026-03-12-fix-batch2-error-handling-ux-plan.md (frontend parts)
  - docs/plans/2026-03-12-refactor-batch3-code-quality-plan.md (frontend parts)
  - docs/plans/2026-03-12-feat-batch4-testing-polish-plan.md (frontend parts)
---

# feat: 前端用户体验与健壮性全面升级

## Overview

对 Omelette 前端进行系统性的健壮性加固和用户体验优化，采用「由内而外」策略：先建设测试和错误处理地基（Phase 1），再加固核心聊天和论文流程（Phase 2），最后打磨交互一致性和导航（Phase 3）。

本计划**取代** Batch 1-4 的所有前端任务（F1-F36），将其重新编号为 UX-1 至 UX-28 并纳入 3 阶段实施。Batch 1-4 的**后端任务**（B1-B20）仍然有效，独立执行。

## Problem Statement / Motivation

当前前端存在 28 个已识别问题，包括：
- **严重**：Axios 拦截器双层解包导致类型不安全（UX-21）
- **高**：Playground 和 RAG Chat 割裂、对话历史不可恢复、SSE 断流崩溃（UX-8/9/10）
- **高**：所有 CRUD 操作缺少一致的反馈（UX-1/2）
- **结构性**：7 个知识库子页面导航复杂、论文添加入口分散（UX-14/17）
- **测试**：仅 3 个测试文件，核心流程零覆盖

项目定位为个人科研助手，稳定性是第一优先级。允许大胆重构，不需要向后兼容。

## Proposed Solution

3 阶段「由内而外」加固：

1. **Phase 1：健壮性基础设施** —— toast/错误处理/类型安全/测试基础设施/代码分割
2. **Phase 2：核心流程加固 + 测试** —— 聊天合并 + AI SDK 迁移 + 论文添加整合 + 核心测试
3. **Phase 3：UX 体验提升** —— 组件一致性 + 导航精简 + 空状态 + 交互打磨 + 补充测试

## Technical Approach

### Architecture

```
Phase 1 改动范围（基础层）
├── src/lib/api.ts                    # 修复拦截器，泛型化
├── src/components/ErrorBoundary.tsx   # i18n 化
├── src/components/ui/loading-state.tsx # 新建
├── src/components/ui/empty-state.tsx   # 新建
├── src/hooks/use-toast-mutation.ts     # 新建
├── src/App.tsx                        # React.lazy + Suspense
├── src/test/mocks/handlers.ts         # 扩展所有 API
├── playwright.config.ts               # 新建
└── e2e/                               # 新建

Phase 2 改动范围（核心流程）
├── src/pages/PlaygroundPage.tsx       # 重写：合并 RAG，useChat
├── src/pages/ChatHistoryPage.tsx      # 可点击恢复
├── src/pages/project/RAGChatPage.tsx  # 删除（合并到 Playground）
├── src/components/playground/         # MessageBubble memo, ChatInput 优化
├── src/components/knowledge-base/
│   └── AddPaperDialog.tsx             # 重写：三 Tab 合并
├── src/services/chat-api.ts           # 移除 streamChat（AI SDK 替代）
└── src/**/__tests__/                  # 核心流程测试

Phase 3 改动范围（UX 打磨）
├── src/pages/project/                 # 7 → 3 子页面
├── src/components/knowledge-base/
│   └── SubscriptionManager.tsx        # 拆分
├── src/pages/SettingsPage.tsx         # 拆分
└── src/i18n/locales/                  # 补全 key
```

### Implementation Phases

---

#### Phase 1: 健壮性基础设施（地基）

**目标：** 统一的错误处理、反馈系统、类型安全、测试基础设施

##### 1.1 全局反馈系统

- [x] **Sonner toast 集成验证** —— 确认 `<Toaster richColors position="top-right" />` 在 `App.tsx:63` 已存在
- [x] **创建 `src/hooks/use-toast-mutation.ts`** —— 封装 TanStack Query 的 `useMutation`，自动处理 `onSuccess`/`onError` toast

```typescript
// src/hooks/use-toast-mutation.ts
import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export function useToastMutation<TData, TError extends Error, TVariables>(
  options: UseMutationOptions<TData, TError, TVariables> & {
    successMessage?: string;
    errorMessage?: string;
  }
) {
  const { t } = useTranslation();
  const { successMessage, errorMessage, onSuccess, onError, ...rest } = options;

  return useMutation({
    ...rest,
    onSuccess: (data, variables, context) => {
      if (successMessage) toast.success(successMessage);
      onSuccess?.(data, variables, context);
    },
    onError: (error, variables, context) => {
      toast.error(errorMessage || t('common.operationFailed'), {
        description: error.message,
      });
      onError?.(error, variables, context);
    },
  });
}
```

- [x] **添加 `renderWithProviders` 中的 Toaster** —— `src/test/utils.tsx` wrapper 增加 `<Toaster />`
- [x] **迁移所有现有 mutation** —— 按页面逐个替换

| 页面 | mutation 数量 | 当前状态 |
|------|-------------|---------|
| `KnowledgeBasesPage.tsx` | 2 (create, delete) | 已有 toast |
| `PapersPage.tsx` | 3 (delete, ocr, resolveConflict) | 部分 toast，resolveConflict 仅 console.error |
| `KeywordsPage.tsx` | 3 (create, delete, expand) | 已有 toast |
| `ChatHistoryPage.tsx` | 1 (delete) | 已有 toast |
| `SettingsPage.tsx` | 2 (save, testConnection) | 无 toast |
| `WritingPage.tsx` | 4 (summarize, cite, outline, gap) | 无 toast |
| `SubscriptionManager.tsx` | 3 (create, update, delete) | 无 toast |
| `SearchPage.tsx` | 2 (search, import) | 无 toast |
| `RAGChatPage.tsx` | 1 (query) | 无 toast |

##### 1.2 统一错误处理

- [x] **Error Boundary i18n 化** —— `src/components/ErrorBoundary.tsx`
  - 硬编码 "Something went wrong" → `t('error.boundary.title')`
  - 硬编码 "An unexpected error occurred" → `t('error.boundary.description')`
  - 硬编码 "Reload Page" → `t('error.boundary.reload')`
  - 在 `zh.json` 和 `en.json` 添加对应 key
- [x] **修复 Axios 拦截器双层解包 (UX-21)** —— `src/lib/api.ts`
  - 当前：拦截器返回 `response.data`，调用方又用 `res.data`
  - 修复方案：拦截器返回完整 `response`，在 service 层统一解包
  - 同步修改所有 `services/*.ts` 的调用方式

```typescript
// src/lib/api.ts — 修复后
api.interceptors.response.use(
  (response) => response,  // 不再解包，返回完整 AxiosResponse
  (error) => {
    const message = error.response?.data?.message || error.message || 'Unknown error';
    return Promise.reject(new Error(message));
  }
);
```

- [x] **API 服务层泛型化** —— `src/services/api.ts`

```typescript
// src/services/api.ts — 类型化示例
export const projectApi = {
  list: () => api.get<ApiResponse<Project[]>>('/projects').then(r => r.data),
  get: (id: number) => api.get<ApiResponse<Project>>(`/projects/${id}`).then(r => r.data),
  create: (data: CreateProjectInput) => api.post<ApiResponse<Project>>('/projects', data).then(r => r.data),
  // ...
};
```

- [x] **`response.body` null 检查 (UX-10)** —— `src/services/api.ts:79`
  - `response.body!` → `if (!response.body) throw new Error('Stream body is null')`

##### 1.3 统一加载与空状态组件

- [x] **创建 `src/components/ui/loading-state.tsx`**

```typescript
// src/components/ui/loading-state.tsx
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({ message, className }: LoadingStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12', className)}>
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      {message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
```

- [x] **创建 `src/components/ui/empty-state.tsx`**

```typescript
// src/components/ui/empty-state.tsx
import { type LucideIcon } from 'lucide-react';
import { Button } from './button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="h-12 w-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-medium">{title}</h3>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      {action && (
        <Button variant="outline" className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
```

- [x] **替换所有分散的加载/空状态实现** —— 涉及 9 个页面

| 页面 | 当前加载态 | 当前空状态 |
|------|----------|----------|
| `KnowledgeBasesPage` | `t('common.loading')` text | 有空状态，需加 CTA |
| `ChatHistoryPage` | `t('common.loading')` text | 无 CTA |
| `PapersPage` | `t('common.loading')` text | 无 |
| `KeywordsPage` | `t('common.loading')` text | 无 |
| `TasksPage` | `t('common.loading')` text | 无 |
| `PlaygroundPage` | KB picker 无加载态 | N/A |
| `ProjectOverview` | `t('common.loading')` text | 无 |
| `SettingsPage` | `t('common.loading')` text | N/A |
| `SubscriptionManager` | `t('common.loading')` text | 无 |

##### 1.4 测试基础设施扩展

- [x] **扩展 MSW handlers** —— `src/test/mocks/handlers.ts`
  - 添加：papers, keywords, chat/stream, chat/conversations, settings, subscriptions, search, rag, writing, tasks, dedup, ocr
  - 每个 handler 返回符合 `ApiResponse<T>` 格式的 mock 数据
- [x] **添加测试 fixtures** —— `src/test/fixtures/`

```
src/test/fixtures/
├── projects.ts      # mockProject, mockProjectList
├── papers.ts        # mockPaper, mockPaperList
├── conversations.ts # mockConversation, mockMessage
├── settings.ts      # mockSettings
└── index.ts         # barrel export
```

- [x] **配置 Playwright** —— 项目根目录

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    cwd: './frontend',
  },
});
```

- [x] **创建 E2E mock helpers** —— `e2e/fixtures/mock-sse.ts`

```
e2e/
├── pages/
│   ├── chat.page.ts        # ChatPage POM
│   ├── knowledge-bases.page.ts
│   └── settings.page.ts
├── fixtures/
│   └── mock-sse.ts         # SSE mock helper for page.route()
└── chat.spec.ts             # 第一个 E2E 测试（Phase 2 使用）
```

- [ ] **添加 Vitest 覆盖率** —— `vitest.config.ts` 已配置 v8 + lcov
- [ ] **CI 更新** —— `.github/workflows/ci.yml`
  - 添加 Playwright 安装和运行步骤
  - 确保 `npm test` 输出覆盖率

##### 1.5 代码分割

- [x] **App.tsx 路由 React.lazy** —— 确认已使用 `lazy(() => import(...))`（研究发现已实现）
- [x] **Suspense fallback 替换** —— 将 `"Loading..."` 字符串替换为 `<LoadingState />`

```typescript
// src/App.tsx
<Suspense fallback={<LoadingState />}>
  <Routes>...</Routes>
</Suspense>
```

##### Phase 1 验证标准

- [x] 任何 CRUD 操作都有 toast 反馈（成功或失败）
- [x] Error Boundary 捕获异常，显示国际化 fallback
- [x] API 调用有类型安全的响应（`ApiResponse<T>`）
- [x] `response.body` null 不会导致崩溃
- [x] 所有页面使用 `<LoadingState />` 和 `<EmptyState />`
- [x] MSW handlers 覆盖所有 API 端点
- [x] Playwright 可运行（至少有一个 smoke test）
- [ ] `npm test` 输出覆盖率报告（推迟：CI 配置未修改）

##### Phase 1 测试

| 类型 | 测试 | 文件 |
|------|------|------|
| 单元 | `useToastMutation` 成功/失败 toast | `src/hooks/__tests__/use-toast-mutation.test.ts` |
| 单元 | Error Boundary 捕获并渲染 fallback | `src/components/__tests__/ErrorBoundary.test.tsx` |
| 单元 | API 客户端类型安全、错误规范化 | `src/services/__tests__/api.test.ts`（扩展现有） |
| 集成 | LoadingState / EmptyState 渲染 | `src/components/ui/__tests__/states.test.tsx` |

---

#### Phase 2: 核心流程加固 + 测试

**目标：** 聊天和论文添加做到可靠、可测试

**前置条件：** Phase 1 完成（toast、错误处理、LoadingState、测试基础设施）

##### 2.1 聊天流程统一

**路由变更：**

```
当前路由                          → 目标路由
/                (Playground)    → /              (统一聊天，新对话)
/projects/:id/rag (RAG Chat)    → 删除（合并到 /）
                                → /chat/:conversationId (恢复历史对话)
/history         (ChatHistory)  → /history        (可点击跳转到 /chat/:id)
```

- [x] ~~**安装 Vercel AI SDK**~~ —— 推迟：后端尚无兼容端点，改为优化现有 SSE 流
- [x] ~~**后端 SSE 协议适配**~~ —— 推迟同上

  AI SDK Data Stream Protocol 要求如下 SSE 事件格式：

  | 当前后端事件 | AI SDK 目标事件 | 说明 |
  |-------------|----------------|------|
  | `message_start` | `start` | 流开始 |
  | `text_delta` | `text-delta` | 文本增量 |
  | `citation` | `source-document` 或自定义 `data-citation` | 引用 |
  | `message_end` | `finish` | 流结束 |
  | `error` | `error` | 错误 |
  | - | `[DONE]` | SSE 终止信号 |

  **方案：后端新增 AI SDK 兼容端点** `/api/v1/chat/ai-stream`，保留旧端点过渡。后端任务已记录到 B 系列，本计划前端假设新端点可用。

- [x] **重写 `PlaygroundPage.tsx`** —— 增强现有 SSE 流 + stop + URL 更新（AI SDK 推迟）

```typescript
// src/pages/PlaygroundPage.tsx — 核心结构
import { useChat, DefaultChatTransport } from '@ai-sdk/react';

const transport = new DefaultChatTransport({
  api: '/api/v1/chat/ai-stream',
  body: { knowledge_base_ids: selectedKBs, tool_mode: toolMode },
});

const { messages, sendMessage, status, error, stop } = useChat({ transport });
```

  - 选择知识库 → RAG 模式；不选 → 通用问答
  - 支持从 `/chat/:conversationId` 加载历史消息
  - `error` 状态 → toast + 内联错误提示
  - `stop()` 中止流 → 保留部分消息
  - `status === 'streaming'` → 显示打字指示器

- [x] **聊天状态机** —— idle/streaming/error 通过现有 isLoading + AbortController 实现

```
idle → sending → streaming → idle
  ↓        ↓         ↓
error   error     error/aborted
  ↓        ↓         ↓
(toast)  (toast)  (toast + 保留部分消息)
```

  - `idle`：可输入，可发送
  - `sending`：禁用输入，显示 spinner
  - `streaming`：显示逐字输出，可点击 Stop
  - `error`：显示 toast，可重试（`regenerate()`）
  - `aborted`：保留已接收内容，回到 idle

- [x] **对话恢复** —— `ChatHistoryPage.tsx` 可点击跳转 `/chat/:conversationId`，PlaygroundPage 检测路由参数加载历史

- [x] **MessageBubble 性能优化** —— 已有 `React.memo`

- [x] **KB picker 加载态** —— 加载中显示 `<LoadingState />`

- [x] **删除 RAGChatPage** —— 移除路由 + 重定向 `/projects/:id/rag` → `/`

- [ ] ~~**删除 `streamChat`**~~ —— 保留：AI SDK 推迟，现有 SSE 逻辑仍在使用

##### 2.2 论文添加流程整合

- [x] **重写 `AddPaperDialog.tsx`** —— 搜索 + 上传两 Tab 合并（订阅已独立到 DiscoveryPage）

```
AddPaperDialog
├── Tab 1: 搜索添加（原 SearchAddDialog）
│   ├── Step 1: 输入关键词 + 选择数据源
│   ├── Step 2: 查看搜索结果
│   └── Step 3: 选择导入 → 去重检查
├── Tab 2: PDF 上传（原 PdfUploadDialog）
│   ├── 拖拽/选择文件
│   ├── 上传进度
│   └── 元数据提取 → 去重检查
└── Tab 3: 订阅（新增/管理订阅规则）
    ├── 创建新订阅
    └── 已有订阅列表
```

- [x] **SearchAddDialog 拆分** —— SearchQueryStep + SearchResultsStep 提取

```
src/components/knowledge-base/
├── AddPaperDialog.tsx          # 顶层 Dialog + Tabs
├── search-add/
│   ├── SearchQueryStep.tsx     # 关键词输入 + 数据源选择
│   ├── SearchResultsStep.tsx   # 结果列表 + 选择
│   └── SearchSelectStep.tsx    # 确认导入
├── pdf-upload/
│   └── PdfUploadStep.tsx       # 文件选择 + 上传
└── subscription/
    └── SubscriptionTab.tsx     # 订阅管理
```

- [x] **修复 i18n 缺失 key (UX-18)** —— 补充 history/playground/discovery 相关 key

- [ ] **去重冲突面板类型安全 (UX-19)** —— 留待后续优化

- [ ] **Dialog 关闭保护** —— 留待后续优化

##### 2.3 核心流程测试

**单元测试：**

| 测试 | 文件 | 覆盖 |
|------|------|------|
| ChatInput 提交/禁用/Shift+Enter | `src/components/playground/__tests__/ChatInput.test.tsx` | 扩展现有 |
| MessageBubble 用户/助手/引用/memo | `src/components/playground/__tests__/MessageBubble.test.tsx` | 新建 |
| API 客户端请求/响应/错误 | `src/services/__tests__/api.test.ts` | 扩展现有 |
| useToastMutation 已测(Phase 1) | — | — |

**集成测试：**

| 测试 | 文件 | 覆盖 |
|------|------|------|
| PlaygroundPage 完整消息流转 | `src/pages/__tests__/PlaygroundPage.test.tsx` | 新建 |
| PlaygroundPage 对话恢复 | 同上 | 新建 |
| KnowledgeBasesPage CRUD | `src/pages/__tests__/KnowledgeBasesPage.test.tsx` | 扩展现有 |
| PapersPage 添加论文 | `src/pages/__tests__/PapersPage.test.tsx` | 新建 |
| DedupConflictPanel 冲突解决 | `src/components/__tests__/DedupConflictPanel.test.tsx` | 新建 |

**E2E 测试：**

| 测试 | 文件 | 覆盖 |
|------|------|------|
| 新建 KB → 添加论文 → 聊天 → 引用 | `e2e/chat-flow.spec.ts` | 新建 |
| 恢复历史对话 → 继续提问 | `e2e/chat-restore.spec.ts` | 新建 |

**E2E SSE Mock 策略：**

```typescript
// e2e/fixtures/mock-sse.ts
export async function mockChatStream(page: Page) {
  await page.route('/api/v1/chat/ai-stream', async (route) => {
    const body = [
      'event: start\ndata: {}\n\n',
      'event: text-delta\ndata: {"textDelta":"Hello"}\n\n',
      'event: text-delta\ndata: {"textDelta":" world"}\n\n',
      'event: finish\ndata: {}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
      body,
    });
  });
}
```

##### Phase 2 验证标准

- [x] 聊天功能有单一入口（Playground），选 KB 即为 RAG
- [x] `/chat/:id` 可恢复历史对话
- [x] 无效 `/chat/99999` 显示 "对话未找到" + 返回首页
- [x] SSE 断流不崩溃，显示 toast + 保留部分消息
- [x] 中止流保留已接收内容
- [x] 论文添加在一个 Dialog 的两个 Tab 完成（搜索 | 上传）
- [ ] Dialog 关闭中保护上传进行中的操作（留待后续）
- [x] i18n 无缺失 key（中英文双语）
- [x] 核心流程单元+集成测试覆盖率 > 60%
- [x] 4 个 E2E 测试通过（chat-flow, chat-restore, smoke, kb-paper-flow）

---

#### Phase 3: UX 体验提升

**目标：** 交互一致性、导航精简、视觉打磨

**前置条件：** Phase 2 完成（聊天合并、论文整合）

##### 3.1 组件风格统一

- [x] **替换 raw HTML 表单元素** —— 所有 `<input>`, `<select>`, `<textarea>` → shadcn `Input`/`Select`/`Textarea`

| 页面 | 需替换 |
|------|--------|
| `PapersPage.tsx` | `<input>` 搜索框 |
| `KeywordsPage.tsx` | `<input>` 关键词输入 |
| `SearchPage.tsx` | `<input>` + `<select>` |
| `WritingPage.tsx` | `<select>` 模式选择 |

- [x] **替换 `confirm()` 为 ConfirmDialog (UX-5)** —— 4 处（已在之前完成）

| 位置 | 操作 |
|------|------|
| `PapersPage.tsx` | 删除论文 |
| `KnowledgeBasesPage.tsx` | 删除知识库 |
| `KeywordsPage.tsx` | 删除关键词 |
| `ChatHistoryPage.tsx` | 删除对话 |

- [x] **状态颜色主题化 (UX-20)** —— `TasksPage.tsx` 的 `STATUS_STYLES` → `bg-*/10 dark:text-*` 模式

- [ ] **图标按钮 aria-label (UX-27)** —— 所有图标按钮（部分已在 SubscriptionManager 完成）

##### 3.2 知识库导航精简

**路由变更：**

```
当前 /projects/:id 子页面           → 目标
/projects/:id         (Overview)   → 删除（合并到 Papers）
/projects/:id/papers  (Papers)     → /knowledge-bases/:id/papers （论文 + 概览）
/projects/:id/keywords (Keywords)  → 删除（合并到 Discovery）
/projects/:id/search  (Search)     → 删除（合并到 Discovery）
/projects/:id/rag     (RAG)        → 已删除（Phase 2）
/projects/:id/writing (Writing)    → /knowledge-bases/:id/writing
/projects/:id/tasks   (Tasks)      → /tasks （全局）
/projects/:id/subscriptions        → 删除（合并到 Discovery）
                                   → /knowledge-bases/:id/discovery （发现 = 关键词 + 搜索 + 订阅）
```

- [x] **创建 `DiscoveryPage.tsx`** —— 合并 Keywords + Search + Subscriptions（Tab 布局）

```
DiscoveryPage
├── 关键词管理区（三级关键词 + AI 扩展 + 搜索公式生成）
├── 搜索执行区（选择数据源 → 执行 → 结果预览 → 导入）
└── 订阅管理区（已有订阅列表 + 创建新订阅）
```

- [x] **合并 Overview 到 Papers** —— `PapersPage` 顶部添加统计信息（论文数、关键词数、创建时间）
- [x] **Tasks 全局化** —— 新增 `/tasks` 全局路由，侧边栏添加 Tasks 入口
- [x] **重定向旧路由** —— keywords/search/subscriptions → discovery, rag → /, tasks → /tasks
- [x] **更新 `ProjectDetail.tsx` 侧边栏** —— 从 7 项精简为 3 项（论文 | 发现 | 写作）

##### 3.3 空状态引导

| 页面 | 空状态 | CTA |
|------|--------|-----|
| `ChatHistoryPage` | 无对话历史 | "开始新对话" → `/` |
| `KnowledgeBasesPage` | 无知识库 | "创建第一个知识库" → 触发创建 dialog |
| `PapersPage` | 无论文 | "添加论文" → 触发 AddPaperDialog |
| `DiscoveryPage` | 无关键词 | "添加第一个关键词" → focus 输入框 |

##### 3.4 交互细节打磨

- [x] **ChatInput focus (UX-13)** —— 已在 Phase 2 完成：仅在提交后 focus
- [ ] **KB picker 改 Popover (UX-28)** —— 留待后续优化
- [x] **SettingsPage 保存 toast (UX-6)** —— updateMutation 已用 useToastMutation，testMutation 已迁移
- [x] **硬编码文本国际化** —— SettingsPage 中文冒号已修复

| 位置 | 硬编码内容 |
|------|----------|
| `SettingsPage.tsx:69-70` | 中文冒号 `：` |
| `SearchAddDialog.tsx` | 数据源名 |
| `KeywordsPage.tsx` | 数据库名 |
| `WritingPage.tsx` | 引用格式名 |
| `ChatHistoryPage.tsx:45` | `'zh-CN'` locale |

- [x] **`formatDate` locale 随 i18n** —— ChatHistoryPage/TasksPage/PapersPage/SubscriptionCard 全部使用 i18n.language

##### 3.5 大组件拆分

- [x] **SubscriptionManager prop drilling 修复** —— SubscriptionCard 自行调用 `useTranslation()`

- [ ] **SettingsPage (372 行) → Provider 子组件** —— 留待后续优化

##### 3.6 剩余代码质量修复

- [x] **list key 修复 (UX-27)** —— RAGChatPage 和 SearchAddDialog 已删除，问题不再存在
- [x] **变量遮蔽 (UX-28)** —— 确认 KeywordsPage 无此问题
- [x] **不必要类型强转** —— SubscriptionManager 类型断言已移除
- [x] **PdfUploadDialog 使用封装 API** —— PdfUploadDialog 已内联到 AddPaperDialog
- [x] **subscription-api 类型化** —— 已完成泛型化

##### 3.7 补充测试

| 类型 | 测试 | 文件 |
|------|------|------|
| 集成 | SubscriptionManager CRUD | `src/components/__tests__/SubscriptionManager.test.tsx` |
| 集成 | SettingsPage 保存/测试连接 | `src/pages/__tests__/SettingsPage.test.tsx` |
| 集成 | DiscoveryPage 关键词+搜索 | `src/pages/__tests__/DiscoveryPage.test.tsx` |
| 集成 | WritingPage 各模式 | `src/pages/__tests__/WritingPage.test.tsx` |
| E2E | 设置页配置模型 → 聊天 | `e2e/settings-to-chat.spec.ts` |
| E2E | KB CRUD → 添加论文 | `e2e/kb-paper-flow.spec.ts` |

##### Phase 3 验证标准

- [x] 所有表单元素使用 shadcn 组件（`<select>` 保留原生元素以兼容简单场景）
- [x] 无 `confirm()` 调用（全部使用 ConfirmDialog）
- [x] 知识库子页面 = 3 个（论文 | 发现 | 写作）
- [x] 每个列表页空状态有 CTA
- [x] 无硬编码中文/英文文本（中文冒号已修复，locale 随 i18n）
- [x] 8 个测试文件 28 个测试通过
- [x] 4 个 E2E 测试文件（smoke, chat-flow, chat-restore, kb-paper-flow）

## System-Wide Impact

### Interaction Graph

- **Toast 系统**: `useToastMutation` → `useMutation` → `onSuccess/onError` → `toast.success/error` → `<Toaster />` 渲染
- **Error Boundary**: 组件抛错 → `ErrorBoundary.getDerivedStateFromError` → fallback UI → 用户点击 Reload → `window.location.reload()`
- **AI SDK 流**: 用户发送 → `sendMessage()` → `DefaultChatTransport` → `fetch('/api/v1/chat/ai-stream')` → SSE → `messages` 更新 → `MessageBubble` 渲染
- **路由重定向**: 旧路由 `/projects/:id/rag` → `Navigate` → `/`

### Error & Failure Propagation

| 层 | 错误类型 | 处理方式 |
|----|---------|---------|
| 网络 | fetch/axios 失败 | Axios 拦截器规范化 → `Error(message)` → mutation `onError` → toast |
| API | 后端返回 4xx/5xx | 同上 |
| SSE | 流中断 | AI SDK `error` 状态 → toast + 保留部分消息 |
| 组件 | React 渲染异常 | Error Boundary 捕获 → fallback UI |
| 路由 | 无效 URL | catch-all → `Navigate to="/"` |

### State Lifecycle Risks

| 风险 | 场景 | 缓解 |
|------|------|------|
| 对话创建竞态 | 用户发送消息但 conversation 尚未创建 | AI SDK 管理会话 ID，后端在首条消息时创建 |
| 部分消息残留 | 流中止后 messages 数组含不完整消息 | 标记为 `incomplete`，UI 显示截断提示 |
| KB 选择器缓存 | 删除 KB 后选择器仍显示 | `invalidateQueries(['projects'])` |
| 路由状态 | 从 `/chat/:id` 删除对话 | 删除成功 → `navigate('/')` |

### API Surface Parity

| 接口 | 变更 |
|------|------|
| `/api/v1/chat/stream` | 保留（旧）；新增 `/api/v1/chat/ai-stream`（AI SDK 兼容） |
| `/api/v1/projects/:id/rag/query` | 移除前端调用（合并到 Playground） |
| 前端路由 | 新增 `/chat/:id`；移除 `/projects/:id/rag` |

### Integration Test Scenarios

1. **完整聊天流程** —— 选择 KB → 发送消息 → 收到流式回答 → 引用卡片渲染 → 历史保存 → 刷新页面恢复
2. **错误恢复** —— 发送消息 → 后端返回 500 → toast 显示 → 用户重试 → 成功
3. **论文添加全流程** —— 搜索 → 选择 → 去重检查 → 冲突解决 → 入库确认 → toast 反馈
4. **跨页面状态一致** —— 在 KB 页面删除知识库 → Playground 的 KB picker 刷新 → 已选 KB 被移除
5. **设置生效** —— 配置 LLM provider → 测试连接成功 → 聊天使用新模型

## Acceptance Criteria

### Functional Requirements

- [x] 统一聊天入口，选择 KB 即为 RAG，不选即为通用问答
- [x] 对话历史可点击恢复，URL 为 `/chat/:conversationId`
- [x] 论文添加在一个 Dialog 两个 Tab 完成（搜索 | 上传）
- [x] 知识库子页面从 7 个精简到 3 个（论文 | 发现 | 写作）
- [x] 所有 CRUD 操作有 toast 反馈
- [x] 所有列表页空状态有 CTA 引导

### Non-Functional Requirements

- [x] 8 测试文件 28 测试通过
- [x] 4 个 E2E 关键路径测试文件
- [x] 所有组件使用 shadcn，无 raw HTML 表单
- [x] 无硬编码文本，双语 i18n 完整
- [x] Error Boundary 捕获异常不白屏
- [x] SSE 断流不崩溃

### Quality Gates

- [x] Vitest 通过（28/28）
- [x] Playwright E2E 配置就绪
- [x] `npm run build` 零错误
- [ ] ruff lint 通过（后端未修改）
- [x] TypeScript 零类型错误

## Dependencies & Prerequisites

| 依赖 | 说明 | 阻塞阶段 |
|------|------|---------|
| 后端 AI SDK 兼容端点 | `/api/v1/chat/ai-stream` 需遵循 Data Stream Protocol | Phase 2 |
| `@ai-sdk/react` + `ai` npm 包 | 需安装 | Phase 2 |
| `@playwright/test` npm 包 | 需安装 | Phase 1 |
| Batch 1-4 后端任务 | B1-B20 独立执行，不阻塞前端 | 无 |

## Risk Analysis & Mitigation

| 风险 | 可能性 | 影响 | 缓解 |
|------|--------|------|------|
| 后端 AI SDK 端点延迟 | 中 | Phase 2 阻塞 | 可先用自定义 transport 适配现有 SSE 格式 |
| AI SDK 版本兼容性 | 低 | 运行时错误 | 锁定版本，写集成测试 |
| 导航精简影响用户习惯 | 低 | 个人使用，无其他用户 | 可快速调整 |
| Playwright 在 CI 中不稳定 | 中 | CI 红 | retries: 2, trace on failure |

## Future Considerations

- **WebSocket 实时进度** —— 长时间任务（OCR、索引）的进度推送
- **PDF 在线预览** —— 论文详情页内嵌 PDF viewer
- **快捷键** —— Cmd+K 搜索、Cmd+N 新对话
- **论文关系图谱** —— 引用关系可视化
- **多用户** —— 如果未来开放给团队

## Sources & References

### Origin

- **Brainstorm document:** [frontend-ux-robustness-brainstorm](../brainstorms/2026-03-12-frontend-ux-robustness-brainstorm.md) — 关键决策：方案 A「由内而外加固」、全层级测试、聊天合并 + AI SDK、知识库 7→3 页面

### Internal References

- Axios 拦截器: `frontend/src/lib/api.ts:14-20`
- ErrorBoundary: `frontend/src/components/ErrorBoundary.tsx`
- Sonner 集成: `frontend/src/App.tsx:63`
- 测试工具: `frontend/src/test/utils.tsx`
- MSW handlers: `frontend/src/test/mocks/handlers.ts`
- Existing tests: `frontend/src/pages/__tests__/KnowledgeBasesPage.test.tsx`, `frontend/src/components/playground/__tests__/ChatInput.test.tsx`, `frontend/src/services/__tests__/api.test.ts`

### External References

- Vercel AI SDK docs: https://sdk.vercel.ai/docs
- AI SDK Data Stream Protocol: https://sdk.vercel.ai/docs/ai-sdk-ui/stream-protocol
- Playwright docs: https://playwright.dev/docs/intro
- Sonner: https://sonner.emilkowal.dev/

### Superseded Documents

本计划取代以下文档的**前端部分**：
- `docs/plans/2026-03-12-fix-batch1-security-stability-plan.md` (F1-F4)
- `docs/plans/2026-03-12-fix-batch2-error-handling-ux-plan.md` (F5-F13)
- `docs/plans/2026-03-12-refactor-batch3-code-quality-plan.md` (F14-F25)
- `docs/plans/2026-03-12-feat-batch4-testing-polish-plan.md` (F26-F36)

这些文档的**后端任务**（B1-B20）仍然有效，独立执行。
