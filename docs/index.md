---
layout: home
hero:
  name: "Omelette"
  text: "Scientific Literature Lifecycle Management"
  tagline: "Chat-centric scientific assistant — from keyword search to RAG-powered writing, orchestrated by LangGraph."
  image:
    src: /logo-mascot.png
    alt: Omelette Mascot
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/sylvanding/omelette
features:
  - title: "\U0001F4AC Chat Playground"
    details: ChatGPT-style interface with SSE streaming, knowledge base selection, and multiple tool modes (QA, citation lookup, review outline, gap analysis).
  - title: "\U0001F916 Multi-LLM Support"
    details: LangChain abstraction supporting OpenAI, Anthropic, Aliyun, Volcengine, Ollama, and mock providers with per-session switching.
  - title: "\U0001F9E0 RAG Knowledge Base"
    details: LlamaIndex-powered with ChromaDB vector store, GPU-aware HuggingFace embeddings, hybrid retrieval, and cited answers.
  - title: "\U0001F500 LangGraph Pipeline"
    details: Orchestrated search → dedup → HITL → crawl → OCR → index workflow with interrupt/resume and checkpointing.
  - title: "\U0001F50D Multi-Source Search"
    details: Federated search across Semantic Scholar, OpenAlex, arXiv, and Crossref with standardized metadata.
  - title: "\U0001F9F9 Smart Deduplication"
    details: Three-stage pipeline with Git-style HITL conflict resolution — DOI hard dedup, title similarity, LLM verification.
  - title: "\U0001F4E1 Subscription Management"
    details: Persistent subscription rules with CRUD API, frequency scheduling, and automatic incremental updates.
  - title: "\U0001F4E5 PDF Crawler & OCR"
    details: Multi-channel PDF download via Unpaywall/arXiv, native text extraction with PaddleOCR GPU fallback.
  - title: "\U0001F4DD Writing Assistant"
    details: Summarization, citation generation (GB/T 7714, APA, MLA), review outlines, and gap analysis.
  - title: "\U0001F310 MCP Integration"
    details: Model Context Protocol server exposing tools, resources, and prompts for Claude Code, Codex, and other AI IDEs.
  - title: "\U0001F30D Bilingual i18n"
    details: Full Chinese/English bilingual interface with react-i18next and automatic language detection.
  - title: "\U0001F3A8 Modern UI"
    details: shadcn/ui + Radix components, Framer Motion animations, icon sidebar, and responsive design with TailwindCSS v4.
---
