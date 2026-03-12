---
title: "feat: Rewrite chat message routing chain"
type: feat
status: active
date: 2026-03-12
origin: docs/brainstorms/2026-03-12-chat-message-routing-chain-brainstorm.md
---

# feat: 聊天消息路由链全面重写

## Enhancement Summary

**Deepened on:** 2026-03-12
**Sections enhanced:** 6 (ChatState, Citation 策略, 前端类型, 错误处理, 性能, 架构)
**Research agents used:** Python Reviewer, TypeScript Reviewer, Performance Oracle, Architecture Strategist, AI SDK Context7 Docs

### Key Improvements

1. **Citation 协调模式改进**：用 AI SDK `id`-based 协调替代分离的 `data-citation-enhanced` 事件——同一 `data-citation` 类型 + 相同 `id` 可直接更新已有 Part，更简洁
2. **ChatState 类型加强**：引入 `CitationDict` 和 `ChatMessageDict` TypedDicts 替代 `dict[str, Any]`
3. **前端防抖**：`useChat` 每 token 触发 re-render，需添加 `useDeferredValue` 或自定义防抖（P0 性能问题）
4. **UIMessage 泛型**：使用 `useChat<OmeletteUIMessage>()` 获得类型安全的自定义 Part 访问

### New Considerations Discovered

- AI SDK 5.0 `data-*` Part 支持 `id` 字段进行 reconciliation（同 id 的新 Part 更新旧 Part）
- AI SDK 5.0 支持 `transient: true` 标记（thinking steps 可设为 transient，不保存到消息历史）
- `useChat` 的 `onData` 回调可处理所有 data Part（含 transient 的）
- LangGraph overhead 极低（~0.5-2ms/token），不需要 checkpointer
- 当前 Paper 查询已经是批量的（不是 N+1），需保持该模式

## Overview

对 Omelette 的聊天消息处理链路进行全面重写：前端从手工 SSE 解析 + 15 个 useState 迁移到 Vercel AI SDK 5.0 `useChat`；后端从 230+ 行的 `_stream_chat` 单体函数迁移到 LangGraph StateGraph 可编排节点管道。同时建立标准化的 Data Stream Protocol 通信协议，统一错误处理和消息模型。

## Problem Statement

当前聊天消息处理链路存在 11 个已识别问题（见 brainstorm R-1 至 R-11），核心矛盾是：
- 前端手写 SSE 解析器无法利用生态工具、不处理 error 事件、断流无重试
- PlaygroundPage ~15 个 useState/useRef 导致状态逻辑与 UI 高度耦合
- 后端 `_stream_chat` 单体函数步骤间耦合，难以独立测试/复用/扩展

## Proposed Solution

三层重构：
1. **协议层**：Vercel AI SDK 5.0 Data Stream Protocol（标准化 SSE 格式）
2. **前端层**：`useChat` hook 替代手动状态管理，`UIMessage` + `parts` 替代 `LocalMessage`
3. **后端层**：LangGraph StateGraph 编排 7 个节点，`get_stream_writer()` 发射标准 SSE 事件

（见 brainstorm: `docs/brainstorms/2026-03-12-chat-message-routing-chain-brainstorm.md`）

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (React)                              │
│                                                                   │
│  useChat({ transport, chatId, initialMessages })                 │
│    ├─ messages: UIMessage[]  (parts: text | data-citation | ...) │
│    ├─ status: 'ready' | 'submitted' | 'streaming' | 'error'     │
│    ├─ sendMessage()                                               │
│    └─ stop()                                                      │
│                                                                   │
│  Components:                                                      │
│    PlaygroundPage → MessageBubble → [TextPart, CitationCard,     │
│                                      ThinkingChain, A2UISurface] │
└────────────────────────┬──────────────────────────────────────────┘
                         │ POST /api/v1/chat/stream
                         │ Header: x-vercel-ai-ui-message-stream: v1
                         │ SSE: data: {"type":"text-delta","id":"...","delta":"..."}\n\n
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    后端 (FastAPI)                                 │
│                                                                   │
│  POST /api/v1/chat/stream                                        │
│    → StreamingResponse(chat_graph_stream(request, db))           │
│                                                                   │
│  LangGraph StateGraph:                                            │
│    [understand] → [retrieve] → [rank] → [clean] → [generate]    │
│                       ↓ (无KB)            → [persist] → [end]    │
│                   [generate] → [persist] → [end]                  │
│                                                                   │
│  每个节点通过 get_stream_writer() 发射 Data Stream Protocol 事件  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Stream Protocol 事件映射

| 阶段 | 事件类型 | Payload | 发射节点 |
|------|---------|---------|---------|
| 开始 | `start` | `{"type":"start","messageId":"msg_xxx"}` | endpoint |
| 思考 | `data-thinking` | `{"type":"data-thinking","data":{"step":"understand","status":"running","detail":"..."}}` | 各节点 |
| 引用 | `data-citation` | `{"type":"data-citation","id":"cit-0","data":{"index":0,"title":"...","excerpt":"原始摘要"}}` | rank |
| 引用更新 | `data-citation` (同 id) | `{"type":"data-citation","id":"cit-0","data":{"index":0,"title":"...","excerpt":"清洗后摘要"}}` | clean |
| 文本开始 | `text-start` | `{"type":"text-start","id":"text_xxx"}` | generate |
| 文本增量 | `text-delta` | `{"type":"text-delta","id":"text_xxx","delta":"..."}` | generate |
| 文本结束 | `text-end` | `{"type":"text-end","id":"text_xxx"}` | generate |
| 会话ID | `data-conversation` | `{"type":"data-conversation","data":{"conversation_id":123}}` | persist |
| 结束 | `finish` | `{"type":"finish"}` | endpoint |
| 终止 | `[DONE]` | `data: [DONE]` | endpoint |
| 错误 | `error` | `{"type":"error","errorText":"..."}` | 任意节点 |

