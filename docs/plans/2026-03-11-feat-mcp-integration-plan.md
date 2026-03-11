---
title: "feat: MCP 协议集成"
type: feat
status: completed
date: 2026-03-11
origin: docs/brainstorms/2026-03-11-ux-architecture-upgrade-brainstorm.md
---

# feat: MCP 协议集成

## 1. Overview

### 1.1 什么是 MCP

**Model Context Protocol (MCP)** 是 Anthropic 主导的开放协议，用于标准化 AI 应用与外部数据源、工具的交互方式。MCP 定义了三种核心原语：

- **Tools**：可被 AI 调用的函数（如搜索、查找）
- **Resources**：可被 AI 读取的静态或动态内容（如文档、配置）
- **Prompts**：预定义的提示模板，引导 AI 完成特定任务

### 1.2 为什么需要 MCP

Omelette 作为科研文献全生命周期管理系统，已具备文献检索、知识库 RAG、论文摘要、引用生成等能力。但这些能力目前仅通过 Web 前端和 REST API 暴露。科研人员在使用 **Claude Code**、**Cursor**、**Claude Desktop** 等 AI IDE 进行编码或写作时，无法直接调用 Omelette 的文献能力，需要手动切换应用、复制粘贴。

MCP 集成后，AI IDE 可作为 MCP 客户端，直接调用 Omelette 的 Tools 和 Resources，实现：

- 在编码/写作过程中**即时检索知识库**，获取相关文献片段
- **按 DOI 或标题查找论文**，获取元数据和摘要
- **为一段文字查找引用来源**，辅助学术写作
- **添加论文到知识库**，无需离开当前工作流

### 1.3 给科研人员带来的价值

| 场景 | 无 MCP | 有 MCP |
|------|--------|--------|
| 写论文时找引用 | 切换到 Omelette Web → 搜索 → 复制 DOI | 在 Claude/Cursor 中直接问「为这段话找引用」 |
| 查某篇论文详情 | 打开浏览器搜索 DOI | 在对话中 `lookup_paper(doi="10.1234/xxx")` |
| 文献综述 | 手动整理多篇论文 | 使用 `literature_review` 提示模板，AI 自动检索并综述 |
| 增量积累文献 | 定期去 Omelette 添加 | 对话中 `add_paper_by_doi(doi="...", kb_id=1)` |

---

## 2. Technical Approach

### 2.1 MCP Server 架构

#### 2.1.1 FastMCP 初始化与配置

使用官方 MCP Python SDK（`mcp` 包）的 FastMCP 高级 API：

```python
# app/mcp_server.py
from mcp.server.fastmcp import FastMCP

mcp = FastMCP(
    name="Omelette Literature Server",
    json_response=True,  # 工具返回 JSON 字符串，便于 AI 解析
)
```

- **name**：客户端连接时显示的服务器名称
- **json_response**：工具返回结构化 JSON 字符串，便于 LLM 解析和引用

#### 2.1.2 ASGI 子应用挂载到 FastAPI

将 MCP 的 HTTP 应用挂载到主 FastAPI 应用的 `/mcp` 路径：

```python
# app/main.py
from app.mcp_server import mcp

# 在 lifespan 之后、include_router 之后
app.mount("/mcp", mcp.http_app())
```

- `mcp.http_app()` 返回 Starlette ASGI 应用
- Streamable HTTP 传输端点：`/mcp`（推荐，支持多客户端并发）
- 若需兼容旧版 SSE：`mcp.sse_app()` 挂载到 `/sse`

#### 2.1.3 传输模式

| 模式 | 适用场景 | 配置方式 |
|------|----------|----------|
| **Streamable HTTP** | 远程部署时，Claude Desktop / Cursor 远程连接 | `app.mount("/mcp", mcp.http_app())`，客户端连接 `http://host:port/mcp` |
| **stdio** | 本地运行，Claude Desktop 通过子进程调用 | `python -m app.mcp_server`，stdin/stdout 通信 |

