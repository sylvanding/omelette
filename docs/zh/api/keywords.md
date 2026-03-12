# Keywords API

路径：`/api/v1/projects/{project_id}/keywords`

## 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /projects/{id}/keywords | 列表 |
| POST | /projects/{id}/keywords | 创建 |
| POST | /projects/{id}/keywords/bulk | 批量创建 |
| PUT | /projects/{id}/keywords/{kw_id} | 更新 |
| DELETE | /projects/{id}/keywords/{kw_id} | 删除 |
| POST | /projects/{id}/keywords/expand | LLM 扩展 |
| GET | /projects/{id}/keywords/search-formula | 检索公式 |

## 扩展响应

`expanded_terms` 为对象列表：`{ term, term_zh, relation }`，`relation` 为 `synonym`、`abbreviation` 或 `related`。

## 检索公式

`GET /projects/{id}/keywords/search-formula?database=wos` — 查询参数 `database`：`wos`、`scopus`、`pubmed`（默认 `wos`）。
