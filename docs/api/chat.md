# Chat API

Chat 模块提供基于 SSE 的流式对话与文本改写接口，支持知识库 RAG 检索、多工具模式及实时流式输出。

**Base path:** `/api/v1/chat`

---

## 1. 流式对话

### POST /api/v1/chat/stream

基于 SSE 的流式对话接口，支持知识库检索、引用标注及多轮对话上下文。

#### 请求体 (ChatStreamRequest)

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `conversation_id` | int | 否 | 对话 ID，续写时传入以保持上下文 |
| `message` | str | 是 | 用户消息内容（至少 1 字符） |
| `knowledge_base_ids` | list[int] | 否 | 知识库（项目）ID 列表，用于 RAG 检索 |
| `model` | str | 否 | 模型标识，空则使用用户设置 |
| `tool_mode` | str | 否 | 工具模式，默认 `"qa"` |

**tool_mode 可选值：**

| 值 | 说明 |
|----|------|
| `qa` | 问答模式：基于上下文回答问题，使用 [1]、[2] 等引用格式 |
| `citation_lookup` | 引用查找：识别并列出与文本最相关的参考文献 |
| `review_outline` | 综述提纲：生成结构化文献综述提纲 |
| `gap_analysis` | 研究缺口分析：识别研究空白与未来方向 |

#### 响应格式

SSE 流式响应，`Content-Type: text/event-stream`。

#### SSE 事件类型

| 事件 | 说明 | data 字段 |
|------|------|-----------|
| `message_start` | 消息开始 | `{ message_id }` |
| `citation` | 引用信息（每个来源一条） | `{ index, paper_id, paper_title, page_number, excerpt, relevance_score, chunk_type, authors, year, doi }` |
| `text_delta` | 文本增量 | `{ delta }` |
| `message_end` | 消息结束 | `{ message_id, conversation_id, finish_reason }` |
| `error` | 错误 | `{ code, message }` |

#### 示例 curl

```bash
curl -X POST "http://localhost:8000/api/v1/chat/stream" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "什么是注意力机制？",
    "knowledge_base_ids": [1, 2],
    "tool_mode": "qa"
  }'
```

#### 错误码

| code | 说明 |
|------|------|
| `stream_error` | 流式处理异常 |

---

## 2. 文本改写

### POST /api/v1/chat/rewrite

基于 SSE 的流式文本改写接口，支持多种风格与自定义提示。

#### 请求体 (RewriteRequest)

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `excerpt` | str | 是 | 待改写文本，**最多 2000 字符** |
| `style` | str | 是 | 改写风格 |
| `custom_prompt` | str | 否 | 自定义提示，`style=custom` 时必填 |
| `source_language` | str | 否 | 源语言，默认 `"auto"` |

**style 可选值：**

| 值 | 说明 |
|----|------|
| `simplify` | 通俗化：将学术文本改写为易懂语言 |
| `academic` | 学术化：改写为正式学术风格 |
| `translate_en` | 英译：翻译为英文 |
| `translate_zh` | 中译：翻译为中文 |
| `custom` | 自定义：使用 `custom_prompt` 作为系统提示 |

#### 响应格式

SSE 流式响应，`Content-Type: text/event-stream`。

#### SSE 事件类型

| 事件 | 说明 | data 字段 |
|------|------|-----------|
| `rewrite_delta` | 改写文本增量 | `{ delta }` |
| `rewrite_end` | 改写完成 | `{ full_text }` |
| `error` | 错误 | `{ code, message }` |

#### 示例 curl

```bash
curl -X POST "http://localhost:8000/api/v1/chat/rewrite" \
  -H "Content-Type: application/json" \
  -d '{
    "excerpt": "The attention mechanism allows the model to focus on different parts of the input.",
    "style": "translate_zh"
  }'
```

#### 错误码

| code | 说明 |
|------|------|
| `timeout` | 改写超时（30 秒） |
| `rewrite_error` | 改写处理异常 |