### ChatState 定义

```python
# backend/app/pipelines/chat/state.py
from typing import Any, Literal, TypedDict

class CitationDict(TypedDict, total=False):
    """强类型 citation，与前端 Citation interface 对齐。"""
    index: int
    paper_id: int | None
    paper_title: str
    chunk_type: str
    page_number: int | None
    relevance_score: float
    excerpt: str
    authors: list[str] | None
    year: int | None
    doi: str | None

class ChatMessageDict(TypedDict):
    """LLM 消息格式。"""
    role: Literal["system", "user", "assistant"]
    content: str

class ChatState(TypedDict, total=False):
    """LangGraph chat pipeline state."""

    # --- 输入 (from request) ---
    message: str
    knowledge_base_ids: list[int]
    tool_mode: str
    conversation_id: int | None

    # --- 服务注入 (通过 config["configurable"]，不在 state 中) ---
    # config["configurable"]["db"]:  AsyncSession
    # config["configurable"]["llm"]: LLMClient  (由 understand_node 注入)
    # config["configurable"]["rag"]: RAGService  (由 understand_node 注入)

    # --- 中间结果 ---
    rag_results: list[dict[str, Any]]  # RAG 内部格式，保持松散
    citations: list[CitationDict]
    history_messages: list[ChatMessageDict]
    system_prompt: str
    full_messages: list[ChatMessageDict]

    # --- 输出 ---
    assistant_content: str
    new_conversation_id: int | None
    error: str | None
```

**服务注入约定**（`config["configurable"]` 契约）：

```python
# backend/app/pipelines/chat/config_helpers.py
from langchain_core.runnables import RunnableConfig

def get_chat_db(config: RunnableConfig):
    return config["configurable"]["db"]

def get_chat_llm(config: RunnableConfig):
    return config["configurable"]["llm"]

def get_chat_rag(config: RunnableConfig):
    return config["configurable"]["rag"]
```

- `understand_node` 创建 `llm` 和 `rag` 并注入 `config["configurable"]`
- 后续节点通过 `get_chat_llm(config)` 等辅助函数访问
- `db` 在端点调用时注入，全生命周期有效

### 服务注入模式

LangGraph 节点通过 `config["configurable"]` 访问请求级服务（DB session、LLM、RAG）：

```python
# backend/app/pipelines/chat/nodes.py

from langchain_core.runnables import RunnableConfig

async def understand_node(state: ChatState, config: RunnableConfig) -> dict:
    db = config["configurable"]["db"]
    svc = UserSettingsService(db)
    llm_config = await svc.get_merged_llm_config()
    llm = get_llm_client(config=llm_config)
    embed = get_embedding_model() if llm_config.provider != "mock" else MockEmbedding(embed_dim=128)
    rag = RAGService(llm=llm, embed_model=embed)

    # 注入到 configurable 供后续节点使用
    config["configurable"]["llm"] = llm
    config["configurable"]["rag"] = rag

    writer = get_stream_writer()
    writer({"type": "data-thinking", "data": {"step": "understand", "status": "done", ...}})

    return {"history_messages": [...], "system_prompt": "..."}
```

**调用侧**：

```python
# backend/app/api/v1/chat.py

async def chat_graph_stream(request: ChatStreamRequest, db: AsyncSession):
    graph = get_chat_graph()
    config = {"configurable": {"db": db, "thread_id": str(uuid4())}}
    initial_state = {
        "message": request.message,
        "knowledge_base_ids": request.knowledge_base_ids or [],
        "tool_mode": request.tool_mode or "qa",
        "conversation_id": request.conversation_id,
    }

    yield f'data: {json.dumps({"type": "start", "messageId": f"msg_{uuid4().hex}"})}\n\n'

    async for mode, chunk in graph.astream(initial_state, config=config, stream_mode=["updates", "custom"]):
        if mode == "custom":
            yield f'data: {json.dumps(chunk)}\n\n'

    yield f'data: {json.dumps({"type": "finish"})}\n\n'
    yield 'data: [DONE]\n\n'
```

### 前端 UIMessage Parts 适配

```typescript
// frontend/src/types/chat.ts

// AI SDK 5.0 UIMessage 扩展类型
interface CitationData {
  index: number;
  title: string;
  authors: { name: string }[];
  year?: number;
  doi?: string;
  excerpt: string;
  paper_id?: number;
  source?: string;
  confidence?: number;
}

interface ThinkingData {
  step: string;
  label?: string;
  status: 'running' | 'done' | 'error' | 'skipped';
  detail?: string;
  duration_ms?: number;
  summary?: string;
}

interface ConversationData {
  conversation_id: number;
}

// 从 UIMessage.parts 提取自定义数据
function getCitations(message: UIMessage): CitationData[] {
  return message.parts
    .filter(p => p.type === 'data-citation')
    .map(p => p.data as CitationData);
}

function getThinkingSteps(message: UIMessage): ThinkingData[] {
  return message.parts
    .filter(p => p.type === 'data-thinking')
    .map(p => p.data as ThinkingData);
}
```

### MessageBubble 适配

