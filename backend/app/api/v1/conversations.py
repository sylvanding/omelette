"""Conversation CRUD API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db
from app.models.conversation import Conversation
from app.models.message import Message
from app.schemas.common import ApiResponse, PaginatedData
from app.schemas.conversation import (
    ConversationCreateSchema,
    ConversationListSchema,
    ConversationSchema,
    ConversationUpdateSchema,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=ApiResponse[PaginatedData[ConversationListSchema]], summary="List conversations")
async def list_conversations(
    page: int = 1,
    page_size: int = 20,
    knowledge_base_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List conversations, newest first."""
    kb_filter = None
    if knowledge_base_id is not None:
        kb_filter = text(
            "EXISTS (SELECT 1 FROM json_each(conversations.knowledge_base_ids) WHERE value = :kb_id)"
        ).bindparams(kb_id=knowledge_base_id)

    count_base = select(func.count(Conversation.id))
    if kb_filter is not None:
        count_base = count_base.where(kb_filter)
    total = (await db.execute(count_base)).scalar_one()

    msg_count_sq = (
        select(func.count(Message.id))
        .where(Message.conversation_id == Conversation.id)
        .correlate(Conversation)
        .scalar_subquery()
        .label("message_count")
    )
    last_msg_sq = (
        select(Message.content)
        .where(Message.conversation_id == Conversation.id)
        .order_by(Message.created_at.desc())
        .limit(1)
        .correlate(Conversation)
        .scalar_subquery()
        .label("last_message")
    )

    detail_stmt = (
        select(Conversation, msg_count_sq, last_msg_sq)
        .order_by(Conversation.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    if kb_filter is not None:
        detail_stmt = detail_stmt.where(kb_filter)

    detail_result = await db.execute(detail_stmt)

    items = [
        ConversationListSchema(
            id=conv.id,
            title=conv.title,
            knowledge_base_ids=conv.knowledge_base_ids,
            model=conv.model,
            tool_mode=conv.tool_mode,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            message_count=msg_count or 0,
            last_message_preview=(last_msg_content[:100] if last_msg_content else ""),
        )
        for conv, msg_count, last_msg_content in detail_result.all()
    ]

    total_pages = (total + page_size - 1) // page_size if total > 0 else 1

    return ApiResponse(
        data=PaginatedData(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )
    )


@router.post("", response_model=ApiResponse[ConversationSchema], summary="Create conversation")
async def create_conversation(
    body: ConversationCreateSchema,
    db: AsyncSession = Depends(get_db),
):
    """Create a new conversation."""
    conv = Conversation(
        title=body.title or "新对话",
        knowledge_base_ids=body.knowledge_base_ids,
        model=body.model,
        tool_mode=body.tool_mode,
    )
    db.add(conv)
    await db.flush()

    result = await db.execute(
        select(Conversation).where(Conversation.id == conv.id).options(selectinload(Conversation.messages))
    )
    conv = result.scalar_one()
    return ApiResponse(data=ConversationSchema.model_validate(conv))


@router.get("/{conversation_id}", response_model=ApiResponse[ConversationSchema], summary="Get conversation")
async def get_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get conversation with all messages."""
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id).options(selectinload(Conversation.messages))
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ApiResponse(data=ConversationSchema.model_validate(conv))


@router.put("/{conversation_id}", response_model=ApiResponse[ConversationSchema], summary="Update conversation")
async def update_conversation(
    conversation_id: int,
    body: ConversationUpdateSchema,
    db: AsyncSession = Depends(get_db),
):
    """Update conversation title or settings."""
    result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(conv, field, value)

    result2 = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id).options(selectinload(Conversation.messages))
    )
    conv = result2.scalar_one()
    return ApiResponse(data=ConversationSchema.model_validate(conv))


@router.delete("/{conversation_id}", response_model=ApiResponse[dict], summary="Delete conversation")
async def delete_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete conversation and all messages (cascade)."""
    result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    await db.delete(conv)
    return ApiResponse(data={"deleted": True, "id": conversation_id})
