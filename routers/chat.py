"""
POST /chat — the main endpoint.

Flow:
  1. Create/resolve conversation in DB
  2. Fan out to 3 models concurrently
  3. Run judge
  4. Write all DB rows
  5. Stream SSE events: token → scores → follow_up (if any) → done
"""

import json
from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from models.schemas import ChatRequest
from services.orchestrator import fan_out
from services.judge import run_judge
import services.supabase_client as db

router = APIRouter()


@router.post("/chat")
async def handle_chat(request: ChatRequest):
    """Accepts a prompt, fans out to 3 models, judges, and streams SSE events."""
    return EventSourceResponse(_stream(request))


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
        conversation_id = str(request.conversation_id) if request.conversation_id else None

        # --- Step 1: Resolve conversation ---
        if not conversation_id:
            # Truncate prompt to 60 chars as the conversation title
            title = request.prompt[:60]
            conversation_id = db.create_conversation(title)

        # --- Step 2: Load conversation history for context ---
        history = db.get_conversation_history(conversation_id)

        # --- Step 3: Fan out to all 3 models concurrently ---
        model_results = await fan_out(request.prompt, history)

        # --- Step 4: Run judge over the 3 responses ---
        judge_result = await run_judge(request.prompt, model_results)

        # --- Step 5: Write all DB rows ---

        # Save the user message (now we know prompt_type from the judge)
        user_msg_id = db.save_message(
            conversation_id=conversation_id,
            role="user",
            content=request.prompt,
            prompt_type=judge_result["prompt_type"],
        )

        # Save the winning assistant message
        assistant_msg_id = db.save_message(
            conversation_id=conversation_id,
            role="assistant",
            content=judge_result["winner_content"],
            prompt_type=judge_result["prompt_type"],
        )

        # Save all 3 model responses linked to the assistant message
        db.save_model_responses(
            message_id=assistant_msg_id,
            responses=judge_result["responses"],
            judge_reason=judge_result["judge_reason"],
        )

        # Save follow-up if the judge generated one
        if judge_result["follow_up"]:
            db.save_follow_up(
                message_id=assistant_msg_id,
                question=judge_result["follow_up"],
            )

        # --- Step 6: Stream SSE events ---

        # Stream the winning response word-by-word as `token` events.
        # Models are called non-streaming (full response at once), so we simulate
        # streaming by chunking the complete text into words.
        words = judge_result["winner_content"].split(" ")
        for i, word in enumerate(words):
            # Re-add the space between words (except before the first word)
            chunk = word if i == 0 else " " + word
            yield {"event": "token", "data": json.dumps({"text": chunk})}

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

        # Signal the client that the stream is complete
        yield {"event": "done", "data": json.dumps({})}

    except Exception as e:
        # Forward the error to the client before closing the stream —
        # without this the frontend just sees a dropped connection with no context
        yield {"event": "error", "data": json.dumps({"message": str(e)})}
        raise  # Re-raise so the server logs still show the full traceback
