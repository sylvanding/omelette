---
date: 2026-03-12
topic: frontend-ux-robustness
depends_on:
  - 2026-03-11-ux-architecture-upgrade-brainstorm.md
  - 2026-03-12-codebase-quality-audit-brainstorm.md
---

# 前端用户体验与健壮性全面提升

## 我们要构建什么

对 Omelette 前端进行系统性的用户体验优化和健壮性加固，重点是：

1. **健壮性基础设施** —— 统一错误处理、加载状态、toast 通知、类型安全
2. **核心流程加固** —— 聊天、论文添加、知识库管理等关键路径的断点修复和容错
3. **全层级测试体系** —— 单元测试 + 集成测试 + E2E 测试金字塔
4. **用户体验优化** —— 导航简化、交互一致性、空状态引导、操作反馈

## 为什么选择这个方案

### 考虑过的方案

| 方案 | 描述 | 取舍 |
|------|------|------|
| **A: 由内而外加固（选中）** | 先修地基（错误处理、类型、测试），再优化上层交互 | 每步有测试保护，不引入新 bug；用户感知改善较晚 |
| B: 由外而内重构 | 先改 UX 流程让用户感知到改善，再加固底层 | 快速可见的改善，但重构期间缺少测试保护 |
| C: 纵向切片 | 按功能模块（聊天/知识库/设置）逐个做到位 | 每个模块做完即高质量，但全局基础设施推迟 |

**选择方案 A 的理由：**
- 项目定位为个人科研助手，稳定性比外观更重要
- 目前测试几乎为零（仅 3 个测试文件），任何重构都有引入回归的风险
- 先建立测试基础设施，后续所有改进都有安全网
- 允许大胆重构，不需要向后兼容，追求最终效果

## 关键决策

### 1. 优化策略：先健壮后体验

- **决策**：分 3 阶段——基础设施 → 核心流程加固 → UX 提升
- **理由**：健壮性是体验的地基，没有可靠的错误处理和反馈，再好的 UI 也会让用户焦虑

### 2. 测试策略：全层级金字塔

- **决策**：Vitest（单元/集成）+ Playwright（E2E），建立完整测试金字塔
- **理由**：
  - 单元测试：快速覆盖工具函数、hooks、纯组件
  - 集成测试：Testing Library + MSW 测试页面级交互
  - E2E 测试：Playwright 覆盖关键用户旅程（聊天、添加论文、去重）
- **覆盖目标**：核心流程 > 60%，关键组件 > 50%，工具函数 > 70%

### 3. 可以大胆重构

- **决策**：不需要向后兼容，中间状态可以接受
- **影响**：可以做结构性调整（合并页面、重组组件、重写 API 层）

## 现状问题全景图

### 一、交互反馈体系（最基础，影响所有流程）

| # | 问题 | 严重度 | 位置 |
|---|------|--------|------|
| UX-1 | 无全局 toast 系统 | 高 | 全局 —— CRUD 操作无成功/失败反馈 |
| UX-2 | 加载状态不一致 | 高 | 部分用 `t('common.loading')` 文字，部分用 `Loader2` spinner，部分无加载态 |
| UX-3 | 空状态无引导 | 中 | ChatHistory 空列表无 CTA，知识库列表空时无新建引导 |
| UX-4 | Error Boundary 硬编码英文 | 中 | `ErrorBoundary.tsx` fallback 文本未国际化 |
| UX-5 | `confirm()` 原生弹窗 | 中 | 4 个删除操作使用浏览器原生 confirm，不可访问且风格不一致 |
| UX-6 | 设置保存无反馈 | 中 | SettingsPage 保存成功仅图标变化，无 toast |
| UX-7 | 订阅管理缺 onError | 中 | SubscriptionManager 的 create/update/delete mutation 无错误提示 |

### 二、聊天流程（最高频功能）

| # | 问题 | 严重度 | 位置 |
|---|------|--------|------|
| UX-8 | Playground 和 RAG Chat 割裂 | 高 | 两个独立聊天界面，用户困惑该用哪个 |
| UX-9 | 对话历史不可恢复 | 高 | ChatHistoryPage 列表不可点击恢复上下文 |
| UX-10 | SSE 断流无重试 | 高 | `response.body!` 非空断言，流中断直接崩溃 |
| UX-11 | MessageBubble 无 memo | 中 | 每次流式更新所有消息重渲染 |
| UX-12 | KB picker 加载态缺失 | 中 | 知识库列表加载中显示"无知识库" |
| UX-13 | ChatInput 抢焦点 | 低 | `isLoading` 变化时无条件 focus |

### 三、知识库导航（结构性问题）

| # | 问题 | 严重度 | 位置 |
|---|------|--------|------|
| UX-14 | 7 个子页面层级深 | 中 | 论文/关键词/搜索/RAG/写作/任务/订阅，用户容易迷路 |
| UX-15 | Project 404 无明确提示 | 中 | projectId 无效时仅显示文字"not found" |
| UX-16 | RAG MarkdownBlock 简陋 | 低 | 简单 line-split，Playground 用 ReactMarkdown |

