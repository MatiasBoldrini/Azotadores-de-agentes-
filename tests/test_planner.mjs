// node --test tests/test_planner.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PRESETS,fallbackPlan,planInsights,planOperation,slackHours} from '../frontend/src/lib/planner.ts';
import {keyFor,violations,windows} from '../frontend/src/lib/science.ts';

const H = 3_600_000;
const bundle = JSON.parse(readFileSync(new URL('../public/data/snapshot.json', import.meta.url)));
const C = {minSun:70,minEarth:40,maxOutage:360,maxDistance:1000,maxSlope:20,requireLink:true};
const at = (cell, h) => bundle.analyses.find(a => a.candidate_id === cell && a.height_m === h);
const ridgeA = 'r256c256';

// Synthetic fixture (30-minute samples), isolated from production data.
const times = Array.from({length: 13}, (_, i) => new Date(Date.UTC(2026, 10, 1, 0, 30 * i)).toISOString().replace('.000Z', '+00:00'));
const sun   = [true, true, true, true, false, false, true, true, true, true, true, true, true];
const earth = [false, false, false, false, true, true, true, false, false, true, true, true, true];
const both = sun.map((s, i) => s && earth[i]);
const fx = {candidate_id: 'fx', height_m: 0, series: {timestamp_utc: times}, metrics: {sun: windows(times, sun), earth: windows(times, earth), both: windows(times, both)}};
const t0 = Date.parse(times[0]);
const op = {id: 't', name: 'T', steps: [{need: 'sun', hours: 1, label: 'a'}, {need: 'earth', hours: 1, label: 'b'}]};

test('steps run in order, each inside one continuous run, as early as possible', () => {
  const p = planOperation(fx, op, t0);
  assert.equal(p.slots[0].start, t0);               // Sun 00:00–01:00
  assert.equal(p.slots[1].start, t0 + 2 * H);       // Earth run 02:00–03:30
  assert.equal(p.finish, t0 + 3 * H);
  assert.equal(planOperation(fx, {...op, steps: [{need: 'both', hours: 3, label: 'x'}]}, t0), null);
});

test('slack never adds a wait and the fallback is a later opportunity', () => {
  const p = planOperation(fx, op, t0);
  const slack = slackHours(fx, op, p);
  assert.equal(slack, 1);                            // start 01:00 still finishes 03:00
  const fb = fallbackPlan(fx, op, p);
  assert.ok(fb.start > p.start + slack * H);
});

test('Ridge A ground level: a 2 h + 0.5 h operation waits for the Earth window found by the engine', () => {
  const a = at(ridgeA, 0), from = Date.parse(a.series.timestamp_utc[0]);
  const p = planOperation(a, PRESETS[0], from);
  const earthRun = a.metrics.earth.intervals.find(r => Date.parse(r.end_utc) - Math.max(Date.parse(r.start_utc), p.slots[0].end) >= 0.5 * H);
  assert.equal(p.slots[1].start, Math.max(Date.parse(earthRun.start_utc), p.slots[0].end));
});

test('the better-configuration suggestion meets every constraint and finishes no later', () => {
  for (const preset of PRESETS) for (const h of [0, 2]) {
    const selected = at(ridgeA, h);
    const items = planInsights({selected, all: bundle.analyses, links: bundle.links['ridge-a'], constraints: C, index: 0, op: preset});
    const better = items.find(i => i.id === 'plan-better');
    if (!better) continue;
    const a = at(better.action.candidate, better.action.height);
    assert.deepEqual(violations(a, bundle.links['ridge-a'][keyFor(a)], C), []);
    const from = Date.parse(selected.series.timestamp_utc[0]);
    const mine = planOperation(selected, preset, from), theirs = planOperation(a, preset, from);
    assert.ok(!mine || theirs.finish < mine.finish);
  }
});
