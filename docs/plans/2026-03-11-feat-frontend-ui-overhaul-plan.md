---
title: "feat: 前端 UI 重构与 shadcn/ui 集成"
type: feat
status: completed
date: 2026-03-11
origin: docs/brainstorms/2026-03-11-ux-architecture-upgrade-brainstorm.md
---

# 前端 UI 重构与 shadcn/ui 集成计划

## 1. Overview

### 为什么重构

Omelette 当前以「项目为中心」的架构将用户引导至项目列表 Dashboard，而科研人员最高频的操作是「问问题」和「找文献」。现有 UI 存在以下问题：

- **入口错位**：首页是项目列表，用户需先选项目再进入 RAG 聊天，路径过长
- **布局陈旧**：顶部 Header + 左侧 Project 侧边栏，与 ChatGPT 等现代 AI 产品体验差距大
- **组件零散**：自定义 Tailwind 组件缺乏统一设计系统，可访问性、暗色模式支持不足
- **聊天体验弱**：RAG 聊天无流式输出、无 Markdown/数学公式渲染、无引用卡片

### 目标效果

- **以聊天为核心**：首页即 Playground 聊天界面，用户进入即可开始对话
- **ChatGPT 风格布局**：左侧窄图标侧边栏 + 中央聊天区 + 顶部模型选择器
- **统一设计系统**：shadcn/ui 组件库 + OKLCH 主题 + 暗色模式
- **富文本 AI 回答**：Markdown、KaTeX 数学公式、代码高亮、内联引用卡片
- **流式体验**：Vercel AI SDK useChat 实现 SSE 流式输出

---

## 2. Design System

### 2.1 shadcn/ui 初始化

```bash
npx shadcn@canary init
```

- 使用 **canary** 版本以支持 Tailwind v4 和 React 19
- 选择 **new-york** 风格（default 已弃用）
- 选择 **OKLCH** 颜色变量（与 Tailwind v4 新主题系统一致）
- 组件路径：`src/components/ui/`
- 工具函数：保留现有 `src/lib/utils.ts` 中的 `cn`，与 shadcn 的 `tailwind-merge` + `clsx` 兼容

### 2.2 主题配置

- **颜色变量**：迁移至 OKLCH 格式，支持 `@theme` 指令
- **暗色模式**：`class` 策略，通过 `html.dark` 切换
- **CSS 变量**：`--background`, `--foreground`, `--primary`, `--muted`, `--card`, `--border`, `--radius-*` 等
- **现有主题保留**：当前 `index.css` 中的语义色（primary, secondary, accent, destructive）需映射到 shadcn 变量

### 2.3 核心组件清单

| 组件 | 用途 |
|------|------|
| Button | 主按钮、次按钮、图标按钮、ghost |
| Input | 文本输入、搜索框 |
| Select | 下拉选择（知识库、模型、工具模式） |
| Dialog | 模态框（新建知识库、确认删除） |
| Sheet | 侧边抽屉（移动端、设置面板） |
| ScrollArea | 消息列表、长列表滚动 |
| Tabs | 知识库详情页、设置页分栏 |
| DropdownMenu | 更多操作、上下文菜单 |
| Card | 知识库卡片、快捷模板卡片 |
| Badge | 状态标签、论文数、索引状态 |
| Tooltip | 图标按钮提示 |
| Separator | 区域分隔 |
| Command (Cmdk) | Cmd+K 快速搜索、命令面板 |

### 2.4 字体选择

- **保留 Inter**：当前 `index.css` 已使用 Inter，与科研工具气质相符
- **备选**：若需更鲜明风格，可考虑 Geist（Vercel 风格）或 Source Sans 3
- **数学公式**：KaTeX 自带字体，无需额外配置

### 2.5 图标库

- **保留 lucide-react**：轻量、一致、Tree-shakeable
- 与 shadcn/ui 组件（如 Button、DropdownMenu）配合使用

---

## 3. Layout Architecture

### 3.1 新布局结构

```
AppShell
├── IconSidebar (左侧，~60px)
│   ├── Logo / 品牌
│   ├── NavItem: 首页 (Playground)
│   ├── NavItem: 知识库
│   ├── NavItem: 对话历史
│   ├── NavItem: 设置
│   └── 底部：主题切换、版本号
└── ContentArea (主内容区)
    └── <Outlet /> (根据路由渲染)
```

### 3.2 IconSidebar 规格

