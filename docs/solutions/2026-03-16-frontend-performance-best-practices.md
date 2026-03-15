# 2026 前端性能优化最佳实践

**项目背景**: Omelette 使用 React 19 + Vite 7 + TailwindCSS v4，包含 react-pdf (pdfjs-dist)、react-force-graph-2d、katex、AI SDK 等大型依赖。后端 FastAPI 提供 SSE 流式接口。

**研究日期**: 2026-03-16

---

## 1. Vite 7.x `manualChunks` / `codeSplitting` 最佳配置

### 重要变更：Vite 7 使用 Rolldown

Vite 7 已将 `build.rollupOptions` 弃用，改用 `build.rolldownOptions`。**`manualChunks` 的对象形式已不再支持**，函数形式也已弃用。Rolldown 推荐使用 `codeSplitting` 替代。

### 推荐配置：`codeSplitting.groups`

```typescript
// frontend/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { /* ... */ },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // 高优先级：大型依赖单独拆分，便于并行加载与缓存
            {
              name: 'react-pdf',
              test: /node_modules[\\/](react-pdf|pdfjs-dist)/,
              priority: 25,
            },
            {
              name: 'react-force-graph',
              test: /node_modules[\\/]react-force-graph-2d/,
              priority: 24,
            },
            {
              name: 'katex',
              test: /node_modules[\\/]katex/,
              priority: 23,
            },
            {
              name: 'ai-sdk',
              test: /node_modules[\\/](@ai-sdk|ai)\//,
              priority: 22,
            },
            // React 核心（常被多处引用）
            {
              name: 'react-vendor',
              test: /node_modules[\\/](react|react-dom)/,
              priority: 20,
            },
            // 其他 node_modules
            {
              name: 'vendor',
              test: /node_modules/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
})
```

### 分组策略说明

| 分组 | 依赖 | 理由 |
|------|------|------|
| react-pdf | react-pdf, pdfjs-dist | ~2MB+，PDF 页面才需要，lazy 加载 |
| react-force-graph | react-force-graph-2d | 图可视化，仅引用图页面需要 |
| katex | katex | 数学公式，Markdown 渲染时用 |
| ai-sdk | @ai-sdk/react, ai | 聊天流式核心 |
| react-vendor | react, react-dom | 高频引用，单独缓存 |
| vendor | 其余 node_modules | 兜底 |

### 兼容写法：若需保留 `manualChunks` 函数形式

```typescript
// 迁移期可用，但会被 codeSplitting 覆盖
build: {
  rolldownOptions: {
    output: {
      manualChunks: (moduleId) => {
        if (moduleId.includes('node_modules/react-pdf') || moduleId.includes('node_modules/pdfjs-dist')) {
          return 'react-pdf';
        }
        if (moduleId.includes('node_modules/react-force-graph-2d')) return 'react-force-graph';
        if (moduleId.includes('node_modules/katex')) return 'katex';
        if (moduleId.includes('node_modules/@ai-sdk') || moduleId.includes('node_modules/ai/')) return 'ai-sdk';
        if (moduleId.includes('node_modules')) return 'vendor';
        return null;
      },
    },
  },
}
```

**注意**：若同时配置 `manualChunks` 和 `codeSplitting`，`manualChunks` 会被忽略。

---

## 2. `rollup-plugin-visualizer` 在 Vite 7 中的使用

### 安装

```bash
npm add -D rollup-plugin-visualizer
```

### 配置（Vite + TypeScript）

```typescript
// frontend/vite.config.ts
import { defineConfig, type PluginOption } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // 放在最后，确保能分析完整 bundle
    visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
      template: 'treemap', // 可选: sunburst | treemap | treemap-3d | network | flamegraph
    }) as PluginOption,
  ],
  // ...
})
```

### 可选配置

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `template` | string | `treemap` | `sunburst`, `treemap`, `treemap-3d`, `network`, `flamegraph`, `raw-data`, `list`, `markdown` |
| `filename` | string | `stats.{ext}` | 输出文件路径 |
| `open` | boolean | false | 构建后自动打开 |
| `gzipSize` | boolean | false | 包含 gzip 体积 |
| `brotliSize` | boolean | false | 包含 Brotli 体积 |
| `emitFile` | boolean | false | 使用 Rollup emitFile（SvelteKit 等多构建场景） |

### 使用流程

```bash
cd frontend && npm run build
# 生成 dist/stats.html
npx serve dist  # 或直接打开 dist/stats.html
```

### 验证清单（来自 Phase5 计划）

- [ ] PDFViewer、CitationGraphView 不在 main chunk
- [ ] pdfjs-dist worker 未被打入 main bundle
- [ ] 各 vendor chunk 大小合理（建议单 chunk < 500KB）

---

## 3. React 19 `useDeferredValue` vs 自定义 throttle

### 推荐：AI SDK `experimental_throttle` + `useDeferredValue` 组合

Omelette 已采用该组合，符合最佳实践：

