---
title: "feat: 知识库检索增强 — 富媒体引用、内容重写与 A2UI 集成"
type: feat
status: active
date: 2026-03-12
version: v0.2.0
origin: docs/brainstorms/2026-03-12-rich-citation-rewrite-brainstorm.md
---

# feat: 知识库检索增强 — 富媒体引用、内容重写与 A2UI 集成

## Enhancement Summary

**深化日期**：2026-03-12
**审查代理**：Python Reviewer、TypeScript Reviewer、Performance Oracle、Architecture Strategist
**研究代理**：Best Practices Researcher、Framework Docs Researcher、SpecFlow Analyzer

### 关键改进（来自深化审查）

1. **Citation 批量查询修正**：示例代码存在 N+1 问题，已修正为 `select(Paper).where(Paper.id.in_(paper_ids))`
2. **asyncio.to_thread 精确使用**：Rewrite API 使用 LangChain `astream`（已异步），**不需要** `asyncio.to_thread()`，仅 LlamaIndex 同步调用需要
3. **流式渲染性能 P0**：`text_delta` 需节流到 50-100ms 或每 5-10 token 批量更新，避免每 token 触发完整 Markdown 重解析
4. **XSS 防护**：excerpt 渲染 **禁止** `dangerouslySetInnerHTML`，改用 `react-markdown` 安全渲染
5. **类型安全**：SSE 事件解析需类型守卫（`isCitation`），禁止 `as unknown as Citation`
6. **Phase 4 范围收缩**：A2UI 组件初期从 7 个收缩为 3 个核心组件（CitationCard、RewriteDiff、StatsDashboard）
7. **connect-python 实际为 Alpha**（非 Beta），Phase 4 启动前需 POC 验证
8. **历史数据迁移**：`snippet` → `excerpt` 需兼容已持久化的 `Message.citations` JSON

### 新发现的风险

- 浏览器端 grpc-web **不支持双向流**，已调整为 server streaming
- `@a2ui/react` NPM 包可能未正式发布，需在 Phase 4 前确认
- remark 插件链顺序可能影响现有 `remarkGfm`/`remarkMath`，Phase 3 需回归测试

---

## 1. Overview

### 1.1 愿景

在现有 Chat Playground 中全面升级知识库检索体验：将简陋的引用列表升级为可展开的富媒体引用卡片，支持原文片段重写与对比，AI 回答中的引用标记变为可交互元素，最终引入 Google A2UI 协议实现 LLM 驱动的动态富媒体 UI 渲染。

### 1.2 当前状态 vs 目标

| 维度 | 现状 | 目标 |
|------|------|------|
| **引用展示** | 简单列表 `[index] title (p.X)`，未展示 excerpt | 可展开卡片：原文片段 + 元数据 + 相关度 badge |
| **原文内容** | 后端返回 `excerpt` 但前端未使用 | 展示原文片段，支持重写与对比 |
| **引用交互** | 无交互 | [1][2] 可 hover 预览、点击跳转、颜色区分 |
| **重写能力** | 无 | 多风格重写（简化/学术/翻译/自定义）+ Diff 对比 |
| **加载动画** | 仅 `●` 打字机光标 | 分阶段动画：检索→骨架屏→渐入→激活 |
| **富媒体** | 仅 Markdown + KaTeX | A2UI 声明式组件：表格、时间线、关系图 |
| **传输协议** | HTTP SSE 单向流 | ConnectRPC 多路复用 + SSE 降级 |

### 1.3 核心价值

- **信息密度提升**：引用卡片展示原文片段，用户无需离开聊天界面即可审阅来源
- **写作辅助**：对原文片段进行多风格重写，加速学术写作
- **溯源可视化**：内联引用标注让信息来源一目了然
- **富媒体表达**：A2UI 让 LLM 不再局限于纯文本，可输出交互式图表和表格
- **性能提升**：并行 LLM 调用减少用户等待时间

### 1.4 前置计划

本计划基于已完成的 `docs/plans/2026-03-11-feat-chat-streaming-citations-plan.md`（聊天系统、流式输出与引用追踪），在其基础上进行增强。

---

## 2. Technical Approach

