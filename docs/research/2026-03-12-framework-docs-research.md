# 框架与库文档研究

**日期**: 2026-03-12
**范围**: @a2ui/react、@connectrpc/connect-web、React diff 库、framer-motion v12

---

## 1. @a2ui/react（A2UI React 渲染器）

### 概述

A2UI 是 Google 开源的 Agent 生成 UI 协议，用于在客户端渲染 AI Agent 输出的结构化界面。React 渲染器基于 `@a2ui/web-lib` 共享库，负责协议解析、状态管理和数据绑定。

### 版本与包状态

| 包名 | 版本 | 状态 | 说明 |
|------|------|------|------|
| `@a2ui/react` + `@a2ui/web-lib` | v0.8 | 官方文档推荐 | 官方仓库有实现，NPM 发布状态待确认 |
| `@a2ui-sdk/react` | v0.4.0 | 社区稳定 | 支持 v0.8/v0.9，React ^19.0.0 |
| `@a2ui-bridge/react` | v0.1.0 | 社区 | useA2uiProcessor、Surface、ComponentMapping |
| `@a2ui-renderer/react` | 0.9.0-alpha.2 | 预发布 | 面向 v0.9 的无头工具包 |

### 安装

```bash
# 官方（按 a2ui.org 文档）
npm install @a2ui/react @a2ui/web-lib

# 社区替代（若官方包未发布）
npm install @a2ui-sdk/react @a2ui/web-lib
# 或
npm install @a2ui-bridge/react @a2ui/web-lib
```

### 核心 API

| API | 说明 |
|-----|------|
| `MessageProcessor` | 处理 A2UI JSONL 流，分发消息，管理 surface 生命周期 |
| `useA2UI()` | 在任意组件中获取 MessageProcessor 的 React hook |
| `Surface` | 渲染 A2UI surface 的 React 组件 |

### 基本用法

```tsx
import { MessageProcessor, useA2UI, Surface } from '@a2ui/react';
import '@a2ui/web-lib';

// 1. 创建 MessageProcessor
const processor = new MessageProcessor();

// 2. 通过 transport 接收消息（SSE / WebSocket / A2A）
// processor.processMessage(jsonLine);

// 3. 在组件中使用
function App() {
  const a2ui = useA2UI();
  return (
    <Surface
      processor={a2ui}
      surfaceId="main"
    />
  );
}
```

### 自定义组件注册

- 通过 **Custom Catalogs** 扩展：定义包含标准组件 + 自定义组件的 catalog
- Agent 在 `beginRendering` 中指定 `catalogId`
- 客户端在 `a2uiClientCapabilities.supportedCatalogIds` 中声明支持的 catalog
- 自定义组件支持 data binding（JSON Pointer）和 action 回调

```ts
// 定义 catalog，包含标准 + 自定义组件
// 注册到 client，Agent 通过 surfaceUpdate 使用
```

### 版本约束与注意事项

