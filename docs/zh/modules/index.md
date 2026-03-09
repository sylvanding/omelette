# 模块概览

Omelette 由八个核心模块组成科研文献流水线。

| # | 模块 | 说明 |
|---|------|------|
| 1 | [关键词管理](/zh/modules/keywords) | 三级层级、LLM 扩展、检索公式生成 |
| 2 | [文献检索](/zh/modules/search) | 联邦检索 Semantic Scholar、OpenAlex、arXiv、Crossref |
| 3 | [去重过滤](/zh/modules/dedup) | DOI 硬去重、标题相似度、LLM 校验 |
| 4 | [增量订阅](/zh/modules/subscription) | RSS 与 API 定时更新 |
| 5 | [PDF 爬取](/zh/modules/crawler) | Unpaywall、arXiv、直链回退 |
| 6 | [OCR 解析](/zh/modules/ocr) | pdfplumber + PaddleOCR 扫描版 |
| 7 | [RAG 知识库](/zh/modules/rag) | ChromaDB 向量、混合检索、带引用回答 |
| 8 | [写作辅助](/zh/modules/writing) | 摘要、引用、综述提纲、缺口分析 |

## 流水线

```
Keywords → Search → Dedup → Subscription → Crawler → OCR → RAG → Writing
```

各模块可独立使用或串联。项目组织文献，关键词驱动检索，结果经去重、爬取、OCR、索引后供写作辅助查询。
