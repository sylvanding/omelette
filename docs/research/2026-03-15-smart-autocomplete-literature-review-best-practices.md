# 智能补全与 Literature Review 最佳实践研究

**日期**: 2026-03-15
**上下文**: Phase 4 创新功能（智能补全、自动 Literature Review）实现前的研究与方案建议

---

## 一、智能补全（Smart Autocomplete for Chat Input）

### 1.1 最佳实践建议（5 条）

| # | 实践 | 说明 |
|---|------|------|
| 1 | **Debounce + AbortController 双保险** | Debounce 减少请求频率；AbortController 取消过时请求，避免 race condition（旧请求晚于新请求返回）。两者缺一不可。 |
| 2 | **最小触发阈值** | 输入 ≥ 10 字符且停顿 300–400ms 再触发，避免短输入时无意义调用。可配置化。 |
| 3 | **补全长度与 prompt 约束** | 限制 `max_tokens=30–50`，prompt 明确要求「只返回补全部分，不重复已输入内容」。非指令微调模型在 completion 任务上往往优于指令模型。 |
| 4 | **灰色 ghost text + Tab 接受** | 补全以灰色/半透明文本紧跟在光标后；Tab 接受、Esc 忽略、继续输入取消。与 VS Code/Cursor 一致，用户心智负担低。 |
| 5 | **服务端限流与超时** | 每用户每秒最多 2 次补全请求；2s 超时熔断，静默返回空，不展示错误。 |

### 1.2 边界情况与陷阱

| 场景 | 风险 | 建议 |
|------|------|------|
| **Race condition** | 快速输入时，旧请求晚于新请求返回，展示错误补全 | 使用 `AbortController` 取消前次请求；或使用 `requestId` 校验，只处理最新请求的响应 |
| **多行输入** | Textarea 中光标位置复杂，补全展示位置难算 | 方案 A：补全始终在最后一行末尾；方案 B：用 `contenteditable` div 精确控制（复杂度高） |
| **Tab 与表单导航冲突** | 默认 Tab 会切换焦点，可能误触发 | 有补全时 `e.preventDefault()` 拦截 Tab，无补全时放行 |
| **LLM 返回重复内容** | 模型可能重复用户已输入部分 | Prompt 强调「仅返回后续补全，不包含已输入内容」；后处理可做 prefix 去重 |
| **冷启动延迟** | 首次调用 LLM 延迟高 | 使用 Routing Tier 小模型；或考虑 WebSocket 长连接预热（后续优化） |

### 1.3 推荐技术方案与库

| 类别 | 推荐 | 说明 |
|------|------|------|
| **Debounce + Abort** | 自实现 `useDebouncedCompletion` | 结合 `useRef` 存 timer 和 `AbortController`，onChange 时 `clearTimeout` + `abort()`，再 `setTimeout` 发起新请求 |
| **Ghost text 展示** | 重叠 input 或 span 方案 | 两方案：(1) 上下叠放两个 input，上层可编辑、下层 disabled 显示灰色补全；(2) 在 input 后追加 `<span className="text-muted-foreground/60">` 显示补全 |
| **开源库** | GhostComplete、fude | GhostComplete：38kB、零依赖、支持学习；fude：含 @mentions + AI 补全，适合复杂场景。Omelette 当前为简单 Textarea，可先自实现，后续评估 fude |

### 1.4 代码示例

**React Debounce + AbortController 模式**：

```tsx
function useCompletion(prefix: string, options: { kbIds: number[] }) {
  const [completion, setCompletion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const controllerRef = useRef<AbortController>();

  useEffect(() => {
    if (prefix.length < 10) {
      setCompletion('');
      return;
    }

    clearTimeout(timerRef.current);
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    const signal = controllerRef.current.signal;

    timerRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/v1/chat/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix, knowledge_base_ids: options.kbIds }),
          signal,
        });
        const data = await res.json();
        if (data.data?.completion) setCompletion(data.data.completion);
        else setCompletion('');
      } catch (err) {
        if ((err as Error).name !== 'AbortError') console.error(err);
        setCompletion('');
      } finally {
        setIsLoading(false);
      }
    }, 400);

    return () => {
      clearTimeout(timerRef.current);
      controllerRef.current?.abort();
    };
  }, [prefix, options.kbIds]);

  return { completion, isLoading };
}
```

