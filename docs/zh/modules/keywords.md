# 关键词管理模块

三级关键词层级，支持 LLM 扩展与 WOS、Scopus、PubMed 检索公式生成。

## 功能

- **Level 1（核心）：** 主要研究术语
- **Level 2（子领域）：** 领域相关术语
- **Level 3（扩展）：** 同义词、缩写、相关词
- **LLM 扩展：** 从种子词生成相关术语
- **检索公式：** 为 WOS、Scopus、PubMed 生成布尔公式

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/projects/{id}/keywords` | 列出关键词（可选 level 过滤） |
| POST | `/projects/{id}/keywords` | 创建关键词 |
| POST | `/projects/{id}/keywords/bulk` | 批量创建 |
| PUT | `/projects/{id}/keywords/{kw_id}` | 更新 |
| DELETE | `/projects/{id}/keywords/{kw_id}` | 删除 |
| POST | `/projects/{id}/keywords/expand` | LLM 扩展 |
| GET | `/projects/{id}/keywords/search-formula` | 生成检索公式 |

## 示例

```bash
# 创建关键词
curl -X POST http://localhost:8000/api/v1/projects/1/keywords \
  -H "Content-Type: application/json" \
  -d '{"term": "机器学习", "term_en": "machine learning", "level": 1}'

# LLM 扩展
curl -X POST http://localhost:8000/api/v1/projects/1/keywords/expand \
  -H "Content-Type: application/json" \
  -d '{"seed_terms": ["transformer", "attention"], "max_results": 10, "language": "zh"}'

# 获取 WOS 检索公式
curl "http://localhost:8000/api/v1/projects/1/keywords/search-formula?database=wos"
```
