// npm test --prefix mcp — talks to the server through a real MCP client over stdio and HTTP.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const SERVER = fileURLToPath(new URL('./server.mjs', import.meta.url));
const TOOLS = ['evaluate_configuration', 'find_best_configuration', 'list_sites', 'mission_briefing', 'monthly_outlook', 'plan_operation'];

async function exercise(client) {
  const {tools} = await client.listTools();
  assert.deepEqual(tools.map(t => t.name).sort(), TOOLS);
  assert.ok(tools.every(t => t.annotations?.readOnlyHint === true));
  assert.match(client.getInstructions(), /report only figures these tools return/);
  const r = await client.callTool({name: 'evaluate_configuration', arguments: {site_id: 'ridge-a', mast_height_m: 0}});
  assert.equal(r.structuredContent.earth_visibility.hours, 199);
  const plan = await client.callTool({name: 'plan_operation', arguments: {site_id: 'ridge-a', mast_height_m: 5, request: 'charge for a day then downlink 30 min'}});
  assert.equal(plan.structuredContent.operation.steps.length, 2);
  const bad = await client.callTool({name: 'evaluate_configuration', arguments: {site_id: 'ridge-a', mast_height_m: 0, station: 'r1c1'}});
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /Valid stations/);
  const res = await client.readResource({uri: 'selenarc://methodology'});
  assert.match(res.contents[0].text, /Geometric line of sight/);
}

test('stdio transport', async () => {
  const client = new Client({name: 'selenarc-test', version: '0'});
  await client.connect(new StdioClientTransport({command: process.execPath, args: [SERVER]}));
  try { await exercise(client); } finally { await client.close(); }
});

test('streamable HTTP transport', async () => {
  const port = 18765 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, [SERVER, '--http', String(port)], {stdio: ['ignore', 'ignore', 'pipe']});
  await new Promise((resolve, reject) => { child.stderr.on('data', d => /listening/.test(d) && resolve()); child.on('exit', reject); });
  const client = new Client({name: 'selenarc-test', version: '0'});
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
    await exercise(client);
  } finally { await client.close(); child.kill(); }
});
