# Proactive language agent (OpenAI)

The "What to do next" panel in Designer has three proactive parts and one input:

1. **Briefing** (top card). Every time the station, mast height, operation, constraints or timeline cursor change, the agent reviews the findings the deterministic advisor computed and says the single most important thing to do, with up to three findings ranked and explained. Nobody has to ask. It is refreshed after 1.2 s without changes and paused while the timeline plays.
2. **Right now** alerts. The next Sun or Earth rise or set within 12 h of the cursor ("Earth sets in 7 h: transmit now"). Read directly from the visibility intervals on every cursor move, including during playback. No model involved.
3. **Your operation** and **Watching this configuration**: the planner and advisor findings (when to start, slack, fallback, better configuration, blackouts, margins, cheapest fix).
4. **Tell the agent what you need to do**: a request in Spanish or English ("cargar un día y después transmitir 1 h") becomes an ordered operation and goes through the same planner as the presets.

## Division of work

| Part | Does | Never does |
| --- | --- | --- |
| OpenAI `POST /api/agent/operation` (`siteforge/agent.py`) | Turns words into steps: need (`sun`, `earth`, `both`), hours, label, one sentence saying what it assumed | See or produce visibility figures |
| OpenAI `POST /api/agent/briefing` | Chooses and explains up to 3 of the computed findings, plus a one-line headline | Add facts or numbers: the server rejects any number not present in the findings it was given, and any unknown finding id |
| Offline parser and automatic briefing (`frontend/src/lib/intent.ts`, `localBriefing`) | Same jobs without a model: keyword parsing; the most urgent finding first | Guess a request that names no Sun or Earth need |
| Planner, advisor, alerts (`planner.ts`, `advisor.ts`, `alerts.ts`) | Every time, duration, outage and configuration shown, from the engine output | Use anything a model wrote except the steps |

Both calls use Chat Completions with strict JSON-schema structured output. Answers are validated on the server and again in the browser; invalid answers are rejected, never repaired, and the browser falls back. The panel always labels the source: "Briefing by OpenAI, checked against the computed findings" or "Automatic briefing (reason)", "Read by OpenAI" or "Read by the offline parser (reason)". When the server shows it has no agent (404, 405, 501, 503) the page stops asking for the rest of the session.

## Enable OpenAI on the backend

The static Vercel deployment has no backend, so it always uses the offline parser and the automatic briefing. To use OpenAI, run the FastAPI backend (see [HYBRID_BACKEND.md](HYBRID_BACKEND.md)) with the key in its environment, and build the frontend with `VITE_API_BASE_URL` pointing at it when it is on another origin:

```sh
pip install -r requirements.txt
OPENAI_API_KEY=... .venv/bin/python -m uvicorn siteforge.api:app --host 127.0.0.1 --port 8000
```

- Model: `gpt-5-mini` by default; set `SITEFORGE_AGENT_MODEL` to any OpenAI model that supports structured outputs.
- The key stays on the server; the frontend never holds it. Requests are size-limited (500 characters; 12 findings). There is no per-user rate limit: each pause or scrub of the timeline can trigger one briefing call, cached per set of findings.

## Verification

- `tests/test_agent.mjs` (11): offline parser in Spanish and English, sequences, simultaneous and live operations, assumed and rounded durations, rejection of requests it cannot express; client fallback on 503, network failure and invalid payloads; a parsed request plans exactly like the matching preset on Ridge A; right-now alerts match the Ridge A Earth interval (Earth up at 1 Nov 00:00 UTC, sets 07:00 UTC); briefing validation and fallback.
- `tests/test_agent_api.py` (9): both endpoints with the OpenAI client stubbed: strict structured output, only the operator text or the findings are sent, out-of-range operations rejected (502), briefings with an invented number or finding rejected (502), refusal (422), truncation (502), size limits, 503 without a key.
- The real OpenAI SDK requests were checked against a local stub server, and the full page was driven in a browser against the real FastAPI backend with that stub in place of OpenAI: briefing shown as "Briefing by OpenAI", typed request read by the OpenAI path, no agent calls while the timeline plays.
- **No live OpenAI call was made**: no API key was available in the build environment.
