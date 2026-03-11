---
layout: home
hero:
  name: "Omelette"
  text: "科研文献全生命周期管理"
  tagline: "以对话为中心的科研助手 — 从关键词检索到 RAG 驱动写作，由 LangGraph 编排。"
  image:
    src: /logo-mascot.png
    alt: Omelette 吉祥物
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/guide/getting-started
    - theme: alt
      text: GitHub
      link: https://github.com/sylvanding/omelette
features:
  - title: "\U0001F4AC 对话式工作台"
    details: ChatGPT 风格界面，支持 SSE 流式输出、知识库选择和多工具模式（问答、引文查找、综述提纲、缺口分析）。
  - title: "\U0001F916 多模型 LLM 支持"
    details: 基于 LangChain 抽象，支持 OpenAI、Anthropic、阿里云、火山引擎、Ollama 和 Mock 模式，可按会话切换。
  - title: "\U0001F9E0 RAG 知识库"
    details: LlamaIndex 驱动，ChromaDB 向量存储，GPU 加速 HuggingFace 嵌入，混合检索，带引文回答。
  - title: "\U0001F500 LangGraph 流水线"
    details: 检索 → 去重 → HITL → 下载 → OCR → 索引全流程编排，支持中断/恢复和检查点持久化。
  - title: "\U0001F50D 多源检索"
    details: 联邦检索 Semantic Scholar、OpenAlex、arXiv、Crossref，统一元数据格式。
  - title: "\U0001F9F9 智能去重"
    details: 三阶段流水线 + Git 风格 HITL 冲突解决 — DOI 硬去重、标题相似度、LLM 校验。
  - title: "\U0001F4E1 订阅管理"
    details: 持久化订阅规则，支持 CRUD、频率调度和自动增量更新。
  - title: "\U0001F4E5 PDF 爬取与 OCR"
    details: Unpaywall/arXiv 多通道 PDF 下载，pdfplumber 原生提取 + PaddleOCR GPU 加速。
  - title: "\U0001F4DD 写作辅助"
    details: 论文摘要、引文生成（GB/T 7714、APA、MLA）、综述提纲和缺口分析。
  - title: "\U0001F310 MCP 集成"
    details: MCP 协议服务器，向 Claude Code、Codex 等 AI IDE 暴露工具、资源和提示词。
  - title: "\U0001F30D 中英双语"
    details: 基于 react-i18next 的完整中英双语界面，自动语言检测。
  - title: "\U0001F3A8 现代化 UI"
    details: shadcn/ui + Radix 组件库，Framer Motion 动画，图标侧边栏，TailwindCSS v4 响应式设计。
---
