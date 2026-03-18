"""
Term extractor — identifies complex/technical terms in the winning response.

Uses gpt-4o-mini via OpenRouter (same client as orchestrator) to keep cost low.
Called concurrently with token streaming so it adds zero extra latency.
"""

import os
import re
import json
import openai
from dotenv import load_dotenv

load_dotenv()

_client = openai.AsyncOpenAI(
    api_key=os.environ["OPENROUTER_API_KEY"],
    base_url="https://openrouter.ai/api/v1",
)

_SYSTEM = (
    "You are a technical term identifier. Given a text, return ONLY a valid JSON array "
    "of 3 to 7 complex technical, scientific, or domain-specific terms that a non-expert "
    "might not understand. Multi-word terms are fine (e.g. 'gradient descent'). "
    "Return [] if there are fewer than 3 such terms. "
    "No markdown fences, no explanation, no preamble — just the JSON array."
)


async def extract_terms(text: str) -> list[str]:
    """Return a list of complex terms found in `text`. Returns [] on any failure."""
    try:
        response = await _client.chat.completions.create(
            model="openai/gpt-4o-mini",
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": text},
            ],
            max_tokens=200,
        )
        raw = response.choices[0].message.content.strip()
        # Strip markdown fences in case the model ignores instructions
        raw = re.sub(r"^```(?:json)?\s*\n?|\n?```$", "", raw)
        result = json.loads(raw)
        # Validate it's a list of strings
        if isinstance(result, list) and all(isinstance(t, str) for t in result):
            return result
        return []
    except Exception:
        # Term extraction is best-effort — never block the main response on failure
        return []
