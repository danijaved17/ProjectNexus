"""
Demo rate limiting.

Two guards:
  1. Per-session: 5 prompts max (tracked in demo_sessions table)
  2. Global: 50 total prompts across all non-master sessions (tracked in demo_config)

Master key bypass: if X-Master-Key matches MASTER_KEY env var, skip all checks.

SQL to run in Supabase before using this:

    create table demo_sessions (
      session_id text primary key,
      prompt_count integer default 0,
      created_at timestamp with time zone default now()
    );

    create table demo_config (
      id integer primary key default 1,
      total_prompts_used integer default 0,
      max_total_prompts integer default 50
    );

    insert into demo_config (id, total_prompts_used, max_total_prompts) values (1, 0, 50);
"""

import asyncio
from fastapi import HTTPException

SESSION_LIMIT = 5


async def check_and_increment(session_id: str) -> int:
    """
    Enforce per-session and global limits, then increment both counters.

    Returns the new per-session prompt count so the caller can send it
    back as X-Prompts-Used.

    Raises HTTPException(429) with detail "session_limit" or "global_limit".
    """
    session_row, config_row = await asyncio.gather(
        asyncio.to_thread(_get_or_create_session, session_id),
        asyncio.to_thread(_get_config),
    )

    current_count: int = session_row["prompt_count"]
    total_used: int = config_row["total_prompts_used"]
    max_total: int = config_row["max_total_prompts"]

    if current_count >= SESSION_LIMIT:
        raise HTTPException(status_code=429, detail="session_limit")

    if total_used >= max_total:
        raise HTTPException(status_code=429, detail="global_limit")

    new_session_count = current_count + 1
    new_total = total_used + 1

    await asyncio.gather(
        asyncio.to_thread(_set_session_count, session_id, new_session_count),
        asyncio.to_thread(_set_global_count, new_total),
    )

    return new_session_count


# ---------------------------------------------------------------------------
# Sync helpers (run in thread pool so they don't block the event loop)
# ---------------------------------------------------------------------------

def _get_or_create_session(session_id: str) -> dict:
    from services.supabase_client import _supabase
    result = _supabase.table("demo_sessions") \
        .select("session_id, prompt_count") \
        .eq("session_id", session_id) \
        .execute()
    if result.data:
        return result.data[0]
    _supabase.table("demo_sessions").insert({"session_id": session_id, "prompt_count": 0}).execute()
    return {"session_id": session_id, "prompt_count": 0}


def _get_config() -> dict:
    from services.supabase_client import _supabase
    result = _supabase.table("demo_config").select("*").eq("id", 1).execute()
    return result.data[0]


def _set_session_count(session_id: str, new_count: int) -> None:
    from services.supabase_client import _supabase
    _supabase.table("demo_sessions") \
        .update({"prompt_count": new_count}) \
        .eq("session_id", session_id) \
        .execute()


def _set_global_count(new_total: int) -> None:
    from services.supabase_client import _supabase
    _supabase.table("demo_config") \
        .update({"total_prompts_used": new_total}) \
        .eq("id", 1) \
        .execute()
