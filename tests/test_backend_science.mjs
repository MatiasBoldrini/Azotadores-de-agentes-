import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import manifest from '../frontend/src/lib/observationEphemerisManifest.json' with {type: 'json'};
import {backendWindow, backendOptimize} from '../frontend/src/lib/backendScience.ts';
import {sliceAnalysis, optimize, keyFor} from '../frontend/src/lib/science.ts';

const snapshot = JSON.parse(readFileSync(new URL('../public/data/snapshot.json', import.meta.url)));
const inputs = snapshot.analyses.slice(0, 5);
const start = '2026-11-21T16:00:00Z', end = '2026-11-21T18:00:00Z';
const output = inputs.map(a => sliceAnalysis(a, start, end));
const envelope = () => ({schema_version: 1, snapshot_sha256: manifest.snapshot_sha256, start, end});
const windowPayload = () => ({...envelope(), analyses: structuredClone(output)});
const response = payload => ({ok: true, json: async () => payload});
const defaults = {minSun: 70, minEarth: 40, maxOutage: 360, maxDistance: 1000, maxSlope: 20, requireLink: true};
const all = snapshot.analyses.map(a => sliceAnalysis(a, start, end));
const links = snapshot.links['ridge-a'];
const expected = optimize(all, links, defaults);
const rankingPayload = () => ({...envelope(), site_id: 'ridge-a', evaluated: expected.evaluated, feasible: expected.feasible, recommended: expected.recommended ? keyFor(expected.recommended) : null, alternatives: expected.alternatives.map(keyFor)});
function fake(t, implementation) { t.mock.method(globalThis, 'fetch', implementation); }

await test('backend window sends checksum and filters canonical heights into the caller subset/order', async t => {
 let observed;
 fake(t, async (url, init) => { observed = {url, init}; return response(windowPayload()); });
 const selected = [inputs[3], inputs[0]];
 const result = await backendWindow(selected, start, end, undefined, 'https://science.example/');
 assert.deepEqual(result.map(keyFor), selected.map(keyFor));
 assert.equal(observed.url, 'https://science.example/api/science/window');
 assert.equal(observed.init.method, 'POST');
 assert.deepEqual(JSON.parse(observed.init.body), {start, end, candidate_ids: [inputs[0].candidate_id], snapshot_sha256: manifest.snapshot_sha256});
 assert.equal(result[0].metrics.sun.duration_hours, 2);
});

await test('backend window accepts equivalent UTC offset timestamps', async t => {
 const payload = windowPayload(); payload.start = '2026-11-21T13:00:00-03:00'; payload.end = '2026-11-21T15:00:00-03:00';
 fake(t, async () => response(payload));
 assert.equal((await backendWindow(inputs, start, end)).length, 5);
});

for (const [name, mutate] of Object.entries({
 'wrong schema': p => {p.schema_version = 2;},
 'stale snapshot': p => {p.snapshot_sha256 = 'stale';},
 'stale window': p => {p.end = '2026-11-22T18:00:00Z';},
 'empty analyses': p => {p.analyses = [];},
 'missing height': p => {p.analyses.pop();},
 'duplicate identity': p => {p.analyses[1] = p.analyses[0];},
 'unknown candidate': p => {p.analyses[0].candidate_id = 'r0c0';},
 'unsupported height': p => {p.analyses[0].height_m = 7;},
 'wrong position': p => {p.analyses[0].position.row += 1;},
 'wrong horizon': p => {p.analyses[0].horizon.elevation_deg[0] += 1;},
 'nonfinite angles': p => {p.analyses[0].series.sun_elevation_deg[0] = Infinity;},
 'nonboolean visibility': p => {p.analyses[0].series.sun_visible[0] = 1;},
 'inconsistent visibility': p => {p.analyses[0].series.sun_visible[0] = !p.analyses[0].series.sun_visible[0];},
 'inconsistent combined visibility': p => {p.analyses[0].series.both_visible[0] = !p.analyses[0].series.both_visible[0];},
 'inconsistent metric': p => {p.analyses[0].metrics.sun.total_hours += .5;},
 'missing interval': p => {p.analyses[0].metrics.sun.intervals = [{start_utc: start, end_utc: end, duration_hours: 999}];},
 'missing sample': p => {p.analyses[0].series.sun_visible.pop();},
 'out of order time': p => {p.analyses[0].series.timestamp_utc.reverse();},
})) {
 await test(`rejects ${name} instead of silently accepting backend data`, async t => {
  const payload = windowPayload(); mutate(payload);
  fake(t, async () => response(payload));
  await assert.rejects(backendWindow(inputs, start, end), /validation/);
 });
}