- **宽度**：`w-[60px]` 或 `60px` 固定
- **内容**：仅图标 + Tooltip（hover 显示文字）
- **激活态**：左侧竖条高亮 + 图标颜色变化
- **可折叠**：桌面端可增加折叠为更窄条（仅图标），移动端自动变为底部 tab bar

### 3.3 ContentArea

- **全宽**：`flex-1 min-w-0` 占满剩余空间
- **Playground 页**：聊天区 + 底部输入框，无额外 padding
- **知识库/历史/设置**：`max-w-4xl mx-auto px-6` 或类似约束

### 3.4 响应式策略

| 断点 | 布局 |
|------|------|
| `md` 及以上 | 左侧 IconSidebar 固定 |
| `md` 以下 | IconSidebar 折叠为底部 TabBar（4 个主入口） |
| 底部 TabBar | 首页、知识库、历史、设置，固定 `bottom-0` |

---

## 4. Route Migration

### 4.1 路由映射表

| 旧路由 | 新路由 | 说明 |
|--------|--------|------|
| `/` | `/` | Dashboard → Playground |
| `/projects` (Dashboard) | `/knowledge-bases` | 项目列表 → 知识库列表 |
| `/projects/:projectId` | `/knowledge-bases/:id` | 项目详情 → 知识库详情 |
| `/projects/:projectId/papers` | `/knowledge-bases/:id` (Tabs) | 论文管理并入知识库详情 |
| `/projects/:projectId/keywords` | `/knowledge-bases/:id` (Tabs) | 关键词并入知识库详情 |
| `/projects/:projectId/search` | `/knowledge-bases/:id/add` | 检索添加 → 添加论文页 |
| `/projects/:projectId/rag` | `/` (Playground) | RAG 聊天 → 首页聊天 |
| `/projects/:projectId/writing` | `/` (Playground 工具模式) | 写作助手 → 工具模式 |
| `/projects/:projectId/tasks` | `/knowledge-bases/:id` (Tabs) | 任务并入知识库详情 |
| `/settings` | `/settings` | 保持不变 |

### 4.2 过渡策略

- **Redirect 旧路由**：在路由配置中添加 `<Route path="/projects/:projectId/*" element={<Navigate to="/knowledge-bases/:projectId" replace />} />`
- **Redirect `/projects`**：`/projects` → `/knowledge-bases`
- **兼容期**：保留 redirect 至少一个版本，便于书签和外部链接迁移

---

## 5. Page Designs

### 5.1 Playground（聊天首页）

- **未开始对话**：欢迎语 + 快捷模板卡片（4 个） + 底部输入框
- **对话中**：消息列表（ScrollArea）+ 底部固定输入框
- **输入框**：知识库多选、工具模式选择、附件上传、引用开关、模型选择（或移至设置）
- **消息**：User 左对齐，Assistant 流式 Markdown 渲染，引用 [1][2] 可点击展开卡片
- **顶部**：可选模型选择器、当前知识库标签

### 5.2 知识库列表

- **布局**：卡片网格（Card），每卡片显示名称、论文数、最后更新、标签
- **操作**：新建知识库（Dialog）、搜索/筛选
- **空状态**：引导创建第一个知识库

### 5.3 知识库详情

- **Tabs**：论文 | 关键词 | 订阅 | 任务（或合并为「概览」）
- **论文列表**：表格或卡片，标题、作者、年份、状态、操作
- **索引统计**：已索引/总数、chunk 数量
- **添加论文**：入口按钮 → `/knowledge-bases/:id/add`

### 5.4 添加论文（`/knowledge-bases/:id/add`）

- **双模式**：Tabs 切换「关键词检索」|「PDF 上传」
- **关键词检索**：关键词输入、数据源选择、篇数上限、执行 → 结果预览 → 去重冲突处理
- **PDF 上传**：拖拽区域、多文件、元数据提取预览
- **去重冲突**：左右对比、保留旧/新/合并/跳过、AI 一键解决

### 5.5 对话历史

- **列表**：按时间倒序，每条显示标题、知识库、时间
- **操作**：点击恢复、删除、重命名
- **空状态**：引导去 Playground 开始对话

### 5.6 设置

- **Tabs**：模型配置 | 系统配置
- **模型配置**：当前模型、各厂商 API Key、连接测试、temperature/max_tokens
- **系统配置**：数据路径、代理、默认检索源、检索篇数上限

---

## 6. New Dependencies

