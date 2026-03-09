# 写作辅助模块

LLM 写作辅助：摘要、引用生成、综述提纲、缺口分析。

## 功能

- **摘要：** 论文摘要
- **引用：** GB/T 7714、APA、MLA
- **综述提纲：** 文献综述结构
- **缺口分析：** 研究缺口与机会

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/projects/{id}/writing/assist` | 通用辅助 |
| POST | `/projects/{id}/writing/summarize` | 摘要 |
| POST | `/projects/{id}/writing/citations` | 引用生成 |
| POST | `/projects/{id}/writing/review-outline` | 综述提纲 |
| POST | `/projects/{id}/writing/gap-analysis` | 缺口分析 |
