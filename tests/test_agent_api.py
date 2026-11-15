"""Language agent endpoint: request shape, validation and failure behaviour.

Claude is replaced by a stub here; the endpoint's contract is that it returns only an
operation (needs and hours) and never visibility figures, which the planner computes.
"""
import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from siteforge import agent, api


def reply(payload, stop_reason="end_turn"):
    text = payload if isinstance(payload, str) else json.dumps(payload)
    return SimpleNamespace(stop_reason=stop_reason, content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=text)])


class StubClient:
    def __init__(self, response):
        self.calls = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self.create))
        self.response = response

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return self.response


GOOD = {"understood": True, "name": "Charge then call", "note": "Asumí 1 h.",
        "steps": [{"need": "sun", "hours": 24, "label": "Charge batteries"}, {"need": "earth", "hours": 0.75, "label": "Call Earth"}]}


class AgentApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(api.app)

    def post(self, stub, text="cargar un día y llamar a la Tierra"):
        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "test"}), patch.object(agent, "client", return_value=stub):
            return self.client.post("/api/agent/operation", json={"text": text})

    def test_unconfigured_server_answers_503_so_the_browser_uses_its_parser(self):
        env = {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")}
        with patch.dict(os.environ, env, clear=True):
            response = self.client.post("/api/agent/operation", json={"text": "transmitir 1 h"})
        self.assertEqual(response.status_code, 503)

    def test_request_uses_structured_output_and_returns_only_an_operation(self):
        stub = StubClient(reply(GOOD))
        response = self.post(stub)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["understood"])
        self.assertEqual([(s["need"], s["hours"]) for s in body["operation"]["steps"]], [("sun", 24), ("earth", 1.0)])
        self.assertEqual(body["source"], "claude")
        call = stub.calls[0]
        self.assertEqual(call["model"], "claude-opus-5-5")
        self.assertEqual(call["output_config"]["format"]["type"], "json_schema")
        self.assertEqual(call["messages"], [{"role": "user", "content": "cargar un día y llamar a la Tierra"}])
        self.assertNotIn("hours of", json.dumps(call["messages"]), "no visibility data is sent to the model")

    def test_not_understood_is_returned_without_steps(self):
        stub = StubClient(reply({"understood": False, "name": "", "steps": [], "note": "Necesita datos de temperatura."}))
        body = self.post(stub, "mantener la batería sobre 0 °C").json()
        self.assertFalse(body["understood"])
        self.assertIsNone(body["operation"])

    def test_out_of_range_or_malformed_answers_are_rejected_not_repaired(self):
        for bad in ({**GOOD, "steps": [{"need": "mars", "hours": 2, "label": "x"}]},
                    {**GOOD, "steps": [{"need": "sun", "hours": 1000, "label": "x"}]},
                    {**GOOD, "steps": GOOD["steps"] * 3},
                    "not json"):
            self.assertEqual(self.post(StubClient(reply(bad))).status_code, 502, bad)

    def test_refusal_and_truncation_are_errors(self):
        self.assertEqual(self.post(StubClient(reply(GOOD, "refusal"))).status_code, 422)
        self.assertEqual(self.post(StubClient(reply(GOOD, "max_tokens"))).status_code, 502)

    def test_text_length_is_bounded(self):
        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "test"}):
            self.assertEqual(self.client.post("/api/agent/operation", json={"text": "x" * 501}).status_code, 422)
            self.assertEqual(self.client.post("/api/agent/operation", json={"text": ""}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
