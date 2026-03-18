---
date: 2026-03-19
topic: frontend-redesign
status: approved
tags: [frontend, design, ui, api, figma]
---

# 前端全面重设计 — Brainstorm

## What We're Building

基于 Figma 设计规范（`omelette-ui`），对 Omelette 前端进行全面视觉重设计，同时对齐后端 48 项 API 改进。采用**主题层改造**策略：先改 CSS 变量/主题 + 基础组件，再逐页面适配。

核心变化：
- 从 shadcn neutral 灰色调 → **紫/蓝紫色调**主色系
- 从单层图标侧边栏 → **双层侧边栏**（图标栏 + 可展开文本栏）
- 聊天页增加 **Figma 风格欢迎界面**（Logo + 问候语 + 功能卡片入口）
- 表格增加**看板视图**（列表 + 看板双视图切换）
- 移除 @a2ui-sdk/react 依赖，用**自定义组件替换**
- 前端 API 调用层全面对齐后端新接口（参数格式、响应结构、新增端点）
- **移动端重新设计**，对齐 Figma 移动端规范

## Why This Approach

### 考虑的方案

| 方案 | 描述 | 优缺点 |
|------|------|--------|
| A. 主题层改造 ✅ | 先改主题变量+基础组件，再逐页面适配 | 渐进式、每步可验证、风险低 |
| B. 页面级重写 | 按优先级逐页面完全重写 | 过渡期风格混搭 |
| C. 设计系统先行 | 先建完整组件库再替换 | 前期投入大、见效慢 |

**选择方案 C**：先构建完整设计系统（Design Tokens + 组件库），确保每个组件都完美匹配 Figma 紫色调规范后，再一次性替换所有页面。虽然前期投入大，但最终一致性最高，且组件可复用，长期维护成本低。

## Figma 设计规范参考

**Figma 文件**: `S0EBb8yirqyBEUUwkVsFOz` (omelette-ui)

### 关键页面映射

| Figma 页面 | Node ID | Omelette 页面 |
|-----------|---------|--------------|
| ai-聊天机器人（空状态） | 12327:142158 | PlaygroundPage（空聊天） |
| ai聊天机器人/类型（输入状态） | 12327:146598 | PlaygroundPage（输入中） |
| ai聊天机器人/我的工具 | 12327:151038 | 工具模式选择 |
| ai聊天机器人/我的工具/写作 | 12327:151425 | WritingPage |
| 项目管理/项目 | 12327:116150 | KnowledgeBasesPage |
| 项目管理/任务（列表） | 12327:116272 | TasksPage（列表视图） |
| 项目管理/任务（看板） | 12327:121306 | TasksPage（看板视图） |
| 目标 | 12327:128438 | Papers 列表 / Discovery |
| 活动/屏幕截图 | 12327:114747 | 项目仪表盘（统计概览） |
| 设置/我的个人资料 | 12327:152210 | SettingsPage |

### 设计语言要素

