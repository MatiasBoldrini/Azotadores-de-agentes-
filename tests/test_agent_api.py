"""FastAPI operation endpoint with stubbed OpenAI Responses API."""
import json
import os
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from siteforge import agent, api


GOOD = {
    "understood": True, "name": "Charge then call", "note": "Asumí media hora de transmisión.",
    "steps": [
        {"need": "sun", "hours": 24, "label": "Charge batteries"},
        {"need": "earth", "hours": 0.5, "label": "Call Earth"},
    ],
}
FACTS = [
    {"id": "fix-height", "tone": "risk", "title": "Use a 5 m mast", "detail": "Longest outage 465 h."},
    {"id": "joint-best", "tone": "opportunity", "title": "Longest Sun and Earth window: 44 h", "detail": ""},
]
BRIEFING = {
    "facts": FACTS, "operation": "Sun 2 h, then Earth 0.5 h", "context": "Station r256c256, 0 m",
}
BRIEF = {"picks": ["joint-best", "fix-height"]}
REFUSAL = {"type": "refusal", "refusal": "I can't help."}


def reply(payload, status="completed", *, refusal=False):
    text = payload if isinstance(payload, str) else json.dumps(payload)
    content = REFUSAL if refusal else {"type": "output_text", "text": text}
    return httpx.Response(
        200,
        json={"status": status, "output": [{"type": "message", "content": [content]}]},
        request=httpx.Request("POST", "https://api.openai.com/v1/responses"),
    )


class AgentApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(api.app, client=('127.0.0.1', 50100))

    def post(self, upstream, text="cargar un día y llamar a la Tierra", *, body=None, route='operation'):
        with (
            patch.dict(os.environ, {"OPENAI_API_KEY": "fake-api-key", "OPENAI_MODEL": "",
                                    "SITEFORGE_AGENT_MODEL": "", "SITEFORGE_AGENT_LOCAL": "1"}),
            patch.object(agent.httpx, "post", return_value=upstream) as post,
        ):
            return self.client.post(f"/api/agent/{route}", json={"text": text} if body is None else body), post

    def test_unconfigured_server_answers_503(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "", "SITEFORGE_AGENT_LOCAL": "1"}):
            response = self.client.post("/api/agent/operation", json={"text": "transmitir 1 h"})
        self.assertEqual(response.status_code, 503)

    def test_request_uses_structured_output_and_returns_only_an_operation(self):
        response, post = self.post(reply(GOOD))
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["operation"]["steps"], GOOD["steps"])
        self.assertEqual(body["source"], "openai")
        self.assertEqual(body["model"], "gpt-6-luna")
        self.assertEqual(post.call_args.args, ("https://api.openai.com/v1/responses",))
        call = post.call_args.kwargs["json"]
        self.assertEqual(call["model"], "gpt-6-luna")
        self.assertEqual(call["text"]["format"]["type"], "json_schema")
        self.assertTrue(call["text"]["format"]["strict"])
        self.assertFalse(call["store"])
        self.assertEqual(call["input"], "cargar un día y llamar a la Tierra")
        self.assertNotIn("tools", call)

    def test_not_understood_is_returned_without_steps(self):
        response, _ = self.post(reply({
            "understood": False, "name": "", "steps": [], "note": "Necesita datos de temperatura.",
        }))
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["understood"])
        self.assertIsNone(response.json()["operation"])

    def test_out_of_range_or_malformed_answers_are_rejected(self):
        for step in (
            {"need": "mars", "hours": 2, "label": "x"},
            {"need": "sun", "hours": 1000, "label": "x"},
            {"need": "sun", "hours": 0.75, "label": "x"},
            {"need": "sun", "hours": 0.49, "label": "x"},
            {"need": "sun", "hours": "2", "label": "x"},
            {"need": "sun", "hours": True, "label": "x"},
        ):
            with self.subTest(step=step):
                self.assertEqual(self.post(reply({**GOOD, "steps": [step]}))[0].status_code, 502)
        for bad in ({**GOOD, "steps": []}, {**GOOD, "steps": GOOD["steps"] * 3},
                    {**GOOD, "understood": False}, "not json"):
            self.assertEqual(self.post(reply(bad))[0].status_code, 502, bad)

    def test_refusal_and_truncation_are_errors(self):
        self.assertEqual(self.post(reply(GOOD, refusal=True))[0].status_code, 422)
        self.assertEqual(self.post(reply(GOOD, "incomplete"))[0].status_code, 502)

    def test_text_length_is_bounded(self):
        for text in ("", " ", "x" * 501):
            response, post = self.post(reply(GOOD), text)
            self.assertEqual(response.status_code, 422)
            post.assert_not_called()

    def test_remote_fastapi_and_disabled_local_agent_cannot_call_upstream(self):
        remote = TestClient(api.app, client=("198.51.100.10", 50100))
        for enabled, client in [("1", remote), ("", self.client)]:
            with (patch.dict(os.environ, {"OPENAI_API_KEY": "fake", "SITEFORGE_AGENT_LOCAL": enabled}),
                  patch.object(agent.httpx, "post") as post):
                for route, body in [("operation", {"text": "charge 1 h"}), ("briefing", BRIEFING)]:
                    self.assertEqual(client.post(f"/api/agent/{route}", json=body).status_code, 503)
                post.assert_not_called()

    def test_briefing_uses_computed_findings_and_returns_only_known_picks(self):
        response, post = self.post(reply(BRIEF), body=BRIEFING, route="briefing")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {**BRIEF, "source": "openai", "model": "gpt-6-luna"})
        sent = post.call_args.kwargs["json"]
        self.assertEqual(sent["text"]["format"]["name"], "operation_briefing")
        self.assertEqual(json.loads(sent["input"]), {
            "operation": BRIEFING["operation"], "context": BRIEFING["context"], "findings": FACTS,
        })

    def test_briefing_rejects_model_prose_and_unknown_or_duplicate_findings(self):
        for invalid in (
            {**BRIEF, "headline": "Use the 465 m mast."},
            {"picks": [{"id": "joint-best", "reason": "Use a 5 m mast."}]},
            {"picks": ["unknown"]},
            {"picks": ["fix-height", "fix-height"]},
        ):
            response, _ = self.post(reply(invalid), body=BRIEFING, route="briefing")
            self.assertEqual(response.status_code, 502, invalid)

    def test_briefing_input_is_bounded_and_requires_unique_findings(self):
        for facts in (FACTS * 2, FACTS * 7, [], [{**FACTS[0], "detail": "x" * 501}]):
            response, post = self.post(reply(BRIEF), body={"facts": facts}, route="briefing")
            self.assertEqual(response.status_code, 422, facts)
            post.assert_not_called()


if __name__ == "__main__":
    unittest.main()
