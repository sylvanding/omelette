---
title: "feat: 聊天系统、流式输出与引用追踪"
type: feat
status: active
date: 2026-03-11
origin: docs/brainstorms/2026-03-11-ux-architecture-upgrade-brainstorm.md
---

# feat: 聊天系统、流式输出与引用追踪

## 1. Overview

### 1.1 愿景

将 Omelette 的 RAG 能力升级为完整的**以聊天为中心的科研助手**：用户通过自然对话与知识库交互，获得带引用的流式 AI 回答，支持多种工具模式（普通问答、引用查找、文献综述、研究空白分析），对话历史可持久化与恢复。

### 1.2 当前状态

| 维度 | 现状 | 目标 |
|------|------|------|
| **RAG 接口** | `POST /api/v1/projects/{id}/rag/query` 非流式 | SSE 流式 `POST /api/v1/chat/stream` |
| **前端聊天** | RAGChatPage 简单消息列表，无流式 | Vercel AI SDK useChat + 流式渲染 |
| **对话历史** | 无持久化 | Conversation + Message 模型，SQLite 持久化 |
| **引用展示** | 底部 sources 列表 | 内联 [1][2] 标记 + 点击展开 CitationCard |
| **Markdown** | 简单换行渲染 | react-markdown + KaTeX + 代码高亮 |
| **工具模式** | 仅普通问答 | 普通问答 \| 引用查找 \| 文献综述 \| 研究空白分析 |

### 1.3 核心价值

- **流式体验**：token 级实时输出，降低等待感知
- **引用溯源**：内联引用 + 卡片展示论文元数据（标题、作者、年份、DOI）
- **多模式**：按任务类型切换 prompt 与检索策略
- **对话延续**：支持多轮对话、历史恢复、标题自动生成

---

## 2. Technical Approach

### 2.1 后端 Chat API

#### 2.1.1 SSE 流式聊天端点

**路径**：`POST /api/v1/chat/stream`

**Request Body**：
```json
{
  "conversation_id": 123,           // 可选，续写已有对话
  "knowledge_base_ids": [1, 2],     // 必填，项目 ID 列表（即 project_id）
  "model": "qwen-plus",             // 可选，默认从设置读取
  "tool_mode": "qa",                // qa | citation_lookup | review_outline | gap_analysis
  "message": "What is STED microscopy?"
}
```

**Response**：`Content-Type: text/event-stream`，SSE 事件流（见 4. SSE Protocol）

**流程**：
1. 解析请求，校验 knowledge_base_ids 与权限
2. 若有 conversation_id，加载历史消息作为 context
3. 根据 tool_mode 选择 prompt 模板与检索策略
4. RAG 检索（跨多个 project 的 chunks 合并）
5. 组装 system + context + user prompt
6. 流式调用 LLM，逐 token 输出
7. 在合适位置插入 citation 事件（根据 source_nodes 或后处理）
8. 流结束后创建/更新 Message，更新 Conversation.updated_at

#### 2.1.2 对话管理 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/conversations` | 对话列表，分页，按 updated_at 降序 |
| POST | `/api/v1/conversations` | 创建对话，body: `{ title?, knowledge_base_ids?, model?, tool_mode? }` |
| GET | `/api/v1/conversations/{id}` | 获取对话详情（含 messages） |
| PUT | `/api/v1/conversations/{id}` | 更新标题 |
| DELETE | `/api/v1/conversations/{id}` | 删除对话（级联删除 messages） |

**Query 参数**（GET conversations）：
- `page`, `page_size`：分页
- `knowledge_base_id`：按知识库筛选（可选）

### 2.2 数据模型

#### 2.2.1 Conversation

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| title | str | 对话标题，可 AI 生成或用户编辑 |
| knowledge_base_ids | JSON | [1, 2]，关联的项目 ID 列表 |
| model | str | 使用的模型 |
| tool_mode | str | 默认工具模式 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 最后更新时间 |

#### 2.2.2 Message

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| conversation_id | int | 外键 |
| role | str | user \| assistant \| system |
| content | text | 消息正文 |
| citations | JSON | 引用列表，见下 |
| created_at | datetime | 创建时间 |

