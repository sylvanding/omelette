# RAG API

路径：`/api/v1/projects/{project_id}/rag`

## 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /projects/{id}/rag/query | 查询知识库 |
| POST | /projects/{id}/rag/index | 构建/重建索引 |
| POST | /projects/{id}/rag/index/stream | 构建索引（SSE 流式进度） |
| GET | /projects/{id}/rag/stats | 索引统计 |
| DELETE | /projects/{id}/rag/index | 删除索引 |

## 查询请求

```json
{
  "question": "什么是注意力机制？",
  "top_k": 10,
  "use_reranker": true,
  "include_sources": true
}
```

- `question` — 待回答的问题（必填）
- `top_k` — 检索块数量（默认：10）
- `use_reranker` — 是否使用重排序（默认：true）
- `include_sources` — 是否包含来源（默认：true）

## 索引流式接口

`POST /projects/{id}/rag/index/stream` — 通过 SSE 流式重建向量索引，实时推送进度。

**事件类型：** `progress`、`complete`、`error`