```tsx
// frontend/src/components/playground/MessageBubble.tsx

function MessageBubble({ message }: { message: UIMessage }) {
  const citations = useMemo(() => getCitations(message), [message.parts]);
  const thinkingSteps = useMemo(() => getThinkingSteps(message), [message.parts]);

  return (
    <div>
      {message.parts.map((part, i) => {
        switch (part.type) {
          case 'text':
            return <MarkdownRenderer key={i} content={part.text} />;
          case 'data-citation':
            return null; // 在 CitationCardList 中统一渲染
          case 'data-thinking':
            return null; // 在 ThinkingChain 中统一渲染
          default:
            return null;
        }
      })}
      {thinkingSteps.length > 0 && <ThinkingChain steps={thinkingSteps} />}
      {citations.length > 0 && <CitationCardList citations={citations} />}
    </div>
  );
}

export default memo(MessageBubble);
```

### Conversation 恢复

```tsx
// frontend/src/pages/PlaygroundPage.tsx

function PlaygroundPage() {
  const { conversationId: routeConvId } = useParams();
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);

  // 从 DB 恢复消息并转换为 UIMessage 格式
  useEffect(() => {
    if (routeConvId) {
      conversationApi.get(Number(routeConvId)).then(conv => {
        setInitialMessages(convertToUIMessages(conv.messages));
      });
    }
  }, [routeConvId]);

  const { messages, sendMessage, status, stop, error } = useChat({
    chatId: routeConvId,
    initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/v1/chat/stream',
      headers: { 'Content-Type': 'application/json' },
    }),
  });

  // 从 streaming message 中提取 conversation_id 用于 URL 更新
  const latestConvId = useMemo(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) return null;
    const convPart = lastAssistant.parts.find(p => p.type === 'data-conversation');
    return convPart?.data?.conversation_id ?? null;
  }, [messages]);
  // ...
}
```

### Implementation Phases

#### Phase 1: 后端 LangGraph Chat Pipeline + Data Stream Protocol

**目标**：创建新的 LangGraph chat graph 和 Data Stream Protocol 端点，与旧端点并行运行

**文件变更**：

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `backend/app/pipelines/chat/__init__.py` | 包初始化 |
| 新建 | `backend/app/pipelines/chat/state.py` | ChatState TypedDict |
| 新建 | `backend/app/pipelines/chat/nodes.py` | 7 个节点函数 |
| 新建 | `backend/app/pipelines/chat/graph.py` | StateGraph 定义 |
| 新建 | `backend/app/pipelines/chat/stream_writer.py` | Data Stream Protocol SSE 格式化工具 |
| 修改 | `backend/app/api/v1/chat.py` | 新增 `/stream/v2` 端点 |
| 新建 | `backend/tests/test_chat_pipeline.py` | 节点单元测试 |

**详细任务**：

**1.1 ChatState 定义** (`backend/app/pipelines/chat/state.py`)

```python
from typing import Any, TypedDict

class ChatState(TypedDict, total=False):
    message: str
    knowledge_base_ids: list[int]
    tool_mode: str
    conversation_id: int | None
    rag_results: list[dict[str, Any]]
    citations: list[dict[str, Any]]
    enhanced_citations: list[dict[str, Any]]
    history_messages: list[dict[str, Any]]
    system_prompt: str
    full_messages: list[dict[str, Any]]
    assistant_content: str
    new_conversation_id: int | None
    error: str | None
```

**1.2 StreamWriter 工具** (`backend/app/pipelines/chat/stream_writer.py`)

```python
import json
import uuid

class DataStreamWriter:
    """Formats events in Vercel AI SDK 5.0 Data Stream Protocol."""

    @staticmethod
    def start(message_id: str | None = None) -> str:
        mid = message_id or f"msg_{uuid.uuid4().hex}"
        return f'data: {json.dumps({"type": "start", "messageId": mid})}\n\n'

    @staticmethod
    def text_start(text_id: str | None = None) -> str:
        tid = text_id or f"text_{uuid.uuid4().hex}"
        return f'data: {json.dumps({"type": "text-start", "id": tid})}\n\n'

    @staticmethod
    def text_delta(text_id: str, delta: str) -> str:
        return f'data: {json.dumps({"type": "text-delta", "id": text_id, "delta": delta})}\n\n'

    @staticmethod
    def text_end(text_id: str) -> str:
        return f'data: {json.dumps({"type": "text-end", "id": text_id})}\n\n'

    @staticmethod
    def data_part(data_type: str, data: dict) -> str:
        return f'data: {json.dumps({"type": data_type, "data": data})}\n\n'

    @staticmethod
    def error(message: str) -> str:
        return f'data: {json.dumps({"type": "error", "errorText": message})}\n\n'

    @staticmethod
    def finish() -> str:
        return f'data: {json.dumps({"type": "finish"})}\n\n'

    @staticmethod
    def done() -> str:
        return 'data: [DONE]\n\n'
```

**1.3 节点实现** (`backend/app/pipelines/chat/nodes.py`)

每个节点遵循已有模式（`backend/app/pipelines/nodes.py`）：接收 state + config，返回 partial state update，通过 `get_stream_writer()` 发射自定义事件。

