---
date: 2026-03-12
topic: chat-message-routing-chain
depends_on:
  - 2026-03-12-frontend-ux-robustness-brainstorm.md
  - 2026-03-11-ux-architecture-upgrade-brainstorm.md
---

# 聊天消息路由链全面重构

## 我们要构建什么

对 Omelette 的聊天消息处理链路进行**全面重构**，覆盖前端协议层、状态管理、后端处理管道三个维度。目标是从当前的"手工 SSE 解析 + 巨型组件状态管理 + 单体流函数"升级为"标准化协议 + 抽象状态层 + 可编排管道"。

核心变化：
1. **协议层**：自定义 SSE 解析 → Vercel AI SDK 5.0 Data Stream Protocol
2. **前端状态**：PlaygroundPage ~15 个 useState → `useChat` + Transport 抽象
3. **后端管道**：`_stream_chat` 单体函数 (230+ 行) → LangGraph StateGraph 可编排节点
4. **可靠性**：无错误处理/无断流重试 → 标准错误 Part + Resumable Streams

## 现状分析：当前消息路由链

### 完整链路图

```
用户输入
  ↓
ChatInput.handleSubmit (trim → onSend → clear)
  ↓
PlaygroundPage.handleSend
  ├─ 创建 user/assistant LocalMessage
  ├─ pendingDeltaRef + assistantIdRef 初始化
  ├─ setMessages([...prev, userMsg, assistantMsg])
  ├─ setIsStreaming(true)
  ├─ AbortController 创建
  ↓
streamChat(fetch POST /api/v1/chat/stream)     ←── chat-api.ts
  ├─ fetch + ReadableStream.getReader()
  ├─ TextDecoder + 手动 buffer split('\n')
  ├─ 解析 `event:` + `data:` + 空行 → yield SSEEvent
  ↓
for await (const event of gen)                  ←── PlaygroundPage.tsx
  ├─ text_delta    → pendingDeltaRef + 80ms debounce flush
  ├─ citation      → isCitation() → normalizeCitation() → append
  ├─ thinking_step → update/append thinkingSteps
  ├─ citation_enhanced → update citations[index].excerpt
  ├─ a2ui_surface  → append to a2uiMessages
  ├─ message_end   → flushDelta + setConversationId + navigate
  └─ error         → ❌ 未处理！
  ↓
finally: cleanup (timer, flush, isStreaming=false)
```

### 后端 `_stream_chat` 链路

```
POST /api/v1/chat/stream
  ↓
_stream_chat(request, db) → AsyncGenerator[str, None]
  ├─ message_start
  ├─ thinking_step(understand, running)
  ├─ _get_rag_service_for_chat() → (rag, llm)
  ├─ thinking_step(understand, done)
  │
  ├─ [if knowledge_base_ids]:
  │   ├─ thinking_step(retrieve, running)
  │   ├─ asyncio.gather(*rag_tasks)  ← RAGService.query()
  │   ├─ thinking_step(retrieve, done)
  │   ├─ thinking_step(rank, running)
  │   ├─ Load papers, build citations → yield citation × N
  │   ├─ thinking_step(rank, done)
  │   ├─ thinking_step(clean, running)
  │   ├─ _clean_excerpt × M (LLM, semaphore, timeout)
  │   ├─ yield citation_enhanced × M
  │   └─ thinking_step(clean, done)
  │
  ├─ Build history_messages from DB
  ├─ Build messages (system + history + user)
  ├─ thinking_step(generate, running)
  ├─ llm.chat_stream() → yield text_delta × K
  ├─ thinking_step(generate, done)
  ├─ Create conversation + messages in DB
  ├─ thinking_step(complete, done)
  └─ message_end
```

### 现存问题

