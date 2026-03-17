"""Schemas for conversations and messages."""

from datetime import datetime

from pydantic import BaseModel, Field


class MessageSchema(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    citations: list[dict] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationSchema(BaseModel):
    id: int
    title: str
    knowledge_base_ids: list[int] | None = None
    model: str = ""
    tool_mode: str = "qa"
    created_at: datetime
    updated_at: datetime
    messages: list[MessageSchema] = []

    model_config = {"from_attributes": True}


class ConversationListSchema(BaseModel):
    id: int
    title: str
    knowledge_base_ids: list[int] | None = None
    model: str = ""
    tool_mode: str = "qa"
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
    last_message_preview: str = ""

    model_config = {"from_attributes": True}


class ConversationCreateSchema(BaseModel):
    title: str = ""
    knowledge_base_ids: list[int] | None = None
    model: str = ""
    tool_mode: str = "qa"


class ConversationUpdateSchema(BaseModel):
    title: str | None = None
    model: str | None = None
    tool_mode: str | None = None


class ChatStreamRequest(BaseModel):
    conversation_id: int | None = None
    knowledge_base_ids: list[int] = Field(default_factory=list, max_length=20)
    model: str | None = None
    tool_mode: str = "qa"
    message: str = Field(min_length=1)
    rag_top_k: int = Field(default=10, ge=1, le=50, description="RAG retrieval top-k")
    use_reranker: bool = Field(default=False, description="Apply reranker to retrieved nodes")
