# 文献检索模块

联邦检索 Semantic Scholar、OpenAlex、arXiv、Crossref，统一元数据。

## 功能

- **多源：** Semantic Scholar、OpenAlex、arXiv、Crossref
- **统一 schema：** title、abstract、authors、DOI、year、source、citation_count
- **自动导入：** 可选将结果导入项目
- **关键词驱动：** 无 query 时从项目关键词构建

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/projects/{id}/search/execute` | 执行检索 |
| GET | `/projects/{id}/search/sources` | 列出数据源 |

## 参数

- `query` — 检索字符串（空则用 level-1 关键词）
- `sources` — 可选：semantic_scholar、openalex、arxiv、crossref
- `max_results` — 每源最大条数（默认 100）
- `auto_import` — 是否导入项目
