import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {
  calculateObservationWindow, decodeObservationShard, novemberWindow, observationDays, shardsForWindow,
} from '../frontend/src/lib/observationEphemeris.ts';
import {keyFor, optimize} from '../frontend/src/lib/science.ts';

const snapshotFile = new URL('../public/data/snapshot.json', import.meta.url);
const snapshot = JSON.parse(readFileSync(snapshotFile));
const utc = day => day + 'T00:00:00+00:00';
const bodies = ['sun', 'earth', 'both'];
const defaults = {minSun: 70, minEarth: 40, maxOutage: 360, maxDistance: 1000, maxSlope: 20, requireLink: true};
const binaryFor = spec => readFileSync(new URL(`observation-ephemeris/${spec.file}`, snapshotFile));
const arrayBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const allSpecs = shardsForWindow(observationDays[0], observationDays.at(-1));
const shards = await Promise.all(allSpecs.map(spec => decodeObservationShard(spec, arrayBuffer(binaryFor(spec)))));
const select = (start, end) => calculateObservationWindow(
  snapshot.analyses, start, end, shardsForWindow(start, end).map(spec => shards.find(shard => shard.spec === spec)),
);

test('November remains the default and the extension accepts only bounded, aligned windows', async () => {
  assert.equal(observationDays[0], utc('2026-11-01'));
  assert.equal(observationDays.at(-1), utc('2027-05-01'));
  assert.deepEqual(novemberWindow, {start: utc('2026-11-01'), end: utc('2026-12-01')});
  assert.equal(select(novemberWindow.start, novemberWindow.end), snapshot.analyses);
  assert.deepEqual(shardsForWindow(utc('2027-01-01'), utc('2027-01-02')).map(spec => spec.file), ['2027-01.f64']);
  assert.deepEqual(shardsForWindow(utc('2026-12-31'), utc('2027-01-01')).map(spec => spec.file), ['2026-12.f64']);
  assert.throws(() => shardsForWindow(utc('2026-10-31'), utc('2026-12-01')), /covered UTC dates/);
  assert.throws(() => shardsForWindow(utc('2027-05-01'), utc('2027-05-02')), /covered UTC dates/);
  assert.throws(() => shardsForWindow(utc('2027-02-29'), utc('2027-04-01')), /calendar date/);
  assert.throws(() => shardsForWindow('2027-04-01T00:01:00Z', utc('2027-05-01')), /covered UTC dates/);
  assert.throws(() => calculateObservationWindow(snapshot.analyses, utc('2027-04-01'), utc('2027-05-01'), []), /incomplete/);
  const spec = allSpecs[0];
  const bytes = binaryFor(spec);
  await assert.rejects(decodeObservationShard(spec, arrayBuffer(bytes.subarray(1))), /Unexpected size/);
  bytes[0] ^= 1;
  await assert.rejects(decodeObservationShard(spec, arrayBuffer(bytes)), /integrity check/);
});

test('full coverage visibility and selected-window rankings agree with independent Python calculations', () => {
  const ranges = [
    ['2026-11-29', '2026-12-05'], ['2026-12-25', '2027-01-07'], ['2027-04-01', '2027-05-01'],
  ];
  const runs = ranges.map(([start, end], index) => ({
    siteId: snapshot.sites[index % 2].id,
    first: (Date.parse(utc(start)) - Date.parse(novemberWindow.start)) / 1_800_000,
    last: (Date.parse(utc(end)) - Date.parse(novemberWindow.start)) / 1_800_000,
    constraints: index === 2 ? defaults : {...defaults, minSun: 20, minEarth: 20},
  }));
  const oracle = spawnSync(process.env.SITEFORGE_TEST_PYTHON || 'python3', [
    fileURLToPath(new URL('./frontend_science_oracle.py', import.meta.url)), fileURLToPath(snapshotFile), '--observations',
  ], {input: JSON.stringify(runs), encoding: 'utf8'});
  assert.ifError(oracle.error);
  assert.equal(oracle.status, 0, oracle.stderr);
  const expected = JSON.parse(oracle.stdout);

  const combined = select(observationDays[0], observationDays.at(-1));
  assert.equal(combined.length, 130);
  for (const analysis of combined) {
    assert.equal(analysis.metrics.sun.duration_hours, 4344);
    assert.equal(analysis.series.timestamp_utc.at(-1), utc('2027-05-01'));
    for (const body of bodies) {
      const visibility = createHash('sha256').update(new Uint8Array(analysis.series[`${body}_visible`])).digest('hex');
      assert.equal(visibility, expected.visibility[keyFor(analysis)][body], `${keyFor(analysis)}/${body}`);
    }
  }
  for (const [index, [from, to]] of ranges.entries()) {
    const run = runs[index];
    const analyses = select(utc(from), utc(to));
    const result = optimize(analyses, snapshot.links[run.siteId], run.constraints);
    assert.deepEqual({
      feasible: result.feasible,
      alternatives: result.alternatives.map(keyFor),
      recommended: result.recommended ? keyFor(result.recommended) : null,
    }, expected.ranking[index]);
  }
});

test('independent Compare windows match the published fixed-site monthly totals', () => {
  const monthly = JSON.parse(readFileSync(new URL('monthly-site-scan.json', snapshotFile)));
  for (const month of monthly.months) {
    const analyses = select(month.start_utc, month.end_utc);
    for (const site of snapshot.sites) {
      for (const height of month.sites[site.id].heights) {
        const result = analyses.find(a => a.candidate_id === site.candidate_id && a.height_m === height.height_m);
        assert.equal(result.metrics.sun.total_hours, height.sun_hours);
        assert.equal(result.metrics.earth.total_hours, height.earth_hours);
        assert.equal(result.metrics.both.longest_outage_hours, height.both_longest_outage_hours);
      }
    }
  }
});