**citations 结构**：
```json
[
  {
    "index": 1,
    "paper_id": 42,
    "paper_title": "STED microscopy...",
    "authors": "Hell et al.",
    "year": 2006,
    "doi": "10.1038/...",
    "excerpt": "relevant chunk text...",
    "page_number": 3
  }
]
```

### 2.3 前端聊天组件

| 组件 | 职责 |
|------|------|
| **ChatContainer** | 主容器：消息列表 + 输入区，管理 useChat 状态 |
| **MessageList** | 消息滚动列表，自动滚到底部，支持虚拟滚动（可选） |
| **MessageBubble** | 单条消息：用户/AI 样式，Markdown 渲染，引用内联 |
| **CitationCard** | 引用卡片：论文标题、作者、年份、DOI 链接、excerpt |
| **ChatInput** | 输入框：知识库选择器、工具模式、附件上传（预留）、引用开关 |
| **StreamingIndicator** | 流式加载动画（打字机光标或三点动画） |

### 2.4 Vercel AI SDK 集成

- **useChat**：连接 `POST /api/v1/chat/stream`，配置 `streamProtocol: 'data'` 或自定义 transport
- **自定义 transport**：处理非标准事件（如 `citation`），将 citation 数据合并到消息的 `metadata` 或单独 state
- **消息状态**：`ready`（空闲）→ `submitted`（已发送）→ `streaming`（接收中）→ `ready`（完成）或 `error`

**关键点**：
- Vercel AI SDK 默认期望 OpenAI 兼容的流式格式；需在后端输出兼容格式或前端自定义 `fetch` 解析 SSE
- 引用数据可通过 `message.annotations` 或自定义字段传递

### 2.5 工具模式实现

| 模式 | tool_mode | 行为 |
|------|-----------|------|
| **普通问答** | `qa` | RAG 检索 → 组装 prompt → LLM 流式回答，带 [1][2] 引用 |
| **引用查找** | `citation_lookup` | 用户输入文本 → 在知识库中检索匹配片段 → 返回引用列表（不生成长回答） |
| **文献综述** | `review_outline` | RAG 检索 + 结构化 prompt → 生成综述提纲（章节、要点） |
| **研究空白分析** | `gap_analysis` | 复用 writing_service.gap_analysis 逻辑，RAG 增强 → 流式输出 |

**Prompt 差异**：
- `qa`：标准 RAG 回答 + 引用
- `citation_lookup`：简短说明 + 引用列表
- `review_outline`：结构化提纲模板
- `gap_analysis`：研究空白分析模板

### 2.6 Markdown 渲染配置

**依赖**：
- `react-markdown`：核心渲染
- `remark-gfm`：表格、删除线、任务列表
- `remark-math`：数学公式解析
- `rehype-katex`：KaTeX 渲染
- `rehype-highlight`：代码语法高亮

**自定义组件**：
- `a` → `CitationLink`：若 href 为 `#cite-1` 形式，渲染为可点击引用标记，点击展开 CitationCard
- `code` → `CodeBlock`：支持语言标签、高亮
- `pre` → 与 `code` 配合

**引用标记格式**：
- 文本中 `[1]`、`[2]` 等 → 解析为 CitationLink，对应 citations 数组下标

---

## 3. Implementation Phases

### Phase 1: 后端 Chat API（SSE 流式 + 对话 CRUD）

**目标**：可用的流式聊天端点与对话持久化

**任务**：
- [ ] 新增 `Conversation`、`Message` 模型与迁移
- [ ] 实现对话 CRUD API（`/api/v1/conversations`）
- [ ] 实现 `POST /api/v1/chat/stream` SSE 端点
- [ ] 流式处理：RAG 检索 → 组装 prompt → LLM 流式调用（需 LLMClient 支持 stream）
- [ ] 输出 `message_start`、`text_delta`、`message_end` 事件（citation 可 Phase 4 再加）
- [ ] 创建/更新 Message，更新 Conversation
- [ ] 单元测试：mock LLM、RAG，验证 SSE 事件序列

### Phase 2: 前端 ChatContainer + MessageBubble + Markdown 渲染

**目标**：基础聊天 UI，支持 Markdown 渲染