| 节点 | 职责 | `get_stream_writer()` 事件 |
|------|------|---------------------------|
| `understand_node` | 获取 LLM/RAG 服务，加载历史消息，构建 system prompt | `data-thinking(understand)` |
| `retrieve_node` | `asyncio.gather()` 并行 RAG 查询多个 KB | `data-thinking(retrieve)` |
| `rank_node` | 批量加载 Paper 元数据，构建 citation 列表 | `data-thinking(rank)` + `data-citation(id=cit-N)` × N |
| `clean_node` | LLM 并行清洗 citation excerpts | `data-thinking(clean)` + `data-citation(id=cit-N, 同 id 更新)` × M |
| `generate_node` | LLM 流式生成回答 | `data-thinking(generate)` + `text-start` + `text-delta` × K + `text-end` |
| `persist_node` | 创建/更新 conversation 和 messages | `data-conversation` |

**关键：`generate_node` 的流式输出**

```python
async def generate_node(state: ChatState, config: RunnableConfig) -> dict:
    writer = get_stream_writer()
    llm = config["configurable"]["llm"]

    writer({"type": "data-thinking", "data": {"step": "generate", "status": "running"}})

    text_id = f"text_{uuid.uuid4().hex}"
    writer({"type": "text-start", "id": text_id})

    content = ""
    async for token in llm.chat_stream(state["full_messages"]):
        content += token
        writer({"type": "text-delta", "id": text_id, "delta": token})

    writer({"type": "text-end", "id": text_id})
    writer({"type": "data-thinking", "data": {"step": "generate", "status": "done"}})

    return {"assistant_content": content}
```

**注意**：`generate_node` 发射的 `text-start/delta/end` 不是 `data-*` 类型，是标准 Part，直接作为 `custom` stream 事件输出。

**1.4 Graph 定义** (`backend/app/pipelines/chat/graph.py`)

```python
from langgraph.graph import END, StateGraph

def _route_after_understand(state: ChatState) -> str:
    if state.get("knowledge_base_ids"):
        return "retrieve"
    return "generate"

def build_chat_graph():
    graph = StateGraph(ChatState)

    graph.add_node("understand", understand_node)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("rank", rank_node)
    graph.add_node("clean", clean_node)
    graph.add_node("generate", generate_node)
    graph.add_node("persist", persist_node)

    graph.set_entry_point("understand")
    graph.add_conditional_edges("understand", _route_after_understand, {
        "retrieve": "retrieve",
        "generate": "generate",
    })
    graph.add_edge("retrieve", "rank")
    graph.add_edge("rank", "clean")
    graph.add_edge("clean", "generate")
    graph.add_edge("generate", "persist")
    graph.add_edge("persist", END)

    return graph.compile()
```

**1.5 新端点** (`backend/app/api/v1/chat.py`)

在现有 `/stream` 旁新增 `/stream/v2`：

```python
@router.post("/stream/v2")
async def chat_stream_v2(
    request: ChatStreamRequest,
    db: AsyncSession = Depends(get_db),
):
    return StreamingResponse(
        _stream_chat_v2(request, db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "x-vercel-ai-ui-message-stream": "v1",
        },
    )
```

**1.6 后端测试** (`backend/tests/test_chat_pipeline.py`)

- 每个节点独立测试（mock state + config）
- `understand_node`：验证 LLM/RAG 初始化、history 加载
- `retrieve_node`：验证 RAG 查询、部分失败处理
- `rank_node`：验证批量 Paper 查询、citation 构建
- `clean_node`：验证 LLM 清洗、超时降级
- `generate_node`：验证流式输出事件序列
- `persist_node`：验证 conversation 创建/更新
- 集成测试：验证完整 graph 执行和事件序列

**1.7 端点级错误处理**

```python
async def _stream_chat_v2(request: ChatStreamRequest, db: AsyncSession):
    writer = DataStreamWriter
    yield writer.start()
    try:
        graph = build_chat_graph()
        config = {"configurable": {"db": db, "thread_id": str(uuid4())}}
        initial_state = {...}

        async for mode, chunk in graph.astream(initial_state, config=config, stream_mode=["updates", "custom"]):
            if mode == "custom":
                yield f'data: {json.dumps(chunk)}\n\n'

        yield writer.finish()
    except Exception as e:
        logger.exception("Chat graph error")
        yield writer.error(str(e))
    finally:
        yield writer.done()
```

### Phase 1 Research Insights

**错误处理（Python Reviewer）**：
- 端点级 `try/except` 捕获所有 graph 异常并发射 `error` Part
- 节点内错误通过 `writer({"type": "error", ...})` 发射 + `return {"error": str(e)}`
- `generate_node` 中 LLM 错误可能发生在 partial content 已发射后——保留已发射内容

**性能（Performance Oracle）**：
- LangGraph overhead ~0.5-2ms/token，远低于 LLM 50-200ms 延迟
- **不要使用 checkpointer**——`graph.compile()` 不传 checkpointer，避免序列化开销
- `json.dumps` 每 token ~2-5µs，500 token 总计 < 3ms，可忽略
- 当前 Paper 查询已是批量的（`IN` 查询），`rank_node` 须保持此模式

**测试（Python Reviewer）**：
- `get_stream_writer()` 在 graph 外部调用时为 None——测试需通过可选参数注入或在最小 graph 中运行
- 建议节点签名添加 `_writer` 可选参数用于测试注入

**架构（Architecture Strategist）**：
- LangGraph 是正确选择（与现有 pipeline 一致、支持 HITL、支持 checkpointing）
- 路由函数返回类型用 `Literal["retrieve", "generate"]`
- `DataStreamWriter` 改为模块级函数而非 class + @staticmethod

**RAG 效率（Python Reviewer）**：
- 考虑添加 `RAGService.retrieve_only()` 避免生成未使用的 answer
- 或保持 `query()` 并忽略 answer（更简单但有微小浪费）

