#!/usr/bin/env node
// SELENARC MCP server. Lets an AI assistant (Claude, ChatGPT, Cursor, ...) plan lunar surface
// operations with the same deterministic engine and NASA-derived data as the web app.
//   stdio (default):   node mcp/server.mjs
//   Streamable HTTP:   node mcp/server.mjs --http [port]   → POST http://127.0.0.1:<port>/mcp
import {createServer} from 'node:http';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {z} from 'zod';
import {DEFAULT_CONSTRAINTS,HEIGHTS,PROVENANCE,SITES,ToolInputError,WINDOW_INFO,
  evaluateConfiguration,findBestConfiguration,listSites,missionBriefing,monthlyOutlook,planOperationTool} from './tools.mjs';

const INSTRUCTIONS = `SELENARC plans lunar south-pole surface operations from NASA LOLA terrain and JPL Horizons ephemerides (window ${WINDOW_INFO.label}).
Rules for assistants: report only figures these tools return, with their units and window; never estimate or extrapolate a value; say "geometric line of sight" rather than power or link quality; when a tool says nothing fits, say so instead of substituting a result. Start with list_sites if unsure of valid sites, stations or heights.`;

const siteId = z.enum(SITES.map(s => s.id)).default('ridge-a').describe('Landing site id. The lander sits at this site.');
const height = z.number().refine(h => HEIGHTS.includes(h), {message: `Tested mast heights: ${HEIGHTS.join(', ')} m`}).describe(`Station mast height in metres; one of ${HEIGHTS.join(', ')}.`);
const station = z.string().regex(/^r\d+c\d+$/).optional().describe('Station cell such as "r256c256". Defaults to the landing site cell.');
const constraints = z.object({
  minSun: z.number().min(0).max(100).optional().describe('Minimum solar exposure, % of window'),
  minEarth: z.number().min(0).max(100).optional().describe('Minimum Earth visibility, % of window'),
  maxOutage: z.number().min(0).optional().describe('Maximum outage per resource, hours'),
  maxDistance: z.number().min(0).max(5000).optional().describe('Maximum station distance from the lander, metres'),
  maxSlope: z.number().min(0).max(90).optional().describe('Maximum terrain slope, degrees'),
  requireLink: z.boolean().optional().describe('Require lander-to-station line of sight'),
}).strict().optional().describe(`Overrides for the app defaults ${JSON.stringify(DEFAULT_CONSTRAINTS)}.`);
const steps = z.array(z.object({
  need: z.enum(['sun', 'earth', 'both']).describe('sun = solar power, earth = direct-to-Earth radio, both = at the same time'),
  hours: z.number().min(0.5).max(336).multipleOf(0.5),
  label: z.string().max(80).optional(),
}).strict()).min(1).max(4).optional().describe('Ordered steps; each runs inside one continuous visibility run.');
const request = z.string().min(1).max(500).optional().describe('Plain-language operation in Spanish or English, e.g. "charge for a day, then transmit 1 h". Used when steps are not given.');
const utc = z.string().optional().describe('ISO 8601 UTC time inside the analysed window.');

const readOnly = {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false};

function respond(fn) {
  return async args => {
    try {
      const result = fn(args);
      return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}], structuredContent: result};
    } catch (error) {
      if (error instanceof ToolInputError) return {isError: true, content: [{type: 'text', text: error.message}]};
      throw error;
    }
  };
}

export function buildServer() {
  const server = new McpServer({name: 'selenarc', title: 'SELENARC lunar operations planner', version: '0.1.0'}, {instructions: INSTRUCTIONS});

  server.registerTool('list_sites', {
    title: 'List sites and dataset',
    description: 'Landing sites, candidate stations, tested mast heights, the analysed time window, default constraints and dataset checksum.',
    inputSchema: {}, annotations: readOnly,
  }, respond(() => listSites()));

  server.registerTool('evaluate_configuration', {
    title: 'Evaluate a station configuration',
    description: 'Solar exposure, Earth visibility, Sun + Earth together, longest simultaneous visibility window, longest gap with Sun or Earth blocked, max single-resource outage, lander line of sight and which constraints fail, for one station and mast height.',
    inputSchema: {site_id: siteId, mast_height_m: height, station, constraints}, annotations: readOnly,
  }, respond(evaluateConfiguration));

  server.registerTool('plan_operation', {
    title: 'Plan an operation',
    description: 'When an ordered operation (for example Sun 2 h, then Earth 0.5 h) can run: start and finish in UTC, wait, slack before a late start costs time, the fallback opportunity, and a configuration that meets every constraint and finishes sooner.',
    inputSchema: {site_id: siteId, mast_height_m: height, station, steps, request, start_utc: utc, constraints}, annotations: readOnly,
  }, respond(planOperationTool));

  server.registerTool('mission_briefing', {
    title: 'Proactive mission briefing',
    description: 'What to do next at a station and time: imminent Sun or Earth rise/set, risks, the cheapest fix, opportunities, ranked with the most urgent first. Optionally include an operation to plan.',
    inputSchema: {site_id: siteId, mast_height_m: height, station, cursor_utc: utc, steps, request, constraints}, annotations: readOnly,
  }, respond(missionBriefing));

  server.registerTool('find_best_configuration', {
    title: 'Find the best configuration',
    description: 'Runs the app optimizer over every evaluated station and mast height for a landing site and returns the recommended configuration and alternatives, or says that none is feasible.',
    inputSchema: {site_id: siteId, constraints}, annotations: readOnly,
  }, respond(findBestConfiguration));

  server.registerTool('monthly_outlook', {
    title: 'Monthly landing outlook',
    description: 'Minimum qualifying mast height per site and month across the monthly scan, plus when and where to land: smallest mast, months to avoid, campaign mast, cost of a one-month slip.',
    inputSchema: {month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Month id such as "2026-11".'), mast_height_m: height.default(0)},
    annotations: readOnly,
  }, respond(monthlyOutlook));

  server.registerResource('methodology', 'selenarc://methodology', {
    title: 'Methodology and limitations', mimeType: 'text/plain',
    description: 'Where the numbers come from and what they do not mean.',
  }, async uri => ({contents: [{uri: uri.href, mimeType: 'text/plain', text: `${PROVENANCE}\nWindow: ${WINDOW_INFO.label}.`}]}));

  return server;
}

async function main() {
  const httpAt = process.argv.indexOf('--http');
  if (httpAt < 0) {
    await buildServer().connect(new StdioServerTransport());
    return;
  }
  const port = Number(process.argv[httpAt + 1] ?? process.env.PORT ?? 8765);
  const host = process.env.SELENARC_MCP_HOST ?? '127.0.0.1';
  createServer(async (req, res) => {
    if (new URL(req.url, 'http://x').pathname !== '/mcp') { res.writeHead(404).end(); return; }
    // Stateless: a fresh server and transport per request, so no session state is kept.
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({sessionIdGenerator: undefined});
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  }).listen(port, host, () => console.error(`SELENARC MCP listening on http://${host}:${port}/mcp`));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('server.mjs')) main().catch(error => { console.error(error); process.exit(1); });