```typescript
// frontend/src/hooks/use-chat-stream.ts（当前实现）
const chat = useChat({
  transport,
  experimental_throttle: 80,  // 80ms 节流
});

const deferredMessages = useDeferredValue(chat.messages);
```

### 对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| **AI SDK `experimental_throttle`** | 在数据层节流，减少 React 更新频率；与 useChat 深度集成 | 仅适用于 AI SDK 场景 |
| **`useDeferredValue`** | React 原生、可中断、按设备自适应；不阻塞输入 | 对非渲染类节流无效 |
| **自定义 throttle hook** | 灵活、可控制间隔 | 固定延迟、可能阻塞、需手动实现 |

### React 官方说明（useDeferredValue vs throttle）

> `useDeferredValue` 更适合渲染优化：无固定延迟、可中断、根据设备性能自适应。throttle 仍适用于网络请求等非渲染场景。

### 推荐策略

1. **SSE 流式 Markdown 渲染**：优先使用 AI SDK `experimental_throttle: 50-80` + `useDeferredValue(messages)`
2. **非 AI SDK 的流式场景**（如 WritingPage 综述）：在数据层做 throttle（50–80ms），再配合 `useDeferredValue`
3. **不推荐**：仅用自定义 throttle 控制 React 状态更新，易造成卡顿

---

## 4. pdfjs-dist Worker 在 Vite 7 中的正确配置

### 当前实现（PDFViewer.tsx）

```typescript
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();
```

该方式通过 `import.meta.url` 引用 worker，Vite 会将其作为独立资源处理，**不会**打入 main bundle。

### 潜在问题与解决方案

| 问题 | 原因 | 方案 |
|------|------|------|
| 生产构建 404 | Vite 对 worker 文件 hash 重命名，缓存导致旧引用 | 将 worker 复制到 `public/` 或使用插件固定路径 |
| 版本不匹配 | pdf.js 与 pdf.worker 版本不一致 | 使用 react-pdf 自带的 pdfjs-dist，保持同版本 |

### 方案 A：复制到 public（推荐，简单稳定）

```bash
# 构建前或 postinstall 脚本
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs frontend/public/
```

```typescript
// PDFViewer.tsx
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
```

### 方案 B：Vite 插件在构建时复制

```typescript
// vite.config.ts
import fs from 'fs'
import path from 'path'

function copyPdfWorkerPlugin() {
  return {
    name: 'copy-pdf-worker',
    apply: 'build',
    closeBundle() {
      const src = path.join(
        path.dirname(require.resolve('pdfjs-dist/package.json')),
        'build',
        'pdf.worker.min.mjs'
      )
      const dest = path.join(__dirname, 'dist', 'pdf.worker.min.mjs')
      fs.copyFileSync(src, dest)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyPdfWorkerPlugin()],
})
```

```typescript
// PDFViewer.tsx - 根据环境选择路径
pdfjs.GlobalWorkerOptions.workerSrc =
  import.meta.env.PROD
    ? '/pdf.worker.min.mjs'
    : new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
```

### 验证

构建后检查 `dist/` 中是否存在 `pdf.worker.min.mjs`，且 main bundle 不包含 worker 代码。

---

## 5. react-pdf v10+ 性能优化

### 5.1 虚拟化渲染大 PDF

当前实现为单页渲染（`<Page pageNumber={currentPage} />`），已避免一次渲染多页。若需「连续滚动」式阅读，应使用虚拟化。

**react-pdf 无内置虚拟化**，可结合 `react-window` 或 `@tanstack/react-virtual`：

```tsx
import { useVirtualizer } from '@tanstack/react-virtual'
import { Document, Page } from 'react-pdf'

function VirtualizedPDFViewer({ url }: { url: string }) {
  const [numPages, setNumPages] = useState(0)
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: numPages,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 1200, // 每页预估高度
    overscan: 2,
  })

  return (
    <Document file={url} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
      <div ref={parentRef} style={{ height: '100vh', overflow: 'auto' }}>
        <div style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => (
            <div key={virtualRow.key} style={virtualRow.style}>
              <Page pageNumber={virtualRow.index + 1} width={600} />
            </div>
          ))}
        </div>
      </div>
    </Document>
  )
}
```

### 5.2 内存管理

- **按需渲染**：只渲染可见页，避免预渲染大量页面
- **卸载时清理**：切换文档时确保 `Document` 卸载，释放 PDF 实例
- **降低 scale**：大文档可适当降低 `scale` 减少 canvas 内存
- **PDF.js 建议**：不要一次渲染 100 页，每页约 3.5MB（96 DPI），100 页约 350MB

### 5.3 可选优化

```tsx
<Page
  pageNumber={currentPage}
  scale={scale}
  renderTextLayer={true}   // 需要文字选择时保留
  renderAnnotationLayer={true}
  loading={/* ... */}
  // 可考虑按需关闭 annotationLayer 以减轻渲染
/>
```

