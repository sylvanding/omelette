# Research: Vercel AI SDK v5 & Playwright for Vite/React (2026)

Research conducted 2026-03-12. Covers latest documentation for both technologies with concrete code examples.

---

## 1. Vercel AI SDK v5 (@ai-sdk/react)

### 1.1 Overview

The AI SDK v5 introduces a **transport-based architecture** and no longer manages input state internally. You must manage input state separately (e.g., with `useState`).

### 1.2 useChat Hook API and Configuration

**Import:**
```tsx
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
```

**Basic usage with Vite/React (input state managed externally):**
```tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

export default function Chat() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, stop, error, regenerate } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',  // or full URL for FastAPI: 'http://localhost:8000/api/chat'
      headers: {
        Authorization: 'Bearer token',  // optional
      },
      credentials: 'include',  // optional, for cookies
      body: { knowledgeBaseId: 'default' },  // extra body data
    }),
  });

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.role}:{' '}
          {message.parts
            .filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join('')}
        </div>
      ))}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) {
            sendMessage({ text: input });
            setInput('');
          }
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={status !== 'ready'}
          placeholder="Say something..."
        />
        <button type="submit" disabled={status !== 'ready'}>Submit</button>
        {(status === 'submitted' || status === 'streaming') && (
          <button type="button" onClick={() => stop()}>Stop</button>
        )}
      </form>
    </div>
  );
}
```

**Key parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `transport` | `ChatTransport` | Default: `DefaultChatTransport` with `/api/chat` |
| `id` | `string` | Unique chat ID (for persistence/resume) |
| `messages` | `UIMessage[]` | Initial messages |
| `onError` | `(error: Error) => void` | Error callback |
| `onFinish` | `(options) => void` | Called when stream finishes |
| `onData` | `(dataPart) => void` | Custom data parts |
| `resume` | `boolean` | Enable stream resumption after reload |
| `sendAutomaticallyWhen` | `(options) => boolean` | Auto-resubmit on tool calls |

**Returns:** `messages`, `sendMessage`, `regenerate`, `stop`, `clearError`, `resumeStream`, `addToolOutput`, `setMessages`, `status`, `error`

**Status values:** `'ready'` | `'submitted'` | `'streaming'` | `'error'`

### 1.3 AI SDK Data Stream Protocol (Backend SSE Format)

Your backend **must** emit Server-Sent Events (SSE) in this format. Set header:

```
x-vercel-ai-ui-message-stream: v1
```

**Required stream parts (minimal chat):**

```
data: {"type":"start","messageId":"msg_abc123"}

data: {"type":"text-start","id":"msg_abc123"}
data: {"type":"text-delta","id":"msg_abc123","delta":"Hello"}
data: {"type":"text-delta","id":"msg_abc123","delta":" world"}
data: {"type":"text-end","id":"msg_abc123"}

data: {"type":"finish"}
data: [DONE]
```

**Full part reference:**

| Part | Format | Purpose |
|------|--------|---------|
| `start` | `{"type":"start","messageId":"..."}` | Message start |
| `text-start` | `{"type":"text-start","id":"..."}` | Text block start |
| `text-delta` | `{"type":"text-delta","id":"...","delta":"..."}` | Incremental text |
| `text-end` | `{"type":"text-end","id":"..."}` | Text block end |
| `error` | `{"type":"error","errorText":"..."}` | Error in stream |
| `finish` | `{"type":"finish"}` | Message complete |
| `abort` | `{"type":"abort","reason":"..."}` | Stream aborted |
| `[DONE]` | literal `[DONE]` | Stream termination |

Additional parts: `reasoning-start/delta/end`, `source-url`, `source-document`, `file`, `tool-input-start`, `tool-input-delta`, `tool-input-available`, `tool-output-available`, `start-step`, `finish-step`, `data-*` (custom).

### 1.4 Error Handling and Retry

**Error object and retry:**
```tsx
const { messages, sendMessage, error, regenerate, clearError } = useChat();

// Show error and retry button
{error && (
  <>
    <div>Something went wrong.</div>
    <button type="button" onClick={() => regenerate()}>Retry</button>
  </>
)}

// Disable submit when error
<input disabled={error != null} />

// Or clear error and replace last message before resubmit
function customSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (error != null) {
    setMessages(messages.slice(0, -1));
  }
  sendMessage({ text: input });
  setInput('');
}
```

