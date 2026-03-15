# Phase 4 技术参考 — 框架/库文档与最佳实践 (2025-2026)

本文档为 Omelette Phase 4 创新功能实现提供技术参考，涵盖 react-pdf、d3-force、react-resizable-panels、Semantic Scholar API 的安装配置、关键 API、兼容性注意事项及代码示例。

---

## 1. react-pdf (wojtekmaj/react-pdf)

### 推荐版本

- **react-pdf**: `^10.4.1`
- **pdfjs-dist**: 与 react-pdf 配套版本（通常由 react-pdf 依赖）

### 安装与配置

```bash
npm install react-pdf pdfjs-dist
```

### Vite 环境下 pdfjs-dist Worker 配置

**关键**：必须在渲染 PDF 的同一模块中配置 worker，否则会报错。

```tsx
// 在 PDFViewer 或使用 react-pdf 的入口模块顶部
import { pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
```

### 文本层与选择

- 必须导入 TextLayer CSS 以支持文本选择和搜索：

```tsx
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
```

- `renderTextLayer={true}` 启用文本层（默认 true）
- `onRenderTextLayerSuccess` 文本层渲染完成回调

**文本选择 API**：react-pdf 本身不提供 `onTextSelect`。获取选中文本需结合浏览器 API：

```tsx
// 在 Document 或 Page 的容器上监听
<div onMouseUp={() => {
  const selection = document.getSelection();
  if (selection) {
    const text = selection.toString();
    if (text) onTextSelect?.(text, currentPageNumber);
  }
}}>
  <Document file={url}>
    <Page pageNumber={currentPage} renderTextLayer={true} />
  </Document>
</div>
```

### 虚拟化渲染

react-pdf **无内置虚拟化**。PDF.js 建议单次渲染不超过 ~25 页。大 PDF 推荐：

1. **Virtuoso / react-virtualized**：仅渲染可见页，用 `Page` 的 `pageNumber` 按需渲染
2. **渐进渲染**：用 `onRenderSuccess` 逐页渲染，控制内存
3. **分页导航**：仅渲染当前页 + 前后各 1–2 页

```tsx
// 虚拟化示例：仅渲染可见页
import { useInView } from 'react-intersection-observer'; // 或类似

function VirtualizedPage({ pageNumber, width }) {
  const { ref, inView } = useInView({ threshold: 0.1 });
  return (
    <div ref={ref} style={{ minHeight: 1200 }}>
      {inView && (
        <Page pageNumber={pageNumber} width={width} />
      )}
    </div>
  );
}
```

### 与项目技术栈兼容性

| 技术 | 兼容性 |
|------|--------|
| React 18/19 | ✅ 支持 |
| TypeScript | ✅ 内置类型 |
| Vite | ✅ 需配置 worker（见上） |
| TailwindCSS | ✅ 可自定义 className |

### 代码示例（PDFViewer 骨架）

```tsx
import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PDFViewerProps {
  url: string;
  onTextSelect?: (text: string, pageNumber: number) => void;
}

export function PDFViewer({ url, onTextSelect }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);

  return (
    <div
      onMouseUp={() => {
        const sel = document.getSelection();
        if (sel?.toString()) onTextSelect?.(sel.toString(), pageNumber);
      }}
    >
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        loading={<div>Loading PDF...</div>}
      >
        <Page
          pageNumber={pageNumber}
          width={600}
          renderTextLayer={true}
          renderAnnotationLayer={true}
        />
      </Document>
      <nav>
        <button disabled={pageNumber <= 1} onClick={() => setPageNumber((p) => p - 1)}>Prev</button>
        <span>Page {pageNumber} of {numPages}</span>
        <button disabled={pageNumber >= numPages} onClick={() => setPageNumber((p) => p + 1)}>Next</button>
      </nav>
    </div>
  );
}
```

---

## 2. d3-force (D3.js Force Simulation)

### 推荐版本

- **d3**: `^7.9.0`（含 d3-force、d3-selection、d3-drag 等）
- **@types/d3**: `^7.4.3`（若需类型）

```bash
npm install d3
npm install -D @types/d3
```

### React 18 集成方式

使用 `useRef` 持有 simulation 和 SVG 引用，在 `useEffect` 中初始化并清理：

