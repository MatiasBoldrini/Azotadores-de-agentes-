// npm test --prefix mcp — talks to the server through a real MCP client over stdio and HTTP.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {get} from 'node:http';
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
  const briefing = await client.callTool({name: 'mission_briefing', arguments: {site_id: 'ridge-a', mast_height_m: 0}});
  assert.equal(briefing.structuredContent.priorities[0], 'now-earth-set');
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

test('streamable HTTP transport protects loopback against DNS rebinding', {timeout: 10_000}, async t => {
  const child = spawn(process.execPath, [SERVER, '--http', '0'], {
    env: {...process.env, SELENARC_MCP_HOST: '127.0.0.1'}, stdio: ['ignore', 'ignore', 'pipe'],
  });
  t.after(() => child.kill());
  const url = await new Promise((resolve, reject) => {
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += chunk;
      const address = stderr.match(/listening on (http:\/\/127\.0\.0\.1:\d+\/mcp)/);
      if (address) resolve(new URL(address[1]));
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`MCP server exited with status ${code}: ${stderr}`)));
  });

  const statusWith = headers => new Promise((resolve, reject) => {
    get(url, {headers}, response => {
      response.resume();
      resolve(response.statusCode);
    }).on('error', reject);
  });
  assert.equal(await statusWith({Host: 'rebinding.example'}), 403);
  assert.equal(await statusWith({Origin: 'https://untrusted.example'}), 403);

  const client = new Client({name: 'selenarc-test', version: '0'});
  await client.connect(new StreamableHTTPClientTransport(url));
  try { await exercise(client); } finally { await client.close(); }
});
