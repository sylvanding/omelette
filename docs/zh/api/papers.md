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
