---
date: 2026-03-12
topic: codebase-quality-audit
---

# Omelette 前后端代码质量全面审计与改进计划

## 我们要构建什么

对 Omelette 前后端代码进行系统性质量提升，修复安全漏洞、改善错误处理、统一代码风格、建立前端测试体系。目标是将代码库从"功能可用"提升到"生产就绪"。

**核心改进领域：**
1. **安全加固** —— 修复路径遍历、默认密钥、跨项目访问等漏洞，加入简单 API Key 认证
2. **稳定性提升** —— Error Boundary、toast 通知、异常处理规范化、N+1 查询优化
3. **代码质量** —— DRY 原则、类型安全、API 一致性、组件拆分
4. **测试体系** —— 建立 vitest + testing-library 前端测试基础设施，覆盖核心流程

## 为什么选择这个方案

### 考虑过的方案

| 方案 | 描述 | 取舍 |
|------|------|------|
| **A: 分批次系统修复（选中）** | 按严重程度分 4 批次，从严重 → 低逐步推进 | 可控、可追踪进度、每批独立可交付 |
| B: 按功能模块逐个重构 | 先重构 chat 模块，再 KB 模块，再 pipeline | 可能遗漏跨模块问题，安全漏洞修复延迟 |
| C: 只修严重问题，其他留后 | 只处理安全和崩溃级别问题 | 快速但债务积累，长期代价高 |

**选择方案 A 的理由：**
- 安全漏洞需要立即修复，不能等到某个模块"轮到"时才处理
- 分批次可以保证每个批次都有明确的 scope 和验证标准
- 每批独立可交付，降低风险

## 关键决策

### 1. 认证方案：简单 API Key 保护

- **决策**：在后端加入可选的 API Key 认证中间件
- **理由**：项目定位为本地/小团队部署，不需要完整用户系统。一个 API Key 足以防止未授权访问
- **实现**：环境变量 `API_SECRET_KEY`，为空时跳过认证（开发模式兼容）

### 2. 前端测试框架选型

- **决策**：Vitest + @testing-library/react + MSW (Mock Service Worker)
- **理由**：Vitest 与 Vite 生态天然集成，testing-library 鼓励面向行为的测试，MSW 拦截网络请求做集成测试
- **覆盖目标**：核心流程 > 工具函数 > 组件渲染

### 3. Toast/通知系统选型

- **决策**：Sonner（shadcn/ui 推荐的 toast 组件）
- **理由**：与现有 shadcn/ui 生态一致，API 简洁，支持 promise toast

### 4. 异常处理规范

- **决策**：建立统一的异常处理策略
- **理由**：当前 10+ 处 `except Exception` 且行为不一致（有的吞错、有的返回字符串、有的重新抛出）
- **规范**：
  - API 层：捕获特定异常，转为 HTTPException
  - Service 层：让异常传播，不要吞错
  - Pipeline 节点：捕获后设置节点状态为 failed，记录到 state

## 审计发现详情

### 后端问题清单（20 项）

#### 严重（Critical）

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| B1 | 路径遍历漏洞 | `api/v1/dedup.py:100-101, 179-180` | `conflict_id` 含用户输入的文件名，可用 `../../` 逃逸项目目录 |
| B2 | 默认密钥 | `config.py:24` | `app_secret_key` 默认值为明文字符串，生产环境不安全 |
| B3 | Writing API 无项目校验 | `api/v1/writing.py:59-154` | 所有 writing 端点不检查 project 是否存在 |

#### 高（High）

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| B4 | 异常吞错 | `services/rag_service.py:253-286` | `except Exception` 后返回错误字符串给用户，不传播 |
| B5 | N+1 查询（项目列表） | `api/v1/projects.py:29-45` | 每个项目执行 2 次额外查询（paper_count + keyword_count） |
| B6 | N+1 查询（对话列表） | `api/v1/conversations.py:45-71` | 每条对话执行 2 次额外查询 |
| B7 | MCP 资源 ID 未校验 | `mcp_server.py:393, 426, 458` | `int(kb_id)` 对非数字输入抛 ValueError，导致 500 |
| B8 | Paper 跨项目访问 | `api/v1/projects.py:144-151` | `run_paper_pipeline` 不验证 paper 是否属于该项目 |