### 2.2 MCP Tools（详细设计）

所有工具复用现有 `app/services/` 层，调用 RAGService、SearchService、WritingService 等。

**数据库会话**：MCP 工具不经过 FastAPI 的 `Depends(get_db)`，需在每次工具调用时自行创建 Session。使用 `async_session_factory()` 创建 `AsyncSession`，在 `async with` 内完成业务逻辑并 commit/rollback。

#### 2.2.1 `search_knowledge_base`

**功能**：在指定知识库（Project）中做向量检索，返回相关文献片段。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | str | 是 | 检索问题或关键词 |
| `kb_id` | int | 是 | 知识库 ID（对应 Project.id） |
| `top_k` | int | 否 | 返回片段数量，默认 5 |

**调用**：`RAGService.query(project_id=kb_id, question=query, top_k=top_k, include_sources=True)`

**返回格式**（Markdown 字符串）：

```markdown
## 检索结果

**问题**：{query}

**回答**：{answer}

**引用来源**：
1. [{paper_title}](p.{page_number}) — 相似度：{relevance_score}
   > {excerpt}
```

#### 2.2.2 `lookup_paper`

**功能**：按 DOI 或标题查找论文。优先查找本地数据库，其次通过 Crossref 等外部 API 获取元数据。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `doi` | str | 否 | 论文 DOI（与 title 至少填其一） |
| `title` | str | 否 | 论文标题（模糊匹配） |
| `kb_id` | int | 否 | 限定在指定知识库内查找；不填则全局查找 |

**调用**：

- 若 `doi`：`select(Paper).where(Paper.doi == doi)` 或 Crossref `GET /works/{doi}`
- 若 `title`：`select(Paper).where(Paper.title.ilike(f"%{title}%"))` 或 SearchService 搜索

**返回格式**（Markdown）：

```markdown
## 论文信息

- **标题**：{title}
- **作者**：{authors}
- **期刊**：{journal}
- **年份**：{year}
- **DOI**：{doi}
- **摘要**：{abstract}
- **状态**：{status}
```

#### 2.2.3 `find_citations`

**功能**：为一段文本在知识库中找到可能的引用来源（向量检索 + 相似度排序）。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | str | 是 | 待查找引用的文本片段 |
| `kb_id` | int | 是 | 知识库 ID |

**调用**：`RAGService.query(project_id=kb_id, question=text, top_k=10, include_sources=True)`

**返回格式**（Markdown，带相似度分数）：

```markdown
## 可能的引用来源

1. **{paper_title}** — 相似度：{relevance_score}
   - 来源：p.{page_number}
   - 片段：{excerpt}
```

#### 2.2.4 `list_knowledge_bases`

**功能**：列出所有可用的知识库。

**参数**：无

**调用**：`select(Project).order_by(Project.updated_at.desc())`，统计每库的 `Paper` 数量

**返回格式**（Markdown）：

```markdown
## 知识库列表

| ID | 名称 | 论文数 | 描述 |
|----|------|--------|------|
| 1 | 机器学习综述 | 42 | 深度学习与迁移学习 |
| 2 | 生物信息学 | 18 | 基因组测序相关 |
```

#### 2.2.5 `add_paper_by_doi`

**功能**：通过 DOI 获取论文元数据并添加到指定知识库。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `doi` | str | 是 | 论文 DOI |
| `kb_id` | int | 是 | 目标知识库 ID |

**调用**：

1. Crossref `GET /works/{doi}` 获取元数据
2. 检查是否已存在（`Paper.doi == doi`）
3. 创建 `Paper` 并 `db.add`，触发后续下载/OCR/索引流水线（可选，或仅添加元数据）

**返回格式**：

```markdown
## 添加结果

- **论文**：{title}
- **状态**：已添加 / 已存在（跳过）
- **Paper ID**：{id}
```

#### 2.2.6 `get_paper_summary`