---

## 6. SSE 流式 Markdown 渲染节流（50–80ms）

### 推荐实现

**方案 A：AI SDK 内置（当前已用）**

```typescript
useChat({
  experimental_throttle: 80,  // 50-80ms 均可
})
```

**方案 B：自定义 SSE 消费 + throttle**

```typescript
import { useRef, useState, useCallback } from 'react'

function useThrottledStream(intervalMs: number = 60) {
  const [content, setContent] = useState('')
  const bufferRef = useRef('')
  const rafRef = useRef<number | null>(null)
  const lastEmitRef = useRef(0)

  const flush = useCallback(() => {
    if (bufferRef.current) {
      setContent((prev) => prev + bufferRef.current)
      bufferRef.current = ''
    }
    lastEmitRef.current = performance.now()
    rafRef.current = null
  }, [])

  const append = useCallback(
    (chunk: string) => {
      bufferRef.current += chunk
      const now = performance.now()
      if (rafRef.current === null && now - lastEmitRef.current >= intervalMs) {
        rafRef.current = requestAnimationFrame(flush)
      } else if (rafRef.current === null) {
        rafRef.current = window.setTimeout(() => {
          rafRef.current = requestAnimationFrame(flush)
        }, intervalMs - (now - lastEmitRef.current))
      }
    },
    [intervalMs, flush]
  )

  const flushFinal = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
    }
    flush()
  }, [flush])

  return { content, append, flushFinal }
}
```

**方案 C：基于 `requestAnimationFrame` 的简单节流**

```typescript
function useThrottledValue<T>(value: T, intervalMs: number = 60): T {
  const [throttled, setThrottled] = useState(value)
  const lastUpdate = useRef(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const schedule = () => {
      rafRef.current = requestAnimationFrame(() => {
        setThrottled(value)
        lastUpdate.current = performance.now()
        rafRef.current = null
      })
    }

    const now = performance.now()
    if (now - lastUpdate.current >= intervalMs) {
      schedule()
    } else if (rafRef.current === null) {
      rafRef.current = window.setTimeout(schedule, intervalMs - (now - lastUpdate.current))
    }

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [value, intervalMs])

  return throttled
}
```

### 推荐区间

- **50ms**：更流畅，更新更频繁，低端设备可能略卡
- **80ms**：平衡流畅度与性能（当前 Omelette 使用）
- **100ms+**：明显延迟，不推荐

---

## 7. Lighthouse / Web Vitals 性能指标目标

### Core Web Vitals（2024 起稳定指标）

| 指标 | 含义 | 目标值 | 说明 |
|------|------|--------|------|
| **LCP** | Largest Contentful Paint | ≤ 2.5s | 主要内容加载完成 |
| **INP** | Interaction to Next Paint | ≤ 200ms | 交互响应（替代 FID） |
| **CLS** | Cumulative Layout Shift | ≤ 0.1 | 视觉稳定性 |

### 评估方式

- 以 **75th 百分位** 为达标线（移动端、桌面端分别统计）
- 三个指标均达标才算通过

### 辅助指标

| 指标 | 说明 |
|------|------|
| FCP | First Contentful Paint，首屏首次绘制 |
| TTFB | Time to First Byte，首字节时间 |
| TBT | Total Blocking Time，Lab 环境替代 INP 的代理指标 |

### 使用 web-vitals 库采集

```typescript
// src/main.tsx 或 analytics
import { onCLS, onINP, onLCP } from 'web-vitals'

function sendToAnalytics(metric: { name: string; value: number }) {
  const body = JSON.stringify(metric)
  navigator.sendBeacon?.('/api/analytics/vitals', body) ||
    fetch('/api/analytics/vitals', { body, method: 'POST', keepalive: true })
}

onCLS(sendToAnalytics)
onINP(sendToAnalytics)
onLCP(sendToAnalytics)
```

```bash
npm add web-vitals
```

### Omelette 优化方向

1. **LCP**：首屏减少同步大 chunk，PDF/图组件 lazy 加载
2. **INP**：SSE 节流、`useDeferredValue` 降低主线程阻塞
3. **CLS**：图片/PDF 占位尺寸、避免动态插入导致布局偏移

---

## 参考资料

- [Vite Build Options](https://vite.dev/config/build-options.html)
- [Rolldown Manual Code Splitting](https://rolldown.rs/in-depth/manual-code-splitting)
- [Rolldown codeSplitting API](https://rolldown.rs/reference/OutputOptions.codeSplitting)
- [React useDeferredValue](https://react.dev/reference/react/useDeferredValue)
- [rollup-plugin-visualizer npm](https://www.npmjs.com/package/rollup-plugin-visualizer)
- [Web Vitals](https://web.dev/articles/vitals)
- [PDF.js FAQ - Vite](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)
- [AI SDK useChat - experimental_throttle](https://sdk.vercel.ai/docs/reference/ai-sdk-ui/use-chat)