#### 中（Medium）

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| B9 | `_ensure_project` 复制粘贴 | 9 个 API 模块 | 相同辅助函数重复定义 9 次 |
| B10 | update_project 响应不一致 | `api/v1/projects.py:111-121` | 不返回 paper_count/keyword_count |
| B11 | 根端点格式不一致 | `main.py:61-68` | 返回 dict 而非 ApiResponse |
| B12 | f-string 日志 | `keyword_service.py:72`, `crawler_service.py:39` | 应使用 `%s` 延迟格式化 |
| B13 | Pipeline 静默异常 | `api/v1/pipelines.py:196-197` | `except Exception: pass` |
| B14 | 硬编码数据目录 | `config.py:31` | `/data0/djx/omelette` 用户特定路径 |
| B15 | `Any` 返回类型 | `services/rag_service.py:72` | `_get_vector_store` 返回 `Any` |

#### 低（Low）

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| B16 | 可收窄的异常捕获 | 多处 service/pipeline 节点 | 可用更具体的异常类型 |
| B17 | 缺失类型注解 | `keyword_service.py:119-141` | `list` 应为 `list[str]` |
| B18 | MCP 逻辑 bug | `mcp_server.py:291-292` | `if summary_type == "abstract" or summary_type != "llm"` 始终为真 |
| B19 | Unpaywall 默认邮箱 | `crawler_service.py:74` | 使用 `test@example.com` 作为 fallback |
| B20 | Mypy continue-on-error | `ci.yml` | CI 中 mypy 错误不阻断构建 |

### 前端问题清单（36 项）

#### 严重（Critical）

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| F1 | 无 Error Boundary | `App.tsx` | 任何组件异常会导致整个应用白屏 |
| F2 | Axios 拦截器混淆 | `lib/api.ts:14-15` | 拦截器返回 `response.data`，调用方又用 `res?.data`，导致双层解包 |
| F3 | `response.body!` 非空断言 | `services/api.ts:79` | ReadableStream body 可能为 null |
| F4 | 未使用的 Zustand store | `stores/projectStore.ts` | 从未被导入，应该删除 |

#### 高（High）

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| F5 | Prop drilling `t` | `SubscriptionManager.tsx:354, 361` | 应在子组件内调用 `useTranslation()` |
| F6 | 不安全类型断言 | `PlaygroundPage.tsx:88` | `as unknown as Citation` 双重断言 |
| F7 | API 响应无类型 | `services/api.ts` 全部 | 方法返回 untyped axios 响应 |
| F8 | fetch/axios 混用 | `api.ts:75`, `chat-api.ts:33` | 流式端点用 fetch，其他用 axios，错误处理不一致 |
| F9 | Mutation 无 `onError` | 多个页面 | 操作失败时用户无感知 |
| F10 | 无 toast/通知系统 | 全局 | CRUD 操作无成功/失败反馈 |
| F11 | i18n key 缺失 | `SearchAddDialog.tsx:37-39` | `stepQuery/stepResults/stepSelect` 不存在于 locale 文件 |
| F12 | i18n key 缺失 | `SearchAddDialog.tsx:179, 190` | `keywords` 和 `sources` 不在 locale 中 |
| F13 | `confirm()` 不可访问 | 4 个删除操作 | 应替换为 Radix AlertDialog |

#### 中（Medium）

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| F14 | 大组件 | `SubscriptionManager.tsx` (461行) | 应拆分子组件 |
| F15 | 无 memoization | `PlaygroundPage.tsx:242-257` | MessageBubble 每次流式更新全部重渲染 |
| F16 | 无代码分割 | `App.tsx` | 所有路由组件同步加载 |
| F17 | KB picker 无加载状态 | `PlaygroundPage.tsx:164-188` | 加载时显示"无知识库" |
| F18 | 硬编码中文冒号 | `SettingsPage.tsx:69-70` | `：` 应国际化 |
| F19-21 | 硬编码文本 | `SearchAddDialog`, `KeywordsPage`, `WritingPage` | 数据源名/数据库名/引用格式应国际化 |
| F22-23 | index 做 key | `RAGChatPage.tsx`, `SearchAddDialog.tsx` | 应使用稳定 ID |
| F24 | subscription API 无类型 | `subscription-api.ts` | 返回 untyped |
| F25 | 重复类型断言 | `DedupConflictPanel.tsx:137, 170, 175` | 应扩展类型定义 |

