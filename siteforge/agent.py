"""Natural-language front door for the operation planner.

Claude only translates a request ("run my experiment for 2 h and then send the data")
into an ordered list of visibility needs. It never sees or produces visibility figures:
when and where the operation fits is computed by the planner from the engine output.
Without credentials the endpoint answers 503 and the browser uses its local parser.
"""
from __future__ import annotations

import json
import os
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError

router = APIRouter(prefix="/api/agent", tags=["Operation agent"])

MODEL = os.environ.get("SITEFORGE_AGENT_MODEL", "claude-opus-5-5")
MAX_STEPS = 4
MIN_HOURS, MAX_HOURS = 0.5, 336.0

SYSTEM = """You turn a lunar surface operator's request into an operation for a visibility planner.
The planner knows, for each station configuration and every 30 minutes, whether the Sun and the Earth are above the local terrain horizon. It cannot model anything else.

Each step has one need:
- "sun": the Sun must be visible (solar power, charging batteries, solar-powered experiments, heating).
- "earth": the Earth must be visible (direct-to-Earth radio: transmit, downlink, uplink, telemetry, commands, calls).
- "both": Sun and Earth at the same time (powered work with a live Earth link: teleoperation, live video, relaying while powered).

Rules:
- Keep the order the operator gave. Use at most 4 steps.
- Hours must be between 0.5 and 336, in steps of 0.5. Convert minutes and days.
- If a duration is missing, choose a reasonable one and say so in "note". Never claim when or whether the operation fits: the planner decides that.
- Labels are short imperative phrases in English (at most 60 characters). The name is at most 40 characters.
- Write "note" in the operator's language, one sentence, saying what you assumed.
- If the request is not something the planner can express (for example it needs temperature, terrain slope, other planets or a specific date), set "understood" to false, return no steps, and explain in "note"."""

SCHEMA = {
    "type": "object",
    "properties": {
        "understood": {"type": "boolean"},
        "name": {"type": "string"},
        "steps": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "need": {"type": "string", "enum": ["sun", "earth", "both"]},
                    "hours": {"type": "number"},
                    "label": {"type": "string"},
                },
                "required": ["need", "hours", "label"],
                "additionalProperties": False,
            },
        },
        "note": {"type": "string"},
    },
    "required": ["understood", "name", "steps", "note"],
    "additionalProperties": False,
}


class AgentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=500)


class Step(BaseModel):
    need: Literal["sun", "earth", "both"]
    hours: float = Field(ge=MIN_HOURS, le=MAX_HOURS)
    label: str = Field(min_length=1, max_length=80)


class Operation(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    steps: list[Step] = Field(min_length=1, max_length=MAX_STEPS)


class AgentResponse(BaseModel):
    understood: bool
    operation: Operation | None
    note: str
    source: Literal["claude"] = "claude"
    model: str


def configured() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def client():
    import anthropic  # imported lazily so the science API runs without the SDK installed
    return anthropic.Anthropic(timeout=30.0, max_retries=1)


def interpret(raw: dict) -> AgentResponse:
    """Validate the model's JSON; anything outside the planner's limits is rejected, not repaired."""
    note = str(raw.get("note", ""))[:300]
    if not raw.get("understood") or not raw.get("steps"):
        return AgentResponse(understood=False, operation=None, note=note, model=MODEL)
    steps = [{**s, "hours": round(float(s["hours"]) * 2) / 2, "label": str(s["label"])[:80]} for s in raw["steps"]]
    operation = Operation(name=str(raw.get("name") or "Your operation")[:60], steps=steps)
    return AgentResponse(understood=True, operation=operation, note=note, model=MODEL)


@router.post("/operation", response_model=AgentResponse)
def operation(request: AgentRequest):
    if not configured():
        raise HTTPException(503, "The language agent is not configured on this server.")
    import anthropic
    try:
        response = client().beta.messages.create(
            model=MODEL,
            max_tokens=2000,
            system=SYSTEM,
            messages=[{"role": "user", "content": request.text}],
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.APIStatusError as error:
        raise HTTPException(502, f"Language agent request failed ({error.status_code}).") from error
    except anthropic.APIConnectionError as error:
        raise HTTPException(502, "Language agent could not be reached.") from error
    if response.stop_reason == "refusal":
        raise HTTPException(422, "The language agent declined this request.")
    if response.stop_reason == "max_tokens":
        raise HTTPException(502, "The language agent response was cut off.")
    text = next((block.text for block in response.content if block.type == "text"), "")
    try:
        return interpret(json.loads(text))
    except (json.JSONDecodeError, ValidationError, KeyError, TypeError, ValueError) as error:
        raise HTTPException(502, "The language agent returned an operation outside the planner's limits.") from error