**Phase 1 验证标准**：
- [ ] 所有节点有单元测试（mock writer + config）
- [ ] `/stream/v2` 输出标准 Data Stream Protocol SSE
- [ ] 端点级错误处理：graph 异常 → `error` Part
- [ ] 旧 `/stream` 端点仍然工作（无破坏性变更）
- [ ] `ruff lint` 通过
- [ ] 不使用 checkpointer

---

#### Phase 2: 前端 Vercel AI SDK 迁移

**目标**：安装 AI SDK 5.0，创建 `useChat` 集成，替换手动状态管理

**文件变更**：

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `frontend/package.json` | 添加 `ai`, `@ai-sdk/react` |
| 新建 | `frontend/src/hooks/useChatStream.ts` | `useChat` 封装（含自定义 data-* 处理） |
| 新建 | `frontend/src/lib/chat-transport.ts` | 自定义 Transport（请求体格式适配） |
| 修改 | `frontend/src/types/chat.ts` | 新增 UIMessage 辅助类型 + 提取函数 |
| 修改 | `frontend/src/pages/PlaygroundPage.tsx` | 重写为 useChat 驱动 |
| 修改 | `frontend/src/components/playground/MessageBubble.tsx` | 适配 UIMessage parts |
| 修改 | `frontend/src/components/playground/ThinkingChain.tsx` | 适配 ThinkingData |
| 修改 | `frontend/src/components/playground/CitationCard.tsx` | 适配 CitationData |
| 修改 | `frontend/src/components/playground/CitationCardList.tsx` | 适配 CitationData[] |
| 删除 | `frontend/src/services/chat-api.ts` (streamChat 部分) | 不再需要手写 SSE 解析 |
| 修改 | `frontend/src/components/playground/ChatInput.tsx` | 适配 sendMessage API |

**详细任务**：

**2.1 安装依赖**

```bash
cd frontend && npm install ai @ai-sdk/react
```

**2.2 自定义 Transport** (`frontend/src/lib/chat-transport.ts`)

```typescript
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map(p => p.text)
    .join('');
}

export function createChatTransport(options?: {
  knowledgeBaseIds?: number[];
  toolMode?: string;
}) {
  return new DefaultChatTransport({
    api: '/api/v1/chat/stream/v2',
    headers: { 'Content-Type': 'application/json' },
    prepareSendMessagesRequest: ({ messages, id }) => ({
      body: {
        message: getMessageText(messages[messages.length - 1]),
        knowledge_base_ids: options?.knowledgeBaseIds ?? [],
        tool_mode: options?.toolMode ?? 'qa',
        conversation_id: id ? Number(id) : undefined,
      },
    }),
  });
}
```

**关键细节**（TypeScript Reviewer 反馈）：
- `messages[*].content` 在 AI SDK 5.0 已废弃 → 用 `getMessageText()` 从 parts 提取
- `conversation_id` 通过 `id` 参数（即 `chatId`）传递到请求体
- Transport 实例须通过 `useMemo` 稳定引用，数组 deps 需序列化

**2.3 UIMessage 类型定义** (`frontend/src/types/chat.ts`)

```typescript
import type { UIMessage } from 'ai';

// 自定义 data-* Part 的 payload 类型（与后端 CitationDict 对齐）
export interface CitationData {
  index: number;
  paper_id?: number;
  paper_title: string;
  chunk_type?: string;
  page_number?: number;
  relevance_score?: number;
  excerpt: string;
  authors?: string[] | null;
  year?: number | null;
  doi?: string | null;
}

export interface ThinkingData {
  step: string;
  label: string;   // 必须，后端保证发射
  status: 'running' | 'done' | 'error' | 'skipped';
  detail?: string;
  duration_ms?: number;
  summary?: string;
}

export interface ConversationData {
  conversation_id: number;
}

// AI SDK 5.0 泛型：强类型自定义 data parts
export type OmeletteDataParts = {
  citation: CitationData;
  thinking: ThinkingData;
  conversation: ConversationData;
};

export type OmeletteUIMessage = UIMessage<unknown, OmeletteDataParts>;

// Citation 提取辅助（AI SDK id-based reconciliation 自动合并同 id Part）
export function getCitations(message: OmeletteUIMessage): CitationData[] {
  return message.parts
    .filter((p): p is { type: 'data-citation'; id?: string; data: CitationData } =>
      p.type === 'data-citation')
    .map(p => p.data);
}

export function getThinkingSteps(message: OmeletteUIMessage): ThinkingData[] {
  return message.parts
    .filter((p): p is { type: 'data-thinking'; data: ThinkingData } =>
      p.type === 'data-thinking')
    .map(p => p.data);
}
```

**2.4 useChatStream Hook** (`frontend/src/hooks/useChatStream.ts`)