### 2.1 架构概览

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Frontend (React 19 + Tailwind v4)                                        │
│                                                                          │
│  PlaygroundPage                                                          │
│   ├── MessageBubble (enhanced)                                           │
│   │    ├── MarkdownRenderer ─── InlineCitationTag [1][2]                 │
│   │    │                          └── CitationPopover (hover preview)     │
│   │    ├── CitationCardList                                              │
│   │    │    └── CitationCard (collapsible)                               │
│   │    │         ├── excerpt + metadata + relevance badge                │
│   │    │         └── RewriteButton → RewritePanel (diff view)           │
│   │    ├── A2UISurfaceRenderer (Phase 4)                                 │
│   │    │    └── <Surface> renders custom components                      │
│   │    └── LoadingStages (skeleton → content transition)                 │
│   └── ChatInput (unchanged)                                             │
│                                                                          │
│  A2UI Component Catalog                                                  │
│   ├── CitationCard, ComparisonTable, PaperTimeline                       │
│   ├── RewriteDiff, KnowledgeGraph, StatsDashboard                        │
│   └── ExportPanel                                                        │
│                                                                          │
│  Transport Layer                                                         │
│   ├── SSE (current, default)                                             │
│   └── ConnectRPC (Phase 4, with SSE fallback)                            │
└──────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Backend (FastAPI)                                                         │
│                                                                          │
│  POST /api/v1/chat/stream ─── _stream_chat()                             │
│   ├── SSE events: message_start, citation*, text_delta*, message_end     │
│   ├── citation 增强: + authors, year, doi (from Paper table)             │
│   └── Phase 4: + a2ui_surface event                                      │
│                                                                          │
│  POST /api/v1/chat/rewrite (Phase 2, NEW)                                │
│   ├── Request: { excerpt, style, custom_prompt? }                        │
│   └── Response: SSE stream of rewritten text                             │
│                                                                          │
│  ConnectRPC Service (Phase 4, NEW)                                       │
│   ├── ChatService.StreamChat (server streaming RPC)                      │
│   └── ChatService.Rewrite (unary RPC)                                    │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Implementation Phases

### Phase 1: 丰富引用卡片 + 聊天加载动画美化

**预估工作量**：3-5 天

#### 3.1.1 后端：Citation 数据增强

**文件**：`backend/app/api/v1/chat.py`

当前 citation 事件仅包含 `index`、`paper_id`、`paper_title`、`page_number`、`excerpt`、`relevance_score`。需从 Paper 表补充元数据。

```python
# 批量查询 Paper 避免 N+1（审查修正）
paper_ids = list({
    pid for pid in (src.get("paper_id") for src in all_sources)
    if pid is not None
})

papers_by_id: dict[int, Paper] = {}
if paper_ids:
    result = await db.execute(select(Paper).where(Paper.id.in_(paper_ids)))
    papers_by_id = {p.id: p for p in result.scalars().all()}

for i, src in enumerate(all_sources, 1):
    paper = papers_by_id.get(src.get("paper_id"))
    citation = {
        "index": i,
        "paper_id": src.get("paper_id"),
        "paper_title": src.get("paper_title", ""),
        "page_number": src.get("page_number"),
        "excerpt": src.get("excerpt", ""),
        "relevance_score": src.get("relevance_score", 0),
        "chunk_type": src.get("chunk_type", "text"),
        "authors": paper.authors if paper else None,
        "year": paper.year if paper else None,
        "doi": paper.doi if paper else None,
    }
    citations.append(citation)
    yield _sse("citation", citation)
```

> **审查洞察**：原示例代码存在 N+1 查询问题（每个 source 单独 `db.get`）。上述修正使用 `IN` 查询批量获取所有 Paper，再用 dict 做 O(1) 查找。注意 `paper_ids` 为空时不要执行 `IN ()`，SQLite 可能报错。

**文件变更清单**：
- `backend/app/api/v1/chat.py` — 增强 citation 构建，批量查询 Paper

#### 3.1.2 前端：类型统一与 Citation 扩展

**文件**：`frontend/src/types/chat.ts`

```typescript
export interface Citation {
  index: number;
  paper_id: number;
  paper_title: string;
  chunk_type: string;
  page_number: number;
  relevance_score: number;
  excerpt: string;           // 统一字段名，原 snippet
  authors?: string | null;   // 新增
  year?: number | null;      // 新增
  doi?: string | null;       // 新增
}
```

**迁移**：全局替换 `snippet` → `excerpt`（前端 `Citation` 类型和所有引用处）。

> **审查洞察**：历史 `Message.citations` JSON 列中已持久化的数据仍使用 `snippet` 字段。需要在前端 `isCitation` 类型守卫中兼容两者：优先读取 `excerpt`，不存在时回退到 `snippet`。

**SSE 类型安全（审查补充）**：

```typescript
function isCitation(data: unknown): data is Citation {
  return (
    typeof data === 'object' && data !== null &&
    'index' in data && 'paper_id' in data &&
    ('excerpt' in data || 'snippet' in data)
  );
}
```

禁止使用 `event.data as unknown as Citation` 不安全断言。

