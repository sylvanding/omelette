# 去重过滤模块

三阶段：DOI 硬去重、标题相似度、LLM 校验。

## 功能

- **DOI 硬去重：** 完全匹配 DOI 去重
- **标题相似度：** 无 DOI 时用 Jaccard/编辑距离
- **LLM 校验：** 可选 LLM 辅助判断
- **异步任务：** 返回 task_id 轮询进度

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/projects/{id}/dedup/run` | 执行去重 |
| GET | `/projects/{id}/dedup/candidates` | 预览候选 |
| POST | `/projects/{id}/dedup/verify` | LLM 校验候选对 |
