# Proactive language agent

The **What to do next** panel in Designer briefs the operator when the station, mast, operation, constraints or timeline cursor changes. It requests a ranking after a pause in changes while the panel is open in Designer. The automatic briefing is available during playback and when the model is unavailable. **Right now** alerts come from the computed Sun and Earth visibility intervals.

The panel also accepts an operation in Spanish or English. For example, “cargar dos horas y después transmitir media hora” becomes a solar power step of two hours followed by an Earth link step of half an hour. The planner uses the engine output to determine possible start times, outages and station configurations.

The two endpoints use OpenAI Structured Outputs. `POST /api/agent/operation` receives the operator's text and returns one to four steps in half-hour increments from 0.5 to 336 hours. `POST /api/agent/briefing` receives up to 12 computed findings and returns up to three distinct finding IDs in priority order. The panel renders the titles and details from those findings. The browser uses the offline parser or automatic briefing when a model request fails.

## Enable OpenAI in Vercel production

Vercel serves the static frontend and two Node.js functions. Confirm that the CLI is linked to the intended project and that the project exposes the Vercel system environment variables. Publish the programmatic firewall rule before deploying with an API key.

```sh
vercel firewall rules add 'SiteForge operation rate limit' \
  --condition '{"type":"rate_limit_api_id","op":"eq","value":"siteforge-operation"}' \
  --action rate_limit --rate-limit-window 60 --rate-limit-requests 6 \
  --rate-limit-keys ip --rate-limit-action rate_limit --yes
vercel firewall diff
vercel firewall publish --yes
vercel env add OPENAI_API_KEY production --sensitive
```

Enter the key when prompted and redeploy production. The functions read the key at runtime. Preview deployments and deployments without a key use the offline parser and automatic briefing. [Vercel Firewall SDK](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk) · [Vercel environment variables](https://vercel.com/docs/cli/env)

Both endpoints share the firewall allowance of six requests per minute per IP. They return an error if the firewall check fails. Each OpenAI request allows up to 512 output tokens. Operation text is capped at 500 characters and briefing input includes up to 12 bounded findings. An OpenAI project-level limit can cap usage across IP addresses. [OpenAI rate and spend limits](https://developers.openai.com/api/docs/guides/rate-limits)

## Local FastAPI

Export `OPENAI_API_KEY` and set `SITEFORGE_AGENT_LOCAL=1` in your shell before running the local backend. Start it on `127.0.0.1` as described in [Hybrid backend](HYBRID_BACKEND.md). FastAPI serves these language endpoints only for loopback clients with the local opt-in. Use the Vercel functions to enable the agent on the public site.

Both runtimes default to `gpt-6-luna` with reasoning disabled. The optional server variable `OPENAI_MODEL` selects a different model. An existing `SITEFORGE_AGENT_MODEL` value still works when `OPENAI_MODEL` is unset. The model must support Structured Outputs in the Responses API. [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) · [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

## Verification

```sh
npm ci
node --test tests/test_agent.mjs tests/test_vercel_agent.mjs
python -m unittest discover -s tests -p test_agent_api.py
```

The tests cover operation validation, the offline parser, briefing order and fallback, visibility alerts, and both backend endpoints with stubbed upstream traffic.
