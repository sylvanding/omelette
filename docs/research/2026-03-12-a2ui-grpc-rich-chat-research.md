# Research: A2UI, gRPC-Web & Rich Chat Best Practices (2026)

Research conducted 2026-03-12. Covers Google A2UI protocol, gRPC-Web integration with FastAPI/React, and rich media chat interface patterns.

---

## 1. Google A2UI 协议集成到 React 应用

### 1.1 概述

A2UI (Agent-to-UI) 是 Google 开源的 AI 驱动 UI 协议，允许 LLM 生成结构化 UI 描述，由客户端渲染为原生组件。v0.8 为当前稳定版。

### 1.2 @a2ui/react + @a2ui/web-lib 集成步骤

**安装：**
```bash
npm install @a2ui/react @a2ui/web-lib
```

**核心组件：**
- `MessageProcessor`：处理 JSONL 消息流，管理 surface 生命周期
- `useA2UI()`：在任意组件中访问 MessageProcessor
- `<Surface>`：渲染 A2UI surfaces

**基础集成示例：**
```tsx
// App.tsx
import { Surface, useA2UI } from '@a2ui/react';
import { MessageProcessor } from '@a2ui/web-lib';

function ChatWithA2UI() {
  const processor = useMemo(() => new MessageProcessor(), []);
  const [surfaceId] = useState('main');

  return (
    <A2UIProvider processor={processor}>
      <Surface surfaceId={surfaceId} />
    </A2UIProvider>
  );
}
```

