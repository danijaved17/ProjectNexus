"""
Judge service — uses Anthropic API directly (claude-sonnet-4-5) to:
  1. Classify the prompt type
  2. Score all 3 responses blindly (A/B/C) using weighted criteria
  3. Detect ties (within 8 pts) and resolve randomly
  4. Generate a follow-up question for factual/conversational prompts
"""

import os
import re
import json
import random
import anthropic
from dotenv import load_dotenv

load_dotenv()

# AsyncAnthropic — must be async so we don't block FastAPI's event loop
_client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

# Scoring weights per prompt type (must sum to 100 per column)
_WEIGHTS = {
    "factual":        {"relevance": 30, "depth": 10, "detail": 10, "quality": 30, "appropriateness": 20},
    "analytical":     {"relevance": 20, "depth": 25, "detail": 25, "quality": 20, "appropriateness": 10},
    "creative":       {"relevance": 20, "depth": 20, "detail": 15, "quality": 25, "appropriateness": 20},
    "conversational": {"relevance": 30, "depth": 10, "detail": 10, "quality": 30, "appropriateness": 20},
}

_JUDGE_SYSTEM = """You are an impartial AI judge evaluating three responses to a user prompt.

Your task:
1. Classify the prompt as one of: factual, analytical, creative, conversational
2. Score each response (labeled A, B, C — you do not know which model wrote which) on five criteria, each 1–10:
   - relevance: How directly does it address the prompt?
   - depth: How thorough is the reasoning or explanation?
   - detail: How specific and precise is the information?
   - quality: How well-written and clear is the response?
   - appropriateness: Is the tone and format right for the prompt type?
3. Apply the correct weights for the prompt type:
   - factual:        relevance×30 + depth×10 + detail×10 + quality×30 + appropriateness×20
   - analytical:     relevance×20 + depth×25 + detail×25 + quality×20 + appropriateness×10
   - creative:       relevance×20 + depth×20 + detail×15 + quality×25 + appropriateness×20
   - conversational: relevance×30 + depth×10 + detail×10 + quality×30 + appropriateness×20
   Divide the weighted sum by 10 to get a score out of 100.
4. Select the winner (highest total). If top two scores are within 8 points, set is_tied to true and pick winner randomly between them.
5. Write a concise judge_reason (1–2 sentences) explaining why the winner was best.
6. If prompt_type is factual or conversational, generate one relevant follow_up question. Otherwise set follow_up to null.

Return ONLY valid JSON with this exact shape — no markdown fences, no preamble:
{
  "prompt_type": "factual|analytical|creative|conversational",
  "scores": {
    "A": {"relevance": 0, "depth": 0, "detail": 0, "quality": 0, "appropriateness": 0, "total": 0},
    "B": {"relevance": 0, "depth": 0, "detail": 0, "quality": 0, "appropriateness": 0, "total": 0},
    "C": {"relevance": 0, "depth": 0, "detail": 0, "quality": 0, "appropriateness": 0, "total": 0}
  },
  "winner": "A|B|C",
  "is_tied": false,
  "judge_reason": "string",
  "follow_up": "string or null"
}"""


async def run_judge(prompt: str, responses: list[dict]) -> dict:
    """
    Run the judge over 3 model responses.

    `responses` is a list of dicts with keys: model, label, content, latency_ms
    Returns a dict with judge results plus the original responses annotated with scores.
    """
    # Shuffle before labeling to eliminate positional bias in the judge
    # (without this, asyncio.gather always returns the same order so the judge
    # would consistently see the same model as "C" and tend to favour it)
    shuffled = responses.copy()
    random.shuffle(shuffled)

    labels = ["A", "B", "C"][:len(shuffled)]
    label_map = {labels[i]: shuffled[i] for i in range(len(shuffled))}

    response_blocks = "\n\n".join(
        f"Response {labels[i]}:\n{shuffled[i]['content']}" for i in range(len(shuffled))
    )
    user_message = f"User prompt: {prompt}\n\n{response_blocks}"

    # Call Anthropic directly — not via OpenRouter
    message = await _client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        system=_JUDGE_SYSTEM,
        messages=[{"role": "user", "content": user_message}],
    )

    raw = message.content[0].text.strip()
    # Strip markdown fences — models sometimes wrap JSON in ```json ... ``` even when told not to
    raw = re.sub(r"^```(?:json)?\s*\n?|\n?```$", "", raw)
    result = json.loads(raw)

    prompt_type = result["prompt_type"]
    scores = result["scores"]
    weights = _WEIGHTS[prompt_type]

    # Recalculate totals server-side using our weights (don't trust model arithmetic)
    for label in labels:
        s = scores[label]
        s["total"] = round(
            s["relevance"] * weights["relevance"] / 10
            + s["depth"] * weights["depth"] / 10
            + s["detail"] * weights["detail"] / 10
            + s["quality"] * weights["quality"] / 10
            + s["appropriateness"] * weights["appropriateness"] / 10
        )

    # Sort by total descending to find top two
    sorted_labels = sorted(labels, key=lambda l: scores[l]["total"], reverse=True)
    top, second = sorted_labels[0], sorted_labels[1]

    # Tie detection: only truly tied scores (≤ 2 pts) get random resolution
    is_tied = (scores[top]["total"] - scores[second]["total"]) <= 2
    winner_label = random.choice([top, second]) if is_tied else top

    # Annotate each response with its score and winner flag
    annotated = []
    for label, response in label_map.items():
        annotated.append({
            **response,
            "score": scores[label]["total"],
            "is_winner": (label == winner_label),
        })

    # Replace blind labels ("Response A") with real model names in the reason
    judge_reason = result["judge_reason"]
    for label, response in label_map.items():
        judge_reason = judge_reason.replace(f"Response {label}", response["model"])

    return {
        "prompt_type": prompt_type,
        "winner_label": winner_label,
        "winner_content": label_map[winner_label]["content"],
        "is_tied": is_tied,
        "judge_reason": judge_reason,
        "follow_up": result.get("follow_up"),
        "responses": annotated,  # All 3 with scores + is_winner flags
    }
