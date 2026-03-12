---
title: "feat: UX 体验与质量全面优化"
type: feat
status: completed
date: 2026-03-12
origin: docs/brainstorms/2026-03-12-ux-quality-improvements-brainstorm.md
---

# UX 体验与质量全面优化

## Overview

对 Omelette 科研文献助手进行全面体验优化，修复 12+ 个已知问题。涵盖 UI 修复（文件名溢出、i18n、布局）、交互改进（聊天框固定、历史侧边栏、工具模式下拉）、后端质量提升（OCR 升级 marker-pdf、引用 LLM 自动清洗、真实 LLM 切换、思维链可视化）。

## Problem Statement / Motivation

当前产品处于"能用"阶段，但多处体验问题影响日常使用：聊天框被内容推出视口、文件名溢出、页面切换闪烁、OCR 文字质量差、引用文本不完整且难以阅读、工具模式占据过多空间。这些问题叠加起来严重影响用户对产品质量的信任感。

## Proposed Solution

分 4 个阶段实施，从快速修复到深层质量提升逐步推进。每个阶段独立可验证。

## Technical Approach

### Phase 1: 快速 UI 修复（~2h）

全部是前端修改，无后端改动。

#### 1.1 PDF 上传文件名溢出

**文件**: `frontend/src/components/knowledge-base/AddPaperDialog.tsx`

**改动**:
- 给 `<ul>` 添加 `overflow-hidden` class
- 给 `<li>` 确保 `overflow-hidden` + `min-w-0`
- 文件名 `<span>` 已有 `truncate`，确认 flex 父级链条完整

```tsx
<ul className="max-h-40 space-y-1 overflow-y-auto overflow-hidden rounded-md border border-border p-2 pr-3">
  {files.map((file, i) => (
    <li className="flex items-center gap-2 overflow-hidden rounded px-2 py-1.5 text-sm hover:bg-muted/50">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate" title={file.name}>
        {file.name}
      </span>
      <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
        {formatSize(file.size)}
      </span>
      ...
    </li>
  ))}
</ul>
```

#### 1.2 返回按钮简化

**文件**: `frontend/src/pages/ProjectDetail.tsx`

**改动**: 将 "← 返回知识库" 改为图标按钮 + Tooltip

```tsx
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

<Link to="/knowledge-bases">
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon" className="mb-2 size-8">
        <ArrowLeft className="size-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent side="right">
      {t('project.backToKB')}
    </TooltipContent>
  </Tooltip>
</Link>
```

> 注：有意简化为仅图标 + Tooltip，不做面包屑。知识库名称已在下方单独显示。

#### 1.3 Citation 作者 `[object Object]` 修复

**文件**: `frontend/src/components/playground/CitationCard.tsx`

**改动**: `formatAuthors` 函数增加对象数组处理

```tsx
function formatAuthors(authors: string[] | string | null | undefined): string {
  if (!authors) return "";
  if (typeof authors === "string") return authors;
  const names = authors.map((a) =>
    typeof a === "object" && a !== null && "name" in a ? (a as { name: string }).name : String(a)
  );
  if (names.length <= 2) return names.join(", ");
  return `${names[0]} et al.`;
}
```

#### 1.4 i18n 硬编码文字清理

**文件**: `frontend/src/i18n/locales/zh.json`, `en.json` + 多个组件

**需要迁移的 defaultValue**:

