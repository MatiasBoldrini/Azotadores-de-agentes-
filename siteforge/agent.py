"""Translate an operator's description into visibility needs via OpenAI."""
from __future__ import annotations

from ipaddress import ip_address
import json
import os
from pathlib import Path
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

router = APIRouter(prefix="/api/agent", tags=["Operation agent"])

CONTRACT = json.loads(Path(__file__).with_name("agent_contract.json").read_text(encoding="utf-8"))
SCHEMA = CONTRACT["schema"]
PROPERTIES = SCHEMA["properties"]
STEP_PROPERTIES = PROPERTIES["steps"]["items"]["properties"]
HOURS = STEP_PROPERTIES["hours"]
BRIEFING = CONTRACT["briefing"]
BRIEFING_PROPS = BRIEFING["schema"]["properties"]
PICK_ID_MAX_LENGTH = BRIEFING_PROPS["picks"]["items"]["maxLength"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class AgentRequest(StrictModel):
    text: str = Field(min_length=1, max_length=CONTRACT["requestMaxLength"], pattern=r"\S")


class Step(StrictModel):
    need: Literal["sun", "earth", "both"]
    hours: float = Field(ge=HOURS["minimum"], le=HOURS["maximum"])
    label: str = Field(min_length=1, max_length=STEP_PROPERTIES["label"]["maxLength"], pattern=r"\S")

    @field_validator("hours")
    @classmethod
    def validate_half_hour(cls, hours: float) -> float:
        if hours % HOURS["multipleOf"] != 0:
            raise ValueError("hours must use half-hour increments")
        return hours


class Operation(StrictModel):
    name: str = Field(min_length=1, max_length=PROPERTIES["name"]["maxLength"], pattern=r"\S")
    steps: list[Step] = Field(min_length=1, max_length=PROPERTIES["steps"]["maxItems"])


class ModelResponse(StrictModel):
    understood: bool
    name: str = Field(max_length=PROPERTIES["name"]["maxLength"])
    steps: list[Step] = Field(max_length=PROPERTIES["steps"]["maxItems"])
    note: str = Field(max_length=PROPERTIES["note"]["maxLength"])


class AgentResponse(StrictModel):
    understood: bool
    operation: Operation | None
    note: str
    source: Literal["openai"] = "openai"
    model: str


def interpret(raw: dict, model: str) -> AgentResponse:
    """Validate the result before giving any steps to the planner."""
    reply = ModelResponse.model_validate(raw)
    operation = None
    if reply.understood:
        operation = Operation(name=reply.name, steps=reply.steps)
    elif reply.steps or reply.name:
        raise ValueError("an unsupported request cannot contain an operation")
    return AgentResponse(understood=reply.understood, operation=operation, note=reply.note, model=model)


class Fact(StrictModel):
    id: str = Field(min_length=1, max_length=PICK_ID_MAX_LENGTH, pattern=r"\S")
    tone: Literal["risk", "opportunity", "alternative"]
    title: str = Field(min_length=1, max_length=BRIEFING["maxTitleLength"], pattern=r"\S")
    detail: str = Field(max_length=BRIEFING["maxDetailLength"])


class BriefingRequest(StrictModel):
    facts: list[Fact] = Field(min_length=1, max_length=BRIEFING["maxFacts"])
    operation: str = Field(default="", max_length=BRIEFING["maxContextLength"])
    context: str = Field(default="", max_length=BRIEFING["maxContextLength"])

    @field_validator("facts")
    @classmethod
    def unique_facts(cls, facts: list[Fact]) -> list[Fact]:
        if len({f.id for f in facts}) != len(facts):
            raise ValueError("duplicate finding IDs")
        return facts


class BriefingResult(StrictModel):
    picks: list[str] = Field(min_length=1, max_length=BRIEFING_PROPS["picks"]["maxItems"])


class BriefingResponse(BriefingResult):
    source: Literal["openai"] = "openai"
    model: str


def check_briefing(raw: dict, request: BriefingRequest, model: str) -> BriefingResponse:
    result = BriefingResult.model_validate(raw)
    known = {fact.id for fact in request.facts}
    if len(set(result.picks)) != len(result.picks) or not known.issuperset(result.picks):
        raise ValueError("invalid finding IDs")
    return BriefingResponse(picks=result.picks, model=model)


def local_settings(request: Request) -> tuple[str, str]:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key or os.environ.get("SITEFORGE_AGENT_LOCAL") != "1" or request.client is None:
        raise HTTPException(503, {"code": "agent_disabled", "message": "The local language agent is disabled."})
    try:
        loopback = ip_address(request.client.host).is_loopback
    except ValueError:
        loopback = False
    if not loopback:
        raise HTTPException(503, {"code": "agent_disabled", "message": "The language agent is available only over loopback."})
    model = (
        os.environ.get("OPENAI_MODEL", "").strip()
        or os.environ.get("SITEFORGE_AGENT_MODEL", "").strip()
        or CONTRACT["model"]
    )
    return api_key, model


def complete(user_input: str, name: str, spec: dict, api_key: str, model: str) -> dict:
    payload = {
        "model": model,
        "instructions": "\n".join(spec["instructions"]),
        "input": user_input,
        "max_output_tokens": CONTRACT["maxOutputTokens"],
        "store": False,
        "text": {"format": {"type": "json_schema", "name": name, "strict": True, "schema": spec["schema"]}},
    }
    if model == CONTRACT["model"]:
        payload["reasoning"] = {"effort": "none"}

    try:
        response = httpx.post(
            "https://api.openai.com/v1/responses",
            json=payload,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=15.0,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as error:
        if error.response.status_code == 429:
            raise HTTPException(429, "The language agent is temporarily rate limited.") from error
        raise HTTPException(502, "Language agent request failed.") from error
    except httpx.RequestError as error:
        raise HTTPException(502, "Language agent could not be reached.") from error

    try:
        result = response.json()
        if result["status"] != "completed":
            raise HTTPException(502, "The language agent response was incomplete.")
        content = [
            block
            for item in result["output"] if item["type"] == "message"
            for block in item["content"]
        ]
        if any(block["type"] == "refusal" for block in content):
            raise HTTPException(422, "The language agent declined this request.")
        texts = [block["text"] for block in content if block["type"] == "output_text"]
        if len(texts) != 1:
            raise ValueError("expected one structured output")
        return json.loads(texts[0])
    except (KeyError, TypeError, ValueError) as error:
        raise HTTPException(502, "The language agent returned invalid structured output.") from error


@router.post("/operation", response_model=AgentResponse)
def operation(payload: AgentRequest, request: Request):
    api_key, model = local_settings(request)
    raw = complete(payload.text.strip(), "planned_operation", CONTRACT, api_key, model)
    try:
        return interpret(raw, model)
    except ValueError as error:
        raise HTTPException(502, "The language agent returned an operation outside the planner's limits.") from error


@router.post("/briefing", response_model=BriefingResponse)
def briefing(payload: BriefingRequest, request: Request):
    api_key, model = local_settings(request)
    model_input = {"operation": payload.operation, "context": payload.context, "findings": [f.model_dump() for f in payload.facts]}
    raw = complete(json.dumps(model_input, ensure_ascii=False), "operation_briefing", BRIEFING, api_key, model)
    try:
        return check_briefing(raw, payload, model)
    except ValueError as error:
        raise HTTPException(502, "The language agent returned an invalid briefing.") from error
