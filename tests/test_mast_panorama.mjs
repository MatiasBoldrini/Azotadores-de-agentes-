// node --test tests/test_mast_panorama.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { windows } from '../frontend/src/lib/science.ts';
import { classify, horizonAt, panoramaRange, trackSegments } from '../frontend/src/lib/panorama.ts';

const snapshot = JSON.parse(readFileSync(new URL('../public/data/snapshot.json', import.meta.url)));
const HEIGHTS = [0, 2, 5, 10, 20];
const at = (candidate, height) => snapshot.analyses.find(a => a.candidate_id === candidate && a.height_m === height);

test('every site has a complete 360-bin LOLA horizon for each mast height', () => {
  for (const site of snapshot.sites) {
    const sweep = HEIGHTS.map(h => at(site.candidate_id, h));
    sweep.forEach((a, k) => {
      assert.ok(a, `${site.id} missing ${HEIGHTS[k]} m`);
      assert.equal(a.horizon.elevation_deg.length, 360);
      assert.ok(a.horizon.elevation_deg.every(Number.isFinite));
      assert.match(a.horizon.coverage, /150 km/);
    });
    // A higher observer can only lower the elevation angle of the same terrain.
    for (let k = 1; k < sweep.length; k++) {
      sweep[k].horizon.elevation_deg.forEach((v, i) => assert.ok(v <= sweep[k - 1].horizon.elevation_deg[i] + 1e-9, `${site.id} bin ${i} rises at ${HEIGHTS[k]} m`));
    }
  }
});

test('horizon interpolation matches the engine at every cached sample', () => {
  for (const a of snapshot.analyses) for (const body of ['sun', 'earth']) {
    const s = a.series;
    s[`${body}_azimuth_deg`].forEach((az, i) => assert.ok(Math.abs(horizonAt(a.horizon.elevation_deg, az) - s[`${body}_horizon_deg`][i]) < 1e-9));
  }
});

test('above/below classification reproduces the engine visibility for all 130 configurations', () => {
  assert.equal(snapshot.analyses.length, 130);
  for (const a of snapshot.analyses) for (const body of ['sun', 'earth']) {
    assert.deepEqual(classify(a, body), a.series[`${body}_visible`], `${a.candidate_id} ${a.height_m} m ${body}`);
  }
});

test('Ridge A November 2026: the panorama classification gives the engine windows', () => {
  const ridge = snapshot.sites.find(s => s.id === 'ridge-a').candidate_id;
  const hours = (h, body) => { const a = at(ridge, h); return windows(a.series.timestamp_utc, classify(a, body)); };
  assert.equal(hours(0, 'sun').total_hours, 426);
  assert.equal(hours(5, 'sun').total_hours, 720);
  assert.equal(hours(0, 'earth').total_hours, 199);
  assert.equal(hours(5, 'earth').total_hours, 359.5);
  for (const h of HEIGHTS) for (const body of ['sun', 'earth']) {
    assert.deepEqual(hours(h, body), at(ridge, h).metrics[body]);
  }
});

test('sky tracks keep every step, never jump the 0/360 seam and carry the sample state', () => {
  for (const a of snapshot.analyses.filter(x => snapshot.sites.some(s => s.candidate_id === x.candidate_id))) for (const body of ['sun', 'earth']) {
    const visible = a.series[`${body}_visible`];
    const segments = trackSegments(a.series, body, visible);
    const az = a.series[`${body}_azimuth_deg`];
    const wraps = az.slice(1).filter((v, i) => Math.abs(v - az[i]) > 180).length;
    const steps = segments.reduce((n, s) => n + s.points.length - 1, 0);
    assert.equal(steps + wraps, az.length - 1);
    for (const s of segments) for (let i = 1; i < s.points.length; i++) assert.ok(Math.abs(s.points[i][0] - s.points[i - 1][0]) <= 180);
    const drawn = segments.flatMap(s => Array(s.points.length - 1).fill(s.visible));
    const expected = visible.slice(0, -1).filter((_, i) => Math.abs(az[i + 1] - az[i]) <= 180);
    assert.deepEqual(drawn, expected);
  }
});

test('one shared elevation range spans all heights and both bodies', () => {
  const ridge = snapshot.sites.find(s => s.id === 'ridge-a').candidate_id;
  const sweep = HEIGHTS.map(h => at(ridge, h));
  const [lo, hi] = panoramaRange(sweep);
  for (const a of sweep) for (const v of [...a.horizon.elevation_deg, ...a.series.sun_elevation_deg, ...a.series.earth_elevation_deg]) assert.ok(v >= lo && v <= hi);
});
