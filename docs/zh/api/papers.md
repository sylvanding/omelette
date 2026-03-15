# Papers API

路径：`/api/v1/projects/{project_id}/papers`

## 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /projects/{id}/papers | 列表（分页） |
| POST | /projects/{id}/papers | 创建 |
| POST | /projects/{id}/papers/bulk | 批量导入 |
| POST | /projects/{id}/papers/upload | 多文件上传（PDF） |
| POST | /projects/{id}/papers/process | 触发论文处理 |
| GET | /projects/{id}/papers/{paper_id} | 获取 |
| PUT | /projects/{id}/papers/{paper_id} | 更新 |
| DELETE | /projects/{id}/papers/{paper_id} | 删除 |

## 列表参数

- `page`, `page_size` — 分页
- `status` — 状态过滤
- `year` — 年份过滤
- `q` — 标题/摘要搜索
- `sort_by`, `order` — 排序

## 上传

`POST /projects/{id}/papers/upload` — 多文件上传 PDF，返回 `{ papers, conflicts, total_uploaded }`。

## 处理

`POST /projects/{id}/papers/process` — 触发 OCR + RAG 索引。可选查询参数 `paper_ids`，省略则处理全部待处理论文。

## 批量导入响应

`POST /projects/{id}/papers/bulk` 返回 `{ created, skipped, total }`。

---

## PDF 文件

### GET /api/v1/projects/{project_id}/papers/{paper_id}/pdf

获取论文的PDF文件。返回 `application/pdf` 内容类型的二进制文件。

---

## 引用图谱

### GET /api/v1/projects/{project_id}/papers/{paper_id}/citation-graph

获取论文的引用关系图谱（基于 Semantic Scholar 数据）。

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| depth | int | 1 | 图谱深度（1-2） |
| max_nodes | int | 50 | 最大节点数（10-200） |

**响应：**

| 字段 | 类型 | 说明 |
|------|------|------|
| nodes | object[] | 节点列表（id, title, year, citation_count, is_local） |
| edges | object[] | 边列表（source, target, type） |
| center_id | string | 中心论文的 Semantic Scholar ID |
