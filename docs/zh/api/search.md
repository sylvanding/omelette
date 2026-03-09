# Search API

路径：`/api/v1/projects/{project_id}/search`

## 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /projects/{id}/search/execute | 执行检索 |
| GET | /projects/{id}/search/sources | 数据源列表 |

## 参数

- `query` — 检索词（空则用关键词）
- `sources` — 可选数据源
- `max_results` — 每源最大条数
- `auto_import` — 是否导入项目