**任务**：
- [ ] 新增 `ChatContainer`、`MessageList`、`MessageBubble` 组件
- [ ] 集成 react-markdown + remark-gfm + remark-math + rehype-katex + rehype-highlight
- [ ] 配置 KaTeX CSS，代码高亮主题
- [ ] 自定义 CodeBlock 组件
- [ ] 消息列表自动滚动到底部
- [ ] 暂时使用非流式 fetch 或 mock 数据验证 UI

### Phase 3: Vercel AI SDK 集成 + 流式 UI

**目标**：真实流式输出，打字机效果

**任务**：
- [ ] 引入 `@ai-sdk/react`、`ai` 包
- [ ] 配置 useChat，连接 `POST /api/v1/chat/stream`
- [ ] 自定义 transport 或 fetch 解析 SSE（若 SDK 不直接支持）
- [ ] 实现 StreamingIndicator 组件
- [ ] 流式消息逐字渲染
- [ ] 错误状态展示（网络失败、超时）

### Phase 4: 引用追踪（CitationCard + 内联引用标记）

**目标**：内联 [1][2] 可点击，展开引用卡片

**任务**：
- [ ] 后端 SSE 增加 `citation` 事件，在流中插入引用数据
- [ ] 前端解析 citation 事件，合并到消息 metadata
- [ ] 实现 CitationCard 组件（论文标题、作者、年份、DOI 链接）
- [ ] 实现 CitationLink 自定义组件，替换 react-markdown 的 `a`
- [ ] 引用标记与 citations 数组映射
- [ ] 点击 [1] 展开/收起对应 CitationCard

### Phase 5: 工具模式切换

**目标**：ChatInput 支持工具模式选择，后端按模式切换行为

**任务**：
- [ ] ChatInput 增加工具模式下拉（普通问答 | 引用查找 | 文献综述 | 研究空白分析）
- [ ] 后端根据 tool_mode 选择不同 prompt 与检索策略
- [ ] `citation_lookup`：返回引用列表为主，简短说明
- [ ] `review_outline`：结构化提纲
- [ ] `gap_analysis`：复用 WritingService，流式输出
- [ ] 各模式端到端测试

### Phase 6: 对话历史页面

**目标**：对话列表页，可恢复历史对话

**任务**：
- [ ] 新增 `/history` 或 `/conversations` 路由
- [ ] 对话列表 UI：标题、知识库、时间、预览
- [ ] 点击进入 ChatContainer，加载该对话的 messages
- [ ] 支持删除、重命名对话
- [ ] 新对话时自动生成标题（首条消息摘要或 AI 生成）

---

## 4. SSE Protocol

### 4.1 事件类型

| 事件 | 说明 | 数据格式 |
|------|------|----------|
| `message_start` | 消息开始 | `{"message_id": "uuid"}` |
| `text_delta` | 文本增量 | `{"delta": "token"}` |
| `citation` | 引用数据 | `{"index": 1, "paper_id": 42, "paper_title": "...", "authors": "...", "year": 2006, "doi": "...", "excerpt": "..."}` |
| `message_end` | 消息结束 | `{"message_id": "uuid", "finish_reason": "stop"}` |
| `error` | 错误 | `{"code": "xxx", "message": "..."}` |

### 4.2 事件格式示例

```
event: message_start
data: {"message_id": "msg-abc123"}

event: text_delta
data: {"delta": "STED"}

event: text_delta
data: {"delta": " microscopy"}

event: text_delta
data: {"delta": " is a technique "}

event: citation
data: {"index": 1, "paper_id": 42, "paper_title": "Breaking the diffraction limit...", "authors": "Hell, S.W., Wichmann, J.", "year": 1994, "doi": "10.1364/OL.19.000780", "excerpt": "We propose a new type of scanning fluorescence microscope..."}

event: text_delta
data: {"delta": "[1]."}

event: message_end
data: {"message_id": "msg-abc123", "finish_reason": "stop"}
```

### 4.3 与 OpenAI 兼容性

若需与 Vercel AI SDK 默认格式兼容，可同时支持：
- **自定义格式**：上述 event 类型，便于前端精确控制
- **OpenAI 兼容**：`data: {"choices":[{"delta":{"content":"x"}}]}` 供 SDK 直接消费

