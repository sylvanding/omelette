# Conversations API

Conversations 模块提供对话的 CRUD 接口，支持分页列表、按知识库筛选及消息详情查询。

**Base path:** `/api/v1/conversations`

---

## 1. 列表对话

### GET /api/v1/conversations

分页获取对话列表，按更新时间倒序，支持按知识库 ID 筛选。

#### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | int | 否 | 页码，默认 1 |
| `page_size` | int | 否 | 每页条数，默认 20 |
| `knowledge_base_id` | int | 否 | 仅返回包含该知识库的对话 |

#### 响应格式

`ApiResponse[PaginatedData[ConversationListSchema]]`

**ConversationListSchema 字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 对话 ID |
| `title` | str | 标题 |
| `knowledge_base_ids` | list[int] \| null | 知识库 ID 列表 |
| `model` | str | 模型标识 |
| `tool_mode` | str | 工具模式，默认 `"qa"` |
| `created_at` | datetime | 创建时间 |
| `updated_at` | datetime | 更新时间 |
| `message_count` | int | 消息数量 |
| `last_message_preview` | str | 最后一条消息预览（最多 100 字符） |

**PaginatedData 结构：**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "items": [...],
    "total": 42,
    "page": 1,
    "page_size": 20,
    "total_pages": 3
  }
}
```

#### 示例 curl

```bash
curl -X GET "http://localhost:8000/api/v1/conversations?page=1&page_size=20"
curl -X GET "http://localhost:8000/api/v1/conversations?knowledge_base_id=1"
```

---

## 2. 创建对话

### POST /api/v1/conversations

创建新对话。

#### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | str | 否 | 标题，默认 `"新对话"` |
| `knowledge_base_ids` | list[int] | 否 | 知识库 ID 列表 |
| `model` | str | 否 | 模型标识 |
| `tool_mode` | str | 否 | 工具模式，默认 `"qa"` |

#### 响应格式

`ApiResponse[ConversationSchema]`，包含完整对话及空 `messages` 数组。

#### 示例 curl

```bash
curl -X POST "http://localhost:8000/api/v1/conversations" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "文献综述讨论",
    "knowledge_base_ids": [1, 2],
    "tool_mode": "review_outline"
  }'
```

---

## 3. 获取对话详情

### GET /api/v1/conversations/{id}

获取单个对话及其全部消息。

#### 路径参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | int | 对话 ID |

#### 响应格式

`ApiResponse[ConversationSchema]`

**ConversationSchema 字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 对话 ID |
| `title` | str | 标题 |
| `knowledge_base_ids` | list[int] \| null | 知识库 ID 列表 |
| `model` | str | 模型标识 |
| `tool_mode` | str | 工具模式 |
| `created_at` | datetime | 创建时间 |
| `updated_at` | datetime | 更新时间 |
| `messages` | list[MessageSchema] | 消息列表 |

**MessageSchema 字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 消息 ID |
| `conversation_id` | int | 对话 ID |
| `role` | str | 角色：`user` / `assistant` |
| `content` | str | 内容 |
| `citations` | list[dict] \| null | 引用列表（assistant 消息） |
| `created_at` | datetime | 创建时间 |

#### 示例 curl

```bash
curl -X GET "http://localhost:8000/api/v1/conversations/1"
```

#### 错误码

| HTTP 状态 | 说明 |
|-----------|------|
| 404 | 对话不存在 |

---

## 4. 更新对话

### PUT /api/v1/conversations/{id}

更新对话标题或设置。

#### 路径参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | int | 对话 ID |

#### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | str | 否 | 新标题 |
| `model` | str | 否 | 新模型 |
| `tool_mode` | str | 否 | 新工具模式 |

仅传入需要更新的字段。

#### 响应格式

`ApiResponse[ConversationSchema]`，包含更新后的完整对话及消息。

#### 示例 curl

```bash
curl -X PUT "http://localhost:8000/api/v1/conversations/1" \
  -H "Content-Type: application/json" \
  -d '{"title": "新标题"}'
```

#### 错误码

| HTTP 状态 | 说明 |
|-----------|------|
| 404 | 对话不存在 |

---

## 5. 删除对话

### DELETE /api/v1/conversations/{id}

删除对话及其全部消息（级联删除）。

#### 路径参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | int | 对话 ID |

#### 响应格式

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "deleted": true,
    "id": 1
  }
}
```

#### 示例 curl

```bash
curl -X DELETE "http://localhost:8000/api/v1/conversations/1"
```

#### 错误码

| HTTP 状态 | 说明 |
|-----------|------|
| 404 | 对话不存在 |
