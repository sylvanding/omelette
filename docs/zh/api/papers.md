# Papers API

路径：`/api/v1/projects/{project_id}/papers`

## 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /projects/{id}/papers | 列表（分页） |
| POST | /projects/{id}/papers | 创建 |
| POST | /projects/{id}/papers/bulk | 批量导入 |
| GET | /projects/{id}/papers/{paper_id} | 获取 |
| PUT | /projects/{id}/papers/{paper_id} | 更新 |
| DELETE | /projects/{id}/papers/{paper_id} | 删除 |

## 列表参数

- `page`, `page_size` — 分页
- `status` — 状态过滤
- `year` — 年份过滤
- `q` — 标题/摘要搜索
- `sort_by`, `order` — 排序