**功能**：获取论文摘要或 LLM 生成的全文总结。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `paper_id` | int | 是 | 论文 ID |
| `summary_type` | str | 否 | `abstract`（仅摘要）或 `llm`（LLM 总结），默认 `abstract` |

**调用**：

- `abstract`：直接返回 `Paper.abstract`
- `llm`：`WritingService.summarize_papers(paper_ids=[paper_id])`

**返回格式**：

```markdown
## 论文摘要

**{title}**

{summary_content}
```

#### 2.2.7 `search_papers_by_keyword`

**功能**：关键词检索论文（多源联合搜索，非向量检索）。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | str | 是 | 检索关键词 |
| `sources` | list[str] | 否 | 数据源：semantic_scholar, openalex, arxiv, crossref，默认全部 |
| `max_results` | int | 否 | 最大返回数，默认 20 |

**调用**：`SearchService.search(query, sources, max_results)`

**返回格式**（Markdown 表格）：

```markdown
## 检索结果

| 标题 | 作者 | 年份 | DOI | 来源 |
|------|------|------|-----|------|
```

### 2.3 MCP Resources

Resources 使用 `omelette://` URI 协议，便于客户端识别和缓存。

| URI | 说明 | 实现 |
|-----|------|------|
| `omelette://knowledge-bases` | 知识库列表 | 返回 JSON 列表，包含 id, name, paper_count, description |
| `omelette://knowledge-bases/{id}` | 知识库详情 | 返回 Project 详情 + 论文数、chunk 数 |
| `omelette://papers/{id}` | 论文详情 | 返回 Paper 元数据（Markdown 格式） |
| `omelette://papers/{id}/chunks` | 论文分块内容 | 返回 PaperChunk 列表（content, page_number, section） |

**实现示例**：

```python
@mcp.resource("omelette://knowledge-bases")
async def list_kb_resource() -> str:
    """知识库列表（Resource 形式）"""
    ...

@mcp.resource("omelette://knowledge-bases/{kb_id}")
async def get_kb_detail(kb_id: str) -> str:
    """知识库详情"""
    ...

@mcp.resource("omelette://papers/{paper_id}")
async def get_paper_resource(paper_id: str) -> str:
    """论文详情"""
    ...

@mcp.resource("omelette://papers/{paper_id}/chunks")
async def get_paper_chunks(paper_id: str) -> str:
    """论文分块"""
    ...
```

### 2.4 MCP Prompts（可选）

预定义提示模板，引导 AI 完成特定任务。

| 名称 | 说明 | 参数 |
|------|------|------|
| `literature_review` | 文献综述 | `topic`, `kb_id`, `language` | 生成综述提纲，引导 AI 调用 search_knowledge_base |
| `citation_finder` | 引用查找 | `text`, `kb_id` | 引导 AI 调用 find_citations |

**实现示例**：

```python
@mcp.prompt()
def literature_review(topic: str, kb_id: int, language: str = "en") -> str:
    """生成文献综述提示"""
    return f"""你正在撰写关于「{topic}」的文献综述。
请使用 search_knowledge_base 工具在知识库 {kb_id} 中检索相关文献。
然后按以下结构组织：1) 背景与动机 2) 主要方法 3) 应用与局限 4) 未来方向。
使用语言：{language}。"""

@mcp.prompt()
def citation_finder(text: str, kb_id: int) -> str:
    """引用查找提示"""
    return f"""以下文本需要添加学术引用。请使用 find_citations 工具在知识库 {kb_id} 中查找相关来源。
待添加引用的文本：
---
{text}
---
返回格式：每个引用标注 [1]、[2]，并在文末列出参考文献。"""
```

### 2.5 stdio 入口

本地运行 MCP Server 时，Claude Desktop 通过子进程启动，使用 stdin/stdout 通信。

**入口**：`python -m app.mcp_server`

**实现** `app/mcp_server.py` 末尾：

```python
if __name__ == "__main__":
    mcp.run(transport="stdio")
```

**Claude Desktop 配置**（`command` + `args`）：