| 组件 | Key | 中文 | 英文 |
|------|-----|------|------|
| CitationCard | `common.collapse` | 收起 | Collapse |
| CitationCard | `common.expandAll` | 展开全文 | Show more |
| RewritePanel | `rewrite.error` | 重写失败 | Rewrite failed |
| RewritePanel | `rewrite.streaming` | 正在重写... | Rewriting... |
| RewritePanel | `rewrite.retry` | 重试 | Retry |
| MessageLoadingStages | `playground.loading.searching` | 正在检索文献... | Searching literature... |
| MessageLoadingStages | `playground.loading.citations` | 已找到相关文献 | Found relevant sources |
| MessageLoadingStages | `playground.loading.generating` | 正在生成回答... | Generating response... |
| PlaygroundPage | `playground.stop` | 停止生成 | Stop generating |
| PlaygroundPage | `history.conversationNotFound` | 对话未找到 | Conversation not found |
| PlaygroundPage | `history.conversationNotFoundDesc` | 该对话可能已被删除 | This conversation may have been deleted |
| PlaygroundPage | `playground.attach` | 附加文件 | Attach file |
| PlaygroundPage | `playground.send` | 发送 | Send |

**操作**: 将以上 key-value 添加到 `zh.json` 和 `en.json`，然后从组件中删除 `defaultValue`。

### Phase 2: 布局与交互改进（~4h）

#### 2.1 Playground 聊天框固定底部

**文件**: `frontend/src/components/layout/AppShell.tsx`, `frontend/src/pages/PlaygroundPage.tsx`

**根因分析**: `AppShell` 的 `<main>` 设置了 `overflow-y-auto`，这使得整个 main 区域成为滚动容器。但 PlaygroundPage 需要自己的 flex 布局（header + scrollable messages + fixed input）。当 main 也能滚动时，PlaygroundPage 的 `h-full` 会被撑开，输入框被推出视口。

**方案**:

1. **AppShell**: 在 Playground 路由下，`<main>` 需要 `overflow-hidden` 而非 `overflow-y-auto`。最简方案：给 PlaygroundPage 自身设置 `overflow-hidden`，覆盖 main 的滚动。

2. **PlaygroundPage**: 外层 div 添加 `min-h-0 overflow-hidden`：

```tsx
// PlaygroundPage.tsx — 外层 div
<div className="flex h-full min-h-0 flex-col overflow-hidden">
```

3. **ScrollArea**: 确保 min-h-0 使 flex-1 正确收缩：

```tsx
// Messages area
<ScrollArea className="min-h-0 flex-1">
```

**关键**: PlaygroundPage 的 `overflow-hidden` 会阻止 main 的 `overflow-y-auto` 向下传播，确保只有内部 ScrollArea 滚动。其他页面不受影响。

**验证**: 在消息多于一屏时，输入框应始终可见在视口底部。

#### 2.2 工具模式下拉选择器

**文件**: `frontend/src/components/playground/ToolModeSelector.tsx`

**改动**: 从平铺按钮改为 Popover 下拉选择器

```tsx
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown, Check } from 'lucide-react';

export default function ToolModeSelector({ value, onChange }: ToolModeSelectorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = modes.find((m) => m.value === value) ?? modes[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-muted hover:bg-muted/80 transition-colors">
          <current.icon className="size-3.5" />
          {t(current.labelKey)}
          <ChevronDown className="size-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start">
        {modes.map((mode) => (
          <button
            key={mode.value}
            onClick={() => { onChange(mode.value); setOpen(false); }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
          >
            <mode.icon className="size-4 text-muted-foreground" />
            <div className="flex-1">
              <div className="font-medium">{t(mode.labelKey)}</div>
              <div className="text-xs text-muted-foreground">{t(mode.descKey)}</div>
            </div>
            {value === mode.value && <Check className="size-4 text-primary" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
```

#### 2.3 页面切换 Loading 闪烁

**文件**: `frontend/src/components/layout/AppShell.tsx`, `frontend/src/App.tsx`, `frontend/src/lib/motion.ts`

**改动**:

1. **移除 AnimatePresence mode="wait"** — 改为无动画或 `mode="sync"`

```tsx
// AppShell.tsx
<main className={`flex-1 overflow-y-auto ${isMobile ? 'pb-16' : ''}`}>
  <Outlet />
</main>
```

2. **预加载核心页面** — 在 App.tsx 中移除 PlaygroundPage 的 lazy

