"""
POST /chat — the main endpoint.

Flow:
  1. Create/resolve conversation in DB
  2. Fan out to 3 models concurrently
  3. Run judge
  4. Write all DB rows
  5. Stream SSE events: token → scores → follow_up (if any) → done
"""

import hmac
import json
import asyncio
import os
import logging
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

logger = logging.getLogger(__name__)

from models.schemas import ChatRequest
from services.orchestrator import fan_out
from services.judge import run_judge
from services.term_extractor import extract_terms
from services.rate_limiter import check_and_increment, get_global_status
import services.supabase_client as db

router = APIRouter()

_MASTER_KEY = os.environ.get("MASTER_KEY", "")


@router.get("/demo/status")
async def demo_status():
    """Returns remaining global prompt quota for demo users."""
    return await get_global_status()


async def _run_models_and_judge(prompt: str, history: list) -> tuple:
    """Run fan-out and judge sequentially, returned as a tuple for the ping loop."""
    model_results = await fan_out(prompt, history)
    judge_result = await run_judge(prompt, model_results)
    return model_results, judge_result


@router.post("/chat")
async def handle_chat(request: ChatRequest, req: Request):
    """Accepts a prompt, fans out to 3 models, judges, and streams SSE events."""
    master_key = req.headers.get("X-Master-Key", "")
    is_master = bool(_MASTER_KEY and hmac.compare_digest(master_key, _MASTER_KEY))

    prompts_used: int | None = None

    if not is_master:
        session_id = req.headers.get("X-Session-Id", "")
        if not session_id:
            return JSONResponse(status_code=400, content={"detail": "missing_session_id"})
        # May raise 429 with detail "session_limit" or "global_limit"
        prompts_used = await check_and_increment(session_id)

    response = EventSourceResponse(_stream(request))
    response.headers["X-Accel-Buffering"] = "no"  # Disable nginx buffering on Railway
    response.headers["Cache-Control"] = "no-cache"
    if prompts_used is not None:
        response.headers["X-Prompts-Used"] = str(prompts_used)
    return response


async def _stream(request: ChatRequest):
    """
    Async generator that drives all work and yields SSE events.

    We do all compute + DB writes before streaming so the client gets a clean,
    ordered event sequence without any partial-state issues.

    The entire body is wrapped in try/except so any failure — model call, judge,
    or DB write — is forwarded to the client as an `error` event instead of
    silently dropping the connection.
    """
    try:
        # Ping immediately so Railway/proxies know the connection is alive
        yield {"event": "ping", "data": json.dumps({})}

        conversation_id = str(request.conversation_id) if request.conversation_id else None

        # --- Step 1: Resolve conversation ---
        if not conversation_id:
            title = request.prompt[:60]
            conversation_id = db.create_conversation(title)

        # Emit conversation_id so the frontend can track this conversation
        yield {"event": "conversation_id", "data": json.dumps({"id": conversation_id, "title": request.prompt[:60]})}

        # --- Step 2: Load conversation history for context ---
        history = db.get_conversation_history(conversation_id)

        # --- Step 3: Fan out to all 3 models + judge concurrently,
        #     sending keepalive pings every 5s so the proxy doesn't drop the connection ---
        work_task = asyncio.create_task(_run_models_and_judge(request.prompt, history))
        while not work_task.done():
            yield {"event": "ping", "data": json.dumps({})}
            await asyncio.sleep(5)
        model_results, judge_result = await work_task

        # --- Step 5: Write all DB rows in the background ---
        # Fire-and-forget so DB writes don't block token streaming from starting.
        # Streaming takes ~2–3s, which is more than enough for the writes to finish.
        def _do_db_writes():
            user_msg_id = db.save_message(
                conversation_id=conversation_id,
                role="user",
                content=request.prompt,
                prompt_type=judge_result["prompt_type"],
            )
            assistant_msg_id = db.save_message(
                conversation_id=conversation_id,
                role="assistant",
                content=judge_result["winner_content"],
                prompt_type=judge_result["prompt_type"],
            )
            db.save_model_responses(
                message_id=assistant_msg_id,
                responses=judge_result["responses"],
                judge_reason=judge_result["judge_reason"],
            )
            if judge_result["follow_up"]:
                db.save_follow_up(
                    message_id=assistant_msg_id,
                    question=judge_result["follow_up"],
                )

        asyncio.create_task(asyncio.to_thread(_do_db_writes))

        # --- Step 6: Stream SSE events ---

        # Kick off term extraction concurrently with token streaming.
        # By the time all tokens finish streaming (~3s), the extraction call (~1s) is already done.
        terms_task = asyncio.create_task(extract_terms(judge_result["winner_content"]))

        # Stream the winning response word-by-word as `token` events.
        # Models are called non-streaming (full response at once), so we simulate
        # streaming by chunking the complete text into words.
        words = judge_result["winner_content"].split(" ")
        for i, word in enumerate(words):
            # Re-add the space between words (except before the first word)
            chunk = word if i == 0 else " " + word
            yield {"event": "token", "data": json.dumps({"text": chunk})}
            await asyncio.sleep(0.02)  # 20ms between words so browser receives tokens incrementally

        # By now the term extraction task should be complete
        terms = await terms_task

        # Emit the scores event with all 3 responses + judge metadata
        scores_payload = {
            "responses": [
                {
                    "model": r["model"],
                    "score": r["score"],
                    "latency_ms": r["latency_ms"],
                    "is_winner": r["is_winner"],
                    "content": r["content"],
                }
                for r in judge_result["responses"]
            ],
            "judge_reason": judge_result["judge_reason"],
        }
        yield {"event": "scores", "data": json.dumps(scores_payload)}

        # Emit follow_up event only if the judge produced a question
        if judge_result["follow_up"]:
            yield {"event": "follow_up", "data": json.dumps({"question": judge_result["follow_up"]})}

        # Emit terms only if the extractor found any complex terms
        if terms:
            yield {"event": "terms", "data": json.dumps({"terms": terms})}

        # Signal the client that the stream is complete
        yield {"event": "done", "data": json.dumps({})}

    except Exception as e:
        logger.error("Stream error: %s", e, exc_info=True)
        yield {"event": "error", "data": json.dumps({"message": "An error occurred. Please try again."})}
        raise