#### 低（Low）

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| F26 | 硬编码状态颜色 | 多处 | 应使用主题 token |
| F27 | 缺失 aria-label | 图标按钮 | 无障碍问题 |
| F28 | KB picker 无 Escape 关闭 | `PlaygroundPage.tsx` | 应使用 Popover 组件 |
| F29 | ChatInput 抢焦点 | `ChatInput.tsx:24-26` | `isLoading` 变化时无条件 focus |
| F30 | 变量遮蔽 `t` | `KeywordsPage.tsx:63` | forEach 参数遮蔽 useTranslation 的 t |
| F31 | 不必要的类型强转 | `SubscriptionManager.tsx:323` | t 函数本身支持 options |
| F32 | 依赖数组问题 | `RAGChatPage.tsx:103` | `indexProgress.active` 在 deps 中不稳定 |
| F33 | 重复 API 调用 | `PdfUploadDialog.tsx:118` | 直接用 `api.post` 而非封装好的 API |
| F34 | 无 barrel exports | `components/knowledge-base/` | 缺少 index.ts |
| F35 | 硬编码 locale | `ChatHistoryPage.tsx:45` | `'zh-CN'` 应随 i18n 语言设置 |
| F36 | 无前端测试 | 全局 | 零测试覆盖 |

## 分批次实施计划

### Batch 1：安全与稳定性（严重级别修复）

**范围**：B1-B3, B7-B8, F1-F4 + 简单 API Key 认证

**后端（7 项）：**
- [ ] 修复路径遍历：验证 `conflict_id` 文件名，禁止 `..` 和路径分隔符
- [ ] 移除默认密钥：生产环境强制要求配置 `APP_SECRET_KEY`
- [ ] Writing API 添加项目存在性校验
- [ ] MCP 资源 ID 输入校验（try/except ValueError）
- [ ] Paper pipeline 添加项目归属校验
- [ ] 修复 MCP `get_paper_summary` 逻辑 bug（B18，虽为低优先级但修复成本极低）
- [ ] 实现简单 API Key 中间件（`API_SECRET_KEY` 环境变量，为空时跳过）

**前端（4 项）：**
- [ ] 添加全局 Error Boundary + 友好的 fallback UI
- [ ] 修复 axios 拦截器返回值，统一 API 响应解包方式
- [ ] `response.body` 添加 null 检查
- [ ] 删除未使用的 Zustand projectStore

**验证标准**：安全漏洞修复有对应测试；Error Boundary 可捕获子组件错误

---

### Batch 2：错误处理与用户体验（高级别修复）

**范围**：B4-B6, F5-F13

**后端（3 项）：**
- [ ] 重构 `rag_service` 异常处理：不吞错，让异常传播到 API 层
- [ ] 优化项目列表 N+1 查询：使用子查询或 CTE 一次查询
- [ ] 优化对话列表 N+1 查询：预加载消息计数和最后一条消息

**前端（10 项）：**
- [ ] 引入 Sonner toast 系统，封装全局通知
- [ ] 所有 mutation 添加 `onError` + toast 错误提示
- [ ] 替换 `confirm()` 为 Radix AlertDialog
- [ ] 修复 SearchAddDialog 缺失的 i18n key
- [ ] 修复 SubscriptionManager prop drilling（子组件自行调用 `useTranslation`）
- [ ] 修复 PlaygroundPage 不安全类型断言（添加 runtime 校验或 type guard）
- [ ] API 服务添加类型化返回值 `Promise<ApiResponse<T>>`
- [ ] **迁移聊天流式到 Vercel AI SDK** —— 引入 `@ai-sdk/react` 的 `useChat`，替换 `chat-api.ts` 自定义 SSE 逻辑
- [ ] 修复 axios 拦截器解包逻辑，统一 API 响应处理
- [ ] KB picker 添加加载状态

