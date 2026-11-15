# Language agent for the operation planner

The "What to do next" panel in Designer accepts a request in plain words, in Spanish or English:

> quiero correr el experimento 2 horas y después mandar los datos a la Tierra por media hora

It becomes an ordered operation (`Sun 2 h → Earth 0.5 h`) and goes through the same deterministic planner as the presets: when to start from the timeline cursor, how late you can start, the fallback opportunity and a configuration that meets every constraint and finishes sooner.

## Division of work

| Part | Does | Never does |
| --- | --- | --- |
| Claude (`POST /api/agent/operation`, `siteforge/agent.py`) | Turns the words into steps: need (`sun`, `earth`, `both`), hours, a short label, and one sentence saying what it assumed | See or produce visibility figures, dates, outages or configurations |
| Offline parser (`frontend/src/lib/intent.ts`) | Same translation from keywords and durations when no agent answers | Guess when the request names no Sun or Earth need |
| Planner (`frontend/src/lib/planner.ts`) | Every time, duration and configuration shown, from the engine output | Use anything the agent wrote except the steps |

The model receives only the operator's text and the system prompt. Its JSON answer is constrained by a JSON schema and validated again on the server and in the browser (1–4 steps, 0.5–336 h in 0.5 h steps, known needs). An answer outside those limits is rejected and the browser uses the offline parser; it is never repaired into something the model did not say. The panel always shows which path read the request ("Read by Claude" or "Read by the offline parser" with the reason).

## Enable Claude on the backend

The static Vercel deployment has no backend, so it always uses the offline parser. To use Claude, run the FastAPI backend (see [HYBRID_BACKEND.md](HYBRID_BACKEND.md)) with credentials in its environment:

```sh
pip install -r requirements.txt
ANTHROPIC_API_KEY=... .venv/bin/python -m uvicorn siteforge.api:app --host 127.0.0.1 --port 8000
```

- Model: `claude-opus-5-5` (override with `SITEFORGE_AGENT_MODEL`), low effort, structured JSON output, server-side refusal fallback enabled.
- Without `ANTHROPIC_API_KEY` (or `ANTHROPIC_AUTH_TOKEN`) the endpoint answers 503 and the browser falls back.
- Requests are limited to 500 characters. The key stays on the server; the frontend never holds it.

## Verification

- `tests/test_agent.mjs`: offline parser (Spanish and English, sequences, simultaneous and live operations, assumed and rounded durations, rejection of requests it cannot express), client fallback on 503, network failure and invalid payloads, and that a parsed request plans exactly like the matching preset on Ridge A.
- `tests/test_agent_api.py`: endpoint with Claude stubbed: structured-output request, only the operator text sent, out-of-range answers rejected (502), refusal (422), truncation (502), length limits, 503 without credentials.
- The real Anthropic SDK request was checked against a local stub server (model, `json_schema` format, effort, fallback beta). A live call to Claude was not made: no API key was available in the build environment.