### 四、论文添加流程（核心工作流）

| # | 问题 | 严重度 | 位置 |
|---|------|--------|------|
| UX-17 | 添加论文入口分散 | 中 | 搜索添加、PDF 上传、订阅在不同位置 |
| UX-18 | SearchAddDialog i18n 缺失 | 中 | stepQuery/stepResults/stepSelect 等 key 不存在 |
| UX-19 | 去重冲突面板类型不安全 | 中 | 3 处 `as` 类型断言 |
| UX-20 | TasksPage 暗色模式适配 | 低 | 状态颜色硬编码 light-only |

### 五、代码层面问题（影响维护和测试）

| # | 问题 | 严重度 | 位置 |
|---|------|--------|------|
| UX-21 | Axios 拦截器双层解包 | 严重 | `lib/api.ts` 拦截器返回 `response.data`，调用方又取 `.data` |
| UX-22 | API 响应无类型 | 高 | `services/api.ts` 方法返回 untyped |
| UX-23 | fetch/axios 混用 | 高 | 流式端点 fetch，其他 axios，错误处理不一致 |
| UX-24 | 不安全类型断言 | 中 | `as unknown as Citation` 双重断言 |
| UX-25 | 大组件未拆分 | 中 | SubscriptionManager 461行, SearchAddDialog 389行, SettingsPage 372行 |
| UX-26 | 无代码分割 | 中 | App.tsx 所有路由同步加载 |
| UX-27 | index 做 list key | 低 | RAGChatPage, SearchAddDialog |
| UX-28 | 变量遮蔽 | 低 | KeywordsPage 的 `t` 被 forEach 参数遮蔽 |

### 六、测试现状

| 维度 | 现状 |
|------|------|
| 测试文件 | 3 个：`KnowledgeBasesPage.test.tsx`, `ChatInput.test.tsx`, `api.test.ts` |
| 测试框架 | Vitest + jsdom + MSW + Testing Library（已配置） |
| E2E 测试 | 无 |
| 覆盖率 | < 5%，核心流程（聊天、论文添加、去重）零覆盖 |
| CI 集成 | GitHub Actions 中有 `npm test` 步骤 |
| 测试工具 | `renderWithProviders` 已有，MSW handlers 仅覆盖项目列表 |

## 分阶段实施计划

### 阶段 1：健壮性基础设施（地基）

**目标：** 建立统一的错误处理、反馈、类型安全和测试基础设施

**1.1 全局反馈系统**
- 引入 Sonner toast（已在 package.json，需要集成到 App 层）
- 封装 `useToastMutation` hook：自动 onSuccess/onError toast
- 所有现有 mutation 迁移到 toast 反馈

**1.2 统一错误处理**
- Error Boundary i18n 化 + 友好 fallback UI
- 修复 Axios 拦截器双层解包 bug（UX-21）
- API 服务层泛型化：`Promise<ApiResponse<T>>`
- `response.body` null 检查（UX-10）

**1.3 统一加载状态**
- 创建共享 `<LoadingState />` 组件（spinner + 文案）
- 创建 `<EmptyState />` 组件（图标 + 文案 + CTA 按钮）
- 替换所有分散的加载和空状态实现

**1.4 测试基础设施扩展**
- 扩展 MSW handlers 覆盖所有 API 端点
- 添加常用测试 fixtures（project, paper, conversation, settings）
- 配置 Playwright（安装、配置文件、基础 page objects、双模式：CI Mock + 本地真实后端）
- 添加覆盖率报告（vitest coverage）

**1.5 代码分割**
- App.tsx 路由组件 React.lazy + Suspense
- Suspense fallback 使用新的 `<LoadingState />`

**验证标准：**
- 任何 CRUD 操作都有 toast 反馈
- 任何组件异常不会白屏
- API 调用有类型安全的响应
- 测试可以跑通且有覆盖率报告

---

### 阶段 2：核心流程加固 + 测试

**目标：** 聊天和论文添加两大核心流程做到可靠、可测试

**2.1 聊天流程统一**
- 合并 Playground 和 RAG Chat 为统一聊天入口
  - Playground 选择知识库后即为 RAG 模式
  - 不选知识库即为通用问答模式
- 路由设计：`/` 新对话，`/chat/:conversationId` 恢复历史对话
- 迁移到 Vercel AI SDK（`@ai-sdk/react` 的 `useChat`），替换自定义 SSE
- 对话历史可恢复（ChatHistoryPage 列表可点击跳转到 `/chat/:id`）
- MessageBubble 添加 React.memo + 性能优化
- KB picker 加载状态修复
- 流式容错：AI SDK 内置断流重试和错误恢复
- RAG MarkdownBlock 迁移到 ReactMarkdown

**2.2 论文添加流程整合**
- 统一论文添加入口（搜索/上传/订阅合并为一个 Dialog 的三个 Tab）
- SearchAddDialog 拆分为步骤子组件（< 200 行/组件）
- 修复 i18n 缺失 key
- 去重冲突面板类型安全修复