```tsx
import PlaygroundPage from '@/pages/PlaygroundPage';  // 直接导入，不 lazy
const KnowledgeBasesPage = lazy(() => import('@/pages/KnowledgeBasesPage'));
// ... 其他保持 lazy
```

3. **缩短/移除页面切换动画**

```ts
// motion.ts
export const pageTransition: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.1 } },
  exit: { opacity: 0, transition: { duration: 0.05 } },
};
```

#### 2.4 聊天历史常驻侧边栏

**新文件**: `frontend/src/components/playground/ChatHistorySidebar.tsx`

**修改文件**: `frontend/src/pages/PlaygroundPage.tsx`

**方案**: 在 PlaygroundPage 外层包裹一个带侧边栏的 flex 布局

```tsx
// PlaygroundPage.tsx 顶层结构
<div className="flex h-full">
  <ChatHistorySidebar
    collapsed={sidebarCollapsed}
    onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
    currentConversationId={conversationId}
    onSelectConversation={(id) => navigate(`/chat/${id}`)}
    onNewChat={handleNewChat}
  />
  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    {/* 原有的 header + messages + input */}
  </div>
</div>
```

**ChatHistorySidebar 设计**:
- 宽度：展开 260px，折叠 0px（完全隐藏，通过 header 中的按钮展开）
- 内容：搜索框 + 新对话按钮 + 对话列表（标题、时间、工具模式 badge）
- 对话列表使用 `useQuery(['conversations'])` 复用已有 API
- 当前对话高亮
- 过渡动画：`transition-all duration-200`
- 折叠状态存入 `localStorage`
- 空状态：显示 "暂无对话" + 引导文字
- 加载失败：显示 "加载失败" + 重试按钮
- 保留独立的 `/history` 页面用于高级管理（批量删除、搜索等），侧边栏为轻量列表

### Phase 3: 后端质量提升（~6h）

#### 3.1 切换到真实 LLM

**文件**: `backend/app/config.py`

**改动**: 确认 `LLM_PROVIDER` 从环境变量读取，当前 `.env` 已配置 `LLM_PROVIDER=volcengine`

```python
# 检查 config.py 中的默认值
class Settings(BaseSettings):
    llm_provider: str = Field(default="mock", env="LLM_PROVIDER")
    # 确保从 .env 读取
```

**验证步骤**:
1. 启动后端，检查日志中 LLM provider 显示为 `volcengine`
2. 发送一条聊天消息，确认返回非 mock 内容
3. 检查 embedding 是否使用 `BAAI/bge-m3`（在 `chat.py` 的 `_get_rag_service_for_chat` 中确认）

#### 3.2 OCR 模型升级（marker-pdf）

**文件**: `backend/app/services/ocr_service.py`, `backend/requirements.txt`

**改动**:

1. 添加依赖: `marker-pdf` (pip install marker-pdf)

2. 在 `OCRService` 中新增 `extract_text_marker` 方法：

```python
def extract_text_marker(self, pdf_path: str) -> list[dict]:
    """Extract text using marker-pdf (high-quality academic PDF parser)."""
    try:
        from marker.converters.pdf import PdfConverter
        from marker.models import create_model_dict

        converter = PdfConverter(artifact_dict=create_model_dict())
        rendered = converter(pdf_path)
        markdown_text = rendered.markdown

        pages = []
        # marker 输出整篇 Markdown，按 page break 或 heading 分页
        # 简单方案：每个 page 作为一个 chunk
        page_texts = markdown_text.split('\n\n---\n\n') if '\n\n---\n\n' in markdown_text else [markdown_text]
        for i, text in enumerate(page_texts):
            pages.append({
                "page_number": i + 1,
                "text": text.strip(),
                "has_text": bool(text.strip()),
                "char_count": len(text),
                "method": "marker",
            })

        # 如果 marker 没有分页标记，整个文档作为单页
        if len(pages) == 1 and pages[0]["char_count"] > 5000:
            # 按 2000 字符粗分页，避免单页过大
            full_text = pages[0]["text"]
            pages = []
            for j in range(0, len(full_text), 2000):
                chunk = full_text[j:j+2000]
                pages.append({
                    "page_number": j // 2000 + 1,
                    "text": chunk.strip(),
                    "has_text": bool(chunk.strip()),
                    "char_count": len(chunk),
                    "method": "marker",
                })

        return pages
    except ImportError:
        logger.warning("marker-pdf not installed. Falling back to PaddleOCR.")
        return []
    except Exception as e:
        logger.error("marker-pdf failed for %s: %s", pdf_path, e, exc_info=True)
        return []
```

