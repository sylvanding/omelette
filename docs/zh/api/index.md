# API 参考概览

Omelette 后端在 `/api/v1/` 下提供 REST API。

## 基础 URL

```
http://localhost:8000/api/v1
```

## 响应格式

统一包装：

```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

## 分页

列表接口使用 `PaginatedData`：

```json
{
  "items": [...],
  "total": 100,
  "page": 1,
  "page_size": 20,
  "total_pages": 5
}
```

## 异步任务

长任务（search、dedup、crawl、OCR、RAG build）返回 `task_id`。轮询：

```
GET /api/v1/tasks/{task_id}
```

## 资源

| 资源 | 路径 |
|------|------|
| [Projects](/zh/api/projects) | /projects |
| [Papers](/zh/api/papers) | /projects/{id}/papers |
| [Keywords](/zh/api/keywords) | /projects/{id}/keywords |
| [Search](/zh/api/search) | /projects/{id}/search |
| [RAG](/zh/api/rag) | /projects/{id}/rag |
| [Writing](/zh/api/writing) | /projects/{id}/writing |
| Tasks | /tasks |
