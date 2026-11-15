// node --test tests/test_agent.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {askAgent,askBriefing,localBriefing,validateAgentPayload,validateBriefing} from '../frontend/src/lib/agentClient.ts';
import {nowAlerts} from '../frontend/src/lib/alerts.ts';
import {advise} from '../frontend/src/lib/advisor.ts';
import {hoursIn,parseOperation} from '../frontend/src/lib/intent.ts';
import {planInsights,planOperation} from '../frontend/src/lib/planner.ts';

const steps = text => { const p = parseOperation(text); assert.ok(p.ok, text); return p.op.steps.map(s => [s.need, s.hours]); };

test('offline parser keeps the order and reads Spanish and English durations', () => {
  assert.deepEqual(steps('quiero correr el experimento 2 horas y después mandar los datos a la Tierra por media hora'), [['sun', 2], ['earth', 0.5]]);
  assert.deepEqual(steps('cargar baterías 24 h, luego transmitir 1 h'), [['sun', 24], ['earth', 1]]);
  assert.deepEqual(steps('charge for a day then downlink 30 min'), [['sun', 24], ['earth', 0.5]]);
  assert.deepEqual(steps('cargar 2 días y transmitir 4 h y después operar a la vez 6 h'), [['sun', 48], ['earth', 4], ['both', 6]]);
});

test('simultaneous and live operations need Sun and Earth together', () => {
  assert.deepEqual(steps('necesito sol y tierra a la vez durante 12 horas'), [['both', 12]]);
  assert.deepEqual(steps('teleoperar el rover con video en vivo 3 h'), [['both', 3]]);
});

test('missing or odd durations are assumed and reported, never silent', () => {
  const p = parseOperation('transmitir a la tierra');
  assert.ok(p.ok);
  assert.equal(p.op.steps[0].hours, 1);
  assert.match(p.assumed[0], /1 h/);
  const q = parseOperation('downlink 10 min');
  assert.equal(q.op.steps[0].hours, 0.5);
  assert.match(q.assumed[0], /rounded to 0.5 h/);
  assert.equal(hoursIn('una semana'), 168);
});

test('requests the planner cannot express are rejected instead of guessed', () => {
  const p = parseOperation('hola, ¿qué tal?');
  assert.equal(p.ok, false);
  assert.match(p.reason, /Sun \(power\), the Earth \(radio link\) or both/);
});

const answer = body => ({ok: true, status: 200, json: async () => body});
const remote = {understood: true, note: 'Asumí 1 h de transmisión.', model: 'gpt-5-mini', source: 'openai',
  operation: {name: 'Charge then talk', steps: [{need: 'sun', hours: 24, label: 'Charge batteries'}, {need: 'earth', hours: 1, label: 'Call Earth'}]}};

test('the client uses the backend agent when it answers with a valid operation', async () => {
  let called;
  const r = await askAgent('cargar un día y llamar a la Tierra', {fetchImpl: async (url, init) => { called = {url, body: JSON.parse(init.body)}; return answer(remote); }});
  assert.equal(called.url, '/api/agent/operation');
  assert.equal(called.body.text, 'cargar un día y llamar a la Tierra');
  assert.equal(r.source, 'openai');
  assert.deepEqual(r.op.steps.map(s => [s.need, s.hours]), [['sun', 24], ['earth', 1]]);
});

test('the client falls back to the offline parser when the agent is missing, failing or invalid', async () => {
  const text = 'cargar 24 h y después transmitir 1 h';
  for (const fetchImpl of [
    async () => ({ok: false, status: 503, json: async () => ({})}),
    async () => { throw new TypeError('network'); },
  ]) {
    const r = await askAgent(text, {fetchImpl});
    assert.equal(r.source, 'local');
    assert.ok(r.fallbackReason);
    assert.deepEqual(r.op.steps.map(s => [s.need, s.hours]), [['sun', 24], ['earth', 1]]);
  }
  const bad = await askAgent(text, {fetchImpl: async () => answer({...remote, operation: {...remote.operation, steps: [{need: 'mars', hours: 2, label: 'x'}]}})});
  assert.equal(bad.source, 'local', 'invalid payloads are never shown as agent output');
  assert.equal(bad.fallbackReason, 'language agent answer failed validation');
  assert.deepEqual(bad.op.steps.map(s => s.need), ['sun', 'earth']);
});