```tsx
import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

function ForceGraph({ nodes, links, width, height }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);

  useEffect(() => {
    if (!svgRef.current || !nodes.length) return;

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(20))
      .on('tick', ticked);

    simulationRef.current = simulation;

    function ticked() {
      d3.select(svgRef.current)
        .selectAll('.link')
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);
      d3.select(svgRef.current)
        .selectAll('.node')
        .attr('cx', (d) => d.x)
        .attr('cy', (d) => d.y);
    }

    return () => {
      simulation.stop();
      simulationRef.current = null;
    };
  }, [nodes, links, width, height]);

  return (
    <svg ref={svgRef} width={width} height={height}>
      <g className="links">...</g>
      <g className="nodes">...</g>
    </svg>
  );
}
```

### forceSimulation 关键参数

| 方法/力 | 说明 |
|---------|------|
| `d3.forceSimulation(nodes)` | 创建仿真，传入节点数组 |
| `simulation.force(name, force)` | 添加/替换力 |
| `simulation.alpha(alpha)` | 当前 alpha（0–1），越大越活跃 |
| `simulation.alphaDecay(decay)` | alpha 衰减率，默认 0.0228 |
| `simulation.alphaTarget(target)` | 目标 alpha，用于“加热” |
| `simulation.velocityDecay(decay)` | 速度衰减，默认 0.4 |
| `d3.forceLink(links).id(fn).distance(d)` | 连接力，拉近相连节点 |
| `d3.forceManyBody().strength(s)` | 斥力（负）或引力（正） |
| `d3.forceCenter(x, y)` | 将图居中 |
| `d3.forceCollide().radius(r)` | 碰撞检测，防止重叠 |
| `d3.forceX(x).strength(s)` | X 方向定位力 |
| `d3.forceY(y).strength(s)` | Y 方向定位力 |

### 性能优化

1. **Barnes–Hut theta**：`forceManyBody().theta(0.5)` 降低计算量
2. **限制节点数**：50–200 节点为宜，超出时采样或分页
3. **alphaMin**：`simulation.alphaMin(0.001)` 提前停止
4. **拖拽时加热**：`simulation.alphaTarget(0.3).restart()`，松手后 `alphaTarget(0)`
5. **固定节点**：`node.fx = x; node.fy = y` 固定位置，减少计算

### TypeScript 类型

```ts
interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  title?: string;
  year?: number;
  citation_count?: number;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  type?: 'cites' | 'cited_by';
}
```

### 与项目技术栈兼容性

| 技术 | 兼容性 |
|------|--------|
| React 18 | ✅ useRef + useEffect 模式 |
| TypeScript | ✅ @types/d3 |
| Vite | ✅ 无特殊配置 |
| TailwindCSS | ✅ 可配合 className |

---

## 3. react-resizable-panels

### 推荐版本

- **react-resizable-panels**: `^4.7.3`

```bash
npm install react-resizable-panels
```

### 组件与基本用法

当前 API 使用 **Group**、**Panel**、**Separator**（非 PanelGroup/PanelResizeHandle）：

```tsx
import { Group, Panel, Separator } from 'react-resizable-panels';

function PDFReaderLayout() {
  return (
    <Group orientation="horizontal" style={{ height: '100vh' }}>
      <Panel defaultSize={70} minSize={40} maxSize={90}>
        <PDFViewer url={url} />
      </Panel>
      <Separator />
      <Panel defaultSize={30} minSize={20} collapsible>
        <SelectionQA selectedText={selectedText} />
      </Panel>
    </Group>
  );
}
```

### 关键 Props

**Group**

- `orientation`: `"horizontal"` | `"vertical"`
- `defaultLayout`: 持久化布局（百分比数组）
- `onLayoutChanged`: 布局变化后回调
- `disabled`: 禁用拖拽

**Panel**

- `defaultSize`: 默认占比（数字或 `"50%"`）
- `minSize` / `maxSize`: 最小/最大占比
- `collapsible`: 是否可折叠
- `onResize`: 尺寸变化回调
- `panelRef`:  imperative API（`collapse()`, `expand()`, `resize()`）

**Separator**

- `className` / `style`: 自定义样式
- `disabled`: 禁用该分隔条

### 与 TailwindCSS 集成

