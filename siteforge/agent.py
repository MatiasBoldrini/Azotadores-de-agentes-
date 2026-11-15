"""Language agent for the operation planner, backed by the OpenAI API.

Two jobs, neither of which produces science:
- /operation turns an operator's words into ordered visibility needs (Sun, Earth, both) and hours.
- /briefing reads the findings the deterministic advisor already computed, picks what matters
  most and says why. Every number it writes must already appear in those findings.
Times, durations, outages and configurations are always computed by the planner and engine.
Without OPENAI_API_KEY both endpoints answer 503 and the browser uses its offline logic.
"""
from __future__ import annotations

import json
import os
import re
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError

router = APIRouter(prefix="/api/agent", tags=["Operation agent"])

MODEL = os.environ.get("SITEFORGE_AGENT_MODEL", "gpt-5-mini")
MAX_STEPS = 4
MIN_HOURS, MAX_HOURS = 0.5, 336.0
MAX_FACTS, MAX_PICKS = 12, 3

OPERATION_PROMPT = """You turn a lunar surface operator's request into an operation for a visibility planner.
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

BRIEFING_PROMPT = """You are the proactive mission advisor of a lunar landing-site planning tool.
You receive findings that a deterministic planner computed from NASA terrain and ephemeris data, each with an id, a tone (risk, opportunity, alternative), a title and a detail.

Write a briefing for the operator:
- "headline": one sentence, at most 140 characters, with the single most important thing to do or watch now.
- "picks": up to 3 findings, most important first, each with its id and a "reason" of at most 120 characters saying why it matters for the operator's operation.
- Prefer risks that block the operation, then actions that unblock it, then improvements.

Hard rules:
- Use only the findings given. Do not add facts, causes or advice that the findings do not support.
- Every number you write must appear exactly as written in the findings (hours, dates, heights, distances, counts). If unsure, write no number.
- Write in English. Plain words, no markdown."""

OPERATION_SCHEMA = {
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

BRIEFING_SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "picks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"id": {"type": "string"}, "reason": {"type": "string"}},
                "required": ["id", "reason"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["headline", "picks"],
    "additionalProperties": False,
}


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AgentRequest(StrictModel):
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
    source: Literal["openai"] = "openai"
    model: str


class Fact(StrictModel):
    id: str = Field(min_length=1, max_length=60)
    tone: Literal["risk", "opportunity", "alternative"]
    title: str = Field(min_length=1, max_length=300)
    detail: str = Field(max_length=500)


class BriefingRequest(StrictModel):
    facts: list[Fact] = Field(min_length=1, max_length=MAX_FACTS)
    operation: str = Field(default="", max_length=300)
    context: str = Field(default="", max_length=300)


class Pick(BaseModel):
    id: str
    reason: str = Field(max_length=200)


class BriefingResponse(BaseModel):
    headline: str = Field(max_length=200)
    picks: list[Pick] = Field(max_length=MAX_PICKS)
    source: Literal["openai"] = "openai"
    model: str


def configured() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY"))


def client():
    from openai import OpenAI  # imported lazily so the science API runs without the SDK installed
    return OpenAI(timeout=30.0, max_retries=1)


def complete(system: str, user: str, name: str, schema: dict) -> dict:
    """One structured-output call. Raises HTTPException on any failure; never returns partial data."""
    if not configured():
        raise HTTPException(503, "The language agent is not configured on this server.")
    import openai
    try:
        response = client().chat.completions.create(
            model=MODEL,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format={"type": "json_schema", "json_schema": {"name": name, "schema": schema, "strict": True}},
            max_completion_tokens=4000,
        )
    except openai.APIStatusError as error:
        raise HTTPException(502, f"Language agent request failed ({error.status_code}).") from error
    except openai.APIConnectionError as error:
        raise HTTPException(502, "Language agent could not be reached.") from error
    choice = response.choices[0]
    if choice.message.refusal:
        raise HTTPException(422, "The language agent declined this request.")
    if choice.finish_reason == "length":
        raise HTTPException(502, "The language agent response was cut off.")
    try:
        return json.loads(choice.message.content or "")
    except json.JSONDecodeError as error:
        raise HTTPException(502, "The language agent returned invalid JSON.") from error


def interpret(raw: dict) -> AgentResponse:
    """Validate the model's operation; anything outside the planner's limits is rejected, not repaired."""
    note = str(raw.get("note", ""))[:300]
    if not raw.get("understood") or not raw.get("steps"):
        return AgentResponse(understood=False, operation=None, note=note, model=MODEL)
    steps = [{**s, "hours": round(float(s["hours"]) * 2) / 2, "label": str(s["label"])[:80]} for s in raw["steps"]]
    operation = Operation(name=str(raw.get("name") or "Your operation")[:60], steps=steps)
    return AgentResponse(understood=True, operation=operation, note=note, model=MODEL)


NUMBER = re.compile(r"\d+(?:[.,]\d+)?")


def numbers(text: str) -> set[str]:
    return {n.replace(",", ".").lstrip("0") or "0" for n in NUMBER.findall(text)}


def check_briefing(raw: dict, request: BriefingRequest) -> BriefingResponse:
    """Accept the briefing only if it cites known findings and introduces no number of its own."""
    known_ids = {f.id for f in request.facts}
    allowed = numbers(" ".join(f"{f.title} {f.detail}" for f in request.facts) + " " + request.operation + " " + request.context)
    picks, seen = [], set()
    for pick in raw.get("picks", [])[:MAX_PICKS]:
        if pick["id"] not in known_ids:
            raise ValueError(f"unknown finding {pick['id']!r}")
        if pick["id"] in seen:
            continue
        seen.add(pick["id"])
        picks.append(Pick(id=pick["id"], reason=str(pick["reason"])[:200]))
    headline = str(raw.get("headline", ""))[:200]
    invented = numbers(headline + " " + " ".join(p.reason for p in picks)) - allowed
    if invented:
        raise ValueError(f"numbers not in the findings: {sorted(invented)}")
    if not headline or not picks:
        raise ValueError("empty briefing")
    return BriefingResponse(headline=headline, picks=picks, model=MODEL)


@router.post("/operation", response_model=AgentResponse)
def operation(request: AgentRequest):
    raw = complete(OPERATION_PROMPT, request.text, "operation", OPERATION_SCHEMA)
    try:
        return interpret(raw)
    except (ValidationError, KeyError, TypeError, ValueError) as error:
        raise HTTPException(502, "The language agent returned an operation outside the planner's limits.") from error


@router.post("/briefing", response_model=BriefingResponse)
def briefing(request: BriefingRequest):
    payload = {"operation": request.operation, "context": request.context, "findings": [f.model_dump() for f in request.facts]}
    raw = complete(BRIEFING_PROMPT, json.dumps(payload, ensure_ascii=False), "briefing", BRIEFING_SCHEMA)
    try:
        return check_briefing(raw, request)
    except (ValidationError, KeyError, TypeError, ValueError) as error:
        raise HTTPException(502, f"The briefing failed validation: {error}") from error
