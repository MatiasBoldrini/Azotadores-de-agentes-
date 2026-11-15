"""Translate an operator's description into visibility needs via OpenAI."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

router = APIRouter(prefix="/api/agent", tags=["Operation agent"])

CONTRACT = json.loads(Path(__file__).with_name("agent_contract.json").read_text(encoding="utf-8"))
SCHEMA = CONTRACT["schema"]
PROPERTIES = SCHEMA["properties"]
STEP_PROPERTIES = PROPERTIES["steps"]["items"]["properties"]
HOURS = STEP_PROPERTIES["hours"]


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


@router.post("/operation", response_model=AgentResponse)
def operation(request: AgentRequest):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(503, "The language agent is not configured on this server.")

    model = os.environ.get("OPENAI_MODEL", "").strip() or CONTRACT["model"]
    payload = {
        "model": model,
        "instructions": "\n".join(CONTRACT["instructions"]),
        "input": request.text.strip(),
        "max_output_tokens": CONTRACT["maxOutputTokens"],
        "store": False,
        "text": {"format": {"type": "json_schema", "name": "planned_operation", "strict": True, "schema": SCHEMA}},
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
        return interpret(json.loads(texts[0]), model)
    except (KeyError, TypeError, ValueError) as error:
        raise HTTPException(502, "The language agent returned an operation outside the planner's limits.") from error
