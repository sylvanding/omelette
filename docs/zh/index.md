---
layout: home
hero:
  name: "Omelette"
  text: "AI 驱动的文献管理"
  tagline: "检索 · 去重 · OCR · 索引 · 对话 — 完整研究管道"
  image:
    src: /logo-mascot.png
    alt: Omelette 吉祥物
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/guide/getting-started
    - theme: alt
      text: GitHub 查看
      link: https://github.com/sylvanding/omelette

features:
  - icon: 🔍
    title: 多源检索
    details: Semantic Scholar、OpenAlex、arXiv、Crossref 联合检索与自动去重。
    link: /zh/modules/search
  - icon: 📄
    title: PDF 管道
    details: 自动 PDF 下载、OCR 处理、全文索引，支持 MinerU 和 PaddleOCR。
    link: /zh/modules/ocr
  - icon: 🧠
    title: RAG 知识库
    details: LlamaIndex 驱动的检索增强生成，GPU 加速嵌入，混合检索。
    link: /zh/modules/rag
  - icon: 💬
    title: 对话工作台
    details: ChatGPT 式对话界面，流式响应，支持文献问答。
    link: /zh/guide/chat
  - icon: 📊
    title: 研究分析
    details: 趋势分析、作者网络、缺口分析、论文对比工具。
    link: /zh/guide/features
  - icon: 🌐
    title: 双语 + PWA
    details: 完整中英文国际化，可安装 PWA，离线支持，响应式设计。
    link: /zh/guide/configuration
---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 · TypeScript · Vite · TailwindCSS v4 · shadcn/ui |
| 后端 | FastAPI · SQLAlchemy 2 (async) · Pydantic v2 · Python 3.12 |
| 数据库 | SQLite + aiosqlite · Alembic |
| 向量库 | ChromaDB |
| RAG | LlamaIndex · BAAI/bge-m3 |
| 测试 | 264 前端 · 857 后端 · 39 E2E |

## 快速链接

- [快速开始](/zh/guide/getting-started)
- [系统架构](/zh/guide/architecture)
- [API 参考](/zh/api/)
- [配置说明](/zh/guide/configuration)