```json
{
  "mcpServers": {
    "omelette": {
      "command": "python",
      "args": ["-m", "app.mcp_server"],
      "cwd": "/path/to/omelette/backend",
      "env": {
        "PYTHONPATH": "/path/to/omelette/backend"
      }
    }
  }
}
```

**注意**：stdio 模式下需确保数据库路径、ChromaDB 路径等配置正确（通过 `.env` 或环境变量）。

### 2.6 安全

| 方面 | 说明 |
|------|------|
| **远程模式认证** | Streamable HTTP 支持 Authorization header。可配置 `MCP_API_TOKEN`，在 `mcp.http_app()` 挂载前添加 Middleware 校验 `Authorization: Bearer <token>` |
| **参数校验** | 所有工具参数使用 Pydantic 或类型注解校验；`kb_id`、`paper_id` 需校验存在性 |
| **错误处理** | 工具内部 try/except，返回友好错误信息而非堆栈，避免泄露内部路径 |
| **本地 stdio** | 无网络暴露，依赖本地文件权限；仅限本机用户使用 |

---

## 3. Client Configuration Examples

### 3.1 Claude Desktop（本地 stdio）

```json
{
  "mcpServers": {
    "omelette": {
      "command": "python",
      "args": ["-m", "app.mcp_server"],
      "cwd": "/home/user/omelette/backend",
      "env": {
        "PYTHONPATH": "/home/user/omelette/backend"
      }
    }
  }
}
```

**配置文件路径**：

- macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows：`%APPDATA%\Claude\claude_desktop_config.json`

### 3.2 Claude Desktop（远程 HTTP）

```json
{
  "mcpServers": {
    "omelette": {
      "url": "http://localhost:8000/mcp"
    }
  }
}
```

若部署到远程服务器且启用认证：

```json
{
  "mcpServers": {
    "omelette": {
      "url": "https://omelette.example.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_TOKEN"
      }
    }
  }
}
```

### 3.3 Cursor MCP 配置

在 Cursor 设置中配置 MCP 服务器（或通过 `.cursor/mcp.json`）：

```json
{
  "mcpServers": {
    "omelette": {
      "command": "python",
      "args": ["-m", "app.mcp_server"],
      "cwd": "/home/user/omelette/backend",
      "env": {
        "PYTHONPATH": "/home/user/omelette/backend"
      }
    }
  }
}
```

或远程：

```json
{
  "mcpServers": {
    "omelette": {
      "url": "http://localhost:8000/mcp"
    }
  }
}
```

### 3.4 Claude Code 配置

Claude Code 通过 `claude_code` 或类似工具的配置文件支持 MCP。配置格式与 Claude Desktop 类似，指定 `command`/`args` 或 `url`。

---

## 4. Implementation Phases

### Phase 1: FastMCP 初始化 + 挂载到 FastAPI（0.5 天）

- [ ] 添加依赖 `mcp>=1.26` 到 `pyproject.toml`
- [ ] 创建 `app/mcp_server.py`，初始化 FastMCP
- [ ] 在 `app/main.py` 中 `app.mount("/mcp", mcp.http_app())`
- [ ] 启动 FastAPI，用 MCP Inspector 连接 `http://localhost:8000/mcp` 验证连通性

### Phase 2: 核心 Tools 实现（1–2 天）

- [ ] `search_knowledge_base`：调用 RAGService.query
- [ ] `lookup_paper`：本地 DB 查询 + Crossref DOI 解析（可选）
- [ ] `find_citations`：复用 RAGService.query，格式化输出
- [ ] `list_knowledge_bases`：调用 Project 列表 + 论文数统计
- [ ] 依赖注入：在 FastMCP 工具中获取 `AsyncSession`（需设计 context 或全局 session 工厂）

### Phase 3: Resources 实现（0.5 天）

- [ ] `omelette://knowledge-bases`
- [ ] `omelette://knowledge-bases/{id}`
- [ ] `omelette://papers/{id}`
- [ ] `omelette://papers/{id}/chunks`

