# 去重 API

去重模块 API，支持 DOI 精确去重、标题相似度去重及 LLM 辅助验证。

**基础路径：** `/api/v1/projects/{project_id}/dedup`

---

## 端点概览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/run` | 执行去重流程 |
| GET | `/candidates` | 列出待人工审核的候选重复对 |
| POST | `/verify` | 使用 LLM 验证两个文献是否为重复 |
| POST | `/resolve` | 解决单条上传冲突（keep_old / keep_new / merge / skip） |
| POST | `/auto-resolve` | AI 自动建议冲突解决方式 |

---

## POST /run

执行去重流水线。

**查询参数**

| 参数名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `strategy` | string | `"full"` | 策略：`doi_only` \| `title_only` \| `full` |

**响应**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "stage1_doi_removed": 0,
    "stage2_title_removed": 0,
    "stage3_candidates": 5,
    "total_remaining": 120,
    "details": {
      "doi_duplicates": [],
      "title_duplicates": [],
      "llm_candidates": []
    }
  }
}
```

- `strategy=doi_only`：仅 DOI 精确去重
- `strategy=title_only`：仅标题相似度去重
- `strategy=full`：完整三阶段（DOI → 标题 → LLM 候选）

**示例**

```bash
curl -X POST "http://localhost:8000/api/v1/projects/1/dedup/run?strategy=full"
```

---

## GET /candidates

列出待人工审核的候选重复对（标题相似度较高，需 LLM 或人工确认）。

**响应**

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "paper_a_id": 10,
      "paper_b_id": 11,
      "similarity": 0.92,
      "paper_a": { "id": 10, "title": "...", "doi": "..." },
      "paper_b": { "id": 11, "title": "...", "doi": "..." }
    }
  ]
}
```

**示例**

```bash
curl "http://localhost:8000/api/v1/projects/1/dedup/candidates"
```

---

## POST /verify

使用 LLM 判断两个文献是否为重复。

**查询参数**

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `paper_a_id` | int | 是 | 文献 A ID |
| `paper_b_id` | int | 是 | 文献 B ID |

**响应**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "is_duplicate": true,
    "reason": "Same paper, different sources"
  }
}
```

**示例**

```bash
curl -X POST "http://localhost:8000/api/v1/projects/1/dedup/verify?paper_a_id=10&paper_b_id=11"
```

---

## POST /resolve

解决单条上传冲突。`conflict_id` 格式：`{old_paper_id}:{saved_filename}`，由上传接口返回的 `conflicts` 提供。

**请求体**

```json
{
  "conflict_id": "123:uploaded.pdf",
  "action": "keep_old",
  "merged_paper": null
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `conflict_id` | string | 是 | 冲突 ID，格式 `old_paper_id:saved_filename` |
| `action` | string | 是 | `keep_old` \| `keep_new` \| `merge` \| `skip` |
| `merged_paper` | object | 否 | 仅当 `action=merge` 时提供，合并后的元数据 |

**操作说明**

- `keep_old`：保留现有文献，丢弃上传
- `keep_new`：以新上传为准，创建新文献
- `merge`：合并元数据，创建新文献（需提供 `merged_paper`）
- `skip`：以新上传为准，创建新文献（与 keep_new 行为相同）

**响应**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "action": "keep_new",
    "paper_id": 124,
    "message": "Created new paper"
  }
}
```

**示例**

```bash
curl -X POST "http://localhost:8000/api/v1/projects/1/dedup/resolve" \
  -H "Content-Type: application/json" \
  -d '{"conflict_id":"123:paper.pdf","action":"keep_new"}'
```

---

## POST /auto-resolve

使用 LLM 批量建议冲突解决方式。

**请求体**

```json
{
  "conflict_ids": ["123:file1.pdf", "124:file2.pdf"]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `conflict_ids` | list[string] | 否 | 冲突 ID 列表；为空则返回空列表 |

**响应**

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "conflict_id": "123:file1.pdf",
      "action": "keep_new",
      "reason": "New version has more complete metadata"
    },
    {
      "conflict_id": "124:file2.pdf",
      "error": "Paper not found"
    }
  ]
}
```

每个元素为 `{conflict_id, action, reason}` 或 `{conflict_id, error}`。

**示例**

```bash
curl -X POST "http://localhost:8000/api/v1/projects/1/dedup/auto-resolve" \
  -H "Content-Type: application/json" \
  -d '{"conflict_ids":["123:paper.pdf"]}'
```

---

## 错误码

| 状态码 | 说明 |
|--------|------|
| 400 | 无效的 `conflict_id` 格式、`action` 或请求体 |
| 404 | 文献不存在或 PDF 文件不存在 |