```typescript
import { useChat } from '@ai-sdk/react';
import { useDeferredValue, useMemo } from 'react';
import { createChatTransport } from '@/lib/chat-transport';
import type {
  CitationData, ThinkingData, OmeletteUIMessage,
  getCitations, getThinkingSteps,
} from '@/types/chat';

export function useChatStream(options: {
  chatId?: string;
  initialMessages?: OmeletteUIMessage[];
  knowledgeBaseIds?: number[];
  toolMode?: string;
}) {
  // 稳定化 array deps（TypeScript Reviewer 反馈）
  const kbIdsKey = useMemo(
    () => JSON.stringify(options.knowledgeBaseIds ?? []),
    [options.knowledgeBaseIds],
  );

  const transport = useMemo(
    () => createChatTransport({
      knowledgeBaseIds: options.knowledgeBaseIds,
      toolMode: options.toolMode,
    }),
    [kbIdsKey, options.toolMode],
  );

  const chat = useChat<OmeletteUIMessage>({
    id: options.chatId,  // AI SDK 5.0 用 `id` 而非 `chatId`
    initialMessages: options.initialMessages,
    transport,
    onData: (dataPart) => {
      // 处理 transient parts（如通知）
      if (dataPart.type === 'data-thinking' && dataPart.data.status === 'running') {
        // thinking steps 可选择为 transient（不保存到消息历史）
      }
    },
  });

  // 防抖流式内容（Performance Oracle P0 建议）
  const deferredMessages = useDeferredValue(chat.messages);

  const lastAssistant = useMemo(() => {
    return [...deferredMessages].reverse().find(m => m.role === 'assistant');
  }, [deferredMessages]);

  const citations = useMemo<CitationData[]>(
    () => lastAssistant ? getCitations(lastAssistant) : [],
    [lastAssistant],
  );

  const thinkingSteps = useMemo<ThinkingData[]>(
    () => lastAssistant ? getThinkingSteps(lastAssistant) : [],
    [lastAssistant],
  );

  const conversationId = useMemo<number | null>(() => {
    if (!lastAssistant) return null;
    const part = lastAssistant.parts.find(p => p.type === 'data-conversation');
    return part ? (part.data as { conversation_id: number }).conversation_id : null;
  }, [lastAssistant]);

  return {
    ...chat,
    messages: deferredMessages,
    citations,
    thinkingSteps,
    conversationId,
  };
}
```

**关键改进（Research Insights）**：
- `useChat<OmeletteUIMessage>()` 泛型获得强类型 `data-*` Part 访问
- `useDeferredValue(chat.messages)` 防止每 token re-render（Performance Oracle P0）
- `kbIdsKey = JSON.stringify(...)` 稳定化数组 deps（TypeScript Reviewer）
- `id` 替代 `chatId`（AI SDK 5.0 API 修正）
- `onData` 回调处理 transient parts
- Citation 用 type guard `(p): p is {...}` 替代 `as` 类型断言

**2.4 PlaygroundPage 重写**

核心变化：
- 移除 `messages` useState → `useChatStream.messages`
- 移除 `isStreaming` useState → `status === 'streaming'`
- 移除 `pendingDeltaRef`、`flushTimerRef`、`assistantIdRef` → AI SDK 内部管理
- 移除 `abortRef` → `stop()`
- 移除整个 `for await (event of gen)` 循环 → AI SDK 自动处理
- 保留 `sidebarCollapsed`、`toolMode`、`selectedKBs` 等 UI 状态

**2.5 MessageBubble 适配**

- `content` prop → 从 `message.parts` 中提取 text parts
- `citations` prop → `getCitations(message)`
- `thinkingSteps` prop → `getThinkingSteps(message)`
- `isStreaming` → 通过 `status` 判断
- 保持 `memo()` 优化

**2.6 Conversation 恢复**

```typescript
// 从后端 ChatMessage 转换为 UIMessage
function convertToUIMessages(messages: ChatMessage[]): UIMessage[] {
  return messages.map(msg => ({
    id: String(msg.id),
    role: msg.role as 'user' | 'assistant',
    parts: [{ type: 'text' as const, text: msg.content }],
    // 恢复的消息不包含 citation/thinking parts（已完成的对话）
  }));
}
```

**2.7 删除旧代码**

- `chat-api.ts` 中的 `streamChat` 函数和 `SSEEvent` 类型
- `PlaygroundPage.tsx` 中的手动 SSE 处理逻辑
- `LocalMessage` interface

### Phase 2 Research Insights

**类型安全（TypeScript Reviewer）**：
- `CitationData` 字段须与后端 `CitationDict` 对齐（`paper_title` 而非 `title`）
- 用 type guards 替代 `as CitationData` 类型断言
- `convertToUIMessages` 须映射恢复消息的 citations 到 `data-citation` parts

**性能（Performance Oracle P0）**：
- `useChat` 每 token 触发 re-render → 用 `useDeferredValue(chat.messages)` 防抖
- `memo(MessageBubble)` 必须保留
- `getCitations()` / `getThinkingSteps()` 放在 `useMemo` 中，依赖 `lastAssistant`

**A2UISurface 迁移**：
- `LocalMessage.a2uiMessages` → `data-a2ui` Part（与 citation 同模式）
- 如果 A2UISurface 暂时不迁移，保留为独立 prop 从消息中提取

**错误/加载状态**：
- `status === 'submitted'`：已发送，等待首 token
- `status === 'streaming'`：流式中
- `status === 'error'`：错误（`chat.error` 有详细信息）
- `chat.stop()`：中止
- ChatInput disabled when `status !== 'ready'`

**Phase 2 验证标准**：
- [ ] `useChat` 正常发送消息并接收流式响应
- [ ] citations（含 id reconciliation 更新）正确渲染
- [ ] thinking steps 正确渲染
- [ ] 对话恢复（`/chat/:id`）正常工作（`initialMessages` + `id`）
- [ ] abort（`stop()`）正常工作
- [ ] error 状态显示 toast 或内联错误
- [ ] 流式文本无明显卡顿（`useDeferredValue` 生效）
- [ ] ESLint 无新增错误
- [ ] TypeScript 编译通过

