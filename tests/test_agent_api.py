"""Language agent endpoints (OpenAI): request shape, validation and failure behaviour.

The OpenAI client is replaced by a stub; the contract is that /operation returns only needs and
hours, and /briefing only picks and explains findings, adding no number of its own.
"""
import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from siteforge import agent, api


def reply(payload, finish_reason="stop", refusal=None):
    content = payload if isinstance(payload, str) else json.dumps(payload)
    message = SimpleNamespace(content=None if refusal else content, refusal=refusal)
    return SimpleNamespace(choices=[SimpleNamespace(message=message, finish_reason=finish_reason)])


class StubClient:
    def __init__(self, response):
        self.calls = []
        self.response = response
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return self.response


GOOD = {"understood": True, "name": "Charge then call", "note": "Asumí 1 h.",
        "steps": [{"need": "sun", "hours": 24, "label": "Charge batteries"}, {"need": "earth", "hours": 0.75, "label": "Call Earth"}]}
FACTS = [
    {"id": "fix-height", "tone": "risk", "title": "Fails at 0 m: a 5 m mast passes every constraint", "detail": "Longest outage 465 h vs 360 h allowed."},
    {"id": "joint-best", "tone": "opportunity", "title": "Longest Sun + Earth window: 44 h from 3 Nov, 10:00 UTC", "detail": "Plan joint work there."},
]
BRIEF = {"headline": "Use the 5 m mast: at 0 m the 465 h outage breaks the 360 h limit.",
         "picks": [{"id": "fix-height", "reason": "It is the only blocker."}, {"id": "joint-best", "reason": "Best 44 h slot for joint work."}]}


class AgentApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(api.app)

    def post(self, stub, path="/api/agent/operation", body=None):
        body = body or {"text": "cargar un día y llamar a la Tierra"}
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test"}), patch.object(agent, "client", return_value=stub):
            return self.client.post(path, json=body)

    def brief(self, payload, **kw):
        return self.post(StubClient(reply(payload, **kw)), "/api/agent/briefing", {"facts": FACTS, "operation": "Sun 2 h then Earth 0.5 h", "context": "Station r256c256, 0 m"})

    def test_unconfigured_server_answers_503_so_the_browser_uses_its_offline_logic(self):
        env = {k: v for k, v in os.environ.items() if k != "OPENAI_API_KEY"}
        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(self.client.post("/api/agent/operation", json={"text": "transmitir 1 h"}).status_code, 503)
            self.assertEqual(self.client.post("/api/agent/briefing", json={"facts": FACTS}).status_code, 503)

    def test_operation_uses_strict_structured_output_and_returns_only_steps(self):
        stub = StubClient(reply(GOOD))
        response = self.post(stub)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual([(s["need"], s["hours"]) for s in body["operation"]["steps"]], [("sun", 24), ("earth", 1.0)])
        self.assertEqual(body["source"], "openai")
        call = stub.calls[0]
        self.assertEqual(call["model"], agent.MODEL)
        self.assertEqual(call["response_format"]["type"], "json_schema")
        self.assertTrue(call["response_format"]["json_schema"]["strict"])
        self.assertEqual(call["messages"][1], {"role": "user", "content": "cargar un día y llamar a la Tierra"})

    def test_not_understood_is_returned_without_steps(self):
        body = self.post(StubClient(reply({"understood": False, "name": "", "steps": [], "note": "Necesita temperatura."}))).json()
        self.assertFalse(body["understood"])
        self.assertIsNone(body["operation"])

    def test_out_of_range_or_malformed_operations_are_rejected_not_repaired(self):
        for bad in ({**GOOD, "steps": [{"need": "mars", "hours": 2, "label": "x"}]},
                    {**GOOD, "steps": [{"need": "sun", "hours": 1000, "label": "x"}]},
                    {**GOOD, "steps": GOOD["steps"] * 3},
                    "not json"):
            self.assertEqual(self.post(StubClient(reply(bad))).status_code, 502, bad)

    def test_refusal_and_truncation_are_errors(self):
        self.assertEqual(self.post(StubClient(reply(GOOD, refusal="no"))).status_code, 422)
        self.assertEqual(self.post(StubClient(reply(GOOD, finish_reason="length"))).status_code, 502)

    def test_briefing_with_known_findings_and_numbers_is_accepted(self):
        response = self.brief(BRIEF)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([p["id"] for p in response.json()["picks"]], ["fix-height", "joint-best"])

    def test_briefing_that_invents_a_number_or_a_finding_is_rejected(self):
        self.assertEqual(self.brief({**BRIEF, "headline": "Use a 7 m mast."}).status_code, 502)
        self.assertEqual(self.brief({**BRIEF, "picks": [{"id": "fix-height", "reason": "Saves 12 h."}]}).status_code, 502)
        self.assertEqual(self.brief({**BRIEF, "picks": [{"id": "invented", "reason": "x"}]}).status_code, 502)
        self.assertEqual(self.brief({"headline": "", "picks": []}).status_code, 502)

    def test_briefing_sends_only_the_findings_and_context(self):
        stub = StubClient(reply(BRIEF))
        self.post(stub, "/api/agent/briefing", {"facts": FACTS, "operation": "op", "context": "ctx"})
        sent = json.loads(stub.calls[0]["messages"][1]["content"])
        self.assertEqual(set(sent), {"operation", "context", "findings"})
        self.assertEqual([f["id"] for f in sent["findings"]], ["fix-height", "joint-best"])

    def test_input_sizes_are_bounded(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test"}):
            self.assertEqual(self.client.post("/api/agent/operation", json={"text": "x" * 501}).status_code, 422)
            self.assertEqual(self.client.post("/api/agent/operation", json={"text": ""}).status_code, 422)
            self.assertEqual(self.client.post("/api/agent/briefing", json={"facts": FACTS * 7}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