**文件变更清单**：
- `frontend/src/types/chat.ts` — `Citation` 类型扩展
- `frontend/src/pages/PlaygroundPage.tsx` — citation 事件处理适配
- `frontend/src/components/playground/MessageBubble.tsx` — 引用渲染重构

#### 3.1.3 前端：CitationCard 组件

**新文件**：`frontend/src/components/playground/CitationCard.tsx`

**设计**：
- 默认折叠状态：序号 badge + 论文标题（截断）+ 页码 + 相关度 badge
- 展开状态：原文片段（`excerpt`）+ 论文元数据（作者/年份/DOI）
- 相关度颜色：`>0.8` 绿色、`>0.5` 黄色、`<=0.5` 灰色
- 使用 Radix `Collapsible` 实现展开/折叠动画
- 卡片底部预留 rewrite 按钮位（第二阶段激活，初始 `disabled`）

**边缘情况处理**：
- `citations.length === 0`：隐藏引用区域
- `excerpt` 超长（>500 字）：折叠展示前 300 字 + "展开全文"按钮
- `excerpt` 含特殊字符（HTML/公式）：使用 `react-markdown` 安全渲染（**禁止 `dangerouslySetInnerHTML`**，存在 XSS 风险）
- 15+ 引用：使用虚拟列表（`@tanstack/react-virtual`）或"显示更多"按钮

```typescript
type CitationColorIndex = 0 | 1 | 2 | 3 | 4 | 5;

interface CitationCardProps {
  citation: Citation;
  colorIndex: CitationColorIndex;  // 约束为 6 色调色板
  isExpanded: boolean;
  onToggle: () => void;
  onRewrite?: (excerpt: string) => void; // Phase 2
}
```

> **审查洞察**：`colorIndex` 应约束为 `0-5`，避免越界。`CitationCardList` 和 `CitationCard` 都应使用 `React.memo()`，`citations` 数组引用需通过 `useMemo` 稳定化，避免父组件 `text_delta` 更新导致整个引用列表重渲染。

**文件变更清单**：
- `frontend/src/components/playground/CitationCard.tsx` — 新建
- `frontend/src/components/playground/CitationCardList.tsx` — 新建，管理展开状态

#### 3.1.4 前端：聊天加载动画美化

**文件**：`frontend/src/components/playground/MessageBubble.tsx`

替换现有的 `animate-pulse` 圆点为分阶段加载动画：

| SSE 阶段 | 触发条件 | 动画效果 |
|----------|---------|---------|
| 等待响应 | `message_start` 之前 | 脉冲搜索图标 + "正在检索文献..." |
| 接收引用 | 首个 `citation` 事件 | 引用卡片骨架屏淡入 |
| 生成文本 | 首个 `text_delta` 事件 | 骨架屏渐出 + 文字渐入 |
| 完成 | `message_end` 事件 | 内容固定 + 引用卡片交互激活 |

使用项目已有的 `framer-motion` + `frontend/src/lib/motion.ts` 中的共享 variants。

**新文件**：`frontend/src/components/playground/MessageLoadingStages.tsx`

```typescript
type LoadingStage = 'searching' | 'citations' | 'generating' | 'complete';
```

**制度知识（来自 docs/solutions/）**：
- `MessageBubble` 必须使用 `React.memo()` 减少流式重渲染（see: codebase-quality-audit）
- 骨架屏使用 `CardSkeleton` 模式替代 spinner（see: comprehensive-ui-polish）
- 动画统一从 `@/lib/motion` 引入（see: comprehensive-ui-polish）

#### 3.1.5 性能优化：流式渲染节流（P0）

> **性能审查发现**：每个 `text_delta` 事件触发 `setMessages` → `MessageBubble` 重渲染 → 完整 Markdown 重解析（remark + rehype），长回答时 CPU 压力极大。

**解决方案**：在 `PlaygroundPage` 中节流 `text_delta` 的 state 更新：

```typescript
// 每 50-100ms 或每 5-10 个 token 批量更新一次
const pendingDelta = useRef('');
const flushTimer = useRef<ReturnType<typeof setTimeout>>();

function handleTextDelta(delta: string) {
  pendingDelta.current += delta;
  if (!flushTimer.current) {
    flushTimer.current = setTimeout(() => {
      setMessages(prev => /* 合并 pendingDelta.current */);
      pendingDelta.current = '';
      flushTimer.current = undefined;
    }, 80); // 80ms 节流
  }
}
```

