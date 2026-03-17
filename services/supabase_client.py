"""
Supabase client and all database read/write operations.

--- SQL SCHEMA (run manually in Supabase SQL editor) ---

create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text,
  created_at timestamp with time zone default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text check (role in ('user', 'assistant')),
  content text,
  prompt_type text,
  created_at timestamp with time zone default now()
);

create table model_responses (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references messages(id) on delete cascade,
  model_name text,
  content text,
  latency_ms integer,
  score integer,
  is_winner boolean default false,
  judge_reason text
);

create table follow_ups (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references messages(id) on delete cascade,
  question text
);

--------------------------------------------------------
"""

import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

_supabase: Client = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_KEY"],
)


def create_conversation(title: str) -> str:
    """Insert a new conversation row and return its id."""
    result = _supabase.table("conversations").insert({"title": title}).execute()
    return result.data[0]["id"]


def save_message(conversation_id: str, role: str, content: str, prompt_type: str | None = None) -> str:
    """Insert a message row and return its id."""
    result = _supabase.table("messages").insert({
        "conversation_id": conversation_id,
        "role": role,
        "content": content,
        "prompt_type": prompt_type,
    }).execute()
    return result.data[0]["id"]


def save_model_responses(message_id: str, responses: list[dict], judge_reason: str) -> None:
    """Insert one row per model response into model_responses."""
    rows = [
        {
            "message_id": message_id,
            "model_name": r["model"],
            "content": r["content"],
            "latency_ms": r["latency_ms"],
            "score": r["score"],
            "is_winner": r["is_winner"],
            "judge_reason": judge_reason if r["is_winner"] else None,
        }
        for r in responses
    ]
    _supabase.table("model_responses").insert(rows).execute()


def save_follow_up(message_id: str, question: str) -> None:
    """Insert a follow-up question linked to the assistant message."""
    _supabase.table("follow_ups").insert({
        "message_id": message_id,
        "question": question,
    }).execute()


def get_conversations() -> list[dict]:
    """Return all conversations ordered by most recent first."""
    result = _supabase.table("conversations") \
        .select("id, title, created_at") \
        .order("created_at", desc=True) \
        .execute()
    return result.data


def get_messages(conversation_id: str) -> list[dict]:
    """Return all messages in a conversation ordered oldest first."""
    result = _supabase.table("messages") \
        .select("id, role, content, created_at") \
        .eq("conversation_id", conversation_id) \
        .order("created_at") \
        .execute()
    return result.data


def delete_conversation(conversation_id: str) -> None:
    """Delete a conversation — cascades to messages, model_responses, follow_ups."""
    _supabase.table("conversations").delete().eq("id", conversation_id).execute()


def get_conversation_history(conversation_id: str) -> list[dict]:
    """
    Return conversation messages in OpenAI message format: [{role, content}, ...]
    Used to pass full context to each model on every request.
    """
    result = _supabase.table("messages") \
        .select("role, content") \
        .eq("conversation_id", conversation_id) \
        .order("created_at") \
        .execute()
    return [{"role": row["role"], "content": row["content"]} for row in result.data]
