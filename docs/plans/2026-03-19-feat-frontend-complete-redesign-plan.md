---
title: "feat: Complete Frontend Redesign with Figma Design System"
type: feat
status: active
date: 2026-03-19
origin: docs/brainstorms/2026-03-19-frontend-redesign-brainstorm.md
---

# ✨ Complete Frontend Redesign with Figma Design System

## Enhancement Summary

**Deepened on:** 2026-03-19
**Research agents used:** Design System Best Practices, D3+React Integration, Performance Oracle, TypeScript Reviewer

### Key Improvements from Research
1. **OKLCH 色相修正**: 紫色 hue 应为 ~293-308（非 280），匹配 Tailwind 默认 violet 色阶
2. **PaperStatus 关键类型错误**: 后端用 `pending/metadata_only/pdf_downloaded/ocr_complete`，非 `new/crawled/ocr_done`
3. **性能保障**: DataTable 必须使用虚拟化或严格分页（≤50 行）; KanbanBoard 需要 `@dnd-kit/core`
4. **D3 集成模式**: 使用子模块导入（d3-force, d3-selection 等）而非全量 d3，节省 ~200KB
5. **DualSidebar**: 可基于 shadcn Sidebar (SidebarProvider/SidebarRail) 构建，用 CSS transition 而非 framer-motion

### New Considerations Discovered
- Keyword `synonyms` 在后端是 `string` 类型（逗号分隔），非 `string[]`
- Vite 7 的 `codeSplitting.groups` 需要 `priority` 字段控制匹配优先级
- Pipeline WebSocket 需要 `threadId` 变化时关闭旧连接的处理
- SSE 事件应使用 discriminated unions 提升类型安全
- React Query 应引入 typed `queryKeys` factory

## Overview

Omelette 前端全面重设计：基于 Figma `omelette-ui` 设计规范构建完整设计系统（Design Tokens + 组件库），对齐后端 48 项 API 改进，然后一次性替换所有页面。采用方案 C「设计系统先行」策略 (see brainstorm: `docs/brainstorms/2026-03-19-frontend-redesign-brainstorm.md`)。