**2.3 核心流程测试**
- 单元测试：
  - `streamChat` SSE 解析逻辑
  - `ChatInput` 提交/禁用/快捷键
  - `MessageBubble` 用户/助手/引用渲染
  - API 客户端请求/响应/错误
- 集成测试：
  - PlaygroundPage 完整消息流转
  - KnowledgeBasesPage CRUD
  - PapersPage 添加论文流程
  - DedupConflictPanel 冲突解决
- E2E 测试：
  - 用户旅程：新建知识库 → 添加论文 → 聊天提问 → 查看引用
  - 用户旅程：恢复历史对话 → 继续提问

**验证标准：**
- 聊天功能有单一入口，不再困惑
- 对话可恢复
- SSE 断流不会崩溃
- 论文添加流程在一个 Dialog 完成
- 核心流程测试覆盖率 > 60%

---

### 阶段 3：UX 体验提升

**目标：** 交互一致性、导航优化、视觉打磨

**3.1 组件风格统一**
- 所有 raw `<input>/<select>` 替换为 shadcn `Input`/`Select`
- `confirm()` 原生弹窗替换为 `ConfirmDialog`（Radix AlertDialog）
- 状态颜色使用主题 token（支持暗色模式）
- 图标按钮添加 aria-label

**3.2 知识库导航简化**
- 将 7 个子页面整合为 3 个：
  - Overview + Papers → 合并为「论文」（概览即论文列表，统计信息作为页头）
  - Keywords + Search → 合并为「发现」（关键词定义 + 搜索执行一气呵成）
  - RAG → 已合并到 Playground（阶段 2 完成）
  - Writing → 保留为「写作」
  - Tasks → 移到全局侧边栏（任务是全局概念，不属于单个知识库）
  - Subscriptions → 整合到「发现」模块内（订阅本质是自动化搜索）
- 最终结构：论文 | 发现 | 写作（3 个页面）

**3.3 空状态与引导**
- ChatHistory 空状态 → CTA 引导去 Playground
- 知识库空列表 → 新建引导
- 论文空列表 → 添加论文引导

**3.4 交互细节打磨**
- ChatInput focus 逻辑优化（仅提交后 focus）
- KB picker 改为 Popover（支持 Escape 关闭）
- SettingsPage 保存成功 toast
- 硬编码文本国际化
- `formatDate` locale 随 i18n

**3.5 大组件拆分**
- SubscriptionManager (461行) → 列表 + 表单 + 详情子组件
- SettingsPage (372行) → Provider 子组件

**3.6 剩余测试补充**
- SubscriptionManager CRUD 测试
- SettingsPage 配置保存/测试连接
- KeywordsPage AI 扩展
- WritingPage 各模式测试
- E2E：设置页配置模型 → 聊天验证

**验证标准：**
- 所有组件使用 shadcn，无 raw HTML 表单元素
- 知识库子页面 = 3 个（论文、发现、写作）
- 每个空状态有 CTA 引导
- 总前端测试覆盖率 > 50%
- 所有 E2E 关键路径通过

## 已解决的问题

1. **对话恢复 URL 设计** —— **两者兼顾**。默认首页 `/` 是新对话，点击历史记录跳转到 `/chat/:conversationId` 恢复上下文。每个对话有独立 URL，支持书签。
2. **Keywords + Search 合并** —— **合并为「发现」模块**。关键词定义和搜索执行在同一页面完成，减少页面切换。用户工作流是：定义关键词 → 生成搜索公式 → 执行搜索 → 导入结果，应一气呵成。
3. **E2E 测试策略** —— **双套方案**。CI 中用 Mock API 保证速度和稳定性；本地开发用真实后端做端到端验证。
4. **Vercel AI SDK 迁移** —— **在阶段 2 同步迁移**。聊天合并时一起引入 `@ai-sdk/react` 的 `useChat`，替换自定义 SSE 逻辑，一次到位。

## 与现有脑暴的关系

- **ux-architecture-upgrade**：本文档聚焦**前端执行层面**，那份聚焦**产品架构和技术选型**。本文档的阶段 2 聊天合并是其 Phase 2 的前端实现。两份文档互补，不冲突。
- **codebase-quality-audit**：本文档**取代**其前端部分（F1-F36 和 Batch 1-4 的前端任务）。所有前端问题已重新编号为 UX-1 至 UX-28 并纳入本文档的 3 阶段计划。该文档的**后端部分**（B1-B20）仍然有效，独立执行。

## 未说明的假设

1. **后端 SSE 协议适配** —— Vercel AI SDK 的 `useChat` 要求后端遵循特定的 SSE 数据格式（AI SDK 协议）。阶段 2 迁移时后端需要同步调整 SSE 端点响应格式。
2. **Playwright 选型** —— E2E 选 Playwright 而非 Cypress，因为 Playwright 更轻量、速度更快、对 CI 更友好，且与 Vite 生态兼容。
3. **个人部署场景** —— 所有优化以单用户本地部署为前提。不考虑并发、CDN、SSR 等多用户场景需求。

## 下一步

→ 确认方向后，执行 `/ce:plan` 生成详细实施计划并开始编码