```json
{
  "@ai-sdk/react": "^5.0.0",
  "ai": "^5.0.0",
  "react-markdown": "^10.1.0",
  "remark-gfm": "^4.0.0",
  "remark-math": "^6.0.0",
  "rehype-katex": "^7.0.0",
  "rehype-highlight": "^7.0.0",
  "framer-motion": "^11.0.0",
  "katex": "^0.16.0"
}
```

- **@ai-sdk/react + ai**：useChat hook、流式 SSE、多模型
- **react-markdown + remark/rehype**：Markdown 渲染、GFM、数学公式、代码高亮
- **framer-motion**：消息进入/退出、页面切换、侧边栏动画
- **katex**：数学公式渲染（rehype-katex 依赖）

**shadcn/ui**：通过 CLI 按需添加，非 npm 依赖。

---

## 7. Implementation Phases

### Phase 1: shadcn/ui 初始化 + 主题配置 + 暗色模式（约 2-3 天）

- [ ] `npx shadcn@canary init`，选择 new-york、OKLCH
- [ ] 迁移 `index.css` 主题变量至 shadcn 格式
- [ ] 添加暗色模式：ThemeProvider、切换按钮
- [ ] 安装核心组件：Button, Input, Select, Dialog, Card, Badge, Tooltip, Separator, ScrollArea, Tabs

### Phase 2: 新布局组件（约 2 天）

- [ ] 创建 `AppShell`：IconSidebar + ContentArea
- [ ] 创建 `IconSidebar`：导航项、激活态、Tooltip
- [ ] 创建 `BottomTabBar`（移动端）
- [ ] 响应式：`md` 断点切换 sidebar / tab bar

### Phase 3: 路由迁移 + 基础页面骨架（约 2 天）

- [ ] 新路由配置：`/`, `/knowledge-bases`, `/knowledge-bases/:id`, `/knowledge-bases/:id/add`, `/history`, `/settings`
- [ ] 旧路由 redirect
- [ ] 占位页面：Playground、知识库列表、知识库详情、添加论文、历史、设置
- [ ] 更新 Layout 为 AppShell

### Phase 4: Playground 页面（约 3-4 天）

- [ ] 安装 Vercel AI SDK、react-markdown、remark-math、rehype-katex、rehype-highlight
- [ ] 聊天 UI：消息列表、输入框、知识库选择器、工具模式
- [ ] useChat 集成（对接后端 SSE API）
- [ ] Markdown 渲染：表格、代码、数学公式
- [ ] 引用卡片组件
- [ ] 快捷模板卡片
- [ ] 流式输出动画

### Phase 5: 知识库列表 + 详情页（约 2-3 天）

- [ ] 知识库列表：Card 网格、新建 Dialog、搜索
- [ ] 知识库详情：Tabs（论文/关键词/订阅/任务）
- [ ] 论文列表、索引统计
- [ ] 添加论文入口

### Phase 6: 对话历史 + 设置页（约 2 天）

- [ ] 对话历史：列表、恢复、删除、重命名
- [ ] 设置页：模型配置、系统配置 Tabs
- [ ] API Key 输入、连接测试

### Phase 7: 响应式适配 + 动画（约 1-2 天）

- [ ] 移动端 BottomTabBar 完善
- [ ] Framer Motion：消息进入、页面切换、侧边栏
- [ ] 键盘快捷键：Cmd+K 命令面板（可选）

---

## 8. File Structure

```
frontend/src/
├── components/
│   ├── ui/                    # shadcn 组件（按需添加）
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── dialog.tsx
│   │   ├── sheet.tsx
│   │   ├── scroll-area.tsx
│   │   ├── tabs.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── card.tsx
│   │   ├── badge.tsx
│   │   ├── tooltip.tsx
│   │   ├── separator.tsx
│   │   └── command.tsx
│   ├── layout/
│   │   ├── AppShell.tsx       # 主布局
│   │   ├── IconSidebar.tsx    # 左侧窄栏
│   │   └── BottomTabBar.tsx   # 移动端底部栏
│   ├── playground/
│   │   ├── ChatMessage.tsx    # 单条消息
│   │   ├── ChatInput.tsx      # 输入框
│   │   ├── CitationCard.tsx   # 引用卡片
│   │   ├── QuickTemplates.tsx # 快捷模板
│   │   └── MarkdownContent.tsx # Markdown + KaTeX 渲染
│   └── ...
├── pages/
│   ├── Playground.tsx         # 聊天首页
│   ├── KnowledgeBaseList.tsx  # 知识库列表
│   ├── KnowledgeBaseDetail.tsx # 知识库详情
│   ├── AddPapers.tsx          # 添加论文
│   ├── History.tsx            # 对话历史
│   ├── Settings.tsx           # 设置
│   └── ...                    # 旧页面可保留或逐步移除
├── lib/
│   ├── utils.ts
│   └── theme.ts               # 主题切换逻辑
├── hooks/
│   └── useChat.ts             # 封装 useChat（若需）
├── App.tsx
├── main.tsx
└── index.css
```