**验证标准**：所有 CRUD 操作有 toast 反馈；i18n 双语无缺失 key

---

### Batch 3：代码质量与一致性（中级别修复）

**范围**：B9-B15, F14-F25

**后端（7 项）：**
- [ ] `_ensure_project` 抽取到 `api/deps.py`，作为 `Depends` 注入
- [ ] `update_project` 响应补全 paper_count/keyword_count
- [ ] 根端点改为 ApiResponse 格式
- [ ] 修复 f-string 日志为 `%s` 风格
- [ ] Pipeline 静默异常改为 warning 日志
- [ ] 硬编码数据目录改为环境变量 + 通用默认值
- [ ] `_get_vector_store` 返回具体类型

**前端（12 项）：**
- [ ] SubscriptionManager 拆分子组件（< 200 行/组件）
- [ ] MessageBubble 添加 React.memo
- [ ] App.tsx 路由组件改为 React.lazy + Suspense
- [ ] 列表 key 从 index 改为稳定 ID
- [ ] 硬编码数据源名/数据库名/引用格式国际化
- [ ] 硬编码中文冒号修复
- [ ] subscription-api.ts 添加类型
- [ ] DedupConflictPanel 类型断言改为类型扩展
- [ ] PdfUploadDialog 使用封装好的 kbApi
- [ ] SearchAddDialog 拆分（389 行 → 步骤子组件）
- [ ] SettingsPage 拆分（372 行 → provider 子组件）
- [ ] RAGChatPage startRebuild 依赖数组修复

**验证标准**：无大于 200 行的单文件组件；`rg "except Exception" | wc -l` 减半

---

### Batch 4：测试体系与打磨（低级别 + 测试）

**范围**：B16-B20, F26-F36 + 前端测试基础设施

**前端测试基础设施：**
- [ ] 配置 Vitest + @testing-library/react + MSW
- [ ] 创建测试工具文件（renderWithProviders, mock i18n, mock API）
- [ ] 添加 CI 集成（`npm test` 步骤）

**核心流程测试（优先级排序）：**
- [ ] `streamChat` —— SSE 流式解析逻辑
- [ ] `ChatInput` —— 提交、Enter、禁用状态
- [ ] `MessageBubble` —— 用户/助手消息渲染、引用展示
- [ ] API 客户端 —— 请求/响应/错误处理
- [ ] `PlaygroundPage` —— 消息流转、KB 选择
- [ ] `SubscriptionManager` —— CRUD 和表单状态
- [ ] `DedupConflictPanel` —— 冲突解决流程

**后端改进：**
- [ ] 收窄异常捕获类型（httpx.HTTPError, pdfplumber.PDFSyntaxError 等）
- [ ] 补全缺失类型注解（list → list[str]）
- [ ] Unpaywall 默认邮箱移至配置
- [ ] Mypy 改为阻断 CI（需先修复现有错误）

**前端打磨：**
- [ ] 图标按钮添加 aria-label
- [ ] KB picker 改为 Popover（支持 Escape 关闭）
- [ ] ChatInput focus 逻辑优化（仅在提交后 focus）
- [ ] 修复变量遮蔽和不必要类型强转
- [ ] 添加 barrel exports
- [ ] `formatDate` locale 随 i18n 语言设置
- [ ] 状态颜色改用主题 token

**验证标准**：前端测试覆盖率 > 60%（核心模块）；CI 通过率 100%

## 已解决的问题

1. **Vercel AI SDK 替换自定义 fetch** —— **决定在 Batch 2 中迁移**。引入 `@ai-sdk/react` 的 `useChat`，与错误处理改进一起做。需要调整后端 SSE 格式以兼容 AI SDK 的协议。
2. **API 响应格式** —— **保持 `ApiResponse` 包装**，修复前端 axios 拦截器的解包逻辑，确保调用方一致使用 `res.data` 获取业务数据。
3. **Mypy 严格模式** —— **渐进式推进**，每个 batch 修复涉及文件的 mypy 错误，最终在所有 batch 完成后开启严格模式。

## 下一步

→ 确认方向后，执行 `/ce:plan` 逐批次生成详细实施计划并开始编码
