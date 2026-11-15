// node --test tests/test_mcp_tools.mjs — MCP tool results equal what the app computes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {DEFAULT_CONSTRAINTS,ToolInputError,evaluateConfiguration,findBestConfiguration,listSites,missionBriefing,monthlyOutlook,planOperationTool} from '../mcp/tools.mjs';
import {planOperation} from '../frontend/src/lib/planner.ts';
import {keyFor,optimize} from '../frontend/src/lib/science.ts';

const bundle = JSON.parse(readFileSync(new URL('../public/data/snapshot.json', import.meta.url)));
const scan = JSON.parse(readFileSync(new URL('../public/data/monthly-site-scan.json', import.meta.url)));
const ridgeA0 = bundle.analyses.find(a => a.candidate_id === 'r256c256' && a.height_m === 0);

test('defaults match the Designer defaults in the app', () => {
  const app = readFileSync(new URL('../frontend/src/App.tsx', import.meta.url), 'utf8');
  const literal = app.match(/DEFAULT_CONSTRAINTS: Constraints = (\{[^}]+\})/)[1].replace(/(\w+):/g, '"$1":');
  assert.deepEqual(JSON.parse(literal), DEFAULT_CONSTRAINTS);
  const sites = listSites();
  assert.deepEqual(sites.sites.map(s => s.id), ['ridge-a', 'ridge-b']);
  assert.equal(sites.window.hours, 720);
});

test('evaluate_configuration reports the figures confirmed in the team room, with the app labels', () => {
  const r = evaluateConfiguration({site_id: 'ridge-a', mast_height_m: 0});
  assert.equal(r.solar_exposure.hours, 426);
  assert.equal(r.earth_visibility.hours, 199);
  assert.equal(r.longest_simultaneous_visibility_window_hours, 44);
  assert.equal(r.longest_gap_with_sun_or_earth_blocked_hours, 465);
  assert.equal(r.max_single_resource_outage_hours, 458);
  assert.match(r.earth_visibility.window, /2026-11-01 to 2026-12-01 UTC \(720 h\)/);
  assert.equal(r.passes_all_constraints, false);
  assert.equal(evaluateConfiguration({site_id: 'ridge-a', mast_height_m: 5}).passes_all_constraints, true);
});

test('find_best_configuration is the app optimizer, and says so when nothing is feasible', () => {
  const r = findBestConfiguration({site_id: 'ridge-a'});
  const app = optimize(bundle.analyses, bundle.links['ridge-a'], DEFAULT_CONSTRAINTS);
  assert.equal(r.feasible, 17);
  assert.equal(`${r.recommended.station}-${r.recommended.mast_height_m}`, keyFor(app.recommended));
  const none = findBestConfiguration({site_id: 'ridge-a', constraints: {maxOutage: 240}});
  assert.equal(none.recommended, null);
  assert.match(none.note, /No result has been substituted/);
});

test('plan_operation runs the planner on given steps or a plain-language request', () => {
  const given = planOperationTool({site_id: 'ridge-a', mast_height_m: 0, steps: [{need: 'sun', hours: 2}, {need: 'earth', hours: 0.5}]});
  const parsed = planOperationTool({site_id: 'ridge-a', mast_height_m: 0, request: 'correr el experimento 2 h y después mandar los datos 30 min'});
  const direct = planOperation(ridgeA0, {id: 'x', name: 'x', steps: [{need: 'sun', hours: 2, label: 'a'}, {need: 'earth', hours: 0.5, label: 'b'}]}, Date.parse(ridgeA0.series.timestamp_utc[0]));
  assert.equal(Date.parse(given.plan.start_utc), direct.start);
  assert.equal(Date.parse(given.plan.finish_utc), direct.finish);
  assert.deepEqual(parsed.plan.slots.map(s => s.start_utc), given.plan.slots.map(s => s.start_utc));
  assert.equal(parsed.operation.read_by, 'offline parser');
  assert.deepEqual(given.better_configuration, {type: 'use_configuration', station: 'r256c256', mast_height_m: 5, label: 'Use this configuration'});
});

test('mission_briefing leads with the most urgent finding and every time action is a real sample', () => {
  const r = missionBriefing({site_id: 'ridge-a', mast_height_m: 0, cursor_utc: '2026-11-01T00:00:00Z'});
  assert.equal(r.headline, r.findings.find(f => f.tone === 'risk').title);
  for (const f of r.findings) if (f.suggested_action?.type === 'go_to_time') assert.ok(ridgeA0.series.timestamp_utc.includes(f.suggested_action.utc));
});

test('monthly_outlook reproduces the scan table', () => {
  const r = monthlyOutlook({});
  assert.deepEqual(r.minimum_mast_height_m_by_month.map(m => [m['ridge-a'], m['ridge-b']]),
    scan.months.map(m => [m.sites['ridge-a'].minimum_height_m, m.sites['ridge-b'].minimum_height_m]));
  assert.ok(r.advice.some(a => a.id === 'month-none'));
});

test('invalid input names the valid choices instead of guessing', () => {
  assert.throws(() => evaluateConfiguration({site_id: 'ridge-c', mast_height_m: 0}), e => e instanceof ToolInputError && /ridge-a, ridge-b/.test(e.message));
  assert.throws(() => evaluateConfiguration({site_id: 'ridge-a', mast_height_m: 7}), /Tested heights: 0, 2, 5, 10, 20 m/);
  assert.throws(() => planOperationTool({site_id: 'ridge-a', mast_height_m: 0, request: 'hola'}), ToolInputError);
  assert.throws(() => missionBriefing({site_id: 'ridge-a', mast_height_m: 0, cursor_utc: '2027-06-01T00:00:00Z'}), /outside the analysed window/);
});