### Phase 4: stdio 入口 + Claude Desktop 测试（0.5 天）

- [ ] `if __name__ == "__main__": mcp.run(transport="stdio")`
- [ ] 编写 `README` 或文档中的 Claude Desktop 配置示例
- [ ] 本地测试：Claude Desktop 连接 stdio 模式，验证工具调用

### Phase 5: 额外 Tools（1 天）

- [ ] `add_paper_by_doi`：Crossref 解析 + Paper 创建
- [ ] `get_paper_summary`：WritingService.summarize_papers
- [ ] `search_papers_by_keyword`：SearchService.search

### Phase 6: 认证 + Prompts（0.5 天）

- [ ] 远程模式：可选 API Token 认证 Middleware
- [ ] `literature_review` Prompt
- [ ] `citation_finder` Prompt

---

## 5. Testing

### 5.1 MCP Inspector

1. 启动 FastAPI：`cd backend && uvicorn app.main:app --reload`
2. 运行 MCP Inspector：`npx -y @modelcontextprotocol/inspector`
3. 选择「Streamable HTTP」，输入 `http://localhost:8000/mcp`
4. 连接后测试 Tools：调用 `list_knowledge_bases`、`search_knowledge_base` 等
5. 测试 Resources：读取 `omelette://knowledge-bases`

### 5.2 stdio 测试

1. 运行 `python -m app.mcp_server`，确认无报错
2. 使用 Claude Desktop 配置 stdio，连接并发送「列出我的知识库」等消息
3. 验证 AI 能正确调用工具并返回结果

### 5.3 单元测试（可选）

- 为 `app/mcp_server.py` 中的工具函数编写 pytest 单元测试
- 使用 Mock 替代 `get_db`、RAGService 等依赖

---

## 6. Acceptance Criteria

| 编号 | 验收标准 |
|------|----------|
| AC1 | FastAPI 启动后，`/mcp` 路径可被 MCP Inspector 连接 |
| AC2 | `list_knowledge_bases` 返回所有 Project 及论文数 |
| AC3 | `search_knowledge_base(query, kb_id)` 返回 RAG 检索结果及引用来源 |
| AC4 | `lookup_paper(doi=...)` 或 `lookup_paper(title=...)` 返回论文 Markdown 信息 |
| AC5 | `find_citations(text, kb_id)` 返回带相似度分数的引用列表 |
| AC6 | `add_paper_by_doi(doi, kb_id)` 成功添加论文到知识库 |
| AC7 | `get_paper_summary(paper_id)` 返回摘要或 LLM 总结 |
| AC8 | `search_papers_by_keyword(query)` 返回多源检索结果 |
| AC9 | Resources `omelette://knowledge-bases`、`omelette://papers/{id}` 可访问 |
| AC10 | stdio 模式 `python -m app.mcp_server` 可被 Claude Desktop 连接 |
| AC11 | 所有工具参数校验正确，非法输入返回友好错误 |
| AC12 | 文档中包含 Claude Desktop、Cursor 配置示例 |

---

## 7. Dependencies

```toml
# pyproject.toml 新增
dependencies = [
    # ... 现有依赖
    "mcp>=1.26",
]
```

- **mcp**：官方 MCP Python SDK，包含 FastMCP、stdio、Streamable HTTP 支持
- **版本**：>=1.26 确保 `http_app()`、`run(transport="stdio")` 等 API 可用

---

## 8. 附录：与现有架构的对应关系

| 概念 | Omelette 现有 | MCP 暴露 |
|------|---------------|----------|
| 知识库 | Project | kb_id，对应 Project.id |
| 论文 | Paper | paper_id |
| 向量检索 | RAGService.query | search_knowledge_base, find_citations |
| 多源检索 | SearchService.search | search_papers_by_keyword |
| 论文添加 | search/execute + auto_import | add_paper_by_doi |
| 摘要 | WritingService.summarize_papers | get_paper_summary |
| 论文详情 | Project 下 Paper CRUD | lookup_paper, Resources |