**参考实现：** [React shell sample](https://github.com/google/A2UI/tree/main/samples/client/react/shell)

### 1.3 Component Catalog（自定义组件目录）定义方式

**概念：** Catalog 是组件集合的契约，Agent 通过 `catalogId` 选择使用哪个 catalog，Client 注册对应实现。

**定义流程：**
1. 创建 catalog 定义（列出标准 + 自定义组件）
2. 实现自定义组件的 React 映射（如 `StockTicker` → `<StockTicker />`）
3. 在 `beginRendering` 中通过 `catalogId` 指定
4. Client 在 `a2uiClientCapabilities.supportedCatalogIds` 中声明支持

**安全注意：**
- 仅注册可信组件
- 校验 agent 消息中的 component 属性
- 不要将敏感 API 暴露给自定义组件

**文档：** [Custom Components](https://a2ui.org/guides/custom-components/)

### 1.4 与 SSE 流式传输的结合方式

**消息格式：** JSONL（每行一个完整 JSON 对象），流式友好、易增量生成。

**典型消息序列（v0.8）：**
```json
{"surfaceUpdate":{"surfaceId":"main","components":[...]}}
{"dataModelUpdate":{"surfaceId":"main","path":"/user","contents":[...]}}
{"beginRendering":{"surfaceId":"main","root":"root-component"}}
```

**SSE 集成伪代码：**
```ts
// 连接 SSE 并喂给 MessageProcessor
const eventSource = new EventSource('/api/a2ui/stream');
eventSource.onmessage = (e) => {
  const line = e.data;
  try {
    const msg = JSON.parse(line);
    processor.processMessage(msg);
  } catch (err) {
    console.warn('Malformed A2UI message', err);
  }
};
```

**或使用 fetch + ReadableStream：**
```ts
const res = await fetch('/api/a2ui/stream', { method: 'POST', body: JSON.stringify(request) });
const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    if (line.trim()) processor.processMessage(JSON.parse(line));
  }
}
```

### 1.5 渐进渲染模式（Progressive Rendering）

A2UI 原生支持渐进渲染：不必等完整响应，可边生成边渲染。

**流程：**
1. Agent 流式发送 `surfaceUpdate`（组件定义）
2. 随后发送 `dataModelUpdate`（数据）
3. 最后发送 `beginRendering`（渲染信号）
4. Client 收到 `beginRendering` 后从 root 开始渲染

**性能建议（来自 A2UI 文档）：**
- 细粒度更新：只更新 `/user/name` 而非整个 `/` 模型
- Diffing：比较新旧组件，仅更新变更属性
- Batching：缓冲 16ms 内的更新，批量渲染

### 1.6 注意事项与常见坑

| 问题 | 处理方式 |
|------|----------|
| Schema Validation Failed | 校验消息格式与 A2UI spec 一致 |
| Invalid Data Path | 检查 JSON Pointer 语法与 data model 结构 |
| Invalid Component ID | 组件 ID 在 surface 内必须唯一 |
| Invalid Surface ID | 确保先收到 `beginRendering` 再渲染 |
| 网络中断 | 显示错误状态、重连，Agent 重发或恢复 |
| 畸形消息 | 跳过并继续，或发送 error 回 Agent |

**版本说明：**
- v0.8：`surfaceUpdate`、`dataModelUpdate`、`beginRendering`
- v0.9：`updateComponents`、`updateDataModel`、`createSurface`，更扁平化

React renderer 在 v0.8 稳定，v0.9 支持待定。

### 1.7 相关文档链接

- [Client Setup](https://a2ui.org/guides/client-setup/)
- [Renderer Development](https://a2ui.org/guides/renderer-development/)
- [Custom Components](https://a2ui.org/guides/custom-components/)
- [Data Flow](https://a2ui.org/concepts/data-flow/)
- [Transports](https://a2ui.org/concepts/transports/)
- [A2UI GitHub](https://github.com/google/A2UI)

---

## 2. gRPC-Web 集成到 FastAPI + React 应用

### 2.1 概述

gRPC-Web 允许浏览器通过 HTTP/1.1 或 HTTP/2 访问 gRPC 服务。**重要限制：浏览器不支持双向流**，仅支持 unary 和 server streaming。

### 2.2 FastAPI 中使用 grpcio 定义双向流服务

**Python 后端需单独运行 gRPC 服务**（FastAPI 与 gRPC 通常不同端口）：

```python
# chat.proto
syntax = "proto3";

service ChatService {
  rpc StreamChat(stream ChatRequest) returns (stream ChatResponse);
}

message ChatRequest {
  string message = 1;
  string conversation_id = 2;
}

message ChatResponse {
  string message = 1;
  bool done = 2;
}
```

```python
# grpc_server.py
import grpc
from concurrent import futures
import chat_pb2
import chat_pb2_grpc

class ChatServicer(chat_pb2_grpc.ChatServiceServicer):
    async def StreamChat(self, request_iter, context):
        async for req in request_iter:
            # 处理客户端消息
            yield chat_pb2.ChatResponse(message=f"Echo: {req.message}", done=False)
        yield chat_pb2.ChatResponse(message="", done=True)

async def serve():
    server = grpc.aio.server()
    chat_pb2_grpc.add_ChatServiceServicer_to_server(ChatServicer(), server)
    server.add_insecure_port('[::]:50051')
    await server.start()
    await server.wait_for_termination()
```

**双向流异步模式（需同时读写）：**
```python
async def StreamChat(self, request_iter, context):
    async def read_requests():
        async for req in request_iter:
            # 处理客户端消息
            pass

    async def write_responses():
        for i in range(10):
            await context.write(chat_pb2.ChatResponse(message=str(i)))
            await asyncio.sleep(0.5)

    await asyncio.gather(
        asyncio.create_task(read_requests()),
        asyncio.create_task(write_responses())
    )
```

### 2.3 前端：grpc-web vs @connectrpc/connect-web

| 维度 | grpc-web | @connectrpc/connect-web |
|------|----------|--------------------------|
| 协议 | 仅 gRPC-Web | Connect 协议 + gRPC-Web 兼容 |
| 代理 | 需 Envoy 等代理 | Connect 协议可无需代理 |
| 格式 | 默认 binary | 默认 JSON，便于调试 |
| 工具链 | protoc + protoc-gen-grpc-web | buf + 现代工具链 |
| 维护 | 社区维护 | 活跃维护，约 930K 周下载 |

**推荐：** 新项目优先考虑 `@connectrpc/connect-web`，支持 Connect 协议时无需 Envoy；若后端仅支持 gRPC，可用 `createGrpcWebTransport()`。

**Connect 协议示例：**
```ts
import { createConnectTransport } from "@connectrpc/connect-web";

const transport = createConnectTransport({
  baseUrl: "https://api.example.com",
  useBinaryFormat: false,  // JSON 便于调试
});
```

**gRPC-Web 协议示例：**
```ts
import { createGrpcWebTransport } from "@connectrpc/connect-web";

const transport = createGrpcWebTransport({
  baseUrl: "https://api.example.com",
  useBinaryFormat: true,  // gRPC-Web 常用 binary
});
```

### 2.4 gRPC 双向流与单向流的区别和适用场景

| 模式 | 定义 | 浏览器支持 | 适用场景 |
|------|------|------------|----------|
| Unary | 请求 → 响应 | ✅ | 简单 CRUD、单次查询 |
| Server Streaming | 请求 → 流式响应 | ✅ | 聊天回复、日志流、实时推送 |
| Client Streaming | 流式请求 → 响应 | ❌ | 大文件上传、批量提交 |
| Bidirectional | 双向流 | ❌ | 实时聊天、游戏、协作编辑 |

**浏览器端替代方案：**
- 需要双向实时：用 WebSocket 或 SSE + 轮询
- 仅需服务端推送：用 Server Streaming

### 2.5 与现有 HTTP API 共存的架构模式

**方案 A：端口分离**
```
Browser → nginx (443)
  ├─ /api/*     → FastAPI (8000)  # HTTP REST
  └─ /grpc/*    → Envoy (8080)    → gRPC (50051)
```

**方案 B：Envoy 配置示例**
```yaml
# envoy.yaml
static_resources:
  listeners:
  - name: listener_0
    address:
      socket_address: { address: 0.0.0.0, port_value: 8080 }
    filter_chains:
    - filters:
      - name: envoy.http_connection_manager
        typed_config:
          "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
          codec_type: auto
          route_config:
            virtual_hosts:
            - name: local_service
              domains: ["*"]
              routes:
              - match: { prefix: "/" }
                route: { cluster: grpc_backend }
          http_filters:
          - name: envoy.grpc_web
            typed_config:
              "@type": type.googleapis.com/envoy.extensions.filters.http.grpc_web.v3.GrpcWeb
          - name: envoy.filters.http.router
            typed_config:
              "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router
  clusters:
  - name: grpc_backend
    connect_timeout: 0.25s
    type: LOGICAL_DNS
    lb_policy: ROUND_ROBIN
    load_assignment:
      cluster_name: grpc_backend
      endpoints:
        - lb_endpoints:
          - endpoint:
              address:
                socket_address:
                  address: localhost
                  port_value: 50051
```

**nginx 反向代理：**
```nginx
location /grpc {
    proxy_http_version 1.1;
    proxy_pass http://localhost:8080;
    proxy_set_header Connection "";
}
```

### 2.6 错误处理和重连策略

```ts
// 重连示例
let retries = 0;
const maxRetries = 3;

async function connectWithRetry() {
  while (retries < maxRetries) {
    try {
      const client = await createClient(transport);
      retries = 0;
      return client;
    } catch (e) {
      retries++;
      await new Promise(r => setTimeout(r, 1000 * retries));
    }
  }
  throw new Error('Connection failed after retries');
}
```

**错误类型：**
- `grpc-status`、`grpc-message` 响应头
- 网络中断：检测 `fetch` 或 stream 错误，触发重连

### 2.7 降级方案（SSE fallback）

当 gRPC-Web 不可用（如无 Envoy、代理故障）时，可回退到 SSE：

```ts
async function getChatStream(request: ChatRequest) {
  try {
    return await grpcClient.streamChat(request);
  } catch {
    // Fallback to SSE
    return fetch('/api/v1/chat/stream', {
      method: 'POST',
      body: JSON.stringify(request),
    }).then(r => r.body!);
  }
}
```

Omelette 当前已使用 SSE：`POST /api/v1/chat/stream`，可作为 gRPC 的降级端点。

### 2.8 相关文档链接

- [gRPC-Web Basics](https://grpc.io/docs/platforms/web/basics)
- [Connect Protocol](https://connectrpc.com/docs/web/choosing-a-protocol)
- [Connect Web Getting Started](https://connectrpc.com/docs/web/getting-started)
- [Envoy gRPC-Web](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/other_protocols/grpc.html)

---

## 3. 富媒体聊天界面的最佳实践

### 3.1 概述

现代聊天界面不仅展示文本，还嵌入交互式组件（表格、图表、时间线），并支持流式 Markdown + 富媒体混合渲染。

### 3.2 聊天中嵌入交互式组件的 UX 最佳实践

**核心思路：** 将流式内容视为「组件序列化」而非纯文本。LLM 输出结构化描述，客户端解析并渲染为可交互组件。

**推荐模式（Vercel AI SDK）：**
- 使用 `render()` 将 React 组件序列化进流
- 使用 Server Actions 处理组件内交互（如按钮点击）
- 每个交互组件作为独立「状态岛」，避免全局重渲染

**UX 原则：**
- 内联引用：`[1][2]` 可点击展开 CitationCard
- 区分 AI 生成 vs 引用内容
- 显示 AI 状态：`Thinking`、`Checking sources`
- 提供 Stop、Retry 按钮
- 支持编辑前 prompt、对话分支

**交互式组件示例（伪代码）：**
```tsx
// 服务端：注入交互式组件
stream.append(
  render(
    <InteractiveCounter
      initialValue={50}
      onIncrement={incrementCounterAction}
    />
  )
);
```

**陷阱：**
- 不要让 LLM 直接生成 React 代码，易产生无效 JSX
- LLM 只生成描述性文本，组件由代码确定性注入

### 3.3 加载状态的分阶段展示（skeleton → content）

**阶段：**
1. **骨架屏**：占位布局，显示大致结构
2. **部分内容**：流式首 token 到达后开始渲染
3. **完整内容**：流结束，移除 loading 状态

**实现示例：**
```tsx
{message.isStreaming ? (
  <div className="relative">
    <ReactMarkdown>{message.content}</ReactMarkdown>
    <span className="animate-pulse">▋</span>
  </div>
) : (
  <ReactMarkdown>{message.content}</ReactMarkdown>
)}
```

**Skeleton 占位：**
```tsx
{!messages.length && isLoading && (
  <div className="space-y-4 animate-pulse">
    <div className="h-4 bg-muted rounded w-3/4" />
    <div className="h-4 bg-muted rounded w-1/2" />
    <div className="h-4 bg-muted rounded w-1/3" />
  </div>
)}
```

**Next.js Suspense 模式：**
```tsx
<Suspense fallback={<ChatSkeleton />}>
  <ChatContent />
</Suspense>
```

### 3.4 流式 Markdown + 富媒体混合渲染

**挑战：**
- 不完整 Markdown（未闭合代码块、半词）
- 需实时更新，避免闪烁

**最佳实践：**
- 缓存不完整 Markdown，等闭合再渲染代码块，或显示「streaming」指示
- 每 50–100ms 批量更新 DOM，减少抖动
- 优先展示首 token（TTFT < 500ms 感知更快）

**推荐库：**
- **Streamdown**：专为流式 AI 内容设计，含 Shiki 代码高亮、KaTeX、流式动画
- **react-markdown**：Omelette 已用，配合 `rehype-highlight`、`rehype-katex`、`remark-gfm`

**混合渲染示例：**
```tsx
// 根据 part.type 渲染不同内容
{message.parts.map((part) => {
  if (part.type === 'text') return <ReactMarkdown key={part.id}>{part.text}</ReactMarkdown>;
  if (part.type === 'chart') return <ChartComponent data={part.data} />;
  if (part.type === 'table') return <DataTable data={part.data} />;
  return null;
})}
```

### 3.5 常见陷阱与解决方案

| 问题 | 处理方式 |
|------|----------|
| 流中 await 阻塞 | 用 IIFE 并发执行，POST 立即返回 stream |
| 超时（如 Vercel 10s） | 立即开始流式输出，不等待完整响应 |
| 状态不同步 | Server Action 更新持久化存储，hydration 时拉取最新值 |
| 部分失败 | 保存已流内容，提供 Retry |

### 3.6 相关文档链接

- [Beyond Text: Interactive Components in AI Chat](https://dev.to/programmingcentral/beyond-text-how-to-embed-interactive-ui-components-in-ai-chat-streams-5fic)
- [AI Chat UI Best Practices](https://dev.to/greedy_reader/ai-chat-ui-best-practices-designing-better-llm-interfaces-18jj)
- [Streaming LLM Responses: Real-Time UX](https://getathenic.com/blog/streaming-llm-responses-real-time-ux)
- [Streamdown](https://streamdown.ai/)
- [Next.js Loading UI and Streaming](https://nextjs.org/docs/14/app/building-your-application/routing/loading-ui-and-streaming)

---

## 4. 与 Omelette 的衔接建议

- **A2UI**：若希望 Agent 生成结构化 UI（表单、卡片、图表），可评估 A2UI；当前 Chat 为纯文本 + Markdown，可先做 POC 验证 JSONL 流与 SSE 的兼容性。
- **gRPC-Web**：若需低延迟、强类型 RPC，可引入；需注意浏览器不支持双向流，需 Envoy 或 Connect 协议。现有 SSE 可作为 fallback。
- **富媒体**：当前已有 `react-markdown` + KaTeX + 代码高亮，可扩展 `message.parts` 支持 `chart`、`table` 等类型，参考 Vercel AI SDK 的 `render` 模式。