3. 修改 `process_pdf` 方法的优先级：

```python
def process_pdf(self, pdf_path: str, force_ocr: bool = False) -> dict:
    # 1. 先尝试 native pdfplumber
    # 2. 如果原生文字不够，尝试 marker-pdf
    # 3. marker-pdf 失败，fallback 到 PaddleOCR
    # 4. 都失败，用原生结果（即使不完整）
```

**注意**: `marker-pdf` 是同步调用，在 async 路径中必须 `asyncio.to_thread()` 包装（见 `docs/solutions/performance-issues/blocking-sync-calls-asyncio-to-thread.md`）。

#### 3.3 引用上下文增强 + LLM 自动清洗

**文件**: `backend/app/services/rag_service.py`, `backend/app/api/v1/chat.py`

**3.3.1 上下文增强**（rag_service.py）:

在 RAG 检索结果中扩展上下文窗口，返回相邻 chunk：

```python
async def query(self, project_id, question, top_k=5, include_sources=True, context_window=1):
    """Query with adjacent chunk context."""
    # ... 原有检索逻辑 ...
    if include_sources and context_window > 0:
        for src in sources:
            chunk_idx = src.get("chunk_index")
            paper_id = src.get("paper_id")
            if chunk_idx is not None and paper_id is not None:
                adjacent = await self._get_adjacent_chunks(
                    project_id, paper_id, chunk_idx, context_window
                )
                src["extended_context"] = adjacent
    return result

async def _get_adjacent_chunks(self, project_id: int, paper_id: int, chunk_index: int, window: int = 1) -> str:
    """Retrieve adjacent chunks for context expansion."""
    # 从 ChromaDB 按 paper_id + chunk_index 范围查询
    target_indices = list(range(max(0, chunk_index - window), chunk_index + window + 1))
    # 查询 PaperChunk 表获取相邻 chunks
    result = await db.execute(
        select(PaperChunk)
        .where(PaperChunk.paper_id == paper_id, PaperChunk.chunk_index.in_(target_indices))
        .order_by(PaperChunk.chunk_index)
    )
    chunks = result.scalars().all()
    return "\n\n".join(c.content for c in chunks)
```

**边界情况**: 如果 chunk_index 为 0（首个 chunk），只取后续 chunk；如果为最后一个，只取前面的。`range(max(0, ...))` 已处理下界。

**3.3.2 LLM 自动清洗**（chat.py）:

在发送 citation SSE 事件后，并行启动 LLM 清洗任务：

```python
EXCERPT_CLEAN_PROMPT = (
    "Clean up the following text extracted from an academic PDF. "
    "Fix OCR errors, add missing spaces between words, restore formatting. "
    "Keep the original meaning. Output only the cleaned text."
)

_clean_semaphore = asyncio.Semaphore(3)

async def _clean_excerpt(llm, excerpt: str) -> str:
    """Use LLM to clean OCR-extracted text."""
    async with _clean_semaphore:
        messages = [
            {"role": "system", "content": EXCERPT_CLEAN_PROMPT},
            {"role": "user", "content": excerpt},
        ]
        result = ""
        async for token in llm.chat_stream(messages, temperature=0.1, task_type="clean"):
            result += token
        return result
```