| # | 问题 | 严重度 | 影响 |
|---|------|--------|------|
| R-1 | 手写 SSE 解析器，无标准化 | 高 | 无法利用生态工具、难以测试、易出 bug |
| R-2 | 前端不处理 `error` SSE 事件 | 严重 | 后端发 error 前端静默忽略，用户无感知 |
| R-3 | SSE 断流无重试 | 高 | 网络闪断直接丢失响应 |
| R-4 | `response.body!` 非空断言 | 中 | 已改为 `?.` 但仍无优雅降级 |
| R-5 | PlaygroundPage ~15 个 useState/useRef | 高 | 状态逻辑与 UI 高度耦合，难测试难复用 |
| R-6 | text_delta 80ms 手动防抖 | 中 | 非标准实现，性能特征不可控 |
| R-7 | `_stream_chat` 单体函数 230+ 行 | 高 | 步骤间耦合，难以独立测试/复用/扩展 |
| R-8 | thinking_step 硬编码在流函数中 | 中 | 无法灵活添加/移除/重排步骤 |
| R-9 | citation 处理 (清洗/增强) 内联在流中 | 中 | 清洗超时影响整条流 |
| R-10 | fetch/axios 混用 | 中 | 流用 fetch、其他用 axios，错误处理不一致 |
| R-11 | 消息模型 (LocalMessage) 非标准 | 中 | 自定义接口，与 AI SDK UIMessage 不兼容 |

## 为什么选择这个方案

### 考虑过的方案

| 方案 | 描述 | 取舍 |
|------|------|------|
| **A: Vercel AI SDK 5.0 + LangGraph（选中）** | 前端 useChat + Data Stream Protocol，后端 LangGraph StateGraph 编排 | 最彻底，但改动量大；获得标准化协议+可编排管道+类型安全 |
| B: 自建标准化 SSE + 中间件链 | 保留自定义 SSE 但规范化格式，后端用 Express 风格中间件链 | 轻量灵活，但丢失 AI SDK 生态优势（自动重试、断流恢复、工具调用等） |
| C: 增量修补 | 仅修 error 处理、抽取状态、拆分函数 | 改动最小，但不解决根本架构问题，长期技术债累积 |

**选择方案 A 的理由：**
- Vercel AI SDK 5.0 的 transport 架构天然支持自定义后端（包括 FastAPI Python 后端）
- Data Stream Protocol 的 `data-*` 自定义 Part 可以覆盖所有 Omelette 的自定义事件（citation、thinking、a2ui）
- LangGraph 项目已经引入，且 StateGraph 天然适合"有条件分支+检查点+HITL"的聊天管道
- 一次性解决协议标准化、状态管理、后端可编排三个问题，避免分三次重构

## 关键决策

### 1. 协议层：Vercel AI SDK 5.0 Data Stream Protocol

- **决策**：前端迁移到 `@ai-sdk/react` 的 `useChat` + `DefaultChatTransport`
- **SSE 格式**：后端输出标准 Data Stream Protocol SSE（`data: {"type":"..."}` 格式）
- **自定义事件映射**：

  | 当前事件 | AI SDK 映射 | 说明 |
  |---------|------------|------|
  | `text_delta` | `text-start` + `text-delta` + `text-end` | 标准 text streaming，有 ID 追踪 |
  | `citation` | `data-citation` | 自定义 data Part |
  | `citation_enhanced` | `data-citation-enhanced` | 自定义 data Part |
  | `thinking_step` | `data-thinking` | 自定义 data Part |
  | `a2ui_surface` | `data-a2ui` | 自定义 data Part |
  | `message_start` | `start` (messageId) | 标准 Part |
  | `message_end` | `finish` | 标准 Part |
  | `error` | `error` (errorText) | 标准 Part |

- **理由**：Data Stream Protocol 的 `data-*` 类型是专门为自定义数据设计的扩展点，无需 hack

### 2. 前端状态管理：useChat 替代手动 useState

- **决策**：用 `useChat` hook 管理 messages、status、streaming 状态
- **消息模型**：从 `LocalMessage` 迁移到 `UIMessage` + `parts`
- **自定义数据访问**：通过 `useChat` 的 `onMessage` 或 `parts` 过滤来处理 `data-citation` 等
- **影响**：PlaygroundPage 从 ~15 个 useState 精简到核心交互状态（sidebarCollapsed、toolMode 等）
- **理由**：useChat 内部已处理好 streaming 状态、消息追加、abort、重试等逻辑

### 3. 后端管道：LangGraph StateGraph