**文件变更清单**：
- `frontend/src/components/playground/MessageLoadingStages.tsx` — 新建
- `frontend/src/components/playground/MessageBubble.tsx` — 集成加载阶段
- `frontend/src/pages/PlaygroundPage.tsx` — 流式 text_delta 节流

#### 3.1.6 验收标准（Phase 1）

- [x] 引用卡片默认折叠，展示序号、标题、页码、相关度 badge
- [x] 点击展开显示 excerpt 原文 + 作者/年份/DOI 元数据
- [x] 相关度用颜色梯度区分（绿/黄/灰）
- [x] 0 条引用时隐藏引用区域
- [x] 超长 excerpt（>500 字）折叠展示 + 展开按钮
- [x] 加载分阶段动画：检索→骨架屏→文字渐入→完成
- [x] 前后端字段统一为 `excerpt`
- [x] `MessageBubble` 使用 `React.memo()`
- [x] 流式过程中引用卡片随 citation 事件逐个淡入

---

### Phase 2: 片段重写与对比

**预估工作量**：3-4 天

#### 3.2.1 后端：Rewrite API

**新文件**：`backend/app/api/v1/rewrite.py`

**端点**：`POST /api/v1/chat/rewrite`

```python
class RewriteRequest(BaseModel):
    excerpt: str                    # 原文片段
    style: Literal["simplify", "academic", "translate_en", "translate_zh", "custom"]
    custom_prompt: str | None = None
    source_language: str = "auto"   # 翻译时的源语言

class RewriteChunk(BaseModel):
    delta: str                      # 流式增量

# SSE 流式响应
# event: rewrite_delta, data: { delta: "..." }
# event: rewrite_end, data: { full_text: "..." }
```

**重写 Prompt 策略**：
- `simplify`：将学术语言简化为通俗表述，保留核心含义
- `academic`：改写为符合学术规范的表述，保持原意
- `translate_*`：中英互译，保留学术术语
- `custom`：使用用户自定义 prompt

**限制**：
- excerpt 最大长度：2000 字
- 并发限制：每用户同时最多 3 个重写请求
- 超时：30 秒

**审查修正：asyncio.to_thread 使用规则**：

| 调用 | 是否需要 `asyncio.to_thread()` | 原因 |
|------|-------------------------------|------|
| LlamaIndex `retriever.retrieve()` | ✅ 需要 | 同步阻塞 API |
| LangChain `model.astream()` | ❌ 不需要 | 已是异步 |
| Rewrite 的 LLM 调用 | ❌ 不需要 | 使用 `LLMClient.chat_stream` 已异步 |

Rewrite API 直接 `await llm.chat_stream()`，不要包在 `asyncio.to_thread()` 中。

**超时处理**：使用 `asyncio.wait_for` 包裹 LLM 调用，超时 30 秒后发送 `error` 事件。

**限流实现**：单用户本地部署使用全局 `asyncio.Semaphore(3)`；多用户场景引入 `slowapi` 中间件。

**请求校验（审查补充）**：

```python
class RewriteRequest(BaseModel):
    excerpt: str
    style: Literal["simplify", "academic", "translate_en", "translate_zh", "custom"]
    custom_prompt: str | None = None
    source_language: str = "auto"

    @field_validator("excerpt")
    @classmethod
    def excerpt_max_length(cls, v: str) -> str:
        if len(v) > 2000:
            raise ValueError("excerpt must not exceed 2000 characters")
        return v

    @model_validator(mode="after")
    def custom_requires_prompt(self) -> "RewriteRequest":
        if self.style == "custom" and not self.custom_prompt:
            raise ValueError("custom_prompt required when style is custom")
        return self
```

**文件变更清单**：
- `backend/app/api/v1/rewrite.py` — 新建
- `backend/app/main.py` — 注册 rewrite router

#### 3.2.2 前端：RewritePanel 组件

**新文件**：`frontend/src/components/playground/RewritePanel.tsx`

**交互流程**：
1. 用户点击引用卡片上的"重写"按钮
2. 弹出风格选择器（4 个预设 + 自定义输入）
3. 选择后开始 SSE 流式重写
4. 重写结果以 Diff 对比视图展示（左原文 / 右重写）
5. 底部操作栏：复制、插入到编辑区（未来）、关闭

**Diff 库选择**：`react-diff-viewer-continued`（维护活跃，支持 `splitView`，中文友好用 word-level diff）。

```typescript
interface RewritePanelProps {
  originalText: string;
  paperTitle: string;
  onClose: () => void;
  onRewriteComplete?: (rewrittenText: string) => void;
}
```

