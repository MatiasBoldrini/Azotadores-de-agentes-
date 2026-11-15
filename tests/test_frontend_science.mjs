// Run from the repository root with Node 22.18+ and the project's Python environment:
// SITEFORGE_TEST_PYTHON=.venv/bin/python node --test tests/test_frontend_science.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { keyFor, optimize, sliceAnalysis, violations, windows } from '../frontend/src/lib/science.ts';

const snapshotFile = new URL('../public/data/snapshot.json', import.meta.url);
const snapshotBytes = readFileSync(snapshotFile);
const snapshot = JSON.parse(snapshotBytes);
const times = snapshot.analyses[0].series.timestamp_utc;
const bodies = ['sun', 'earth', 'both'];
const relaxed = {minSun: 0, minEarth: 0, maxOutage: 744, maxDistance: 5000, maxSlope: 90, requireLink: false};

test('static snapshot checksum and scientific contract', () => {
  const digest = createHash('sha256').update(snapshotBytes).digest('hex');
  const checksum = readFileSync(new URL('./snapshot.sha256', snapshotFile), 'utf8');
  assert.equal(checksum.trim(), `${digest}  snapshot.json`);
  assert.equal(snapshot.schema_version, 1);
  assert.equal(snapshot.sites.length, 2);
  assert.equal(snapshot.terrain.source, 'NASA LOLA');
  assert.ok(snapshot.analyses.length > 10);
  assert.equal(new Set(snapshot.analyses.map(keyFor)).size, snapshot.analyses.length);
  assert.ok(snapshot.methodology.provenance.source_sha256);
  assert.ok(snapshot.methodology.sources.some(source => source.url.includes('jpl.nasa.gov')));
  for (const site of snapshot.sites) {
    assert.ok(snapshot.analyses.some(a => a.candidate_id === site.candidate_id && a.height_m === 0));
    for (const analysis of snapshot.analyses) {
      assert.ok(snapshot.links[site.id][keyFor(analysis)], `missing link for ${site.id}/${keyFor(analysis)}`);
    }
  }
  for (const analysis of snapshot.analyses) {
    assert.equal(analysis.classification, 'NASA-derived calculation');
    assert.ok(analysis.provenance.ephemeris_sources.sun);
    assert.ok(analysis.provenance.ephemeris_sources.earth);
    assert.deepEqual(analysis.series.timestamp_utc, times);
    assert.equal(analysis.horizon.azimuth_deg.length, analysis.horizon.elevation_deg.length);
    for (const values of Object.values(analysis.series)) assert.equal(values.length, times.length);
    const series = analysis.series;
    for (let i = 0; i < times.length; i++) {
      assert.equal(series.sun_visible[i], series.sun_elevation_deg[i] > series.sun_horizon_deg[i]);
      assert.equal(series.earth_visible[i], series.earth_elevation_deg[i] > series.earth_horizon_deg[i]);
      assert.equal(series.both_visible[i], series.sun_visible[i] && series.earth_visible[i]);
    }
  }
});

test('TS integrator reproduces exported Python metrics at every real position and height', () => {
  for (const analysis of snapshot.analyses) {
    const computed = sliceAnalysis(analysis, times[0], times.at(-1));
    assert.deepEqual(computed.metrics, analysis.metrics, keyFor(analysis));
  }
});

test('irregular samples own only the interval up to the next observation', () => {
  const testTimes = ['2026-11-01T02:00:00+02:00', '2026-11-01T00:30:00Z',
    '2026-11-01T02:30:00Z', '2026-11-01T03:00:00Z'];
  const expected = {
    total_hours: 2, duration_hours: 3, longest_outage_hours: 0.5,
    longest_visible_hours: 2, interval_count: 1, max_step_hours: 2,
    intervals: [{start_utc: '2026-11-01T00:30:00+00:00', end_utc: '2026-11-01T02:30:00+00:00', duration_hours: 2}],
    outages: [
      {start_utc: '2026-11-01T00:00:00+00:00', end_utc: '2026-11-01T00:30:00+00:00', duration_hours: 0.5},
      {start_utc: '2026-11-01T02:30:00+00:00', end_utc: '2026-11-01T03:00:00+00:00', duration_hours: 0.5},
    ],
  };
  assert.deepEqual(windows(testTimes, [false, true, false, true]), expected);
  assert.deepEqual(windows(testTimes, [false, true, false, false]), expected);
  assert.throws(() => windows(testTimes.slice(0, 1), [false]), /two matching/);
  assert.throws(() => windows(testTimes, [false, true]), /two matching/);
  assert.throws(() => windows([testTimes[0], testTimes[0]], [false, true]), /increase strictly/);
  assert.throws(() => windows([testTimes[1], testTimes[0]], [false, true]), /increase strictly/);
  assert.throws(() => windows([testTimes[0], '2026-11-01T01:00:00'], [false, true]), /UTC offset/);
});