- **决策**：将 `_stream_chat` 拆分为 LangGraph 节点
- **节点设计**：

  ```
  [understand] → [retrieve] → [rank] → [clean] → [generate] → [persist] → [complete]
                      ↓ (无 KB)
                  [generate] → [persist] → [complete]
  ```

  | 节点 | 职责 | 输入 | 输出 |
  |------|------|------|------|
  | understand | 解析请求，获取 LLM/RAG 服务 | request | llm, rag, parsed_query |
  | retrieve | RAG 查询多个知识库 | rag, kb_ids, query | raw_results |
  | rank | 构建引用，加载论文元数据 | raw_results | citations |
  | clean | LLM 清洗引用摘要 | citations, llm | enhanced_citations |
  | generate | LLM 流式生成回答 | messages, llm | text_stream |
  | persist | 保存对话和消息到 DB | conversation, messages | conversation_id |
  | complete | 生成结束信号 | all | message_end |

- **SSE 发射**：每个节点通过 `StreamWriter` 发射标准 Data Stream Protocol 事件
- **条件路由**：`retrieve` 节点根据 `knowledge_base_ids` 是否存在决定是否跳过到 `generate`
- **理由**：
  - 每个节点可独立测试
  - 条件路由已内置（无需 if/else 嵌套）
  - 未来可加入 HITL 检查点（如引用确认后再生成）
  - 可复用已有的 LangGraph checkpointing 基础设施

### 4. 可靠性：错误处理（核心）+ 断流恢复（增强）

- **核心（Phase 1 同步完成）**：
  - 错误：标准 `error` Part + 前端 `useChat` 的 `error` 状态自动处理
  - abort：`useChat` 内置 `stop()` 方法
- **增强（后续迭代）**：
  - 前端：AI SDK 5.0 内置 `reconnect` 能力（`prepareReconnectToStreamRequest`）
  - 后端：LangGraph 检查点 → 可从任意节点恢复
- **范围界定**：Resumable Streams 是独立增强特性，不阻塞主体重构。当前先确保错误和中断不会导致 UI 崩溃，断流恢复留待第二迭代。
- **理由**：先解决"断了会崩"（严重），再解决"断了能续"（增强）

### 5. 后端 SSE 输出适配

- **决策**：创建 `StreamWriter` 工具类，封装 Data Stream Protocol 格式输出
- **格式**：`data: {"type":"...", ...}\n\n`（标准 SSE 格式）
- **Header**：`x-vercel-ai-ui-message-stream: v1`
- **终止**：`data: [DONE]\n\n`
- **理由**：一处封装，所有节点统一调用；前端 useChat 自动解析

## 开源项目对比参考

### Vercel AI SDK 5.0 (标准参考)

- **架构**：Provider → Core → Framework 三层
- **协议**：Data Stream Protocol (SSE `data: {"type":"..."}`)
- **状态**：`useChat` hook 管理 messages, status, error
- **Transport**：可替换 `DefaultChatTransport`，支持自定义后端
- **亮点**：`data-*` 自定义 Part、reconnect、abort、tool-call 标准化

### LibreChat (可靠性参考)

- **Resumable Streams**：断线后客户端透明恢复，服务端从当前位置继续
- **部署模式**：单实例用 Node EventEmitter pub/sub，多实例用 Redis Streams
- **文本动画**：动态速度调整（10→16 字符/ms），队列越长越快
- **亮点**：断点续传对学术写作场景（长响应）极其重要

### Open WebUI (管道参考)

- **Pipeline**：Inlet → Process → Outlet 三阶段
- **Filter**：可插拔的 filter 链（监控、修改、阻断、翻译、限流）
- **异步模式**：耗时操作（web search 30-60s+）立即返回 task_id，WebSocket 推送进度
- **亮点**：Pipeline 可扩展性强，适合学术场景（搜索→去重→全文获取→OCR 可能非常耗时）


## 技术可行性验证

### AI SDK 5.0 + FastAPI 后端 ✅

**结论**：可行，但需手动输出 Data Stream Protocol SSE 格式。