建议：先实现自定义格式，前端自定义 transport 解析；若 SDK 后续支持扩展，再评估切换。

---

## 5. Acceptance Criteria

### 5.1 功能验收

- [ ] **流式聊天**：发送消息后，AI 回答以 token 级流式显示
- [ ] **对话持久化**：新对话自动创建，消息保存到 DB；刷新页面可恢复
- [ ] **对话历史**：可查看对话列表，点击进入恢复上下文
- [ ] **引用展示**：AI 回答中的 [1][2] 可点击，展开 CitationCard 显示论文信息
- [ ] **Markdown**：表格、列表、代码块、数学公式正确渲染
- [ ] **工具模式**：切换模式后，回答风格符合预期（qa 正常回答，citation_lookup 侧重引用列表等）
- [ ] **多知识库**：可选择多个 project，RAG 检索跨库合并

### 5.2 非功能验收

- [ ] **首 token 延迟**：< 3s（含 RAG 检索 + LLM 首 token）
- [ ] **流式流畅度**：无明显卡顿，token 间隔 < 100ms（取决于 LLM API）
- [ ] **错误恢复**：网络中断后，可重试或重新发送
- [ ] **兼容性**：现有 `POST /projects/{id}/rag/query` 保留，不影响既有调用方

### 5.3 兼容性验收

- [ ] 现有 RAGChatPage 可继续使用（或迁移到新 ChatContainer）
- [ ] 新聊天系统与现有 Project/Paper 数据模型兼容

---

## 6. Error Handling

### 6.1 网络中断

- **现象**：SSE 连接断开，流式响应中断
- **处理**：
  - 前端：`useChat` 的 `onError` 捕获，展示「连接中断，请重试」
  - 后端：已输出的部分无法回滚；可考虑在 `message_end` 前中断时，不持久化不完整消息，或标记为 `incomplete`
  - 重试：提供「重试」按钮，重新发送最后一条用户消息

### 6.2 流式错误

- **现象**：LLM API 返回错误、超时、rate limit
- **处理**：
  - 后端：捕获异常，发送 `event: error`，`data: {"code": "llm_error", "message": "..."}`
  - 前端：解析 error 事件，展示错误提示，将消息状态设为 `error`
  - 不持久化失败消息，或持久化为 `content: "[Error: ...]"` 便于用户查看

### 6.3 超时处理

- **现象**：RAG 检索或 LLM 调用超时
- **处理**：
  - 后端：为 RAG 检索设置超时（如 10s），LLM 流式设置 `timeout` 参数
  - 超时后发送 `event: error`，`data: {"code": "timeout", "message": "Request timed out"}`
  - 前端：展示超时提示，建议用户简化问题或稍后重试

### 6.4 知识库无索引

- **现象**：`knowledge_base_ids` 对应项目无 chunk 或未索引
- **处理**：
  - 后端：检索前检查，若无数据则返回友好提示：「所选知识库尚未建立索引，请先完成 OCR 并构建索引」
  - 可通过 `message_start` 后立即发送 `text_delta` 包含该提示，或单独 `error` 事件

### 6.5 对话不存在或无权访问

- **现象**：`conversation_id` 无效或不属于当前用户
- **处理**：
  - 后端：返回 404 或 403
  - 前端：展示「对话不存在」或「无权限」，引导用户新建对话

---

## 7. Dependencies

### 7.1 后端新增

- **sse-starlette** 或 **FastAPI 原生 StreamingResponse**：SSE 输出
- **LLMClient 流式支持**：若当前仅支持非流式 `chat()`，需增加 `chat_stream()` 或等效方法，返回 `AsyncGenerator[str]`

### 7.2 前端新增

```json
{
  "@ai-sdk/react": "^5.0.0",
  "ai": "^5.0.0",
  "react-markdown": "^10.1.0",
  "remark-gfm": "^4.0.0",
  "remark-math": "^6.0.0",
  "rehype-katex": "^7.0.0",
  "rehype-highlight": "^7.0.0",
  "katex": "^0.16.0"
}
```

### 7.3 数据库迁移

- 新增 `conversations`、`messages` 表
- 若使用 Alembic：生成迁移脚本并执行
