# 模块概览

Omelette 由模块化组件组成，形成完整的研究文献管道。

## 核心管道

| # | 模块 | 描述 |
|---|------|------|
| 1 | [关键词](/zh/modules/keywords) | 三级层次，LLM 扩展，检索式生成 |
| 2 | [检索](/zh/modules/search) | 多源联合检索 |
| 3 | [去重](/zh/modules/dedup) | DOI 精确 → 标题相似 → LLM 验证 |
| 4 | [订阅](/zh/modules/subscription) | RSS 和 API 定时更新 |
| 5 | [爬虫](/zh/modules/crawler) | Unpaywall、arXiv、直链 |
| 6 | [OCR](/zh/modules/ocr) | MinerU + pdfplumber + PaddleOCR |
| 7 | [RAG](/zh/modules/rag) | LlamaIndex + ChromaDB |
| 8 | [写作](/zh/modules/writing) | 摘要、引用、缺口分析 |

## 扩展模块

- **分析**：趋势分析、作者网络、缺口分析
- **收藏集**：自定义分组与 AI 标签
- **概念**：知识图谱提取
- **聊天**：流式对话与工具模式
- **导出**：BibTeX、RIS、EndNote、Zotero
- **通知**：订阅匹配应用内提醒
- **团队**：RBAC 项目协作
- **流水线**：LangGraph 编排 + 人机交互

详见 [API 参考](/zh/api/)。
