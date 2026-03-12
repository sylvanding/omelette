# Writing API

路径：`/api/v1/projects/{project_id}/writing`

## 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /projects/{id}/writing/assist | 通用写作辅助 |
| POST | /projects/{id}/writing/summarize | 摘要 |
| POST | /projects/{id}/writing/citations | 引用生成 |
| POST | /projects/{id}/writing/review-outline | 综述提纲 |
| POST | /projects/{id}/writing/gap-analysis | 缺口分析 |

## Assist 请求

`task`：`summarize`、`cite`、`review_outline`、`gap_analysis`；`style` 用于引用样式。

## 引用样式

`gb_t_7714`、`apa`、`mla`