await test('HTTP and network errors reach the caller for explicit fallback decisions', async t => {
 fake(t, async () => ({ok: false, status: 503}));
 await assert.rejects(backendWindow(inputs, start, end), /503/);
 globalThis.fetch = async () => {throw new TypeError('network unavailable');};
 await assert.rejects(backendWindow(inputs, start, end), /network unavailable/);
});

await test('invalid JSON is rejected', async t => {
 fake(t, async () => ({ok: true, json: async () => {throw new SyntaxError('invalid JSON');}}));
 await assert.rejects(backendWindow(inputs, start, end), /invalid JSON/);
});

await test('deadline cancels even a stalled response body and never returns cached data', async t => {
 let signal;
 fake(t, async (_, init) => {signal = init.signal; return {ok: true, json: () => new Promise(() => {})};});
 await assert.rejects(backendWindow(inputs, start, end, undefined, '', 10), {name: 'TimeoutError'});
 assert.equal(signal.aborted, true);
});

await test('pre-aborted requests do not fetch', async t => {
 let calls = 0; fake(t, async () => {calls++; return response(windowPayload());});
 const controller = new AbortController(); controller.abort();
 await assert.rejects(backendWindow(inputs, start, end, controller.signal), {name: 'AbortError'});
 assert.equal(calls, 0);
});

await test('late older response cannot resolve after external abort while a newer request succeeds', async t => {
 let completeOld; let count = 0;
 fake(t, async () => ++count === 1 ? new Promise(resolve => {completeOld = resolve;}) : response(windowPayload()));
 const controller = new AbortController();
 const old = backendWindow(inputs, start, end, controller.signal);
 controller.abort();
 const newer = await backendWindow(inputs, start, end);
 await assert.rejects(old, {name: 'AbortError'});
 completeOld(response(windowPayload()));
 assert.equal(newer.length, 5);
});

await test('backend ranking maps validated keys back to current analysis objects', async t => {
 fake(t, async () => response(rankingPayload()));
 const result = await backendOptimize(all, links, defaults, 'ridge-a');
 assert.equal(result.recommended, expected.recommended);
 assert.deepEqual(result.alternatives.map(keyFor), expected.alternatives.map(keyFor));
 assert.equal(typeof result.cost, 'function');
});

for (const [name, mutate] of Object.entries({
 'wrong site': p => {p.site_id = 'ridge-b';},
 'wrong evaluated count': p => {p.evaluated--;},
 'wrong feasible count': p => {p.feasible++;},
 'unknown recommendation': p => {p.recommended = 'r0c0-0';},
 'fabricated alternatives': p => {p.alternatives = ['r0c0-0'];},
 'wrong schema': p => {p.schema_version = 2;},
 'stale checksum': p => {p.snapshot_sha256 = 'stale';},
 'stale window': p => {p.start = '2026-11-20T16:00:00Z';},
})) {
 await test(`backend optimization rejects ${name}`, async t => {
  const payload = rankingPayload(); mutate(payload); fake(t, async () => response(payload));
  await assert.rejects(backendOptimize(all, links, defaults, 'ridge-a'), /validation/);
 });
}

await test('valid infeasible response remains empty with no invented recommendation', async t => {
 const strict = {...defaults, minSun: 100, minEarth: 100, maxSlope: 0};
 const r = optimize(all, links, strict);
 assert.equal(r.feasible, 0);
 fake(t, async () => response({...envelope(), site_id: 'ridge-a', evaluated: all.length, feasible: 0, recommended: null, alternatives: []}));
 const result = await backendOptimize(all, links, strict, 'ridge-a');
 assert.equal(result.recommended, null); assert.deepEqual(result.alternatives, []);
});