- `className` 和 `style` 可自由使用
- 注意：Group 的 `display`、`flex-direction`、`overflow` 不可覆盖
- 可用 `data-separator` 选择器自定义 Separator 悬停样式：

```css
[data-separator]:hover {
  background-color: rgb(59 130 246);
}
```

### 响应式布局

- 使用 `defaultLayout` + `onLayoutChanged` 持久化到 localStorage
- `groupResizeBehavior`: `preserve-relative-size`（默认）或 `preserve-pixel-size`

```tsx
const [layout, setLayout] = useState<number[] | undefined>();

<Group
  defaultLayout={layout}
  onLayoutChanged={(sizes) => setLayout(sizes)}
>
  ...
</Group>
```

### 与项目技术栈兼容性

| 技术 | 兼容性 |
|------|--------|
| React 18/19 | ✅ peerDependencies 支持 |
| TypeScript | ✅ 内置类型 |
| Vite | ✅ 无特殊配置 |
| TailwindCSS v4 | ✅ 可配合使用 |

---

## 4. Semantic Scholar API

### 基础 URL

- **Academic Graph API**: `https://api.semanticscholar.org/graph/v1`

### Citations 与 References 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/paper/{paper_id}/citations` | **GET** | 引用该论文的论文列表（被引） |
| `/paper/{paper_id}/references` | **GET** | 该论文引用的论文列表（参考文献） |

**paper_id 格式**：S2 paperId（40 字符 hex）或 `DOI:{doi}`

> 注：部分文档提到 POST 用于分页/大批量，常规场景 GET + limit/offset 即可。

### 查询参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `fields` | string | 逗号分隔字段，如 `title,year,citationCount,authors,externalIds` |
| `limit` | int | 每页数量，默认 100 |
| `offset` | int | 分页偏移 |

### 常用 fields

- `paperId`, `title`, `year`, `citationCount`, `referenceCount`
- `authors`, `externalIds`（含 DOI）
- `isOpenAccess`, `openAccessPdf`
- `abstract`, `url`

### 速率限制与认证

| 类型 | 限制 |
|------|------|
| 无 API Key | 共享限速，约 1 req/s |
| 有 API Key | 约 10 req/s（可申请更高） |

**认证**：请求头 `x-api-key: YOUR_API_KEY`

### 请求示例

```python
# Python
import httpx

BASE = "https://api.semanticscholar.org/graph/v1"
paper_id = "649def34f8be52c8b66281af98ae884c09aef38b"
headers = {"x-api-key": "YOUR_API_KEY"}  # 可选

# Citations
resp = httpx.get(
    f"{BASE}/paper/{paper_id}/citations",
    params={"fields": "title,year,citationCount,authors,externalIds", "limit": 20},
    headers=headers,
)
citations = resp.json().get("data", [])

# References
resp = httpx.get(
    f"{BASE}/paper/{paper_id}/references",
    params={"fields": "title,year,citationCount,authors,externalIds", "limit": 20},
    headers=headers,
)
references = resp.json().get("data", [])
```

### 返回格式

```json
{
  "data": [
    {
      "paperId": "...",
      "title": "...",
      "year": 2018,
      "citationCount": 365,
      "authors": [{"authorId": "...", "name": "..."}],
      "externalIds": {"DOI": "10.1234/..."}
    }
  ],
  "next": 20
}
```

### 限制与注意事项

- 单次最多返回 9,999 条
- 单次响应最大约 10 MB
- 建议使用 `fields` 只请求必要字段以提升速度
- 429 时需指数退避重试

---

## 依赖汇总（Phase 4 前端）

```json
{
  "dependencies": {
    "react-pdf": "^10.4.1",
    "pdfjs-dist": "^4.x",
    "d3": "^7.9.0",
    "react-resizable-panels": "^4.7.3"
  },
  "devDependencies": {
    "@types/d3": "^7.4.3"
  }
}
```

---

## 参考资料

- [react-pdf README](https://github.com/wojtekmaj/react-pdf)
- [D3 Force API](https://github.com/d3/d3-force)
- [react-resizable-panels](https://react-resizable-panels.vercel.app/)
- [Semantic Scholar API](https://api.semanticscholar.org/api-docs/)
- [Semantic Scholar API Tutorial](https://semanticscholar.org/product/api/tutorial)
