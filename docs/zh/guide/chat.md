# 对话工作台

对话工作台提供了 ChatGPT 风格的界面，用于与科研知识库进行交互。

## 概述

- **SSE 流式输出**：通过 Server-Sent Events 实时逐 token 响应
- **知识库选择**：选择一个或多个知识库进行 RAG 增强回答
- **工具模式**：在问答、引文查找、综述提纲和缺口分析之间切换
- **富文本渲染**：支持 LaTeX 数学公式（KaTeX）、代码高亮和行内引用

## 工具模式

| 模式 | 说明 |
|------|------|
| **问答**（默认） | 基于 RAG 从选中的知识库中回答问题 |
| **引文查找** | 提供一段文本，从论文库中查找匹配的引用 |
| **综述提纲** | 生成结构化的文献综述提纲 |
| **缺口分析** | 识别所选知识库中的研究空白 |

## API 端点

```
POST /api/v1/chat/stream          # SSE 流式对话
GET  /api/v1/conversations        # 对话列表
POST /api/v1/conversations        # 创建对话
GET  /api/v1/conversations/{id}   # 获取对话详情（含消息）
DELETE /api/v1/conversations/{id} # 删除对话
```

## 架构

```
前端 (useChat) → POST /chat/stream → LLMClient (LangChain)
                                          ↓
                                    RAGService (LlamaIndex)
                                          ↓
                                    ChromaDB 向量存储
```

对话系统使用 LangChain 的 `BaseChatModel` 抽象层，支持通过设置页面或 `.env` 配置在不同 LLM 提供商（OpenAI、Anthropic、Ollama 等）之间无缝切换。
