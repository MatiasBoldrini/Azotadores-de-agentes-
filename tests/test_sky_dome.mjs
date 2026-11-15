// node --test tests/test_sky_dome.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { horizonAt } from '../frontend/src/lib/panorama.ts';
import { enu, gainedHours, horizonRing, raiseSequence, skyGained, skyPaths, skySteps } from '../frontend/src/lib/skyDome.ts';

const snapshot = JSON.parse(readFileSync(new URL('../public/data/snapshot.json', import.meta.url)));
const HEIGHTS = [0, 2, 5, 10, 20];
const at = (candidate, height) => snapshot.analyses.find(a => a.candidate_id === candidate && a.height_m === height);
const ridge = snapshot.sites.find(s => s.id === 'ridge-a').candidate_id;
const siteAnalyses = snapshot.analyses.filter(a => snapshot.sites.some(s => s.candidate_id === a.candidate_id));

test('sky-dome steps are above the horizon exactly when the engine says the body is visible', () => {
  for (const a of siteAnalyses) for (const body of ['sun', 'earth']) {
    const s = a.series, az = s[`${body}_azimuth_deg`], el = s[`${body}_elevation_deg`], vis = s[`${body}_visible`];
    const steps = skySteps(a, body);
    let k = 0;
    for (let i = 0; i < az.length - 1; i++) {
      if (Math.abs(az[i + 1] - az[i]) > 180) continue;
      const step = steps[k++];
      assert.deepEqual(step.from, [az[i], el[i]]);
      assert.equal(step.state === 'visible', vis[i], `${a.candidate_id} ${a.height_m} m ${body} sample ${i}`);
      assert.equal(step.from[1] > horizonAt(a.horizon.elevation_deg, step.from[0]), vis[i]);
      assert.notEqual(step.state, 'gained');
    }
    assert.equal(k, steps.length);
  }
});

test('Ridge A November 2026: drawn sky paths carry the engine hours at 0 m and 5 m', () => {
  const hoursOf = (a, body, states) => {
    const t = a.series.timestamp_utc.map(x => Date.parse(x)), az = a.series[`${body}_azimuth_deg`];
    const steps = skySteps(a, body, a.height_m ? at(ridge, 0) : undefined);
    let k = 0, h = 0;
    for (let i = 0; i < t.length - 1; i++) {
      if (Math.abs(az[i + 1] - az[i]) > 180) { if (a.series[`${body}_visible`][i]) h += (t[i + 1] - t[i]) / 3600000; continue; }
      if (states.includes(steps[k++].state)) h += (t[i + 1] - t[i]) / 3600000;
    }
    return h;
  };
  assert.equal(hoursOf(at(ridge, 0), 'sun', ['visible']), 426);
  assert.equal(hoursOf(at(ridge, 5), 'sun', ['visible', 'gained']), 720);
  assert.equal(hoursOf(at(ridge, 0), 'earth', ['visible']), 199);
  assert.equal(hoursOf(at(ridge, 5), 'earth', ['visible', 'gained']), 359.5);
  // Raising the mast only lowers the horizon, so the sky gained is exactly the difference of the engine totals.
  assert.equal(gainedHours(at(ridge, 5), 'sun', at(ridge, 0)), 720 - 426);
  assert.equal(gainedHours(at(ridge, 5), 'earth', at(ridge, 0)), 359.5 - 199);
});

test('gained steps equal the engine metric difference for every site and height pair', () => {
  for (const site of snapshot.sites) for (let i = 0; i < HEIGHTS.length; i++) for (let j = i + 1; j < HEIGHTS.length; j++) {
    const lo = at(site.candidate_id, HEIGHTS[i]), hi = at(site.candidate_id, HEIGHTS[j]);
    for (const body of ['sun', 'earth']) {
      assert.ok(Math.abs(gainedHours(hi, body, lo) - (hi.metrics[body].total_hours - lo.metrics[body].total_hours)) < 1e-9);
      const paths = skyPaths(skySteps(hi, body, lo));
      for (const state of ['visible', 'gained', 'blocked']) assert.equal(paths[state].length % 2, 0);
    }
  }
});

test('horizon ring closes on itself and passes through every engine bin', () => {
  const a = at(ridge, 0), ring = horizonRing(a.horizon.elevation_deg, 2);
  assert.equal(ring.length, 721);
  assert.deepEqual(ring[0], ring[ring.length - 1].map((v, i) => i ? v : 0));
  for (let bin = 0; bin < 360; bin++) assert.equal(ring[bin * 2][1], a.horizon.elevation_deg[bin]);
});

test('sky gained lies between the two real horizons and is empty when the height does not change', () => {
  const zero = at(ridge, 0).horizon.elevation_deg, five = at(ridge, 5).horizon.elevation_deg;
  const band = skyGained(zero, five);
  assert.ok(band.length > 0);
  for (const [az, top, bottom] of band) {
    assert.equal(top, zero[az]);
    assert.equal(bottom, five[az]);
    assert.ok(top > bottom);
  }
  assert.deepEqual(skyGained(zero, zero), []);
});

test('dome directions are unit vectors in local east-north-up and the raise sequence uses only tested heights', () => {
  for (const [az, el] of [[0, 0], [90, 0], [180, 10], [270, -3], [33, 1.5]]) {
    const v = enu(az, el);
    assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-12);
    assert.ok(Math.abs(Math.asin(v[2]) * 180 / Math.PI - el) < 1e-9);
  }
  assert.ok(Math.abs(enu(90, 0)[0] - 1) < 1e-12);
  assert.ok(Math.abs(enu(0, 0)[1] - 1) < 1e-12);
  assert.deepEqual(raiseSequence([10, 0, 5, 20, 2, 5]), HEIGHTS);
});