> **审查洞察**：`rewrite-api.ts` 的 `streamRewrite()` 必须接受 `AbortSignal` 参数。关闭 RewritePanel 时通过 `AbortController.abort()` 中止 SSE 连接，避免后端继续生成。后端在 `StreamingResponse` 生成器中捕获 `asyncio.CancelledError` 以优雅退出。

**边缘情况**：
- 重写失败：Toast 提示 + 重试按钮
- 并发重写：同时只允许 1 个进行中，其余按钮显示 loading
- 网络中断：部分结果保留，显示"已中断"标记

**新依赖**：
- `react-diff-viewer-continued`

**文件变更清单**：
- `frontend/src/components/playground/RewritePanel.tsx` — 新建
- `frontend/src/components/playground/RewriteStyleSelector.tsx` — 新建
- `frontend/src/services/rewrite-api.ts` — 新建（SSE 流式调用）
- `frontend/src/components/playground/CitationCard.tsx` — 激活重写按钮

#### 3.2.3 验收标准（Phase 2）

- [ ] 引用卡片上的"重写"按钮可用
- [ ] 支持 5 种重写风格选择
- [ ] 重写过程流式展示
- [ ] Diff 对比视图正确展示原文与重写的差异
- [ ] 重写结果可一键复制
- [ ] 重写失败有 Toast + 重试
- [ ] 同时只允许 1 个进行中的重写

---

### Phase 3: 内联标注与联动

**预估工作量**：2-3 天

#### 3.3.1 前端：InlineCitationTag 组件

**新文件**：`frontend/src/components/playground/InlineCitationTag.tsx`

通过自定义 `react-markdown` 组件实现 `[1]`、`[2]` 的交互化。

**实现方式**：自定义 `remark` 或 `rehype` 插件解析 `[数字]` 模式，替换为 `<InlineCitationTag>` 组件。

> **审查洞察**：remark 在 MDAST 层操作，rehype 在 HAST 层操作。rehype 插件可能更简单——直接在 HTML AST 中找 `[N]` 文本节点并替换为 `<span data-citation="N">`。此外，remark 插件链顺序可能影响 `remarkGfm` 和 `remarkMath`，需做回归测试。建议先尝试 rehype 方案。

```typescript
interface InlineCitationTagProps {
  citationIndex: number;
  citation?: Citation;
  color: string;
  onHover: (index: number) => void;
  onClick: (index: number) => void;
}
```

**交互**：
- Hover：Radix `HoverCard` 弹出预览（论文标题 + excerpt 前 150 字）
- Click：平滑滚动到对应 `CitationCard`，高亮闪烁
- 颜色：按 citation index 映射到 6 色调色板，同一来源颜色一致

**边缘情况**：
- 引用序号越界（如 `[3]` 但只有 2 条引用）：渲染为普通灰色文本 `[3]`，不可交互
- 流式过程中：引用标签随 citation 事件到达后才激活（之前显示为普通文本）

**Remark 插件**：`frontend/src/lib/remark-citation.ts`

```typescript
// remark 插件：将 [N] 模式转换为自定义 MDAST 节点
// 然后在 react-markdown 的 components 中渲染为 InlineCitationTag
```

**颜色调色板**（6 色循环，色盲友好）：

```typescript
const CITATION_COLORS = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#06B6D4', // cyan
];
```

**文件变更清单**：
- `frontend/src/components/playground/InlineCitationTag.tsx` — 新建
- `frontend/src/components/playground/CitationPopover.tsx` — 新建
- `frontend/src/lib/remark-citation.ts` — 新建 remark 插件
- `frontend/src/components/playground/MessageBubble.tsx` — 集成 remark 插件和颜色映射

#### 3.3.2 验收标准（Phase 3）

- [ ] AI 回答中 `[1]`、`[2]` 渲染为彩色可交互标签
- [ ] Hover 标签弹出论文标题 + excerpt 预览
- [ ] 点击标签滚动到对应引用卡片并高亮
- [ ] 不同来源用不同颜色区分
- [ ] 越界引用序号显示为灰色不可交互文本
- [ ] 流式过程中标签随 citation 到达逐步激活

---

### Phase 4: A2UI 富媒体渲染 + 并行 LLM 优化

**预估工作量**：5-7 天

> **重要发现**：浏览器端 grpc-web **不支持双向流**，只支持 unary 和 server streaming。因此调整策略：使用 ConnectRPC server streaming（兼容浏览器），而非头脑风暴中的双向流方案（see brainstorm: docs/brainstorms/2026-03-12-rich-citation-rewrite-brainstorm.md）。

#### 3.4.1 A2UI 基础设施搭建

**新依赖**：`@a2ui/react`、`@a2ui/web-lib`

**核心组件**：