**onError callback:**
```tsx
useChat({
  onError: (error) => {
    console.error(error);
    // Log to monitoring, show toast, etc.
  },
});
```

**onFinish with error info:**
```tsx
useChat({
  onFinish: ({ message, messages, isAbort, isDisconnect, isError, finishReason }) => {
    if (isError) {
      // Handle early stop due to error
    }
  },
});
```

**Resume after disconnect:** Use `resumeStream()` when a network error occurs during streaming.

### 1.5 Integration with FastAPI Backends

Your FastAPI backend must:

1. Accept POST with `messages` (or your custom body shape)
2. Stream SSE with `x-vercel-ai-ui-message-stream: v1`
3. Emit the Data Stream Protocol parts

**Minimal FastAPI example:**

```python
# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
import json
import uuid

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"])

async def stream_chat(messages: list):
    """Yield SSE events in AI SDK Data Stream Protocol format."""
    msg_id = f"msg_{uuid.uuid4().hex}"
    yield {"event": "message", "data": json.dumps({"type": "start", "messageId": msg_id})}
    yield {"event": "message", "data": json.dumps({"type": "text-start", "id": msg_id})}
    # Simulate streaming (replace with actual LLM call)
    for chunk in ["Hello", " ", "from", " ", "FastAPI"]:
        yield {"event": "message", "data": json.dumps({"type": "text-delta", "id": msg_id, "delta": chunk})}
    yield {"event": "message", "data": json.dumps({"type": "text-end", "id": msg_id})}
    yield {"event": "message", "data": json.dumps({"type": "finish"})}
    yield {"event": "message", "data": "[DONE]"}

@app.post("/api/chat")
async def chat(request: Request):
    body = await request.json()
    messages = body.get("messages", [])
    return EventSourceResponse(
        stream_chat(messages),
        headers={"x-vercel-ai-ui-message-stream": "v1"},
    )
```

**Dependencies:**
```bash
pip install fastapi uvicorn sse-starlette
```

**Frontend config (Vite proxy already in place):**
```tsx
// Your vite.config.ts proxies /api -> http://localhost:8000
// So useChat with api: '/api/chat' will hit FastAPI
useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
});
```

### 1.6 React Setup with Vite

**Install:**
```bash
npm install ai @ai-sdk/react
```

**Vite config (proxy to FastAPI):**
```ts
// vite.config.ts
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
```

**Text stream (simpler) vs Data stream:**
- For plain text only, use `TextStreamChatTransport` with `streamProtocol: 'text'`
- For tools, sources, custom data, use default Data Stream Protocol

---

## 2. Playwright for Vite/React

### 2.1 Setting Up Playwright with Vite React

**Install:**
```bash
npm init playwright@latest
```

Choose:
- TypeScript
- Test directory: `e2e` or `tests/e2e`
- Add GitHub Actions: Yes

**playwright.config.ts:**
```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? '50%' : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
```

**package.json scripts:**
```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:headed": "playwright test --headed"
  }
}
```

### 2.2 Page Object Model (POM)

**Page object class:**
```ts
// e2e/pages/ChatPage.ts
import { expect, type Locator, type Page } from '@playwright/test';

export class ChatPage {
  readonly page: Page;
  readonly input: Locator;
  readonly submitButton: Locator;
  readonly messages: Locator;
  readonly stopButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.input = page.getByPlaceholder('Say something...');
    this.submitButton = page.getByRole('button', { name: 'Submit' });
    this.messages = page.locator('[data-testid="chat-messages"]');
    this.stopButton = page.getByRole('button', { name: 'Stop' });
  }

  async goto() {
    await this.page.goto('/');
  }

  async sendMessage(text: string) {
    await this.input.fill(text);
    await this.submitButton.click();
  }

  async waitForResponse() {
    await expect(this.messages.locator('.assistant-message').last()).toBeVisible({ timeout: 10000 });
  }
}
```