**LLM 补全 Prompt 模板**：

```
你是一个科研写作助手。根据用户已输入的文本，预测并补全后续内容。
规则：
1. 只返回补全的部分，不要重复用户已输入的内容
2. 最多 50 个字符
3. 如果无法合理预测，返回空字符串

用户已输入：{prefix}
```

---

## 二、自动 Literature Review 生成

### 2.1 最佳实践建议（5 条）

| # | 实践 | 说明 |
|---|------|------|
| 1 | **提纲 → RAG 检索 → 逐章节生成** | 先 LLM 生成提纲，再按章节 query 做 RAG 检索，最后逐章节生成。避免一次性生成导致上下文过长、引用错位。 |
| 2 | **引用强约束：仅允许引用检索到的来源** | Prompt 明确「每个引用必须对应提供的文献」「禁止引用未提供的来源」。Evidence Bundle 模式可将幻觉率从 23.7% 降至 3.2%。 |
| 3 | **SSE 流式 + 多事件类型** | 使用 `StreamingResponse` + `text/event-stream`；可区分 `event: chunk`（正文）、`event: citation`（引用映射）、`event: section`（章节切换），前端按需渲染。 |
| 4 | **SubQuestionQueryEngine 用于复杂综述** | 将「比较 A 与 B」「各方法优劣」等复杂问题拆成子问题，分别检索后合成。适合跨文档对比型综述。 |
| 5 | **引用格式在 Markdown 中的表示** | numbered: `[1][2,3]`；APA: `(Author, Year)`；GB/T 7714: `[1]` 上标或 `[1]` 方括号。文末维护 `[1] Author. Title[J]. Journal, Year.` 格式的参考文献列表。 |

### 2.2 边界情况与陷阱

| 场景 | 风险 | 建议 |
|------|------|------|
| **引用幻觉** | GPT-4 仍有 18–28%  fabricated citations | 强制「仅引用提供的 sources」；可引入 VeriCite/FACTUM 类后处理验证（进阶） |
| **引用与段落错位** | 生成时 [1][2] 与段落不对应 | Prompt 要求「按段落—引用对应」；生成时维护 `sources_map`，随 SSE 下发 |
| **知识库为空** | 直接生成会完全幻觉 | 提前 `collection.count()` 检查，返回友好提示 |
| **SSE 中断** | 用户取消或超时 | 前端保留已展示内容，标记「生成已中断」；后端在 generator 中捕获 `asyncio.CancelledError` 优雅退出 |
| **SubQuestionQueryEngine 延迟** | 子问题串行执行，总时长可能 > 2min | 可并行执行子问题（LlamaIndex Workflow 版支持）；或对简单综述不用 SubQuestion，直接用 outline + 单次 RAG |

### 2.3 推荐技术方案与库

| 类别 | 推荐 | 说明 |
|------|------|------|
| **提纲解析** | 按 `##` 分割 + 标题作为 query | `parse_outline_sections()` 将 Markdown 提纲解析为 `[{title, query}, ...]`；解析失败时降级为整段 outline 作为单一 query |
| **RAG 检索** | 现有 RAGService + `retrieve_only` | 需新增 `retrieve_only(project_id, query, top_k)` 仅检索不生成，返回 `sources` 列表 |
| **SubQuestionQueryEngine** | 可选增强 | 适合「比较/对比」类综述；每个 project 的 index 作为 QueryEngineTool，SubQuestionQueryEngine 分解问题并合成 |
| **引用验证** | Prompt 强约束 + 可选 NLI | 首选 prompt 约束；进阶可引入 NLI 模型做 claim–evidence 对齐验证 |
| **SSE 格式** | FastAPI StreamingResponse | 与现有 chat stream 一致；可 yield `{"event":"chunk","data":"..."}` 或纯 `data: {...}\n\n` |

