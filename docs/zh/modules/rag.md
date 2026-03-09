# RAG 知识库模块

ChromaDB 向量索引，混合检索，带引用的 LLM 回答。

## 功能

- **嵌入：** BAAI/bge-m3
- **ChromaDB：** 向量存储
- **混合检索：** 向量 + BM25，可选重排
- **引用回答：** LLM 回答附带来源

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/projects/{id}/rag/query` | 查询 |
| POST | `/projects/{id}/rag/index` | 构建索引 |
| GET | `/projects/{id}/rag/stats` | 统计 |
| DELETE | `/projects/{id}/rag/index` | 删除索引 |
