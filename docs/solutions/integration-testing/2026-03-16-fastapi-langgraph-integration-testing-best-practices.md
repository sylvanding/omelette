---
title: FastAPI + LangGraph 集成测试最佳实践 (2026)
date: 2026-03-16
category: integration-testing
tags:
  - fastapi
  - langgraph
  - pytest
  - httpx
  - sse
  - streaming
components:
  - backend/tests
  - backend/conftest.py
severity: low
---

# FastAPI + LangGraph 项目集成测试最佳实践

本文档基于 Omelette 项目实践和官方文档，总结 FastAPI + LangGraph 项目的集成测试最佳实践。

---

## 1. FastAPI 异步测试：httpx AsyncClient vs TestClient

### 2026 年推荐方案：**httpx AsyncClient + ASGITransport**

| 方案 | 适用场景 | 优点 | 缺点 |
|-----|---------|------|------|
| **AsyncClient + ASGITransport** | 异步测试、需要 await 其他 async 代码 | 与 async 生态一致，无 event loop 冲突 | 需 `@pytest.mark.asyncio` 或 `asyncio_mode=auto` |
| **TestClient** | 同步测试、简单端点 | 用法简单，无需 async | 在 async 测试中不可用；自建 event loop 可能与 DB 等资源冲突 |

**来源**：FastAPI 官方文档 [Async Tests](https://fastapi.tiangolo.com/advanced/async-tests/) 明确说明：

> The `TestClient` does some magic inside to call the asynchronous FastAPI application in your normal `def` test functions. But that magic doesn't work anymore when we're using it inside **asynchronous functions**. By running our tests asynchronously, we can no longer use the `TestClient` inside our test functions.

> The `TestClient` is based on HTTPX, and luckily, we can use it directly to test the API.

### 标准 fixture 模式

```python
# conftest.py 或 test 文件内
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
```

**注意**：必须设置 `base_url`，否则相对路径如 `/` 可能无法正确解析（Starlette 文档说明）。

### Lifespan 事件

若应用依赖 `lifespan` 事件（如 DB 连接池初始化），`AsyncClient` 默认**不会**触发。可使用 [asgi-lifespan](https://github.com/florimondmanca/asgi-lifespan) 的 `LifespanManager` 包装 app。

Omelette 当前在 `conftest.py` 中通过 `os.environ` 提前设置 `DATABASE_URL` 等，在 app 导入前完成，因此多数测试无需显式 lifespan。

---

## 2. 测试 SSE Streaming Endpoint

### 核心思路：`await` 完整响应后解析 `resp.text`

httpx 的 `AsyncClient` 在 `await client.post(...)` 返回时，会等待整个响应体接收完毕。对于 SSE 流，`resp.text` 即为完整的事件流文本。

### 示例：Data Stream Protocol 事件验证

```python
# backend/tests/test_chat_pipeline.py 中的模式
@pytest.mark.asyncio
async def test_stream_endpoint_data_stream_protocol(client):
    """Verify the /stream endpoint emits Data Stream Protocol events."""
    resp = await client.post(
        "/api/v1/chat/stream",
        json={"message": "Hello", "knowledge_base_ids": []},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")

    text = resp.text
    lines = [line for line in text.split("\n") if line.startswith("data: ")]

    event_types = []
    for line in lines:
        payload = line.removeprefix("data: ").strip()
        if payload == "[DONE]":
            event_types.append("[DONE]")
            continue
        try:
            parsed = json.loads(payload)
            event_types.append(parsed.get("type", "unknown"))
        except json.JSONDecodeError:
            pass

    assert "start" in event_types
    assert "text-delta" in event_types
    assert "finish" in event_types
    assert "[DONE]" in event_types
```

### 测试 review-draft/stream 的 SSE 事件

```python
@pytest.mark.asyncio
async def test_review_draft_stream_sse_events(client: AsyncClient, project_with_papers):
    """Verify /review-draft/stream emits section-start, text-delta, citation-map, done."""
    project_id, _ = project_with_papers
    resp = await client.post(
        f"/api/v1/projects/{project_id}/writing/review-draft/stream",
        json={"topic": "Super-resolution", "style": "narrative", "language": "en"},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")

    text = resp.text
    events = []
    for line in text.split("\n"):
        if line.startswith("data: "):
            payload = line.removeprefix("data: ").strip()
            if payload and payload != "[DONE]":
                try:
                    events.append(json.loads(payload))
                except json.JSONDecodeError:
                    pass

    event_types = [e.get("event") or e.get("type") for e in events]
    assert "section-start" in event_types or "progress" in event_types
    assert "text-delta" in event_types
    assert "citation-map" in event_types or "done" in event_types
```

### 流式逐块读取（可选）

如需验证「逐块到达」而非「最终完整内容」，可使用 `aiter_stream`：

```python
resp = await client.post(url, json=body)
resp.raise_for_status()
chunks = []
async for chunk in resp.aiter_text():
    chunks.append(chunk)
# 或 aiter_bytes() 用于二进制
```

多数集成测试场景下，验证完整 SSE 事件序列即可，无需逐块断言。

---

## 3. LangGraph Pipeline 的单元测试与集成测试

### 单元测试：Mock 策略

| 层级 | 策略 | 示例 |
|------|------|------|
| **节点逻辑** | 使用 mock LLM 和 mock RAG | `LLMClient(provider="mock")`、`MockEmbedding` |
| **Graph 结构** | 无 mock，直接编译 | `create_chat_pipeline()` 编译成功、节点列表正确 |
| **Config 注入** | 注入 mock 对象 | `set_chat_services(config, llm=mock_llm, rag=mock_rag)` |

### 单元测试示例

```python
# 测试 graph 编译
def test_graph_compiles():
    from app.pipelines.chat.graph import create_chat_pipeline
    pipeline = create_chat_pipeline()
    assert pipeline is not None

# 测试 config 注入
def test_set_and_get_services():
    from app.pipelines.chat.config_helpers import get_chat_llm, set_chat_services
    config = {"configurable": {"db": "x"}}
    mock_llm = object()
    set_chat_services(config, llm=mock_llm, rag=mock_rag)
    assert get_chat_llm(config) is mock_llm
```

### 集成测试：Mock 服务初始化

对 `/chat/stream` 等端点，需要 mock `_init_services` 以跳过 DB 中的用户配置查询，直接使用 mock LLM/RAG：

```python
@pytest.fixture(autouse=True)
def mock_services(monkeypatch):
    """Mock _init_services so endpoint tests use mock LLM/RAG without DB lookups."""
    import app.api.v1.chat as chat_module
    from app.services.llm.client import LLMClient

    async def _mock_init_services(db):
        from llama_index.core.embeddings import MockEmbedding
        from app.services.rag_service import RAGService

        llm = LLMClient(provider="mock")
        rag = RAGService(llm=llm, embed_model=MockEmbedding(embed_dim=128))
        return {"llm": llm, "rag": rag}

    monkeypatch.setattr(chat_module, "_init_services", _mock_init_services)
```

### Real Graph vs Mock Graph

- **集成测试**：使用真实 `create_chat_pipeline()` 编译的 graph，仅 mock 外部依赖（LLM、RAG、外部 API）。
- **单元测试**：可构造最小 graph（仅 1–2 个节点）验证逻辑，或直接测试 `stream_writer` 等纯函数。

---

## 4. pytest-asyncio 配置：mode=auto vs strict

### 模式对比

| 模式 | 行为 | 适用场景 |
|------|------|---------|
| **auto** | 自动将 `async def` 测试视为协程并运行 | 项目大量 async 测试，希望少写 `@pytest.mark.asyncio` |
| **strict** | 仅运行显式标记 `@pytest.mark.asyncio` 的测试 | 混合 sync/async 测试，需明确标记 |

### Omelette 当前配置

```toml
# pyproject.toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
```

在 `asyncio_mode = "auto"` 下，`async def test_*` 会自动作为协程运行，无需每个测试都加 `@pytest.mark.asyncio`。但项目现有测试仍保留 `@pytest.mark.asyncio`，可兼容未来切换到 `strict`。

### 推荐

- **新项目**：`asyncio_mode = "auto"` 更省事。
- **混合项目**：若 sync 测试多，可考虑 `strict`，避免误将 sync 测试当作 async 运行。

---

## 5. 外部 API Mock 策略

### 模式对比

| 方式 | 适用 |
|------|------|
| **patch 模块** | `patch("app.services.search_service.httpx.AsyncClient")` |
| **patch 依赖** | `monkeypatch.setattr(chat_module, "_init_services", _mock_init_services)` |
| **环境变量** | `LLM_PROVIDER=mock` 控制 LLM 实现 |
| **Mock 适配器** | `LLMClient(provider="mock")` 使用内置 MockChatModel |

### Semantic Scholar / 外部 HTTP 示例

```python
# backend/tests/test_search.py
async def mock_get(*args, **kwargs):
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = mock_data
    resp.raise_for_status = MagicMock()
    return resp

with patch("app.services.search_service.httpx.AsyncClient") as mock_client_cls:
    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.get = AsyncMock(side_effect=mock_get)
    mock_client_cls.return_value = mock_client

    provider = SemanticScholarProvider()
    papers = await provider.search("test query", max_results=10)
```

### LLM 调用 Mock

- **环境变量**：`conftest.py` 中 `LLM_PROVIDER=mock`，所有通过 `get_llm_client()` 的调用默认使用 mock。
- **依赖注入**：`monkeypatch.setattr` 替换 `_init_services` 等，注入自定义 mock LLM。

---

## 6. 项目现有实践总结（后端）

| 实践 | 位置 |
|------|------|
| httpx AsyncClient + ASGITransport | `test_chat.py`, `test_chat_pipeline.py`, `test_integration.py` |
| 临时测试 DB | `conftest.py` 使用 `tempfile.mkdtemp()` |
| LLM_PROVIDER=mock | `conftest.py` |
| 外部 HTTP mock | `test_search.py`, `test_crawler.py` |
| 服务初始化 mock | `test_chat_pipeline.py` 的 `mock_services` |
| SSE 流式断言 | `test_chat_pipeline.py` 解析 `resp.text` 中的 `data:` 行 |

---

## 7. Vitest + React Testing Library 测试 SSE 流式组件

### 策略：MSW Mock 流式端点

Omelette 使用 Vitest + React Testing Library + MSW。对 `useChatStream`、`WritingPage` 等依赖 SSE 的组件，通过 MSW 拦截 `/api/v1/chat/stream` 和 `/api/v1/projects/:id/writing/review-draft/stream`，返回模拟的 SSE 流。

### POST 流式端点：HttpResponse + ReadableStream

MSW 的 `sse` 命名空间面向 `EventSource`（GET），而 chat/stream 和 review-draft/stream 是 **POST**。需使用 `http.post` + `ReadableStream`：

```typescript
// frontend/src/test/mocks/handlers.ts 中可添加
import { http, HttpResponse } from 'msw';

// 模拟 chat/stream SSE 响应
http.post('/api/v1/chat/stream', () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const events = [
        'data: {"type":"start","messageId":"msg_test"}\n\n',
        'data: {"type":"text-delta","id":"t1","delta":"Hello"}\n\n',
        'data: {"type":"text-delta","id":"t1","delta":" world"}\n\n',
        'data: {"type":"finish"}\n\n',
        'data: [DONE]\n\n',
      ];
      events.forEach((e) => controller.enqueue(encoder.encode(e)));
      controller.close();
    },
  });
  return new HttpResponse(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'x-vercel-ai-ui-message-stream': 'v1',
    },
  });
});

// 模拟 review-draft/stream
http.post('/api/v1/projects/:id/writing/review-draft/stream', () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const events = [
        'data: {"event":"progress","data":{"step":"outline"}}\n\n',
        'data: {"event":"section-start","data":{"title":"Introduction"}}\n\n',
        'data: {"event":"text-delta","data":{"delta":"Mock intro text."}}\n\n',
        'data: {"event":"citation-map","data":{"citations":{}}}\n\n',
        'data: {"event":"done","data":{"total_sections":1}}\n\n',
      ];
      events.forEach((e) => controller.enqueue(encoder.encode(e)));
      controller.close();
    },
  });
  return new HttpResponse(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
  });
});
```

### 测试流式组件示例

```typescript
// PlaygroundPage 流式测试：需 mock chat/stream
it('shows streamed message after send', async () => {
  const user = userEvent.setup();
  renderWithProviders(<PlaygroundPage />);

  const input = screen.getByRole('textbox');
  await user.type(input, 'Hello');
  await user.click(screen.getByRole('button', { name: /send|发送/i }));

  await waitFor(() => {
    expect(screen.getByText(/Hello world/i)).toBeInTheDocument();
  });
});
```

### 测试建议

- **Mock 粒度**：在 handlers 中统一 mock，或按测试用例 `server.use()` 覆盖。
- **waitFor**：流式内容需 `waitFor` 等待渲染完成。
- **AI SDK 兼容**：确保 mock 的 SSE 格式与 Data Stream Protocol 一致（`type`、`delta` 等字段）。

---

## 8. Playwright E2E 测试 SSE/流式界面

### 策略：page.route 模拟流式响应

Omelette 已有 `e2e/fixtures/mock-sse.ts`，通过 `page.route` 拦截 `/api/v1/chat/stream` 并返回模拟 SSE 体。

### 现有模式

```typescript
// e2e/fixtures/mock-sse.ts
export async function mockChatStream(
  page: Page,
  messages: string[] = ['Hello', ' world'],
) {
  await page.route('/api/v1/chat/stream', async (route) => {
    const events = [
      'event: start\ndata: {}\n\n',
      ...messages.map(
        (m) => `event: text-delta\ndata: ${JSON.stringify({ textDelta: m })}\n\n`,
      ),
      'event: finish\ndata: {}\n\n',
      'data: [DONE]\n\n',
    ];
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'x-vercel-ai-ui-message-stream': 'v1',
      },
      body: events.join(''),
    });
  });
}
```

### 使用方式

```typescript
// e2e/chat-flow.spec.ts
import { test, expect } from '@playwright/test';
import { mockChatStream } from './fixtures/mock-sse';

test('chat streams response', async ({ page }) => {
  await mockChatStream(page, ['Hello', ' ', 'world']);
  await page.goto('/');
  await page.getByRole('textbox').fill('Hi');
  await page.getByRole('button', { name: /send/i }).click();

  await expect(page.getByText('Hello world')).toBeVisible();
});
```

### 流式界面 E2E 策略

| 策略 | 说明 |
|------|------|
| **Mock 流式响应** | `page.route` 返回完整 SSE 体，快速验证 UI 渲染 |
| **真实后端** | 启动完整 dev 环境，测试真实流式行为（慢、需后端） |
| **等待策略** | 使用 `expect(locator).toBeVisible()` 或 `waitForSelector`，流式内容可能逐字出现 |
| **超时** | 流式测试适当增加 `test.setTimeout()`，避免网络慢导致失败 |

### review-draft/stream 的 E2E Mock

```typescript
export async function mockReviewDraftStream(page: Page) {
  await page.route(
    /\/api\/v1\/projects\/\d+\/writing\/review-draft\/stream/,
    async (route) => {
      const body = [
        'data: {"event":"progress","data":{"step":"outline"}}\n\n',
        'data: {"event":"section-start","data":{"title":"Introduction"}}\n\n',
        'data: {"event":"text-delta","data":{"delta":"Mock intro."}}\n\n',
        'data: {"event":"done","data":{"total_sections":1}}\n\n',
      ].join('');
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body,
      });
    },
  );
}
```

---

## 9. 参考链接

- [FastAPI Async Tests](https://fastapi.tiangolo.com/advanced/async-tests/)
- [Starlette TestClient](https://www.starlette.io/testclient/) — 说明 async 测试中应使用 httpx.AsyncClient
- [pytest-asyncio Configuration](https://pytest-asyncio.readthedocs.io/en/stable/reference/configuration.html)
- [MSW Mocking Server-Sent Events](https://mswjs.io/docs/sse/)
- [docs/solutions/test-failures/test-database-pollution-tempfile-mkdtemp.md](../../test-failures/test-database-pollution-tempfile-mkdtemp.md) — 测试 DB 隔离