| 组件 | 职责 |
|------|------|
| `A2UIProvider` | 顶层 Provider，管理 MessageProcessor 实例 |
| `A2UISurface` | 渲染 A2UI surface 的容器 |
| `OmeletteCatalog` | 自定义组件目录注册 |

**自定义组件目录**（审查后收缩为分批交付）：

**Phase 4A 最小集（3 个核心组件）**：

| 组件 | 用途 | 触发场景 | 复杂度 |
|------|------|---------|--------|
| `CitationCard` | 展开式引用卡片 | 默认引用展示 | 低（Phase 1 已有） |
| `RewriteDiff` | 重写对比视图 | 重写操作结果 | 低（Phase 2 已有） |
| `StatsDashboard` | 统计概览面板 | "分析知识库概况" | 中 |

**Phase 4B 扩展集（4 个增强组件，后续迭代）**：

| 组件 | 用途 | 触发场景 | 复杂度 |
|------|------|---------|--------|
| `ComparisonTable` | 交互式论文对比表格 | "比较这几篇论文" | 高 |
| `PaperTimeline` | 可缩放研究时间线 | "展示研究发展历程" | 高 |
| `KnowledgeGraph` | 论文关系网络图 | "展示论文引用关系" | 高 |
| `ExportPanel` | 导出操作面板 | "导出这些引用" | 低 |

> **架构审查建议**：7 个组件一次性交付偏多，且 ComparisonTable/PaperTimeline/KnowledgeGraph 需要额外图表库。建议先交付最小集验证 A2UI 可行性和 LLM 生成 JSON 的稳定性，再逐步扩展。

**SSE 事件扩展**：

```
event: a2ui_surface
data: { "surface_id": "s1", "messages": [...A2UI messages...] }
```

**降级机制**：A2UI JSON 解析失败或 schema 不匹配时，回退到 Markdown + 普通引用列表。

**文件变更清单**：
- `frontend/src/components/a2ui/A2UIProvider.tsx` — 新建
- `frontend/src/components/a2ui/A2UISurface.tsx` — 新建
- `frontend/src/components/a2ui/catalog/` — 7 个组件目录
- `frontend/src/components/playground/MessageBubble.tsx` — A2UI 渲染分支
- `backend/app/api/v1/chat.py` — 新增 `a2ui_surface` 事件

#### 3.4.2 ConnectRPC 并行 LLM（调整后方案）

**关键调整**：由于浏览器不支持 gRPC 双向流，改用以下方案：

| 层级 | 技术选择 | 说明 |
|------|---------|------|
| 传输协议 | ConnectRPC（Connect 协议） | 兼容 HTTP/1.1 和 HTTP/2，无需 Envoy 代理 |
| 后端 | `connect-python`（或 `grpcio` + grpc-web） | FastAPI 同端口共存，路径分离 |
| 前端 | `@connectrpc/connect-web` | 原生支持 server streaming |
| 流类型 | **Server Streaming**（非双向流） | 浏览器兼容的流式响应 |
| 并行化 | 后端 `asyncio.gather()` | 多知识库检索 + LLM 生成并行 |
| 降级 | SSE fallback | ConnectRPC 不可用时回退到现有 SSE |

**Proto 定义**：`proto/chat.proto`

```protobuf
syntax = "proto3";
package omelette.chat.v1;

service ChatService {
  rpc StreamChat(ChatRequest) returns (stream ChatEvent);
  rpc Rewrite(RewriteRequest) returns (stream RewriteEvent);
}

message ChatRequest {
  optional int64 conversation_id = 1;
  repeated int64 knowledge_base_ids = 2;
  string message = 3;
  string model = 4;
  string tool_mode = 5;
}

message ChatEvent {
  oneof event {
    MessageStart message_start = 1;
    CitationEvent citation = 2;
    TextDelta text_delta = 3;
    MessageEnd message_end = 4;
    A2UISurface a2ui_surface = 5;
    ErrorEvent error = 6;
  }
}
```

**架构**：

```
Browser ──ConnectRPC──→ FastAPI (same port, /connect/* path)
                         ├── ChatService (server streaming)
                         └── asyncio.gather() parallel RAG + LLM

Browser ──SSE──→ FastAPI (fallback, /api/v1/chat/stream)
```

**新依赖**：
- 后端：`connectrpc`（Python）或 `grpcio` + `grpcio-tools`
- 前端：`@connectrpc/connect`、`@connectrpc/connect-web`、`@bufbuild/protobuf`