---

#### Phase 3: 清理与测试

**目标**：删除旧端点、补充测试、处理边缘情况

**文件变更**：

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `backend/app/api/v1/chat.py` | `/stream/v2` → `/stream`（替换旧端点） |
| 修改 | `frontend/src/lib/chat-transport.ts` | URL 从 `/stream/v2` → `/stream` |
| 删除 | `backend/app/api/v1/chat.py` 旧代码 | 移除 `_stream_chat`、`_thinking`、`_clean_excerpt` |
| 修改 | `backend/tests/test_chat.py` | 更新为 Data Stream Protocol 格式断言 |
| 新建 | `frontend/src/hooks/__tests__/useChatStream.test.ts` | Hook 测试 |
| 新建 | `frontend/src/lib/__tests__/chat-transport.test.ts` | Transport 测试 |

**详细任务**：

**3.1 端点切换**

- `/stream/v2` 重命名为 `/stream`
- 删除旧的 `_stream_chat` 函数和所有相关 helper
- 更新前端 Transport URL

**3.2 边缘情况处理**

| 场景 | 处理 |
|------|------|
| RAG 部分失败（某个 KB 查询失败） | `retrieve_node` 中 `asyncio.gather(return_exceptions=True)` + 过滤异常 |
| LLM 清洗超时 | `clean_node` 中 `asyncio.wait_for(timeout=10)` + 降级为原始 excerpt |
| DB 持久化失败 | `persist_node` catch → 发射 `data-thinking(persist, error)` + 继续完成流 |
| 用户 abort 中途 | `useChat.stop()` → 前端断开连接 → FastAPI `ClientDisconnect` |
| 无效 knowledge_base_ids | `retrieve_node` 跳过无效 ID + 发射 warning |
| conversation_id 不存在 | `persist_node` 创建新对话而非更新 |

**3.3 测试补充**

- 后端节点单元测试（Phase 1 已覆盖）
- 后端集成测试（完整 graph 执行 + SSE 事件验证）
- 前端 `useChatStream` hook 测试（MSW mock `/stream` 端点）
- 前端 `convertToUIMessages` 单元测试
- 手动 E2E 验证（浏览器工具）

**3.4 Rewrite API 评估**

`backend/app/api/v1/rewrite.py` 也使用自定义 SSE 格式（`rewrite_delta`, `rewrite_end`）。本次不迁移——范围限定在 chat 端点。后续可复用 `DataStreamWriter` 统一所有 SSE 端点。

**Phase 3 验证标准**：
- [ ] 旧端点已删除，所有流量走新管道
- [ ] 所有后端测试通过（`pytest`）
- [ ] 所有前端测试通过（`vitest`）
- [ ] 边缘情况有处理（部分失败、超时、abort）
- [ ] `ruff lint` + `eslint` 通过

## System-Wide Impact

### Interaction Graph

```
用户点击发送
  → useChat.sendMessage()
    → DefaultChatTransport.fetch(POST /api/v1/chat/stream)
      → FastAPI chat_stream_v2()
        → StreamingResponse(chat_graph_stream())
          → LangGraph graph.astream(stream_mode=["updates","custom"])
            → understand_node → retrieve_node → ... → persist_node
              → get_stream_writer() → custom event → SSE data line
          → yield SSE line
        → Response body
      → useChat internal SSE parser
    → UIMessage.parts update
  → React re-render
    → MessageBubble → ThinkingChain, CitationCardList, MarkdownRenderer
```

### Error & Failure Propagation

| 错误源 | 传播路径 | 处理 |
|--------|---------|------|
| LLM API 错误 | node → exception → graph → `_stream_chat_v2` catch → `error` Part | `useChat.error` 状态 |
| RAG 查询失败 | `retrieve_node` → `return_exceptions=True` → 过滤 | 跳过失败 KB，继续 |
| DB 错误 | `persist_node` → catch → `data-thinking(persist, error)` | 回答仍然显示，URL 不更新 |
| 网络断开 | fetch abort → `useChat` 检测 → `error` 状态 | 显示错误 toast |
| 用户 abort | `stop()` → abort signal → FastAPI `ClientDisconnect` | 清理状态 |

### State Lifecycle Risks

| 风险 | 缓解 |
|------|------|
| Graph 执行中 DB session 关闭 | 在 `chat_graph_stream` generator 中保持 `db` scope |
| 部分 citation 发射后 LLM 失败 | 前端已收到的 citation 保留显示，error 消息追加 |
| persist 失败导致对话丢失 | catch 异常 + log + 不影响已发射的回答内容 |

### API Surface Parity

| 接口 | 变更 |
|------|------|
| `POST /api/v1/chat/stream` | 输出格式从 `event:X\ndata:{}\n\n` → `data:{"type":"..."}\n\n` |
| `POST /api/v1/chat/rewrite` | **不变**（本次不迁移） |
| `GET /api/v1/rag/{id}/stream` | **不变**（本次不迁移） |
| `conversationApi.*` | **不变**（REST CRUD 不受影响） |

### Integration Test Scenarios

1. **完整 RAG 聊天流**：发送带 KB 的消息 → 验证 thinking steps 顺序 → 验证 citations 出现在 text 之前 → 验证 text streaming → 验证 conversation_id 更新 URL
2. **无 KB 直聊**：发送无 KB 的消息 → 验证跳过 retrieve/rank/clean → 直接 generate
3. **中途 abort**：发送消息 → 等 text_delta 出现 → stop() → 验证 UI 停止更新且不崩溃
4. **对话恢复**：创建对话 → 导航到 `/chat/:id` → 验证 initialMessages 加载 → 继续发送消息
5. **后端错误**：配置无效 LLM provider → 发送消息 → 验证 error Part 到达前端 → error 状态显示