**验证来源**：[vercel/ai#7496](https://github.com/vercel/ai/issues/7496) + 社区 working example

**后端输出格式**（已验证可工作）：

```python
import json, uuid

async def event_stream():
    message_id = f"msg_{uuid.uuid4().hex}"
    yield f'data: {json.dumps({"type": "start", "messageId": message_id})}\n\n'

    text_id = f"text_{uuid.uuid4().hex}"
    yield f'data: {json.dumps({"type": "text-start", "id": text_id})}\n\n'
    for chunk in chunks:
        yield f'data: {json.dumps({"type": "text-delta", "id": text_id, "delta": chunk})}\n\n'
    yield f'data: {json.dumps({"type": "text-end", "id": text_id})}\n\n'

    # 自定义 data Part（citation 等）
    yield f'data: {json.dumps({"type": "data-citation", "data": citation_obj})}\n\n'

    yield f'data: {json.dumps({"type": "finish"})}\n\n'
    yield 'data: [DONE]\n\n'
```

**关键要求**：
- Response Header 必须包含 `x-vercel-ai-ui-message-stream: v1`
- 每行格式 `data: {JSON}\n\n`（标准 SSE）
- 流结束 `data: [DONE]\n\n`
- 无官方 Python SDK helper，需自行封装 `StreamWriter` 工具类

**参考实现**：[Pydantic AI 的 Vercel AI SDK 协议实现](https://ai.pydantic.dev/ui/vercel-ai/)

### LangGraph `get_stream_writer()` ✅

**结论**：完美支持从节点内部实时发射自定义事件。

**验证来源**：[LangGraph 官方文档](https://reference.langchain.com/python/langgraph/config/get_stream_writer) + 社区实践

```python
from langgraph.config import get_stream_writer

def retrieve_node(state: ChatState) -> ChatState:
    writer = get_stream_writer()
    writer({"type": "data-thinking", "data": {"step": "retrieve", "status": "running"}})

    results = rag_service.query(state["query"], state["kb_ids"])

    writer({"type": "data-thinking", "data": {"step": "retrieve", "status": "done"}})
    return {**state, "rag_results": results}
```

**关键要求**：
- Python 3.11+（ContextVar 异步传播需要）
- `stream_mode=["updates", "custom"]`
- `get_stream_writer()` 在节点函数体内调用
- 对于 `generate` 节点的 `text_delta` 流式输出，需要在 LLM streaming 循环内调用 `writer()`

**LangGraph custom stream → Data Stream Protocol 桥接**：

```python
async for chunk in graph.astream(input_state, stream_mode=["updates", "custom"]):
    if chunk[0] == "custom":  # custom event from get_stream_writer()
        yield f'data: {json.dumps(chunk[1])}\n\n'
```

### 前端 `data-*` Part 消费方式 ✅

AI SDK 5.0 的 `UIMessage.parts` 数组包含所有 Part（含自定义 `data-*`），前端通过 `parts.filter()` 访问：

```tsx
// 在 MessageBubble 中
{message.parts.map((part, i) => {
  switch (part.type) {
    case 'text':
      return <MarkdownRenderer key={i} content={part.text} />;
    case 'data-citation':
      return <CitationCard key={i} citation={part.data} />;
    case 'data-thinking':
      return <ThinkingChain key={i} step={part.data} />;
  }
})}
```

### Conversation 恢复对接

`useChat` 支持 `initialMessages` 和 `chatId` 参数：

```tsx
const { messages, sendMessage, status } = useChat({
  chatId: conversationId,                    // 对应 /chat/:conversationId
  initialMessages: restoredMessages,         // 从 DB 恢复的历史消息
  transport: new DefaultChatTransport({ api: '/api/v1/chat/stream' }),
});
```

路由恢复时，通过 `conversationApi.get(id)` 加载历史消息并转换为 `UIMessage[]` 格式传入 `initialMessages`。

## 未陈述的假设

1. AI SDK 5.0 已进入 stable（当前最新为 beta，但核心 API 已稳定且有大量生产使用）
2. Python 3.12 满足 LangGraph `get_stream_writer()` 的 ContextVar 要求（需 ≥ 3.11）
3. `data-*` Part 的 `data` 字段可以是任意 JSON 可序列化对象（已由协议规范确认）
4. Resumable Streams 作为**增强特性**在核心重构完成后实施，不阻塞主体工作

## Resolved Questions

1. **AI SDK 5.0 + FastAPI 是否可行？** → ✅ 可行，需手动格式化 SSE，社区有 working example 和 Pydantic AI 参考实现
2. **LangGraph 节点能否实时流式输出 SSE？** → ✅ 可以，`get_stream_writer()` + `stream_mode="custom"`
3. **`data-*` 自定义 Part 前端怎么消费？** → 通过 `message.parts` 数组的 `type` 字段过滤
4. **对话恢复如何对接 useChat？** → `initialMessages` + `chatId` 参数

## 下一步

→ `/ce:plan` 生成详细实施计划，全面重写前后端消息处理链路
