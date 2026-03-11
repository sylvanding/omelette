"""Conversation CRUD API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
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


@router.get("", response_model=ApiResponse[PaginatedData[ConversationListSchema]])
async def list_conversations(
    page: int = 1,
    page_size: int = 20,
    knowledge_base_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List conversations, newest first."""
    stmt = select(Conversation).order_by(Conversation.updated_at.desc())

    if knowledge_base_id is not None:
        stmt = stmt.where(
            Conversation.knowledge_base_ids.isnot(None),
        )

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    conversations = result.scalars().all()

    items = []
    for conv in conversations:
        if knowledge_base_id is not None:
            kb_ids = conv.knowledge_base_ids or []
            if knowledge_base_id not in kb_ids:
                continue

        msg_count_result = await db.execute(select(func.count()).where(Message.conversation_id == conv.id))
        msg_count = msg_count_result.scalar_one()

        last_msg_result = await db.execute(
            select(Message).where(Message.conversation_id == conv.id).order_by(Message.created_at.desc()).limit(1)
        )
        last_msg = last_msg_result.scalar_one_or_none()

        items.append(
            ConversationListSchema(
                id=conv.id,
                title=conv.title,
                knowledge_base_ids=conv.knowledge_base_ids,
                model=conv.model,
                tool_mode=conv.tool_mode,
                created_at=conv.created_at,
                updated_at=conv.updated_at,
                message_count=msg_count,
                last_message_preview=(last_msg.content[:100] if last_msg else ""),
            )
        )

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


@router.post("", response_model=ApiResponse[ConversationSchema])
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
    await db.commit()

    result = await db.execute(
        select(Conversation).where(Conversation.id == conv.id).options(selectinload(Conversation.messages))
    )
    conv = result.scalar_one()
    return ApiResponse(data=ConversationSchema.model_validate(conv))


@router.get("/{conversation_id}", response_model=ApiResponse[ConversationSchema])
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


@router.put("/{conversation_id}", response_model=ApiResponse[ConversationSchema])
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

    await db.commit()

    result2 = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id).options(selectinload(Conversation.messages))
    )
    conv = result2.scalar_one()
    return ApiResponse(data=ConversationSchema.model_validate(conv))


@router.delete("/{conversation_id}", response_model=ApiResponse[dict])
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
    await db.commit()
    return ApiResponse(data={"deleted": True, "id": conversation_id})