## Acceptance Criteria

### Functional Requirements

- [ ] 用户发送消息后，收到标准 Data Stream Protocol SSE 响应
- [ ] thinking steps 实时显示各节点状态（running → done）
- [ ] citations 在文本生成前出现
- [ ] citation 更新（同 id reconciliation）正确替换摘要
- [ ] 文本流式显示
- [ ] conversation_id 正确传递并更新 URL
- [ ] 对话可通过 URL 恢复（`/chat/:id`）
- [ ] 错误正确显示（LLM 错误、网络错误）
- [ ] abort 正常工作

### Non-Functional Requirements

- [ ] 首 token 延迟 ≤ 2s（与旧端点持平）
- [ ] 流式文本无明显卡顿
- [ ] 旧端点的所有功能在新端点中可用
- [ ] 新增代码有测试覆盖

### Quality Gates

- [ ] `pytest` 通过，chat 节点测试 ≥ 7 个
- [ ] `vitest` 通过
- [ ] `ruff lint` + `eslint` 通过
- [ ] 手动 E2E 验证聊天流程

## Success Metrics

- PlaygroundPage 代码行数减少 ≥ 40%（手动状态管理被 useChat 替代）
- 后端 chat.py 拆分为 7 个可独立测试的节点
- SSE 协议标准化（可被任何 AI SDK 兼容客户端消费）
- error 事件有处理（从 0 处理到 100% 处理）

## Dependencies & Prerequisites

| 依赖 | 版本要求 | 说明 |
|------|---------|------|
| `ai` (npm) | ^5.0.0 | Vercel AI SDK core |
| `@ai-sdk/react` (npm) | ^2.0.0 | React hooks |
| `langgraph` (pip) | >=0.4.0 | 已安装 |
| `langchain-core` (pip) | >=0.3 | 已安装 |
| Python | >=3.12 | 已满足（LangGraph `get_stream_writer()` 需 ≥3.11） |
| React | >=18 | 已满足（当前 v19） |

## Risk Analysis & Mitigation

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| AI SDK 5.0 beta 不稳定 | 中 | 高 | 先在 `/stream/v2` 并行运行，确认稳定后切换；Pydantic AI 已有生产参考 |
| `data-*` Part 前端消费 API 不明确 | 低 | 中 | 已验证 `message.parts.filter()` 可用（见 brainstorm 技术验证） |
| LangGraph `get_stream_writer()` + `astream` 组合行为未预期 | 中 | 中 | Phase 1 先写节点测试验证事件发射 |
| `useChat` 的 `prepareSendMessagesRequest` 不支持所需的请求体格式 | 低 | 高 | 备选：自定义 Transport 类继承 `ChatTransport` |
| 并行运行两个端点增加维护成本 | 低 | 低 | Phase 3 快速切换并删除旧代码 |

## Future Considerations

- **Resumable Streams**：AI SDK 5.0 支持 `prepareReconnectToStreamRequest`，结合 LangGraph checkpointing 可实现断流续传
- **Rewrite API 统一**：复用 `DataStreamWriter` 迁移 `/rewrite` 端点
- **工具调用**：AI SDK 5.0 原生支持 `tool-input-start/delta/available` + `tool-output-available` Part
- **多模型并行**：LangGraph 支持并行节点，可扩展为多模型对比回答

## Sources & References

### Origin

- **Brainstorm document**: [docs/brainstorms/2026-03-12-chat-message-routing-chain-brainstorm.md](docs/brainstorms/2026-03-12-chat-message-routing-chain-brainstorm.md) — 关键决策：AI SDK 5.0 Data Stream Protocol、LangGraph StateGraph、data-* 自定义 Part

### Internal References

- LangGraph 现有模式: `backend/app/pipelines/graphs.py:39-68`
- LangGraph 节点模式: `backend/app/pipelines/nodes.py:16-33`
- 当前 chat 端点: `backend/app/api/v1/chat.py:99-330`
- 当前 SSE 客户端: `frontend/src/services/chat-api.ts:27-78`
- 当前 Playground 状态: `frontend/src/pages/PlaygroundPage.tsx:31-40,114-269`
- HITL 模式: `docs/solutions/integration-issues/langgraph-hitl-interrupt-api-snapshot-next.md`
- Sync 调用模式: `docs/solutions/performance-issues/blocking-sync-calls-asyncio-to-thread.md`
- RAG 性能: `docs/solutions/performance-issues/2026-03-12-rag-rich-citation-performance-analysis.md`
- LangGraph 规则: `.cursor/rules/langgraph-pipelines.mdc`

### External References

- Vercel AI SDK 5.0 Stream Protocol: https://sdk.vercel.ai/docs/ai-sdk-ui/stream-protocol
- AI SDK 5.0 + FastAPI working example: https://github.com/vercel/ai/issues/7496#issuecomment-2379142
- Pydantic AI 的 AI SDK 协议实现: https://ai.pydantic.dev/ui/vercel-ai/
- LangGraph `get_stream_writer()`: https://reference.langchain.com/python/langgraph/config/get_stream_writer
- LangGraph + FastAPI SSE guide: https://dev.to/kasi_viswanath/streaming-ai-agent-with-fastapi-langgraph-2025-26-guide-1nkn
