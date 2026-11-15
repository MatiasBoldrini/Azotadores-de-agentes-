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
        self.client = TestClient(api.app)

    def post(self, upstream, text="cargar un día y llamar a la Tierra"):
        with (
            patch.dict(os.environ, {"OPENAI_API_KEY": "fake-api-key", "OPENAI_MODEL": ""}),
            patch.object(agent.httpx, "post", return_value=upstream) as post,
        ):
            return self.client.post("/api/agent/operation", json={"text": text}), post

    def test_unconfigured_server_answers_503(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
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


if __name__ == "__main__":
    unittest.main()
