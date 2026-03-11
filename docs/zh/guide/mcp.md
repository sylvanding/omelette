# MCP 集成

Omelette 通过 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 暴露其功能，允许 Claude Code、Codex、Cursor 等 AI 编程助手与你的科研知识库交互。

## 概述

MCP 服务器作为 ASGI 子应用挂载在 Omelette 后端的 `/mcp` 路径上，提供：

- **工具 (Tools)**：可执行的操作（检索、查找、添加论文）
- **资源 (Resources)**：只读数据访问（知识库、论文、文本块）
- **提示词 (Prompts)**：常见任务的预构建提示词模板

## 可用工具

| 工具 | 说明 |
|------|------|
| `list_knowledge_bases` | 列出所有知识库及论文数量 |
| `search_knowledge_base` | 在知识库中进行 RAG 语义搜索 |
| `lookup_paper` | 通过 DOI 或标题查找论文（本地数据库 + Crossref） |
| `find_citations` | 为给定文本查找引用候选 |
| `add_paper_by_doi` | 通过 DOI 向知识库添加论文 |
| `get_paper_summary` | 获取论文元数据和摘要 |
| `search_papers_by_keyword` | 多源联邦关键词检索 |

## 可用资源

| URI 模式 | 说明 |
|----------|------|
| `omelette://knowledge-bases` | 所有知识库列表 |
| `omelette://knowledge-bases/{id}` | 知识库详情（含论文列表） |
| `omelette://papers/{id}` | 论文元数据 |
| `omelette://papers/{id}/chunks` | 论文文本块 |

## 从 AI IDE 连接

### Claude Code / Codex

在 MCP 配置中添加：

```json
{
  "mcpServers": {
    "omelette": {
      "url": "http://localhost:8000/mcp"
    }
  }
}
```

### Cursor

在 `.cursor/mcp.json` 中添加：

```json
{
  "mcpServers": {
    "omelette": {
      "url": "http://localhost:8000/mcp"
    }
  }
}
```

### Stdio 模式

本地开发无需 HTTP：

```bash
cd backend
python -m app.mcp_server
```

## 使用示例

连接后，你可以向 AI 助手提问：

- "在 ML 知识库中搜索关于 transformer attention 的论文"
- "为这段文字查找引用：..."
- "将 DOI 为 10.1234/example 的论文添加到我的知识库"
- "总结 42 号论文"
