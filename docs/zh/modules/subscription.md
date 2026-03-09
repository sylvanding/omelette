# 增量订阅模块

RSS 与 API 定时更新，跟踪新论文。

## 功能

- **RSS：** arXiv 分类、期刊订阅
- **API 检查：** 定时 Semantic Scholar/arXiv 查询
- **自动流水线：** 新论文进入去重 → 爬取 → OCR → 索引

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/projects/{id}/subscription/feeds` | 列出 RSS |
| POST | `/projects/{id}/subscription/check-rss` | 立即检查 RSS |
| POST | `/projects/{id}/subscription/check-updates` | 立即检查 API |