**文件变更清单**：
- `proto/chat.proto` — 新建 proto 定义
- `backend/app/grpc/chat_service.py` — 新建 ConnectRPC 服务实现
- `backend/app/main.py` — 挂载 ConnectRPC 路由
- `frontend/src/services/connect-client.ts` — 新建 ConnectRPC 客户端
- `frontend/src/services/chat-api.ts` — 添加 ConnectRPC 传输 + SSE 降级逻辑

#### 3.4.3 验收标准（Phase 4）

- [ ] A2UI 渲染器正常工作，能渲染至少 3 种自定义组件
- [ ] LLM 可根据查询意图动态输出 A2UI JSON 或 Markdown
- [ ] A2UI 解析失败时自动降级为 Markdown
- [ ] ConnectRPC server streaming 正常工作
- [ ] 多知识库检索并行化（`asyncio.gather()`）
- [ ] ConnectRPC 不可用时自动降级为 SSE
- [ ] 多流合并：检索 + 生成并行，前端正确渲染

---

## 4. System-Wide Impact

### 4.1 Interaction Graph

```
用户发送消息
  → PlaygroundPage.handleSend()
    → streamChat() / ConnectRPC.StreamChat()
      → _stream_chat() (backend)
        → RAGService.query() [asyncio.to_thread]
          → ChromaDB retriever.retrieve()
          → Paper table lookup (批量查询)
        → LLM.generate() [async]
          → SSE events: citation*, text_delta*, message_end
          → Optional: a2ui_surface events
  → MessageBubble renders
    → CitationCardList renders citations
    → InlineCitationTag renders [N] markers
    → A2UISurface renders rich components (Phase 4)

用户点击重写
  → CitationCard.onRewrite()
    → RewritePanel opens
      → rewriteApi.streamRewrite()
        → POST /api/v1/chat/rewrite (SSE)
          → LLM.astream() [async, 无需 to_thread]
      → RewritePanel renders diff view
```

### 4.2 Error Propagation

| 错误源 | 错误类型 | 处理方式 |
|--------|---------|---------|
| RAG 检索失败 | 无结果/超时 | 返回空 citations，正常生成回答 |
| LLM 生成失败 | API 错误/超时 | SSE `error` 事件 → 前端 Toast |
| Paper 查询失败 | DB 错误 | citation 中 authors/year/doi 为 null，不影响展示 |
| 重写失败 | LLM 错误/限流 | Toast 提示 + 重试按钮 |
| A2UI 解析失败 | Schema 不匹配 | 降级为 Markdown 渲染 |
| ConnectRPC 失败 | 网络/服务错误 | 自动降级为 SSE |
| SSE body null | 流连接失败 | SSE body null 检查（see: codebase-quality-audit） |

### 4.3 State Lifecycle Risks

- **重写中断**：用户关闭 RewritePanel 时需 abort SSE 连接，避免后端继续生成
- **多 tab 场景**：ConnectRPC 连接需 per-tab 管理，避免连接泄漏
- **对话历史恢复**：citations（含 excerpt、元数据）已持久化在 `Message.citations` JSON 列中，恢复时直接读取

### 4.4 API Surface Parity

| 接口 | 需要更新 |
|------|---------|
| `POST /api/v1/chat/stream` | 增强 citation 字段（authors/year/doi/chunk_type） |
| `POST /api/v1/chat/rewrite` | 新增（Phase 2） |
| `ConnectRPC ChatService` | 新增（Phase 4） |
| MCP `query_knowledge_base` tool | 同步增强 citation 字段 |

---

## 5. Alternative Approaches Considered

| 方案 | 优点 | 缺点 | 决策 |
|------|------|------|------|
| 独立工作面板 | 空间充裕 | 开发量大，偏离聊天范式 | 否决 |
| 新工具模式 | 架构一致 | 第一步过重 | 否决 |
| gRPC 双向流 | 全双工通信 | **浏览器不支持** | 否决，改用 server streaming |
| Vercel AI SDK | Generative UI 成熟 | 绑定 Next.js/Server Actions | 否决，使用 A2UI |
| asyncio 过渡方案 | 改动小 | 延迟优化有限 | 否决，直接上 ConnectRPC |

---

## 6. Dependencies & Prerequisites

### 6.1 新增前端依赖

```json
{
  "@a2ui/react": "^0.8.0",
  "@a2ui/web-lib": "^0.8.0",
  "@connectrpc/connect": "latest",
  "@connectrpc/connect-web": "latest",
  "@bufbuild/protobuf": "latest",
  "react-diff-viewer-continued": "latest"
}
```

### 6.2 新增后端依赖

```toml
[project.optional-dependencies]
grpc = [
  "grpcio>=1.60",
  "grpcio-tools>=1.60",
  # 或 connectrpc (Python)
]
```