### 2.4 代码示例

**SSE 流式综述生成（FastAPI）**：

```python
async def generate_literature_review(
    self, project_id: int, topic: str, citation_format: str = "numbered"
) -> AsyncGenerator[str, None]:
    outline = await self.generate_review_outline(project_id, topic)
    sections = parse_outline_sections(outline["outline"])
    if not sections:
        sections = [{"title": "Overview", "query": outline["outline"][:200]}]

    for i, section in enumerate(sections):
        sources = await self.rag.retrieve_only(project_id, section["query"], top_k=8)
        section["sources"] = sources
        # 下发 section 元数据
        yield f"data: {json.dumps({'event': 'section', 'index': i, 'title': section['title']})}\n\n"

        prompt = f"""你是一个学术综述写作助手。为以下章节撰写综述段落。

章节标题：{section['title']}
相关文献摘录：
{format_sources_for_prompt(sources)}

要求：
1. 使用学术语言，逻辑清晰
2. 在适当位置使用 [1][2] 格式引用
3. 每个引用必须对应上面提供的文献，禁止编造
4. 段落长度 200-400 字"""

        async for chunk in self.llm.stream_chat([{"role": "user", "content": prompt}], max_tokens=500):
            yield f"data: {json.dumps({'event': 'chunk', 'data': chunk})}\n\n"
```

**Markdown 引用格式示例**：

```markdown
## 2. 研究方法

近年来，深度学习在 NLP 领域取得显著进展[1]。Transformer 架构[2,3] 成为主流，但计算成本较高[4]。

## 参考文献

[1] Author A. Title of Paper[J]. Journal Name, 2024, 10(2): 1-15.
[2] Author B. Another Paper[C]. Conference, 2023.
```

**LlamaIndex SubQuestionQueryEngine 用于综述**（可选）：

```python
from llama_index.core.tools import QueryEngineTool, ToolMetadata
from llama_index.core.query_engine import SubQuestionQueryEngine

# 每个 project 的 index 作为 tool
query_engine_tools = [
    QueryEngineTool(
        query_engine=vector_index.as_query_engine(),
        metadata=ToolMetadata(
            name="project_papers",
            description="Literature in the project knowledge base",
        ),
    ),
]
sub_engine = SubQuestionQueryEngine.from_defaults(query_engine_tools=query_engine_tools)

# 复杂查询如 "Compare method A and method B across papers"
response = sub_engine.query("Compare the methodologies of papers on topic X")
```

---

## 三、总结对照表

| 维度 | 智能补全 | Literature Review |
|------|----------|-------------------|
| **核心模式** | debounce 400ms + AbortController + 单次 LLM | 提纲 → RAG 检索 → 逐章节流式生成 |
| **关键约束** | max_tokens≤50，只返回补全部分 | 仅引用检索到的来源 |
| **流式** | 非流式（单次返回） | SSE 流式 |
| **可选增强** | WebSocket 预热、本地小模型 | SubQuestionQueryEngine、引用验证 |
| **与现有代码关系** | 新增 CompletionService + ChatInput 扩展 | 扩展 WritingService + 新增 retrieve_only |

---

## 四、参考文献

- [VeriCite: Towards Reliable Citations in RAG](https://arxiv.org/abs/2510.11394)
- [FACTUM: Detecting Citation Hallucination in RAG](https://www.emergentmind.com/papers/2601.05866)
- [LiRA: Multi-Agent Literature Review Framework](https://arxiv.org/html/2510.05138v2)
- [LlamaIndex SubQuestionQueryEngine](https://docs.llamaindex.ai/en/stable/examples/query_engine/sub_question_query_engine/)
- [FastAPI SSE Streaming](https://fastapi.tiangolo.com/tutorial/server-sent-events/)
- [Debounced fetch with AbortController](https://svarden.se/post/debounced-fetch-with-abort-controller)
- [Ghost text autocomplete Stack Overflow](https://stackoverflow.com/questions/63854661/autocomplete-suggestion-in-an-input-as-gray-letters-after-the-cursor)