test('agent payloads outside the planner limits are refused', () => {
  assert.throws(() => validateAgentPayload({...remote, operation: {...remote.operation, steps: [{need: 'sun', hours: 0, label: 'x'}]}}));
  assert.throws(() => validateAgentPayload({...remote, operation: {...remote.operation, steps: Array(5).fill(remote.operation.steps[0])}}));
  const unclear = validateAgentPayload({understood: false, operation: null, note: 'Needs temperature data.'});
  assert.equal(unclear.ok, false);
});

test('a parsed request goes through the same planner as the presets', () => {
  const bundle = JSON.parse(readFileSync(new URL('../public/data/snapshot.json', import.meta.url)));
  const a = bundle.analyses.find(x => x.candidate_id === 'r256c256' && x.height_m === 0);
  const p = parseOperation('correr el experimento 2 h y después mandar los datos 30 min');
  const preset = {id: 'experiment', name: 'x', steps: [{need: 'sun', hours: 2, label: 'a'}, {need: 'earth', hours: 0.5, label: 'b'}]};
  const from = Date.parse(a.series.timestamp_utc[0]);
  assert.deepEqual(planOperation(a, p.op, from).slots.map(s => [s.start, s.end]), planOperation(a, preset, from).slots.map(s => [s.start, s.end]));
  const C = {minSun: 70, minEarth: 40, maxOutage: 360, maxDistance: 1000, maxSlope: 20, requireLink: true};
  const items = planInsights({selected: a, all: bundle.analyses, links: bundle.links['ridge-a'], constraints: C, index: 0, op: p.op});
  assert.ok(items.some(i => i.id === 'plan-first'));
});

const bundle2 = JSON.parse(readFileSync(new URL('../public/data/snapshot.json', import.meta.url)));
const ridge0 = bundle2.analyses.find(x => x.candidate_id === 'r256c256' && x.height_m === 0);

test('right-now alerts read the next rise or set from the integrated intervals', () => {
  // Ridge A, 0 m: at 1 Nov 00:00 UTC the Earth is up and its run ends at 07:00 UTC.
  const run = ridge0.metrics.earth.intervals[0];
  assert.equal(run.start_utc.slice(0, 16), '2026-11-01T00:00');
  const [alert] = nowAlerts(ridge0, 0);
  assert.equal(alert.id, 'now-earth-set');
  const left = (Date.parse(run.end_utc) - Date.parse(ridge0.series.timestamp_utc[0])) / 3.6e6;
  assert.match(alert.title, new RegExp(`^Earth sets in ${left} h`));
  for (let i = 0; i < ridge0.series.timestamp_utc.length; i += 97)
    for (const a of nowAlerts(ridge0, i)) if (a.action) assert.ok(a.action.index > i && a.action.index < ridge0.series.timestamp_utc.length);
});

const C2 = {minSun: 70, minEarth: 40, maxOutage: 360, maxDistance: 1000, maxSlope: 20, requireLink: true};
const findings = advise({selected: ridge0, all: bundle2.analyses, links: bundle2.links['ridge-a'], constraints: C2, index: 0});

test('the automatic briefing leads with the most urgent computed finding', () => {
  const b = localBriefing(findings);
  assert.equal(b.source, 'local');
  assert.equal(b.headline, findings.find(f => f.tone === 'risk').title);
  assert.ok(b.picks.length <= 3 && b.picks.every(p => findings.some(f => f.id === p.id)));
});

test('a model briefing must cite findings that exist; otherwise the automatic one is used', async () => {
  const good = {headline: 'Raise the mast before landing.', picks: [{id: findings[0].id, reason: 'It blocks the operation.'}], source: 'openai', model: 'gpt-5-mini'};
  assert.equal(validateBriefing(good, findings).source, 'openai');
  assert.throws(() => validateBriefing({...good, picks: [{id: 'made-up', reason: 'x'}]}, findings));
  const ok = await askBriefing(findings, 'op', 'ctx', {fetchImpl: async () => answer(good)});
  assert.equal(ok.briefing.source, 'openai');
  const bad = await askBriefing(findings, 'op', 'ctx', {fetchImpl: async () => answer({...good, picks: [{id: 'made-up', reason: 'x'}]})});
  assert.equal(bad.briefing.source, 'local');
  const none = await askBriefing(findings, 'op', 'ctx', {fetchImpl: async () => ({ok: false, status: 404, json: async () => ({})})});
  assert.equal(none.absent, true);
  assert.equal(none.briefing.source, 'local');
  const rejected = await askBriefing(findings, 'op', 'ctx', {fetchImpl: async () => ({ok: false, status: 502, json: async () => ({})})});
  assert.equal(rejected.absent, false);
  assert.equal(rejected.briefing.fallbackReason, 'agent briefing failed validation');
});
