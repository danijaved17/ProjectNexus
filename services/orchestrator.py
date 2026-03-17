"""
Orchestrator — fans out to all 3 models concurrently via OpenRouter.

Uses the `openai` Python SDK pointed at OpenRouter's base URL, which exposes
an OpenAI-compatible chat completions endpoint.
"""

import os
import time
import asyncio
import openai
from dotenv import load_dotenv

load_dotenv()

# Point the openai client at OpenRouter instead of OpenAI
_client = openai.AsyncOpenAI(
    api_key=os.environ["OPENROUTER_API_KEY"],
    base_url="https://openrouter.ai/api/v1",
)

# The three models to call, with their display labels
_MODELS = [
    {"model_id": "openai/gpt-4o-mini",              "label": "gpt-4o-mini"},
    {"model_id": "anthropic/claude-3-5-haiku",       "label": "claude-haiku"},
    {"model_id": "google/gemini-2.5-flash",          "label": "gemini-flash"},
]


async def _call_model(prompt: str, model_id: str, label: str, history: list[dict]) -> dict:
    """
    Call a single model via OpenRouter and return its response with metadata.

    `history` is a list of {role, content} dicts representing prior messages
    in the conversation — passed as context so the model isn't flying blind.
    """
    # Build the full message list: prior history + the new user prompt
    messages = [*history, {"role": "user", "content": prompt}]

    start = time.time()
    response = await _client.chat.completions.create(
        model=model_id,
        messages=messages,
    )
    latency_ms = int((time.time() - start) * 1000)  # Convert seconds → milliseconds

    content = response.choices[0].message.content

    return {
        "model": label,
        "model_id": model_id,
        "content": content,
        "latency_ms": latency_ms,
    }


async def fan_out(prompt: str, history: list[dict]) -> list[dict]:
    """
    Call all 3 models concurrently. Returns list of successful response dicts.

    return_exceptions=True means a single model failure won't cancel the others —
    we collect all results and filter out exceptions afterward.
    Raises RuntimeError if fewer than 2 models succeed (can't run a meaningful comparison).
    """
    tasks = [
        _call_model(prompt, m["model_id"], m["label"], history)
        for m in _MODELS
    ]
    # return_exceptions=True: failed tasks return the exception object instead of raising
    raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    successful = []
    for i, result in enumerate(raw_results):
        if isinstance(result, Exception):
            # Log which model failed and why, but keep going
            print(f"[orchestrator] {_MODELS[i]['label']} failed: {result}")
        else:
            successful.append(result)

    if len(successful) < 2:
        failed = [_MODELS[i]["label"] for i, r in enumerate(raw_results) if isinstance(r, Exception)]
        raise RuntimeError(f"Too many model failures ({', '.join(failed)}). Need at least 2 responses to judge.")

    return successful
