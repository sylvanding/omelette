# Chat Playground

The Chat Playground provides a ChatGPT-style interface for interacting with your scientific knowledge bases.

## Overview

- **SSE Streaming**: Real-time token-by-token responses via Server-Sent Events
- **Knowledge Base Selection**: Choose one or more knowledge bases for RAG-augmented answers
- **Tool Modes**: Switch between QA, citation lookup, review outline, and gap analysis
- **Rich Rendering**: Markdown with LaTeX math (KaTeX), code highlighting, and inline citations

## Tool Modes

| Mode | Description |
|------|-------------|
| **QA** (default) | Ask questions answered using RAG from selected knowledge bases |
| **Citation Lookup** | Provide a text passage, find matching citations from your papers |
| **Review Outline** | Generate a structured literature review outline |
| **Gap Analysis** | Identify research gaps in the selected knowledge base |

## API Endpoints

```
POST /api/v1/chat/stream          # SSE streaming chat
GET  /api/v1/conversations        # List conversations
POST /api/v1/conversations        # Create conversation
GET  /api/v1/conversations/{id}   # Get with messages
DELETE /api/v1/conversations/{id} # Delete conversation
```

## Architecture

```
Frontend (useChat) → POST /chat/stream → LLMClient (LangChain)
                                              ↓
                                        RAGService (LlamaIndex)
                                              ↓
                                        ChromaDB Vector Store
```

The chat system uses LangChain's `BaseChatModel` abstraction, allowing seamless switching between providers (OpenAI, Anthropic, Ollama, etc.) via the Settings page or `.env` configuration.