在 `_stream_chat` 中，发送 citation 后异步清洗：

```python
# 发送原始 citation
for citation in citations:
    yield _sse("citation", citation)

# 并行清洗所有 citation excerpt
clean_tasks = [
    _clean_excerpt(llm, c["excerpt"])
    for c in citations
    if c.get("excerpt")
]
cleaned = await asyncio.gather(*clean_tasks, return_exceptions=True)

# 发送清洗后的 citation
for i, result in enumerate(cleaned):
    if isinstance(result, str) and result:
        yield _sse("citation_enhanced", {
            "index": citations[i]["index"],
            "cleaned_excerpt": result,
        })
```

**前端处理**（PlaygroundPage.tsx）:

```tsx
} else if (event.event === 'citation_enhanced') {
  const { index, cleaned_excerpt } = event.data as {
    index: number;
    cleaned_excerpt: string;
  };
  setMessages((prev) =>
    prev.map((m) =>
      m.id === assistantMsg.id
        ? {
            ...m,
            citations: (m.citations ?? []).map((c) =>
              c.index === index ? { ...c, excerpt: cleaned_excerpt } : c
            ),
          }
        : m,
    ),
  );
}
```

#### 3.4 思维链（Thinking Chain）详细步骤

**文件**: `backend/app/api/v1/chat.py`, `frontend/src/components/playground/MessageLoadingStages.tsx`, `frontend/src/types/chat.ts`

**后端 SSE 新事件**:

```python
yield _sse("thinking_step", {
    "step": "understand",
    "label": "理解问题",
    "detail": f"分析 '{request.message[:30]}...' 的意图",
    "status": "running",
})
# ... 实际处理 ...
yield _sse("thinking_step", {
    "step": "understand",
    "status": "done",
    "duration_ms": 120,
    "summary": f"检测到关键实体: {entities}",
})
```

**完整思维链阶段**:

| Step | Label | 触发时机 | Summary 示例 |
|------|-------|----------|-------------|
| `understand` | 理解问题 | 收到用户消息 | "检测到 2 个关键实体" |
| `retrieve` | 检索知识库 | 开始 RAG 查询 | "在 smlm-5 中找到 8 条相关文献" |
| `rank` | 分析引用 | RAG 返回后 | "筛选出 5 条高相关引用（>60%）" |
| `clean` | 清洗引用 | 开始 LLM 清洗 | "并行优化 5 条引用的可读性" |
| `generate` | 生成回答 | 开始 LLM 流式 | "基于 5 条引用生成回答..." |
| `complete` | 完成 | 流式结束 | "总用时 3.2s，引用 5 篇文献" |

**前端改造** — `ThinkingChain.tsx`（新组件）:

```tsx
interface ThinkingStep {
  step: string;
  label: string;
  detail?: string;
  status: 'running' | 'done' | 'error' | 'skipped';
  duration_ms?: number;
  summary?: string;
}

function ThinkingChain({ steps, collapsed, onToggle }: Props) {
  // 可折叠的步骤列表
  // 每步显示: 图标 + 标签 + 状态指示 + 耗时 + 摘要
  // running 状态显示 spinner，done 显示 ✓，error 显示 ⚠
}
```

**兜底策略**:
- 每个阶段设 5s 超时，超时后发送 `status: "skipped"` + `summary: "已跳过（超时）"` 并继续
- 如果 RAG 查询失败，跳过 retrieve/rank/clean，直接 generate（无引用模式）
- 如果 LLM 清洗某个 citation 失败，保留原始 excerpt，不发送 `citation_enhanced`
- 如果所有 citation 清洗都失败，静默跳过 clean 阶段
- `understand` 阶段仅前端模拟（无后端调用），不会失败
- `generate` 失败时发送 `error` 事件，前端显示 "回答生成失败，请重试"

### Phase 4: 集成验证与 i18n 最终检查（~1h）

#### 4.1 端到端验证