- **v0.8**：React 渲染器稳定；v0.9 支持尚未就绪
- **v0.9**：消息重命名（`surfaceUpdate`→`updateComponents`，`beginRendering`→`createSurface`）
- 传输：支持 A2A、WebSocket、SSE
- 参考示例：[React shell](https://github.com/google/A2UI/tree/main/samples/client/react/shell)

---

## 2. @connectrpc/connect-web（ConnectRPC）

### 概述

ConnectRPC（前身 Buf Connect）是基于 Protocol Buffers 的 RPC 框架，支持 Connect、gRPC、gRPC-Web 协议。前端用 `@connectrpc/connect-web`，Python 后端用 `connect-python` 或 gRPC 实现。

### 安装

```bash
# 前端
npm install @connectrpc/connect @connectrpc/connect-web @bufbuild/protobuf

# Python 后端
pip install connect-python uvicorn
# 代码生成
pip install connect-python[compiler]
```

### Proto 定义（含双向流）

```protobuf
syntax = "proto3";
package greet.v1;

message GreetRequest { string name = 1; }
message GreetResponse { string greeting = 1; }

// 双向流示例
message ChatMessage { string text = 1; }
service ChatService {
  rpc Chat(stream ChatMessage) returns (stream ChatMessage);
}
```

### buf.gen.yaml（前端 + Python）

```yaml
# 前端 (buf.gen.yaml)
version: v2
plugins:
  - remote: buf.build/bufbuild/es
    out: gen
  - remote: buf.build/connectrpc/es
    out: gen

# Python (buf.gen.yaml)
version: v2
plugins:
  - remote: buf.build/protocolbuffers/python
    out: .
  - remote: buf.build/protocolbuffers/pyi
    out: .
  - remote: buf.build/connectrpc/python
    out: .
```

### 前端基本用法

```ts
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { ElizaService } from "./gen/eliza_pb";

const transport = createConnectTransport({
  baseUrl: "https://api.example.com",
});

const client = createClient(ElizaService, transport);

// Unary
const res = await client.say({ sentence: "Hello" });

// Server streaming
for await (const res of client.introduce({ name: "Joseph" })) {
  console.log(res);
}
```

### React Hook 模式

```ts
import { useMemo } from "react";
import { createClient, type Client } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import type { DescService } from "@bufbuild/protobuf";

const transport = createConnectTransport({
  baseUrl: "https://api.example.com",
});

export function useClient<T extends DescService>(service: T): Client<T> {
  return useMemo(() => createClient(service, transport), [service]);
}
```

### Python 后端（connect-python）

```python
from greet.v1.greet_connect import GreetService, GreetServiceASGIApplication
from greet.v1.greet_pb2 import GreetResponse

class Greeter(GreetService):
    async def greet(self, request, ctx):
        return GreetResponse(greeting=f"Hello, {request.name}!")

app = GreetServiceASGIApplication(Greeter())
# uvicorn server:app
```

### 双向流

- **协议**：双向流需要 HTTP/2
- **connect-python**：`AsyncConnectClient` 提供 `call_bidirectional_streaming`，支持 async 迭代器
- **connect-web**：客户端方法返回 `AsyncIterable`，可用 `for await...of` 消费

### 版本约束与注意事项

- **connect-python**：Beta，1.0 可能引入 breaking changes
- **@connectrpc/connect-web**：v2.x 稳定，与 connect-python 互通
- 若需 gRPC 生态兼容，可选用 gRPC-Web 协议

---

## 3. React 文本 Diff 库

### 库对比

| 库 | 安装 | 特点 | 中文支持 |
|----|------|------|----------|
| **react-diff-viewer** | `npm i react-diff-viewer` | 功能全、split/inline、语法高亮 | ✅ |
| **react-diff-viewer-continued** | `npm i react-diff-viewer-continued` | 原库 fork，持续维护 | ✅ |
| **react-diff-view** | `npm i react-diff-view` | 轻量、性能好 | ✅ |
| **diff2html** | `npm i diff2html` | 将 diff 转 HTML | ✅ |
| **diff** (jsdiff) | `npm i diff` | 底层 diff 算法 | ✅ |

### 推荐组合

- **完整方案**：`react-diff-viewer-continued`（维护活跃）
- **轻量方案**：`react-diff-view` + `diff`（jsdiff）

### 安装

```bash
# 推荐：维护版
npm install react-diff-viewer-continued

# 或
npm install react-diff-viewer

# 底层：仅需 diff 算法
npm install diff
```

### 基本用法（react-diff-viewer）

```tsx
import ReactDiffViewer from 'react-diff-viewer';

const oldCode = `这是原始中文文本`;
const newCode = `这是修改后的中文文本`;

<ReactDiffViewer
  oldValue={oldCode}
  newValue={newCode}
  splitView={true}        // true 左右分栏，false 统一视图
  hideLineNumbers={false}
  disableWordDiff={false}  // 词级 diff，对中文也有效
  showDiffOnly={false}
/>
```

### 使用 jsdiff 生成 diff

```ts
import { diffLines, diffWords, diffChars } from 'diff';

const changes = diffLines(oldText, newText);
// 或词级 diff（适合中文）
const wordChanges = diffWords(oldText, newText);
```

### API 要点

| 属性 | 说明 |
|------|------|
| `oldValue` / `newValue` | 待比较字符串 |
| `splitView` | 左右分栏 vs 统一视图 |
| `disableWordDiff` | 关闭词级高亮 |
| `renderContent` | 自定义渲染（如语法高亮） |
| `styles` | 自定义样式 |

### 版本约束与注意事项

- `react-diff-viewer` 原仓库已停止维护，建议用 `react-diff-viewer-continued`
- 中文建议：`diffWords` 或 `diffChars` 效果较好
- 大 diff 可考虑 `react-diff-view` 以减小内存占用

---

## 4. framer-motion / motion v12（骨架屏与渐入动画）

### 包名变更

- **framer-motion**：旧包名，仍可用
- **motion**：新包名，v12 起推荐

```bash
# 新包（推荐）
npm install motion

# 旧包
npm install framer-motion
```

```ts
// 新包导入（motion/react 用于组件，stagger 从 motion 主包）
import { motion, AnimatePresence } from "motion/react"
import { stagger } from "motion"
```

### 安装

```bash
npm install motion
```

### AnimatePresence + 退出动画

```tsx
import { AnimatePresence, motion } from "motion/react";

<AnimatePresence mode="wait">
  {show && (
    <motion.div
      key="modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    />
  )}
</AnimatePresence>
```

- `mode="wait"`：先完成退出再进入
- 子组件必须有唯一 `key` 以便追踪

### 骨架屏 → 内容过渡

```tsx
import { AnimatePresence, motion } from "motion/react";

<AnimatePresence mode="wait">
  {loading ? (
    <motion.div
      key="skeleton"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="skeleton"
    />
  ) : (
    <motion.div
      key="content"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {content}
    </motion.div>
  )}
</AnimatePresence>
```

### 列表 stagger 进入

```tsx
import { motion } from "motion/react";
import { stagger } from "motion";

const listVariants = {
  open: {
    opacity: 1,
    transition: {
      delayChildren: stagger(0.1),
      staggerChildren: 0.05,
    },
  },
  closed: {
    opacity: 0,
    transition: {
      delayChildren: stagger(0.01, { from: "last" }),
    },
  },
};

const itemVariants = {
  open: { opacity: 1, y: 0 },
  closed: { opacity: 0, y: 20 },
};

<motion.ul variants={listVariants} animate="open" initial="closed">
  {items.map((item) => (
    <motion.li key={item.id} variants={itemVariants}>
      {item}
    </motion.li>
  ))}
</motion.ul>
```

### stagger 用法

```ts
import { stagger } from "motion/react";

// 在 variants 中
transition: {
  delayChildren: stagger(0.1),
  // 或
  delayChildren: stagger(0.05, { from: "last" }),
  delayChildren: stagger(0.1, { startDelay: 0.2 }),
  delayChildren: stagger(0.1, { ease: "easeOut" }),
}
```

### 骨架屏 + layout 动画

```tsx
<motion.div layout>
  <AnimatePresence mode="wait">
    {loading ? (
      <motion.div
        key="skeleton"
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="h-4 bg-gray-200 rounded animate-pulse" />
      </motion.div>
    ) : (
      <motion.div
        key="content"
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {content}
      </motion.div>
    )}
  </AnimatePresence>
</motion.div>
```

### API 要点

| API | 说明 |
|-----|------|
| `AnimatePresence` | 支持退出动画，需唯一 `key` |
| `stagger(duration, options)` | `delayChildren` 中用于 stagger |
| `layout` | 布局动画 |
| `mode="wait"` | 先退出再进入 |

### 版本约束与注意事项

- `framer-motion` v12.x 与 `motion` 共享同一代码库
- 与 `AnimatePresence` 配合时，避免在子 variant 中混用 `exit`/`hover`，可单独放在 `motion` 组件上
- 自定义组件需用 `custom` 传索引，以支持 stagger 延迟

---

## 参考链接

| 主题 | 链接 |
|------|------|
| A2UI 客户端设置 | https://a2ui.org/guides/client-setup/ |
| A2UI 渲染器开发 | https://a2ui.org/guides/renderer-development/ |
| A2UI 自定义组件 | https://a2ui.org/guides/custom-components/ |
| Connect 使用客户端 | https://connectrpc.com/docs/web/using-clients |
| Connect Python 入门 | https://connectrpc.com/docs/python/getting-started |
| Connect Python 文档 | https://connect-python.readthedocs.io/ |
| Motion stagger | https://www.framer.com/motion/stagger/ |
| Motion AnimatePresence | https://www.framer.com/motion/animate-presence/ |
| react-diff-viewer-continued | https://www.npmjs.com/package/react-diff-viewer-continued |
