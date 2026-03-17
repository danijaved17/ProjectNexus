from pydantic import BaseModel
from typing import Optional
from uuid import UUID


class ChatRequest(BaseModel):
    prompt: str
    conversation_id: Optional[UUID] = None


class ModelResponse(BaseModel):
    model: str
    score: int
    latency_ms: int
    is_winner: bool
    content: str


class ScoresPayload(BaseModel):
    responses: list[ModelResponse]
    judge_reason: str


class ConversationOut(BaseModel):
    id: str
    title: Optional[str]
    created_at: str


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    created_at: str