test('slicing includes both cached boundary observations and rejects unsupported dates', () => {
  const analysis = snapshot.analyses[0];
  const [first, last] = [2, 61];
  const sliced = sliceAnalysis(analysis, new Date(times[first]).toISOString(), times[last]);
  for (const key of Object.keys(analysis.series)) {
    assert.deepEqual(sliced.series[key], analysis.series[key].slice(first, last + 1));
  }
  for (const body of bodies) {
    const metric = sliced.metrics[body];
    assert.equal(metric.duration_hours, (last - first) / 2);
    const intervals = [...metric.intervals, ...metric.outages].sort((a, b) => a.start_utc.localeCompare(b.start_utc));
    assert.equal(intervals[0].start_utc, times[first]);
    assert.equal(intervals.at(-1).end_utc, times[last]);
    for (let i = 1; i < intervals.length; i++) assert.equal(intervals[i - 1].end_utc, intervals[i].start_utc);
  }
  const offset = new Date(Date.parse(times[first]) + 3600000).toISOString().replace('Z', '+01:00');
  assert.deepEqual(sliceAnalysis(analysis, offset, times[last]), sliced);
  const misaligned = new Date(Date.parse(times[first]) + 1000).toISOString();
  const outside = new Date(Date.parse(times[0]) - 3600000).toISOString();
  for (const start of [misaligned, outside, times[last], times[last + 1]]) {
    assert.throws(() => sliceAnalysis(analysis, start, times[last]), /aligned with the cached NASA observations/);
  }
  assert.throws(() => sliceAnalysis(analysis, times[first], '2026-11-31T00:00:00Z'), /calendar date/);
  const subMillisecond = new Date(times[first]).toISOString().replace('.000Z', '.000001Z');
  assert.throws(() => sliceAnalysis(analysis, subMillisecond, times[last]), /millisecond precision/);
});

test('constraint checks are strict and tie ranking prefers lower height', () => {
  const sample = snapshot.analyses[0];
  // Synthetic scoring fixture. Production observations and geometry remain in the snapshot.
  const tall = {...sample, candidate_id: 'fixture-tall', height_m: 20, position: {...sample.position, row: 0, slope_deg: 0}};
  const short = {...sample, candidate_id: 'fixture-short', height_m: 0, position: {...sample.position, row: 1, slope_deg: 0}};
  const links = Object.fromEntries([[keyFor(tall), {distance_m: 0, visible: true}],
    [keyFor(short), {distance_m: 1000, visible: true}]]);
  for (const order of [[tall, short], [short, tall]]) {
    const result = optimize(order, links, relaxed);
    assert.equal(result.cost(tall), result.cost(short));
    assert.equal(result.recommended, short);
    assert.deepEqual(result.alternatives, [short, tall]);
  }
  const c = {...relaxed, minSun: 25};
  const boundary = {...sample, metrics: {...sample.metrics, sun: {...sample.metrics.sun, duration_hours: 720, total_hours: 180}}};
  const link = links[keyFor(tall)];
  assert.ok(!violations(boundary, link, c).includes('Solar exposure'));
  assert.ok(violations(boundary, link, {...c, minSun: 25 + 1e-10}).includes('Solar exposure'));
  assert.ok(violations(sample, undefined, relaxed).includes('Installation distance'));
  assert.ok(violations(sample, {...link, visible: false}, {...relaxed, requireLink: true}).includes('Local line of sight'));
});

test('optimizes the same NASA search space as Python for both sites and several dates', () => {
  const demo = {minSun: 70, minEarth: 40, maxOutage: 360, maxDistance: 1000, maxSlope: 20, requireLink: true};
  const runs = snapshot.sites.flatMap(site => [
    {siteId: site.id, first: 0, last: times.length - 1, constraints: demo, feasible: true},
    {siteId: site.id, first: 0, last: times.length - 1, constraints: {...demo, maxOutage: 240}, feasible: false},
    {siteId: site.id, first: 47, last: 192, constraints: {...relaxed, maxDistance: 1000, maxSlope: 20}, feasible: true},
    {siteId: site.id, first: 0, last: times.length - 1, constraints: {...relaxed, maxSlope: 0}, feasible: false},
  ]);
  const oracle = spawnSync(process.env.SITEFORGE_TEST_PYTHON || 'python3', [
    fileURLToPath(new URL('./frontend_science_oracle.py', import.meta.url)), fileURLToPath(snapshotFile),
  ], {input: JSON.stringify(runs), encoding: 'utf8'});
  assert.ifError(oracle.error);
  assert.equal(oracle.status, 0, oracle.stderr);
  const expected = JSON.parse(oracle.stdout);
  for (const [i, run] of runs.entries()) {
    const analyses = snapshot.analyses.map(a => sliceAnalysis(a, times[run.first], times[run.last]));
    const links = snapshot.links[run.siteId];
    const result = optimize(analyses, links, run.constraints);
    assert.equal(result.evaluated, analyses.length);
    assert.deepEqual({
      feasible: result.feasible, alternatives: result.alternatives.map(keyFor),
      recommended: result.recommended ? keyFor(result.recommended) : null,
    }, expected[i], `ranking for ${run.siteId}, samples ${run.first}–${run.last}`);
    for (const analysis of result.alternatives) {
      assert.deepEqual(violations(analysis, links[keyFor(analysis)], run.constraints), []);
    }
    if (run.feasible) {
      assert.ok(result.recommended, 'demonstration window should be feasible');
    } else {
      assert.equal(result.feasible, 0);
      assert.equal(result.recommended, null);
      assert.deepEqual(result.alternatives, []);
    }
    const reversed = optimize(analyses.toReversed(), links, run.constraints);
    assert.deepEqual(reversed.alternatives.map(keyFor), result.alternatives.map(keyFor));
  }
});
