"""
Conversation management routes:
  GET  /conversations        — list all conversations
  GET  /conversations/{id}   — get all messages in a conversation
  DELETE /conversations/{id} — delete conversation + cascade
"""

from fastapi import APIRouter
import services.supabase_client as db

router = APIRouter()


@router.get("/conversations")
async def list_conversations():
    """Return all conversations ordered by most recent first."""
    return db.get_conversations()


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    """Return all messages in a conversation ordered oldest first."""
    return db.get_messages(conversation_id)


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    """
    Delete a conversation and all related data.
    Cascade is handled at the DB level (foreign key ON DELETE CASCADE),
    so this single delete removes messages, model_responses, and follow_ups too.
    """
    db.delete_conversation(conversation_id)
    return {"deleted": conversation_id}
