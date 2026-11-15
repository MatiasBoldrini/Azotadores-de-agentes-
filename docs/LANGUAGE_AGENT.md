# Language agent for the operation planner

The “What to do next” panel in Designer accepts a request in plain words, in Spanish or English:

> quiero correr el experimento 2 horas y después mandar los datos a la Tierra por media hora

OpenAI translates it into ordered visibility needs (`Sun 2 h → Earth 0.5 h`). The planner then uses the engine output to determine possible start times, outage windows and station configurations. OpenAI receives the operation text and translation instructions.

Both the Vercel function and the FastAPI endpoint validate the structured output before returning it to the browser. An operation can have one to four steps of 0.5 to 336 hours in half-hour increments. The panel shows whether OpenAI or the offline parser interpreted the request.

## Enable OpenAI in Vercel production

The site serves the static frontend and a Node.js function at `POST /api/agent/operation`. Confirm that the CLI is linked to the intended project and that the project exposes the Vercel system environment variables. Publish the programmatic firewall rule before deploying with an API key.

```sh
vercel firewall rules add 'SiteForge operation rate limit' \
  --condition '{"type":"rate_limit_api_id","op":"eq","value":"siteforge-operation"}' \
  --action rate_limit --rate-limit-window 60 --rate-limit-requests 6 \
  --rate-limit-keys ip --rate-limit-action rate_limit --yes
vercel firewall diff
vercel firewall publish --yes
vercel env add OPENAI_API_KEY production --sensitive
```

Enter the key when prompted and redeploy production for the new environment variable to take effect. The key is read by the function at runtime. Preview deployments and servers without a key use the offline parser. [Vercel Firewall SDK](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk) · [Vercel environment variables](https://vercel.com/docs/cli/env)

The function rejects requests when the firewall check is unavailable. The firewall rule limits each IP to six requests per minute. The OpenAI request allows up to 512 output tokens and accepts up to 500 characters of user input. A project-level limit in OpenAI can cap usage across all IPs. [OpenAI rate and spend limits](https://developers.openai.com/api/docs/guides/rate-limits)

## Local FastAPI

With `OPENAI_API_KEY` exported in your shell, start the backend as described in [Hybrid backend](HYBRID_BACKEND.md). Keep the backend local or configure rate limiting at your own ingress when exposing it to public traffic.

Both runtimes default to `gpt-6-luna` with reasoning disabled. Use the optional server environment variable `OPENAI_MODEL` to select a different model that supports Structured Outputs in the Responses API. [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) · [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

## Verification

```sh
npm ci
node --test tests/test_agent.mjs tests/test_vercel_agent.mjs
python -m unittest discover -s tests -p test_agent_api.py
```

The tests cover the offline parser, fallback, API validation, and the Vercel firewall responses using stubbed upstream traffic.