**核心变化：**
- neutral 灰色调 → **紫/蓝紫色** (#6C5CE7) 主色系（含 dark mode）
- 单层图标侧边栏 → **双层侧边栏**（图标栏 + 可展开文本栏）
- 聊天页 **Figma 风格欢迎界面**（Logo + 问候语 + 4 功能卡片入口）
- 表格新增**看板视图**（列表 + 看板双视图切换）
- 移除 `@a2ui-sdk/react`，用**自定义组件替换**
- `react-force-graph-2d` → **D3.js** 自定义引用图谱
- API 服务层全面对齐后端新接口
- 移动端重新设计，对齐 Figma 375px 规范
- i18n 先英文，中文后补

## Problem Statement / Motivation

1. 当前前端使用 shadcn neutral 灰色调，缺乏产品视觉 identity
2. 后端完成 48 项全面改进（安全、验证、性能），前端 API 调用层未同步
3. 现有布局（单图标侧边栏）导航能力有限，Figma 双层侧边栏体验更好
4. A2UI SDK 作为外部依赖限制了样式控制力度
5. 聊天空状态体验单调，缺少引导用户探索功能的入口

## Proposed Solution

6 阶段设计系统先行策略：

```
阶段 1: Design Tokens + 主题基础
阶段 2: 基础组件库重建
阶段 3: 布局系统重建
阶段 4: API 服务层对齐
阶段 5: 自定义组件替换 A2UI + D3 图谱
阶段 6: 全面页面替换
```

---

## Technical Approach

### Architecture

```
frontend/src/
├── design-tokens/           # NEW: Design token definitions
│   └── tokens.ts            # Color, spacing, radius, shadow, typography
├── components/
│   ├── ui/                  # MODIFIED: Rebuilt shadcn components (purple theme)
│   │   ├── button.tsx       # Updated variants + purple primary
│   │   ├── card.tsx         # Gradient card variants
│   │   ├── data-table.tsx   # NEW: Sortable data table
│   │   ├── kanban-board.tsx # NEW: Kanban view component
│   │   ├── stats-card.tsx   # NEW: Stats with trend arrows
│   │   ├── progress-bar.tsx # NEW: Purple progress bar
│   │   ├── pagination.tsx   # NEW: Proper pagination component
│   │   └── ... (existing updated)
│   ├── layout/              # MODIFIED: New layout system
│   │   ├── DualSidebar.tsx  # NEW: Icon + text dual sidebar
│   │   ├── TopBar.tsx       # NEW: Welcome + notifications + user
│   │   ├── AppShell.tsx     # REWRITTEN: Uses DualSidebar + TopBar
│   │   ├── MobileLayout.tsx # NEW: Mobile shell (bottom nav + compact header)
│   │   └── PageLayout.tsx   # NEW: Standardized page container
│   ├── citation-graph/      # REWRITTEN: D3.js implementation
│   │   ├── D3CitationGraph.tsx
│   │   └── NodeDetailPanel.tsx
│   ├── playground/          # MODIFIED: New chat UI
│   │   ├── WelcomeScreen.tsx     # NEW: Logo + greeting + feature cards
│   │   ├── FeatureCard.tsx       # NEW: Gradient feature card
│   │   ├── CitationCard.tsx      # NEW: Replace A2UI citation card
│   │   └── ... (existing updated)
│   └── a2ui/                # DELETED: Entire directory removed
├── services/                # MODIFIED: API alignment
│   ├── api.ts               # Updated types + pagination
│   ├── chat-api.ts          # SSE error handling
│   ├── kb-api.ts            # New dedup/batch endpoints
│   ├── subscription-api.ts  # Updated params
│   └── pipeline-api.ts      # NEW: WebSocket pipeline service
├── types/                   # MODIFIED: Sync with backend schemas
│   ├── index.ts
│   ├── chat.ts
│   └── api.ts               # NEW: Shared API types
├── hooks/                   # MODIFIED
│   ├── use-sidebar.ts       # NEW: Sidebar expand/collapse state
│   └── use-pipeline-ws.ts   # NEW: Pipeline WebSocket hook
├── i18n/locales/
│   ├── en.json              # REWRITTEN: English-first
│   └── zh.json              # Deferred (placeholder)
├── index.css                # REWRITTEN: Purple theme tokens
└── pages/                   # REWRITTEN: All pages use new components
```

### Implementation Phases

---

#### Phase 1: Design Tokens + 主题基础

**Goal:** 建立紫色调设计系统基础，全局生效

**Tasks:**

- [ ] 1.1 从 Figma 提取 Design Tokens，创建 `frontend/src/design-tokens/tokens.ts`

```typescript
// frontend/src/design-tokens/tokens.ts
export const colors = {
  primary: {
    50:  'oklch(0.97 0.02 280)',
    100: 'oklch(0.93 0.05 280)',
    200: 'oklch(0.86 0.10 280)',
    300: 'oklch(0.76 0.15 280)',
    400: 'oklch(0.66 0.19 280)',
    500: 'oklch(0.58 0.22 280)',  // #6C5CE7 equivalent
    600: 'oklch(0.50 0.22 280)',
    700: 'oklch(0.42 0.19 280)',
    800: 'oklch(0.35 0.15 280)',
    900: 'oklch(0.28 0.10 280)',
  },
  // neutral, semantic (success, warning, error, info)
  // gradient presets for feature cards
} as const;

export const spacing = { /* 4px grid */ } as const;
export const radius = { sm: '0.375rem', md: '0.5rem', lg: '0.75rem', xl: '1rem' } as const;
export const shadows = { /* sm, md, lg */ } as const;
export const typography = { /* sizes, weights, line-heights */ } as const;
```

- [ ] 1.2 重写 `frontend/src/index.css` — 紫色调 CSS 变量

```css
/* frontend/src/index.css */
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --radius: 0.625rem;
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  /* ... all semantic color mappings */
}

:root {
  --background: oklch(0.98 0.005 280);
  --foreground: oklch(0.15 0.02 280);
  --primary: oklch(0.58 0.22 280);        /* Purple 500 */
  --primary-foreground: oklch(0.98 0.01 280);
  --secondary: oklch(0.94 0.03 280);
  --muted: oklch(0.95 0.01 280);
  --accent: oklch(0.94 0.04 280);
  --card: oklch(0.99 0.002 280);
  --border: oklch(0.90 0.02 280);
  --input: oklch(0.90 0.02 280);
  --ring: oklch(0.58 0.22 280);
  --sidebar: oklch(0.98 0.01 280);
  --sidebar-foreground: oklch(0.35 0.05 280);
  --sidebar-primary: oklch(0.58 0.22 280);
  --sidebar-accent: oklch(0.94 0.06 280);
  --sidebar-border: oklch(0.90 0.02 280);
  /* chart colors */
  --chart-1: oklch(0.58 0.22 280);
  --chart-2: oklch(0.65 0.18 320);
  --chart-3: oklch(0.70 0.15 160);
  --chart-4: oklch(0.75 0.12 80);
  --chart-5: oklch(0.60 0.20 220);
}

.dark {
  --background: oklch(0.14 0.02 280);
  --foreground: oklch(0.93 0.01 280);
  --primary: oklch(0.72 0.18 280);
  --primary-foreground: oklch(0.15 0.02 280);
  --secondary: oklch(0.22 0.03 280);
  --muted: oklch(0.20 0.02 280);
  --accent: oklch(0.25 0.04 280);
  --card: oklch(0.17 0.02 280);
  --border: oklch(0.28 0.03 280);
  --input: oklch(0.28 0.03 280);
  --ring: oklch(0.72 0.18 280);
  --sidebar: oklch(0.16 0.02 280);
  --sidebar-foreground: oklch(0.80 0.02 280);
  --sidebar-primary: oklch(0.72 0.18 280);
  --sidebar-accent: oklch(0.22 0.05 280);
  --sidebar-border: oklch(0.28 0.03 280);
}
```

- [ ] 1.3 移除 `@source "../node_modules/@a2ui-sdk/react"` 从 `index.css`

**Success criteria:** 全局颜色立即从灰色变为紫色调，现有组件自动跟随变色

### Research Insights (Phase 1)

**OKLCH 色相修正:** 紫色 hue 应使用 ~293-308（violet 范围），不是 280。Tailwind 默认 violet 色阶使用 hue ~293。更新所有 OKLCH 值中的 hue 分量。

**三层 Token 层级（推荐）:**
- **Base layer**: 原始色阶（`--color-violet-50` ~ `--color-violet-950`）
- **Semantic layer**: 映射到用途（`--primary` → `var(--color-violet-500)`）
- **Component layer**: 变体级别（`--button-radius`）

**Dark mode 关键:** 紫色主色在暗色模式下 Lightness 需 ≥ 0.72 保证对比度。前景色用柔和白（L ~0.93）而非纯白。

**WCAG 合规:** 验证 4.5:1（正文）和 3:1（大字/UI 组件）对比度。

**Estimated effort:** 小（2-3 小时）

---

#### Phase 2: 基础组件库重建

**Goal:** 升级/新建所有 UI 组件，匹配 Figma 设计语言

**Tasks:**

- [ ] 2.1 更新 `button.tsx` — 新增 `primary` 变体样式，调整 focus ring 为紫色

```typescript
// frontend/src/components/ui/button.tsx — new variant additions
const buttonVariants = cva("...", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
      destructive: "bg-destructive text-white shadow-xs hover:bg-destructive/90",
      outline: "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
      secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
      ghost: "hover:bg-accent hover:text-accent-foreground",
      link: "text-primary underline-offset-4 hover:underline",
      // NEW
      gradient: "bg-gradient-to-r from-primary to-primary/80 text-white shadow-md hover:shadow-lg",
    },
    // ...
  },
});
```

- [ ] 2.2 更新 `card.tsx` — 新增渐变卡片变体

```typescript
// frontend/src/components/ui/card.tsx
interface CardProps extends React.ComponentProps<"div"> {
  variant?: "default" | "gradient-pink" | "gradient-yellow" | "gradient-blue" | "gradient-green";
}
```

- [ ] 2.3 更新 `badge.tsx` — 新增 `purple`, `success`, `warning` 变体
- [ ] 2.4 更新 `input.tsx` — focus 样式改为紫色 ring
- [ ] 2.5 更新 `select.tsx` — 紫色 focus/active 态
- [ ] 2.6 更新 `tabs.tsx` — 激活态改为紫色底线/背景
- [ ] 2.7 更新 `dialog.tsx` — 圆角和阴影调整
- [ ] 2.8 更新 `sheet.tsx` — 匹配新设计
- [ ] 2.9 更新 `skeleton.tsx` — 紫色调闪烁动画
- [ ] 2.10 更新 `tooltip.tsx` — 深紫色背景
- [ ] 2.11 新建 `frontend/src/components/ui/data-table.tsx`

```typescript
// Sortable data table with column resize, sort indicators, row selection
interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  isLoading?: boolean;
  pagination?: { page: number; pageSize: number; total: number };
  onPaginationChange?: (page: number, pageSize: number) => void;
  onRowClick?: (row: T) => void;
  selectedRows?: Set<string | number>;
  onSelectionChange?: (selected: Set<string | number>) => void;
}
```

- [ ] 2.12 新建 `frontend/src/components/ui/pagination.tsx` — 带页码、prev/next、page size selector
- [ ] 2.13 新建 `frontend/src/components/ui/kanban-board.tsx`

```typescript
// Kanban board with drag-and-drop columns
interface KanbanColumn<T> {
  id: string;
  title: string;
  color: string;
  items: T[];
}
interface KanbanBoardProps<T> {
  columns: KanbanColumn<T>[];
  renderCard: (item: T) => ReactNode;
  onDragEnd?: (itemId: string, fromColumn: string, toColumn: string) => void;
}
```

- [ ] 2.14 新建 `frontend/src/components/ui/stats-card.tsx`

```typescript
// Stats card with label, value, trend arrow, optional progress bar
interface StatsCardProps {
  label: string;
  value: string | number;
  trend?: { value: number; direction: "up" | "down" };
  icon?: ReactNode;
}
```

- [ ] 2.15 新建 `frontend/src/components/ui/progress-bar.tsx` — 紫色进度条
- [ ] 2.16 新建 `frontend/src/components/ui/avatar.tsx` — 头像组件（图片 + fallback 首字母）
- [ ] 2.17 新建 `frontend/src/components/ui/switch.tsx` — 开关组件
- [ ] 2.18 新建 `frontend/src/components/ui/checkbox.tsx` — 紫色勾选框

**Success criteria:** 所有基础组件可独立使用，紫色调一致，支持 dark mode

### Research Insights (Phase 2)

**DataTable 虚拟化（P0 性能）:** DataTable 必须使用 `@tanstack/react-virtual` 或强制服务端分页（`pageSize ≤ 50`）。500+ 行无虚拟化会导致卡顿。

**KanbanBoard DnD 库:** 需要添加 `@dnd-kit/core` + `@dnd-kit/sortable` 作为拖拽基础。每列可见项目超过 20 时需虚拟化或 "Show more" 机制。

**CVA vs Tailwind Variants:** 简单组件保持 CVA；KanbanBoard 等多 slot 复合组件考虑用 `tailwind-variants` (tv) 的 slots API。

**DataTable 泛型:** 需要 `getRowId: (row: T) => string | number` prop 支持行选择。Column 定义：

```typescript
interface DataTableColumn<T> {
  id: string;
  header: string;
  accessorKey?: keyof T & string;
  accessorFn?: (row: T) => ReactNode;
  sortable?: boolean;
  cell?: (props: { row: T; value: unknown }) => ReactNode;
}
```

**KanbanBoard 泛型约束:** `T extends { id: string | number }`，`onDragEnd` 传递完整 item 而非仅 id。

**Estimated effort:** 中（8-12 小时）

---

#### Phase 3: 布局系统重建

**Goal:** 构建双层侧边栏、TopBar、移动端布局

**Tasks:**

- [ ] 3.1 新建 `frontend/src/hooks/use-sidebar.ts`

```typescript
// Sidebar state management (expand/collapse, mobile open/close)
interface SidebarState {
  isExpanded: boolean;
  isMobileOpen: boolean;
  toggle: () => void;
  expand: () => void;
  collapse: () => void;
  openMobile: () => void;
  closeMobile: () => void;
}
// Persist isExpanded to localStorage key 'omelette-sidebar-expanded'
```

- [ ] 3.2 新建 `frontend/src/components/layout/DualSidebar.tsx`

```
┌──────┬────────────────┐
│ Icon │  Text Sidebar  │
│ Bar  │  (expandable)  │
│ 56px │  200px         │
│      │                │
│ ☰    │  + New Chat    │
│ 💬   │  My Tools      │
│ 📚   │  AI Chat       │
│ 🔍   │  Image Gen     │
│      │  AI Search     │
│      │  Music Gen     │
│      │                │
│      │  ─── Chat ─── │
│      │  Conversation1 │
│      │  Conversation2 │
│      │                │
│ 🌐   │                │
│ 🌙   │                │
│ ⚙️   │                │
└──────┴────────────────┘
```

- Left icon bar: always visible, 56px wide, bg-sidebar
- Right text panel: toggle expanded/collapsed, 200px when expanded
- Animated transitions (framer-motion or CSS transition)
- Active route highlighting with purple accent
- Footer: language toggle, theme toggle, settings

- [ ] 3.3 新建 `frontend/src/components/layout/TopBar.tsx`

```
┌──────────────────────────────────────────────────────────┐
│  Welcome back, User!          🔔  ❓  📊     👤 Avatar  │
│  Track your time effectively                      ▼      │
└──────────────────────────────────────────────────────────┘
```

- Welcome message (dynamic based on time of day)
- Notification bell, help, dashboard shortcuts
- User avatar with dropdown menu (profile, sign out placeholder)

- [ ] 3.4 重写 `frontend/src/components/layout/AppShell.tsx`

```typescript
// frontend/src/components/layout/AppShell.tsx
export function AppShell() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileLayout /> : <DesktopLayout />;
}

function DesktopLayout() {
  return (
    <div className="flex h-screen">
      <DualSidebar />
      <div className="flex-1 flex flex-col min-h-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] 3.5 新建 `frontend/src/components/layout/MobileLayout.tsx`

- Compact header (logo + hamburger + notifications)
- Bottom navigation bar (Chat, KB, History, Tasks, More)
- Sheet drawer for expanded menu
- 375px optimized

- [ ] 3.6 新建 `frontend/src/components/layout/PageLayout.tsx`

```typescript
// Standardized page container
interface PageLayoutProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  tabs?: { id: string; label: string }[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  children: ReactNode;
}
// Replaces PageHeader with richer layout: title + tabs + action bar + content
```

- [ ] 3.7 删除旧文件: `IconSidebar.tsx`, `MobileBottomNav.tsx`, `MobileMenuSheet.tsx`, `PageHeader.tsx`

**Success criteria:** 双层侧边栏可展开/折叠，TopBar 显示欢迎语，移动端底部导航正常

### Research Insights (Phase 3)

**shadcn Sidebar 基础:** shadcn 已有 `SidebarProvider`, `SidebarRail`, `useSidebar()` 组件——可作为 DualSidebar 的基础，减少从零开发工作量。

**动画性能:** DualSidebar 宽度变化优先用 CSS `transition: width 200ms ease-out`，而非 framer-motion。避免 `width`/`height` 动画导致 layout thrashing。使用 `transform`/`opacity` 处理内容淡入淡出。

**无障碍:** 添加 `aria-expanded`, `aria-controls` 属性；支持 Enter/Space 切换、Escape 关闭。

**Estimated effort:** 大（12-16 小时）

---

#### Phase 4: API 服务层对齐

**Goal:** 前端 API 调用完全匹配后端新接口

**Tasks:**

- [ ] 4.1 更新 `frontend/src/types/api.ts`（新建）— 共享 API 类型

```typescript
// frontend/src/types/api.ts
export type PaperStatus = 'pending' | 'metadata_only' | 'pdf_downloaded' | 'ocr_complete' | 'indexed' | 'error';
export type DedupStrategy = 'full' | 'doi_only' | 'title_only';
export type CrawlPriority = 'high' | 'low';
export type RewriteStyle = 'simplify' | 'academic' | 'translate_en' | 'translate_zh' | 'custom';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface PaginationParams {
  page?: number;
  page_size?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
```

- [ ] 4.2 更新 `frontend/src/types/index.ts` — 同步所有后端 schema

```typescript
// Sync with app/schemas/paper.py
export interface Paper {
  id: number;
  project_id: number;
  doi: string | null;
  title: string;
  abstract: string | null;
  authors: Author[];
  journal: string | null;
  year: number | null;
  citation_count: number;
  source: string | null;
  source_id: string | null;
  pdf_path: string | null;
  pdf_url: string | null;
  status: PaperStatus;
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// NEW: PaperBatchDeleteRequest
export interface PaperBatchDeleteRequest {
  paper_ids: number[];
}

// Sync with app/schemas/keyword.py
export interface Keyword {
  id: number;
  project_id: number;
  term: string;
  term_en: string | null;
  level: number;
  category: string | null;
  parent_id: number | null;
  synonyms: string[];
  created_at: string;
}

// Sync with app/schemas/subscription.py
export interface Subscription {
  id: number;
  project_id: number;
  name: string;
  query: string;
  sources: string[];
  frequency: string;
  max_results: number;
  is_active: boolean;
  last_run_at: string | null;
  total_found: number;
  created_at: string;
  updated_at: string;
}
```

- [ ] 4.3 更新 `frontend/src/services/api.ts` — 对齐新端点和参数

  - `paperApi.batchDelete(projectId, paperIds)` — 新增
  - `paperApi.list()` — 新增 `status`, `year`, `q`, `sort_by`, `order` 参数
  - `paperApi.getChunks(projectId, paperId, params)` — 新增 chunk 列表
  - `paperApi.getCitationGraph(projectId, paperId, depth?, maxNodes?)` — 新增
  - `searchApi.execute()` — 使用 `SearchExecuteRequest` body 而非 query params
  - `ocrApi.process()` — 新增 `force_ocr`, `use_gpu` 参数
  - 所有分页接口统一使用 `PaginationParams`

- [ ] 4.4 更新 `frontend/src/services/chat-api.ts` — SSE 错误统一处理

```typescript
// Unified SSE error handling
interface SSEError {
  code: number;
  message: string;
  detail?: string;
}
// Parse SSE error events uniformly
```

- [ ] 4.5 更新 `frontend/src/services/kb-api.ts`

  - `kbApi.autoResolve(projectId, conflictIds)` — 确认 `AutoResolveRequest` schema
  - `kbApi.uploadPdfs()` — 确认响应包含 `UploadResult` (papers, conflicts, total_uploaded)

- [ ] 4.6 更新 `frontend/src/services/subscription-api.ts`

  - `subscriptionApi.list()` — 新增分页参数
  - `subscriptionApi.trigger()` — 新增 `since_days`, `auto_import` 参数
  - 新增 `subscriptionApi.commonFeeds(projectId)` — 获取预置 RSS 列表
  - 新增 `subscriptionApi.checkRss(projectId, feedUrl, sinceDays?)` — 验证 RSS

- [ ] 4.7 新建 `frontend/src/services/pipeline-api.ts`

```typescript
// frontend/src/services/pipeline-api.ts
export const pipelineApi = {
  list: (status?: string) => api.get('/pipelines', { params: { status } }),
  startSearch: (data: SearchPipelineRequest) => api.post('/pipelines/search', data),
  startUpload: (data: UploadPipelineRequest) => api.post('/pipelines/upload', data),
  getStatus: (threadId: string) => api.get(`/pipelines/${threadId}/status`),
  resume: (threadId: string, resolvedConflicts: ResolvedConflict[]) =>
    api.post(`/pipelines/${threadId}/resume`, { resolved_conflicts: resolvedConflicts }),
  cancel: (threadId: string) => api.post(`/pipelines/${threadId}/cancel`),
};
```

- [ ] 4.8 新建 `frontend/src/hooks/use-pipeline-ws.ts`

```typescript
// WebSocket hook for pipeline real-time updates
export function usePipelineWebSocket(threadId: string | null) {
  // Connect to /api/v1/pipelines/{threadId}/ws
  // Return: { status, messages, isConnected, error }
  // Auto-reconnect on disconnect
}
```

- [ ] 4.9 更新 `frontend/src/lib/api.ts` — 修复 Axios 拦截器

```typescript
// GOTCHA (from docs/solutions): interceptor should return full response
// then unwrap in service layer, not in interceptor
apiClient.interceptors.response.use(
  (response) => response,  // Return full response
  (error) => { /* ... */ }
);
```

**Success criteria:** 所有 API 调用与后端新接口一一匹配，TypeScript 类型完全同步

### Research Insights (Phase 4)

**⚠️ PaperStatus 关键类型修正:** 后端 `PaperStatus` 实际值为：`pending`, `metadata_only`, `pdf_downloaded`, `ocr_complete`, `indexed`, `error`。Plan 中的 `new/crawled/ocr_done` 是错误的。

**Keyword synonyms 类型:** 后端 `KeywordRead.synonyms` 是 `string`（逗号分隔），不是 `string[]`。前端需要 `synonyms: string` 加上显示层解析。

**SubscriptionFrequency:** 后端有 `Literal["daily", "weekly", "monthly"]`，前端应定义对应 literal type。

**SSE 事件 Discriminated Unions:**
```typescript
type SSEEvent =
  | { event: 'progress'; data: { stage?: string; percent?: number } }
  | { event: 'complete'; data: { indexed?: number } }
  | { event: 'error'; data: { code?: number; message: string } }
  | { event: string; data: Record<string, unknown> };
```

**Pipeline WebSocket 类型:**
```typescript
type PipelineWSMessage =
  | { type: 'status'; status: string; thread_id?: string; stage?: string; progress?: number }
  | { type: 'error'; message: string };
```

**WebSocket 生命周期（P1 性能）:** unmount 时必须 `ws.close()`、取消重连 timer；`threadId` 变化时先关闭旧连接再开新连接。

**Axios 拦截器:** 保持现有模式（拦截器返回 `response.data`，service 层 `.then(r => r.data)`）。无需修改。

**queryKeys Factory:** 引入 typed query key factory 提升一致性：
```typescript
export const queryKeys = {
  projects: { all: ['projects'] as const, detail: (id: number) => ['project', id] as const },
  papers: (pid: number, filters?: PaperListFilters) => ['papers', pid, filters] as const,
} as const;
```

**Estimated effort:** 中（6-8 小时）

---

#### Phase 5: 自定义组件替换 A2UI + D3 图谱

**Goal:** 移除 A2UI 外部依赖，用自定义组件替代；D3.js 替换 force-graph

**Tasks:**

- [ ] 5.1 新建 `frontend/src/components/playground/CitationCard.tsx`

```typescript
// Replace A2UICitationCard
interface CitationCardProps {
  title: string;
  authors: string[];
  year?: number;
  journal?: string;
  doi?: string;
  abstract?: string;
  relevanceScore?: number;
  onExpand?: () => void;
}
// Purple-themed card with gradient accent, expandable abstract
```

- [ ] 5.2 新建 `frontend/src/components/playground/RewriteDiffViewer.tsx`

```typescript
// Replace A2UIRewriteDiff — wraps react-diff-viewer-continued
interface RewriteDiffViewerProps {
  original: string;
  rewritten: string;
  style?: RewriteStyle;
  splitView?: boolean;
}
// Purple-themed diff highlights
```

- [ ] 5.3 新建 `frontend/src/components/ui/stats-grid.tsx`

```typescript
// Replace A2UIStatsDashboard
interface StatsGridProps {
  stats: StatsCardProps[];
  columns?: 2 | 3 | 4 | 5;
}
// Grid layout of StatsCard components, responsive
```

- [ ] 5.4 重写 `frontend/src/components/citation-graph/D3CitationGraph.tsx`

```typescript
// Replace react-force-graph-2d with D3.js
import * as d3 from 'd3';

interface D3CitationGraphProps {
  data: GraphData;
  onNodeClick?: (node: GraphNode) => void;
  isLoading?: boolean;
}
// d3-force simulation with:
// - Purple color scheme for nodes (center: primary-600, local: primary-400, other: muted)
// - Directional arrows for citations
// - Zoom/pan
// - Node hover tooltips
// - Click to select + detail panel
```

- [ ] 5.5 更新 `frontend/src/components/citation-graph/NodeDetailPanel.tsx` — 匹配新紫色调
- [ ] 5.6 删除 `frontend/src/components/a2ui/` 整个目录
- [ ] 5.7 从 `package.json` 移除依赖:

```
@a2ui-sdk/react
@a2ui-sdk/types
react-force-graph-2d
```

- [ ] 5.8 添加依赖:

```
d3-force ^3.0.0
d3-selection ^3.0.0
d3-drag ^3.0.0
d3-zoom ^3.0.0
d3-scale ^4.0.0
@types/d3-force ^3.0.0
@types/d3-selection ^3.0.0
@types/d3-drag ^3.0.0
@types/d3-zoom ^3.0.0
@types/d3-scale ^4.0.0
@dnd-kit/core (latest)
@dnd-kit/sortable (latest)
@tanstack/react-virtual ^3.0.0
```

- [ ] 5.9 更新 `frontend/vite.config.ts` — 移除 `react-force-graph` chunk，添加 `d3` chunk

```typescript
// GOTCHA (from docs/solutions): Vite 7 uses codeSplitting.groups, not manualChunks
// NOTE: groups need `priority` to control matching order (higher = matched first)
rolldownOptions: {
  output: {
    codeSplitting: {
      groups: [
        { name: 'react-vendor', test: /react|react-dom|react-router/, priority: 20 },
        { name: 'd3', test: /node_modules[\\/]d3/, priority: 24 },
        { name: 'react-pdf', test: /react-pdf|pdfjs-dist/, priority: 25 },
        { name: 'katex', test: /katex/, priority: 23 },
        { name: 'ai-sdk', test: /@ai-sdk|ai/, priority: 22 },
        { name: 'dnd-kit', test: /@dnd-kit/, priority: 21 },
        { name: 'vendor', test: /node_modules/, priority: 10 },
      ],
    },
  },
}
```

**Success criteria:** A2UI 依赖完全移除，D3 图谱渲染正常，package size 减小

### Research Insights (Phase 5)

**D3 集成模式:** 使用 "D3 渲染 + React 容器" 模式。D3 通过 `useRef` + `useEffect` 拥有 SVG，React 不在 tick 时重渲染。通过 callback props 桥接到 React（如 `onNodeClick`）。

**D3 子模块导入（P2 性能）:** 全量 `import * as d3 from 'd3'` 约 250-300KB。选择性导入仅需 50-80KB：
```typescript
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
import { select } from 'd3-selection';
import { drag } from 'd3-drag';
import { zoom } from 'd3-zoom';
```

**SVG 足够:** <500 节点用 SVG（原生事件、无障碍、简单缩放）。无需 Canvas。

**Force 参数（引用图谱）:** charge -300~-500, link distance 60-100, theta 0.7-0.9, alphaMin 0.001。固定中心节点。

**主题集成:** 通过 `getComputedStyle(document.documentElement).getPropertyValue('--primary')` 读取 CSS 变量，实现 light/dark 自动切换。

**D3 清理（P0 性能）:** `useEffect` cleanup 必须调用 `simulation.stop()`、清空 `simulationRef.current`、移除事件监听。否则内存泄漏。

**响应式:** 使用 `ResizeObserver` 监听容器尺寸变化，更新 `forceCenter` 并 `restart()`。

**Bundle 分析:** 移除 A2UI (~50-150KB) + react-force-graph (188KB)，添加 D3 子模块 (~50-80KB) → 净减少 ≥ 10%。

**Estimated effort:** 大（10-14 小时）

---

#### Phase 6: 全面页面替换

**Goal:** 所有页面使用新组件库重写

**Tasks:**

##### P0: 核心布局和聊天

- [ ] 6.1 重写 `frontend/src/App.tsx` — 使用新 AppShell

- [ ] 6.2 重写 `frontend/src/pages/PlaygroundPage.tsx`

  - 空聊天状态：WelcomeScreen (Logo + 欢迎语 + 4 功能卡片)
  - 功能卡片映射：写作助手、研究分析、RAG 问答、Gap 分析
  - 聊天对话状态：新样式消息气泡 + citation cards + thinking chain
  - 输入区域：带 tool mode buttons (搜索、原因、创建图像、附加文件)
  - **Performance**: `React.memo` on message bubbles, `experimental_throttle: 60` on stream

- [ ] 6.3 更新侧边栏聊天历史列表样式

##### P1: 知识库和论文

- [ ] 6.4 重写 `frontend/src/pages/KnowledgeBasesPage.tsx`

  - 项目列表：DataTable with columns (名称, 描述, 论文数, 创建日期)
  - 新建项目对话框
  - 搜索和筛选
  - 导入/导出项目

- [ ] 6.5 重写 `frontend/src/pages/project/PapersPage.tsx`

  - DataTable: title, authors, year, status badge, journal, created_at
  - 批量选择 + 批量删除
  - 状态筛选 (pending, metadata_only, pdf_downloaded, ocr_complete, indexed, error)
  - 排序 (title, year, created_at, citation_count)
  - 上传 PDF 对话框（对齐新 UploadResult 响应）
  - Dedup 冲突面板（对齐新 auto-resolve 端点）

- [ ] 6.6 重写 `frontend/src/pages/project/SettingsPage.tsx` (原 `/settings`)

  - 左侧导航栏（参考 Figma 设置页）：LLM 配置、Embedding 配置、系统信息
  - LLM 面板：provider selector, model, temperature, max_tokens, API key
  - Embedding 面板：model, device
  - 系统面板：health check, GPU status, data directory
  - 连接测试按钮

##### P2: Discovery, Tasks, Writing

- [ ] 6.7 重写 `frontend/src/pages/project/DiscoveryPage.tsx`

  - 三个 Tab：Keywords | Search | Subscriptions
  - Keywords：三级层级表格 + 关键词扩展
  - Search：搜索表单 + 源选择 + 结果列表 + 导入
  - Subscriptions：订阅列表 + CRUD + 触发更新

- [ ] 6.8 重写 `frontend/src/pages/TasksPage.tsx`

  - 视图切换 Tab：列表 | 看板
  - 列表视图：DataTable (任务名, 状态, 项目, 进度, 时间)
  - 看板视图：KanbanBoard (columns: pending, running, completed, failed)
  - 任务详情展开/对话框
  - 项目筛选

- [ ] 6.9 重写 `frontend/src/pages/project/WritingPage.tsx`

  - 工具卡片入口（参考 Figma "我的工具/写作"页面）
  - 四个功能：Summarize, Citations, Review Outline, Gap Analysis
  - 每个功能的结果展示面板
  - SSE streaming for review-draft

##### P3: PDF Reader, History

- [ ] 6.10 重写 `frontend/src/pages/project/PDFReaderPage.tsx`

  - 参考 Semantic Reader / ReadPaper 布局
  - 左侧：PDF 阅读面板（react-pdf + virtual scroll）
  - 右侧：选择问答面板 + 论文信息 + 引用图谱
  - **Performance**: `@tanstack/react-virtual` for large PDFs
  - **GOTCHA**: Copy pdfjs worker to `public/` for production

- [ ] 6.11 重写 `frontend/src/pages/ChatHistoryPage.tsx`

  - 搜索 + 筛选（按知识库）
  - 对话列表卡片（标题, 最后消息预览, 时间, 消息数）
  - 删除确认对话框

##### i18n

- [ ] 6.12 重写 `frontend/src/i18n/locales/en.json` — 完整英文翻译

  - 所有新增组件的文案
  - 功能卡片文案（Writing, Research, Q&A, Analysis）
  - TopBar 欢迎语
  - 新增页面文案

- [ ] 6.13 更新 `frontend/src/i18n/locales/zh.json` — 占位（使用英文 key 作为 fallback）

**Success criteria:** 所有页面视觉一致，紫色调，双层侧边栏，功能正常

### Research Insights (Phase 6)

**SSE 节流:** 保持现有 `experimental_throttle: 80`（已在最佳 50-80ms 范围内），无需改为 60ms。配合 `useDeferredValue(messages)` 减少渲染压力。`MessageBubbleV2` 已有 `React.memo`。

**PDF Worker 生产部署:** 必须将 `pdf.worker.min.mjs` 复制到 `public/`，生产环境使用 `/pdf.worker.min.mjs` 绝对路径。开发环境保持 `import.meta.url` 方式。

**PDF 虚拟滚动:** 大型 PDF 需要 `@tanstack/react-virtual`，避免同时渲染所有页面。

**CitationCardList:** 当 citations > 15 时考虑虚拟化或分页显示，避免流式渲染时的性能问题。

**Estimated effort:** 特大（20-30 小时）

---

## System-Wide Impact

### Interaction Graph

- CSS 变量变更 → 所有使用 `bg-primary`, `text-primary`, `border-ring` 等 semantic token 的组件自动更新
- AppShell 重构 → 所有 `<Outlet />` 路由页面的布局容器变化
- API 类型变更 → 所有 `useQuery`/`useMutation` 调用需验证参数匹配
- A2UI 移除 → Chat 消息渲染中的 `A2UISurface` 需替换为直接组件渲染

### Error Propagation

- API 拦截器修改需确保错误仍正确传播到 toast 和 mutation error handlers
- SSE 错误格式变化需确保 `useChatStream` 和 `streamRewrite` 正确解析
- Pipeline WebSocket 断连需有自动重连和用户提示

### State Lifecycle Risks

- 侧边栏展开状态需持久化到 localStorage，避免页面切换重置
- Chat 对话在布局重构后需确保 message state 不丢失
- DataTable 分页状态需在路由切换时保留（URL query params）

### API Surface Parity

- 所有后端端点都需有对应前端 service 方法
- 新增的 Pipeline WebSocket 需要完整的连接/断开/重连处理
- GPU status endpoint 需在系统信息面板展示

### Integration Test Scenarios

1. 聊天流完整流程：新建对话 → 发送消息 → SSE streaming → citation 渲染 → 思考链展示
2. 论文上传流程：上传 PDF → 冲突检测 → auto-resolve → 更新列表
3. 看板视图：任务列表 → 切换看板 → 状态分组正确 → 回到列表保持筛选
4. 双层侧边栏：展开 → 折叠 → 移动端切换 → 回到桌面端状态保留
5. 设置变更：修改 LLM provider → 测试连接 → 保存 → 聊天使用新 provider

---

## Acceptance Criteria

### Functional Requirements

- [ ] 所有页面使用紫色调设计系统，视觉一致
- [ ] 双层侧边栏正常展开/折叠，状态持久化
- [ ] 聊天欢迎页显示 Logo、问候语、4 功能卡片
- [ ] 任务页支持列表和看板双视图切换
- [ ] 所有 API 调用与后端新接口匹配（无 400/422 错误）
- [ ] Pipeline WebSocket 连接正常，状态实时更新
- [ ] D3.js 引用图谱正常渲染，支持缩放和点击交互
- [ ] 移动端（375px）底部导航、紧凑布局正常
- [ ] Dark mode 正常切换，紫色暗色变量正确

### Non-Functional Requirements

- [ ] 首屏加载 < 3s（与当前持平或更优）
- [ ] SSE 流式渲染无卡顿（throttle 50-80ms）
- [ ] A2UI 依赖完全移除，bundle size 减小
- [ ] TypeScript strict mode 无类型错误

### Quality Gates

- [ ] `npm run build` 零错误零警告
- [ ] `npm run lint` 通过
- [ ] 所有现有测试通过（可能需要更新 mock/fixture）
- [ ] 英文 i18n 覆盖所有 key（无 missing translation 警告）

---

## Dependencies & Risks

| 风险 | 影响 | 缓解策略 |
|------|------|----------|
| 设计系统建设耗时长 | 页面替换延迟 | 阶段 1-2 可并行，尽早产出可用组件 |
| Figma 色值与 OKLCH 转换偏差 | 颜色不一致 | 用浏览器 DevTools 比对，微调 OKLCH 值 |
| D3.js 学习曲线 | 图谱开发耗时 | 参考已有 `docs/plans/2026-03-15-phase4-tech-reference.md` D3 示例 |
| API 变更遗漏 | 运行时错误 | 启动后端 + 前端联调，逐 endpoint 验证 |
| A2UI 隐式依赖 | 移除后功能缺失 | 审查所有 import，确保替代组件覆盖所有功能 |

## Success Metrics

- 视觉一致性：所有页面 100% 使用新设计系统，无灰色调残留
- Bundle size：移除 A2UI + force-graph 后 JS bundle 减小 ≥ 10%
- API 对齐率：100%（所有后端端点有对应前端调用）
- 用户体验：双层侧边栏提升导航效率，看板视图提升任务管理体验

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-19-frontend-redesign-brainstorm.md](docs/brainstorms/2026-03-19-frontend-redesign-brainstorm.md) — Key decisions: 方案 C 设计系统先行, 紫色调, 双层侧边栏, D3 替换 force-graph, A2UI 移除

### Internal References

- Figma page-component mapping: `docs/brainstorms/2026-03-19-frontend-redesign-brainstorm.md` (Figma 设计规范参考 section)
- CSS theme system: `frontend/src/index.css`
- Previous UI overhaul: `docs/plans/2026-03-11-feat-frontend-ui-overhaul-plan.md`
- D3 tech reference: `docs/plans/2026-03-15-phase4-tech-reference.md`
- UI polish patterns: `docs/solutions/ui-bugs/comprehensive-ui-polish.md`
- Performance best practices: `docs/solutions/2026-03-16-frontend-performance-best-practices.md`
- RAG citation performance: `docs/solutions/performance-issues/2026-03-12-rag-rich-citation-performance-analysis.md`
- Backend API review: `docs/brainstorms/2026-03-18-backend-comprehensive-review-brainstorm.md`

### External References

- Figma Design: `https://www.figma.com/design/S0EBb8yirqyBEUUwkVsFOz/omelette-ui`
- shadcn/ui docs: https://ui.shadcn.com/
- D3.js force simulation: https://d3js.org/d3-force
- TailwindCSS v4: https://tailwindcss.com/docs
