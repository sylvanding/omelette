# MCP Integration

Omelette exposes its capabilities via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/), allowing AI coding assistants like Claude Code, Codex, and Cursor to interact with your scientific knowledge bases.

## Overview

The MCP server runs as an ASGI sub-application mounted at `/mcp` on the Omelette backend. It provides:

- **Tools**: Executable actions (search, lookup, add papers)
- **Resources**: Read-only data access (knowledge bases, papers, chunks)
- **Prompts**: Pre-built prompt templates for common tasks

## Available Tools

| Tool | Description |
|------|-------------|
| `list_knowledge_bases` | List all knowledge bases with paper counts |
| `search_knowledge_base` | RAG-powered semantic search within a knowledge base |
| `lookup_paper` | Find paper by DOI or title (local DB + Crossref) |
| `find_citations` | Find citation candidates for a given text passage |
| `add_paper_by_doi` | Add a paper to a knowledge base by DOI |
| `get_paper_summary` | Get paper metadata and abstract |
| `search_papers_by_keyword` | Multi-source federated keyword search |

## Available Resources

| URI Pattern | Description |
|-------------|-------------|
| `omelette://knowledge-bases` | List all knowledge bases |
| `omelette://knowledge-bases/{id}` | Knowledge base details with paper list |
| `omelette://papers/{id}` | Paper metadata |
| `omelette://papers/{id}/chunks` | Paper text chunks |

## Connecting from AI IDEs

### Claude Code / Codex

Add to your MCP configuration:

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

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "omelette": {
      "url": "http://localhost:8000/mcp"
    }
  }
}
```

### Stdio Mode

For local development without HTTP:

```bash
cd backend
python -m app.mcp_server
```

## Example Usage

Once connected, you can ask your AI assistant:

- "Search the ML knowledge base for papers about transformer attention"
- "Find citations for this paragraph: ..."
- "Add the paper with DOI 10.1234/example to my knowledge base"
- "Summarize paper #42"
