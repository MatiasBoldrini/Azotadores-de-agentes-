# SELENARC over MCP

`mcp/server.mjs` is a Model Context Protocol server. It lets an AI assistant (Claude Code, Claude Desktop, ChatGPT connectors, Cursor, any MCP client) plan lunar operations with the same engine modules and the same precomputed NASA-derived data as the web app. The server imports `frontend/src/lib/*.ts` directly, so a figure from the assistant is the figure on the page.

## Connect

Requires Node 22.18 or later (it loads the engine's TypeScript modules natively).

```bash
npm ci --prefix mcp
```

Claude Code, local stdio:

```bash
claude mcp add selenarc -- node mcp/server.mjs
```

Any client that speaks Streamable HTTP:

```bash
node mcp/server.mjs --http 8765
```

The endpoint is `http://127.0.0.1:8765/mcp`. Set `SELENARC_MCP_HOST=0.0.0.0` to listen beyond localhost; put it behind HTTPS before exposing it.

## Tools

All tools are read-only and deterministic. None calls a language model.

| Tool | Returns |
| --- | --- |
| `list_sites` | Sites, stations, tested mast heights, analysed window, default constraints, dataset SHA-256 |
| `evaluate_configuration` | Solar exposure, Earth visibility and Sun + Earth together (hours and % of the stated window), longest simultaneous visibility window, longest gap with Sun or Earth blocked, max single-resource outage, lander line of sight, failing constraints |
| `plan_operation` | For ordered steps or a plain-language request: start and finish (UTC), wait, slack, fallback start, a better configuration that meets every constraint |
| `mission_briefing` | Imminent Sun or Earth rise/set, risks, cheapest fix and opportunities at a station and time, most urgent first, each with a suggested action |
| `find_best_configuration` | The app optimizer's recommendation and alternatives, or an explicit "none feasible" with no substitute |
| `monthly_outlook` | Minimum qualifying mast per site and month, months to avoid, campaign mast, one-month slip cost |

Resource `selenarc://methodology` gives provenance and limitations.

## Rules the server enforces

These follow the team rules and the app's design language:

- **Only computed numbers.** Every result comes from the snapshot and the engine. The server instructions tell the assistant to report only returned figures, with units and window. Constraints that cannot be met return "No result has been substituted".
- **The app's own labels.** Metric names match the app and the team-agreed definitions: "longest simultaneous visibility window" (44 h at Ridge A, 0 m), "longest gap with Sun or Earth blocked" (465 h), "max single-resource outage" (458 h). Every percentage carries its window.
- **No guessing on bad input.** Unknown sites, stations, heights, months or out-of-window times return an error listing the valid choices.
- **Geometric line of sight only.** The provenance string travels with every result: not electrical output, not a radio link budget, not mission certification.

## Verification

- `tests/test_mcp_tools.mjs` (7, part of the main suite) checks the tools against the app modules and confirmed figures: 426 h Sun and 199 h Earth at Ridge A 0 m, 44 / 465 / 458 h, 17 feasible with the defaults, 5 m recommended, none feasible at a 240 h outage limit, the monthly table, and input errors.
- `npm test --prefix mcp` (2) connects a real MCP client over stdio and over Streamable HTTP: lists the 6 read-only tools, reads the instructions, calls tools, gets an error for an invalid station, and reads the methodology resource.