---

## 9. Acceptance Criteria

### 9.1 设计系统

- [ ] shadcn/ui 成功初始化，Tailwind v4 + React 19 无报错
- [ ] 主题变量（OKLCH）正确应用，亮色/暗色切换正常
- [ ] 核心组件（Button, Input, Select, Dialog, Card 等）可正常使用
- [ ] 字体为 Inter（或指定备选），图标为 lucide-react

### 9.2 布局

- [ ] 桌面端：左侧 60px IconSidebar，主内容区占满
- [ ] 移动端：底部 TabBar，4 个主入口可切换
- [ ] 导航激活态正确高亮
- [ ] Tooltip 在 hover 时显示

### 9.3 路由

- [ ] `/` 渲染 Playground
- [ ] `/knowledge-bases` 渲染知识库列表
- [ ] `/knowledge-bases/:id` 渲染知识库详情
- [ ] `/knowledge-bases/:id/add` 渲染添加论文
- [ ] `/history` 渲染对话历史
- [ ] `/settings` 渲染设置
- [ ] 旧路由 `/projects/*` 正确 redirect 至新路由

### 9.4 Playground

- [ ] 未对话时显示欢迎语 + 快捷模板 + 输入框
- [ ] 对话时显示消息列表，支持流式输出
- [ ] Markdown 渲染正确（标题、列表、表格、代码块）
- [ ] 数学公式（KaTeX）正确渲染
- [ ] 引用 [1][2] 可点击展开引用卡片
- [ ] 知识库选择器、工具模式选择可用
- [ ] 输入框支持多行、提交

### 9.5 知识库

- [ ] 列表页卡片展示，可新建、搜索
- [ ] 详情页 Tabs 切换，论文列表展示
- [ ] 添加论文页支持关键词检索和 PDF 上传两种模式

### 9.6 对话历史与设置

- [ ] 历史列表按时间排序，可恢复、删除
- [ ] 设置页可配置模型、API Key、系统参数

### 9.7 响应式与动画

- [ ] 移动端布局正常，BottomTabBar 可用
- [ ] 消息进入有 Framer Motion 动画
- [ ] 无控制台错误、无布局错位

---

## 10. Accessibility

### 10.1 键盘导航

- [ ] Tab 顺序合理：侧边栏 → 主内容 → 输入框
- [ ] 焦点可见：`:focus-visible` 有清晰轮廓
- [ ] 快捷键（可选）：Cmd+K 打开命令面板、Cmd+N 新建对话、Esc 关闭 Dialog

### 10.2 屏幕阅读器

- [ ] 语义化 HTML：`<nav>`, `<main>`, `<article>`, `<button>`, `<label>`
- [ ] `aria-label`：图标按钮需有描述（如「打开设置」）
- [ ] `aria-current`：当前导航项标记
- [ ] 动态内容：`aria-live` 区域用于流式消息更新

### 10.3 焦点管理

- [ ] Dialog 打开时焦点 trap，关闭时焦点还原
- [ ] 长列表虚拟化时保持焦点正确（若使用）
- [ ] 表单错误时焦点移至第一个错误字段

### 10.4 颜色对比

- [ ] 文本与背景对比度 ≥ 4.5:1（WCAG AA）
- [ ] 暗色模式下对比度同样满足
- [ ] 不依赖纯颜色区分状态（配合图标/文字）

---

## 附录：与头脑风暴的对应关系

本计划聚焦**前端 UI 重构**，以下内容由后续计划覆盖：

- **后端**：Conversation/Message 模型、SSE 聊天 API、LangChain 多模型、LlamaIndex RAG 升级
- **MCP 集成**：FastMCP Server、Claude Desktop 连接
- **去重冲突界面**：关键词检索/PDF 上传流程中的冲突解决 UI 细节
- **WebSocket 实时进度**：检索、下载、OCR 的进度推送

前端计划与后端计划可并行推进，通过 Mock API 或占位接口先行完成 UI 骨架。