**Test using POM:**
```ts
// e2e/chat.spec.ts
import { test, expect } from '@playwright/test';
import { ChatPage } from './pages/ChatPage';

test('user can send message and see response', async ({ page }) => {
  const chatPage = new ChatPage(page);
  await chatPage.goto();
  await chatPage.sendMessage('Hello');
  await chatPage.waitForResponse();
  await expect(chatPage.messages).toContainText('Hello');
});
```

### 2.3 Mock API vs Real Backend

**Option A: Playwright `page.route()` (no MSW):**
```ts
test('shows mocked chat response', async ({ page }) => {
  await page.route('**/api/chat', async (route) => {
    if (route.request().method() === 'POST') {
      // Simulate SSE stream
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data: {"type":"start","messageId":"m1"}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"text-delta","id":"m1","delta":"Mocked reply"}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"text-end","id":"m1"}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"finish"}\n\n'));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      await route.fulfill({
        status: 200,
        headers: { 'x-vercel-ai-ui-message-stream': 'v1', 'Content-Type': 'text/event-stream' },
        body: stream,
      });
    } else {
      await route.continue();
    }
  });

  await page.goto('/');
  await page.getByPlaceholder('Say something...').fill('Hi');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.locator('.assistant-message')).toContainText('Mocked reply');
});
```

**Option B: playwright-msw (MSW in Playwright):**
```bash
npm install playwright-msw --save-dev
```

```ts
// e2e/fixtures.ts
import { test as base } from '@playwright/test';
import { createWorkerFixture } from 'playwright-msw';
import { handlers } from '../src/mocks/handlers';

const test = base.extend({
  worker: createWorkerFixture(handlers),
});

export { test, expect };
```

**Option C: Real backend in CI**
- Start FastAPI in CI before Playwright (e.g., `uvicorn app.main:app`)
- Or use `webServer` to start both frontend and backend

### 2.4 CI Configuration for GitHub Actions

**Generated workflow (playwright.yml):**
```yaml
# .github/workflows/playwright.yml
name: Playwright Tests
on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]
jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright Browsers
        run: npx playwright install --with-deps
      - name: Run Playwright tests
        run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

**With backend (FastAPI) in CI:**
```yaml
- name: Start backend
  run: |
    pip install -r backend/requirements.txt
    uvicorn app.main:app --host 0.0.0.0 --port 8000 &
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
- name: Run Playwright tests
  run: npx playwright test
  env:
    API_URL: http://localhost:8000
```

### 2.5 Vitest vs Playwright: Component vs E2E

| Aspect | Vitest | Playwright |
|--------|--------|------------|
| **Purpose** | Unit + component tests | E2E user flows |
| **Environment** | jsdom or browser (Vitest browser mode) | Real Chromium/Firefox/WebKit |
| **Speed** | Very fast | Slower, full app |
| **Scope** | Functions, components | Full app, real network |

**Vitest for components (existing in Omelette):**
```ts
// Component test with Vitest + Testing Library
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from './ChatInput';

test('submits on enter', async () => {
  const onSubmit = vi.fn();
  render(<ChatInput onSubmit={onSubmit} />);
  await userEvent.type(screen.getByRole('textbox'), 'Hello{Enter}');
  expect(onSubmit).toHaveBeenCalledWith('Hello');
});
```

**MSW for Vitest (mock API in component tests):**
```ts
// src/test/setup.ts
import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers';

export const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

**Recommended split:**
- **Vitest**: Unit tests, component tests (with jsdom or MSW for API)
- **Playwright**: E2E tests (with mocked API or real backend in CI)

---

## References

- [AI SDK useChat Reference](https://v5.ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat)
- [AI SDK Stream Protocol](https://sdk.vercel.ai/docs/ai-sdk-ui/stream-protocol)
- [AI SDK Error Handling](https://sdk.vercel.ai/docs/ai-sdk-ui/error-handling)
- [AI SDK Transport](https://sdk.vercel.ai/docs/ai-sdk-ui/transport)
- [Playwright POM](https://playwright.dev/docs/pom)
- [Playwright Mock APIs](https://playwright.dev/docs/mock)
- [Playwright CI](https://playwright.dev/docs/ci-intro)
- [Vercel AI SDK Python/FastAPI Example](https://github.com/vercel/ai/tree/main/examples/next-fastapi)