### 6.3 前置条件

- [ ] 确认 `@a2ui/react` 与 React 19 的兼容性（v0.8 文档标注 React 稳定）
- [ ] 确认 `@a2ui/react` 已发布到 NPM（文档提示可能尚未发布）
- [ ] 确认 `connect-python` 的稳定性（**实际为 Alpha**，非 Beta，需 POC 验证与 FastAPI 的集成）

---

## 7. Risk Analysis & Mitigation

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|---------|
| `@a2ui/react` 未发布或不兼容 React 19 | 中 | 高 | 先用原生 React 组件实现 CitationCard，A2UI 作为 Phase 4 增量 |
| `connect-python` **Alpha** 版有 breaking changes | 中 | 中 | 保留 SSE 作为主通道，ConnectRPC 作为可选增强，Phase 4 前做 POC |
| LLM 无法稳定生成 A2UI JSON | 高 | 中 | 后端做 schema 验证 + 自动降级为 Markdown |
| 大量引用（20+）渲染性能 | 中 | 中 | 默认显示前 5 条 + "显示更多"，或虚拟列表 |
| 中文 Diff 显示不佳 | 低 | 低 | 使用 `diffWords` 而非 `diffLines`，必要时切换库 |

---

## 8. Success Metrics

| 指标 | 目标 | 测量方式 |
|------|------|---------|
| 引用信息完整度 | 100% citation 展示 excerpt + 元数据 | 手动验证 |
| 加载体验 | TTFB < 500ms，骨架屏 < 1s 出现 | Performance API |
| 重写响应时间 | TTFT < 2s | API 监控 |
| A2UI 渲染成功率 | > 90% | 降级计数 |
| 用户等待时间 | 并行后降低 30%+ | 端到端时间对比 |

---

## 9. Acceptance Criteria (Overall)

### Functional Requirements

- [ ] 引用卡片展示 excerpt、元数据、相关度
- [ ] 原文片段支持 5 种风格重写 + Diff 对比
- [ ] 正文引用标记可交互：hover 预览、点击跳转
- [ ] A2UI 可渲染自定义组件（至少 3 种）
- [ ] ConnectRPC server streaming 正常工作
- [ ] 所有新功能支持 SSE 降级

### Non-Functional Requirements

- [ ] 流式渲染无卡顿（60fps）
- [ ] 移动端响应式布局正常
- [ ] 键盘可完整操作引用卡片和重写面板
- [ ] 引用相关 aria 属性完备
- [ ] 相关度颜色提供非颜色视觉提示（图标/文字）

### Quality Gates

- [ ] 前后端 TypeScript/Python 类型安全
- [ ] 新组件有 Storybook 或 playground 展示
- [ ] SSE body null 检查就位
- [ ] `MessageBubble` 使用 `memo()`
- [ ] LlamaIndex 同步调用用 `asyncio.to_thread()` 包装

---

## 10. Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-12-rich-citation-rewrite-brainstorm.md](docs/brainstorms/2026-03-12-rich-citation-rewrite-brainstorm.md) — 关键决策：渐进增强现有聊天界面、A2UI 第一步预埋、gRPC（调整为 ConnectRPC server streaming）、7 组件丰富集

### Internal References

- 前置计划：`docs/plans/2026-03-11-feat-chat-streaming-citations-plan.md`（已完成）
- 引用渲染：`frontend/src/components/playground/MessageBubble.tsx:64-84`
- SSE 解析：`frontend/src/services/chat-api.ts:27-78`
- Citation 类型：`frontend/src/types/chat.ts:22-31`
- Citation 构建：`backend/app/api/v1/chat.py:95-107`
- RAG 查询：`backend/app/services/rag_service.py:202-211`
- 共享动画：`frontend/src/lib/motion.ts`

### Institutional Learnings (docs/solutions/)

- `docs/solutions/performance-issues/blocking-sync-calls-asyncio-to-thread.md` — LlamaIndex 同步调用必须 `asyncio.to_thread()`
- `docs/solutions/compound-issues/codebase-quality-audit-4-batch-remediation.md` — SSE body null 检查、MessageBubble memo()、N+1 查询优化
- `docs/solutions/ui-bugs/comprehensive-ui-polish.md` — 骨架屏替代 spinner、动画从 motion.ts 引入

### External References

- A2UI 协议：https://a2ui.org/ | https://github.com/google/A2UI
- ConnectRPC：https://connectrpc.com/docs/web/getting-started
- react-diff-viewer-continued：https://www.npmjs.com/package/react-diff-viewer-continued
- framer-motion v12：https://motion.dev/docs/react-quick-start