- [ ] 新建知识库 → 上传长文件名 PDF → 确认文件名不溢出
- [ ] 查看知识库详情 → 确认返回按钮为图标
- [ ] 发起聊天 → 确认使用真实 LLM → 确认回复非 mock 内容
- [ ] 观察思维链 → 确认各步骤正确显示
- [ ] 检查 citation → 确认作者名正确（非 [object Object]）
- [ ] 检查 citation → 确认 excerpt 被自动清洗
- [ ] 多轮对话后 → 确认输入框始终固定在底部
- [ ] 工具模式 → 确认下拉选择器功能正常
- [ ] 历史侧边栏 → 确认可展开/折叠，切换对话
- [ ] 中英文切换 → 确认无硬编码文字

#### 4.2 i18n 最终扫描

```bash
# 搜索残留的 defaultValue
rg "defaultValue" frontend/src/ --type tsx
# 搜索硬编码中文
rg "[\u4e00-\u9fff]" frontend/src/components/ frontend/src/pages/ --type tsx -l
```

## Acceptance Criteria

### 功能要求

- [ ] PDF 上传对话框中，文件名过长时正确截断并显示 tooltip
- [ ] 知识库详情页返回按钮为简洁图标 + Tooltip
- [ ] Citation 卡片作者字段正确显示姓名（非 [object Object]）
- [ ] 所有 UI 文字通过 i18n，中英文切换无硬编码遗留
- [ ] Playground 聊天输入框始终固定在视口底部
- [ ] 工具模式选择器为下拉样式
- [ ] 页面切换无 loading 闪烁
- [ ] Playground 左侧有常驻可折叠历史侧边栏
- [ ] 使用真实 LLM（volcengine doubao-seed-2-0-mini）而非 mock
- [ ] OCR 使用 marker-pdf 替代 PaddleOCR（PaddleOCR 作为 fallback）
- [ ] 引用 excerpt 包含前后文（相邻 chunk 上下文扩展）
- [ ] 引用文本在聊天时自动并行 LLM 清洗
- [ ] 思维链显示详细可折叠步骤（理解→检索→分析→清洗→生成→完成）

### 非功能要求

- [ ] marker-pdf 处理单篇 PDF 耗时 < 30s
- [ ] 引用清洗不阻塞主聊天流（独立 Semaphore(3)）
- [ ] 思维链每步超时 5s 自动跳过
- [ ] 历史侧边栏折叠状态持久化到 localStorage

## Dependencies & Risks

| 风险 | 影响 | 缓解 |
|------|------|------|
| marker-pdf 在 CUDA 6,7 上不兼容 | OCR 升级失败 | 保留 PaddleOCR fallback |
| Volcengine API 配额/限流 | 聊天失败 | 添加 retry + fallback 到 Aliyun |
| 引用 LLM 清洗增加延迟 | 用户等待更久 | 并行执行 + 不阻塞主流 |
| marker-pdf 模型下载大 | 首次启动慢 | 提前下载到 DATA_DIR |

## Sources & References

- **Origin brainstorm**: [docs/brainstorms/2026-03-12-ux-quality-improvements-brainstorm.md](../brainstorms/2026-03-12-ux-quality-improvements-brainstorm.md) — OCR 选型 marker-pdf，思维链详细步骤，引用自动清洗，历史常驻侧边栏
- **历史方案**: `docs/solutions/performance-issues/blocking-sync-calls-asyncio-to-thread.md` — sync → asyncio.to_thread 模式
- **历史方案**: `docs/solutions/performance-issues/2026-03-12-rag-rich-citation-performance-analysis.md` — SSE 节流、citation 批量查询
- **历史方案**: `docs/solutions/ui-bugs/comprehensive-ui-polish.md` — 页面布局规范、骨架屏、i18n 模式
- **关键文件**: `frontend/src/pages/PlaygroundPage.tsx`, `backend/app/api/v1/chat.py`, `backend/app/services/ocr_service.py`