- **主色**: 紫/蓝紫色 (#6C5CE7 风格)，用于按钮、激活态、强调
- **布局**: 双层侧边栏（左侧紧凑图标 + 可展开文本导航）
- **Top Bar**: 欢迎语 + 通知/帮助图标 + 用户信息
- **卡片**: 柔和渐变色背景（粉、黄、蓝、绿）+ 圆角
- **表格**: 带进度条、徽章、分页的数据表格
- **移动端**: 375px 宽，底部导航栏，紧凑卡片布局

## Key Decisions

| 决策 | 选择 | 理由 |
|------|------|------|
| 色彩方案 | 完全采用 Figma 紫色调 | 统一视觉 identity |
| 侧边栏 | 双层：图标栏 + 可展开文本栏 | Figma 规范，提升导航效率 |
| 聊天欢迎页 | Figma 风格（Logo + 问候 + 功能卡片） | 丰富空状态体验 |
| 表格视图 | 列表 + 看板双视图 | 列表满足基本需求，看板提升 Tasks 体验 |
| A2UI SDK | 替换为自定义组件 | 完全控制样式，减少外部依赖 |
| 移动端 | 重新设计 | 对齐 Figma 移动端规范 |
| API 对齐 | 全面适配 48 项后端修复 | 后端已完成，前端需跟进 |
| 实施策略 | 方案 C：设计系统先行 | 一致性最高，组件可复用 |

## 实施层次（方案 C：设计系统先行）

### 阶段 1：Design Tokens + 主题基础

1. **Design Tokens 定义** — 从 Figma 提取完整 tokens：
   - 颜色系统（primary: 紫色梯度、neutral、semantic 颜色）
   - 间距系统（4px 基础网格）
   - 圆角（sm/md/lg/xl）
   - 阴影（sm/md/lg）
   - 排版系统（字体大小、行高、字重）
2. **CSS 变量重定义** — `index.css` 中 light/dark 主题全部改为紫色系
3. **Tailwind 配置更新** — 扩展 theme 匹配 design tokens

### 阶段 2：基础组件库重建

在 `components/ui/` 中重建/升级所有基础组件：

| 组件类别 | 组件列表 | 改造重点 |
|---------|---------|---------|
| 输入 | Button, Input, Textarea, Select, Checkbox, Switch | 紫色主题、新变体 |
| 展示 | Card, Badge, Avatar, Tooltip, Skeleton | 渐变卡片、新徽章色 |
| 反馈 | Dialog, Sheet, AlertDialog, Toast | 紫色调、圆角更新 |
| 导航 | Tabs, DropdownMenu, Popover | 激活态紫色 |
| 数据 | Table, Pagination, DataGrid | 表格行高、斑马纹 |
| 新增 | KanbanBoard, StatsCard, ProgressBar, DualSidebar | 按 Figma 新建 |

### 阶段 3：布局系统重建

1. **DualSidebar** — 双层侧边栏组件（图标栏 + 可展开文本栏）
2. **TopBar** — 欢迎语 + 通知 + 用户头像
3. **AppShell** — 基于新 DualSidebar + TopBar 重构
4. **MobileLayout** — 底部导航 + 紧凑头部
5. **PageLayout** — 统一页面容器（标题 + 操作栏 + 内容区）

### 阶段 4：API 服务层对齐

1. **services/api.ts** — 对齐分页参数标准化（PaginationParams）、Literal 类型
2. **services/chat-api.ts** — SSE 错误格式统一处理
3. **services/kb-api.ts** — 对齐新的 dedup auto-resolve、batch 操作
4. **services/subscription-api.ts** — 对齐 feed 查询新参数
5. **types/** — 更新 TypeScript 类型定义匹配后端 schema 变化
6. **新增 Pipeline WebSocket** — 连接 `/api/v1/pipelines/{thread_id}/ws`

### 阶段 5：自定义组件替换 A2UI

| A2UI 组件 | 替换方案 |
|-----------|----------|
| A2UICitationCard | 自定义 CitationCard（紫色调、卡片样式） |
| A2UIRewriteDiff | 自定义 DiffViewer（保留 react-diff-viewer-continued） |
| A2UIStatsDashboard | 自定义 StatsGrid（参考 Figma 统计卡片） |
| react-force-graph-2d | D3.js 自定义引用图谱 |

### 阶段 6：全面页面替换

一次性替换所有页面，使用新组件库：

| 优先级 | 页面 | 改造内容 |
|--------|------|----------|
| P0 | AppShell（布局） | 使用新 DualSidebar + TopBar |
| P0 | PlaygroundPage（聊天） | 欢迎页、功能卡片、消息气泡样式 |
| P1 | KnowledgeBasesPage | 项目卡片/列表、搜索、CRUD 对话框 |
| P1 | PapersPage | 新 DataGrid、状态 Badge、批量操作 |
| P1 | SettingsPage | 侧边导航 + 多面板（LLM、Embedding、系统） |
| P2 | DiscoveryPage | Keywords/Search/Subscriptions 三面板 |
| P2 | TasksPage | 列表 + KanbanBoard 视图切换 |
| P2 | WritingPage | 工具卡片入口、结果展示 |
| P3 | PDFReaderPage | 全新布局设计（参考 Semantic Reader） |
| P3 | ChatHistoryPage | 历史列表样式统一 |

## 已解决问题

1. ~~范围确认~~ → 全部页面（Chat、Sidebar、KB、Papers、Discovery、Settings、Tasks、Writing、PDF Reader）
2. ~~色彩方案~~ → 完全采用 Figma 紫色调
3. ~~实施策略~~ → 方案 C：设计系统先行（一致性最高）
4. ~~A2UI 处理~~ → 自定义组件替换，移除 @a2ui-sdk/react 依赖
5. ~~移动端~~ → 重新设计，对齐 Figma 移动端规范
6. ~~暗色模式~~ → 保留 dark mode，配合紫色调重新设计暗色变量
7. ~~PDF 阅读器~~ → 重新设计布局（参考主流论文阅读器），无 Figma 参考
8. ~~i18n~~ → 专注英文，中文后续再补
9. ~~引用图谱~~ → 替换为 D3.js 自定义图谱（更灵活控制样式和交互）

## Open Questions

（无——已全部解决）

## 补充决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 暗色模式 | 保留，紫色调重新设计暗色变量 | 用户已习惯 dark mode，紫色暗色版可以很优雅 |
| PDF 阅读器 | 重新设计布局 | 参考主流论文阅读器（Semantic Reader/ReadPaper），提升阅读体验 |
| i18n | 先英文，中文后补 | 集中精力先完成一套完整的设计语言 |
| 引用图谱 | D3.js 替换 force-graph | 完全控制配色和交互，更好融入紫色设计系统 |

## Next Steps

→ `/ce:plan` 制定详细实施计划（分阶段任务、文件变更清单、测试策略）
