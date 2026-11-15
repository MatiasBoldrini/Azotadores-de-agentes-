// node --test tests/test_mission_ops.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { countdown, eventName, missionCountdowns, timelineCsv } from '../frontend/src/lib/missionOps.ts';
import { windows } from '../frontend/src/lib/science.ts';
import { decodeShareState, encodeShareState } from '../frontend/src/lib/shareLink.ts';

// Synthetic fixture: 30-minute samples, isolated from production data.
const times = Array.from({length: 9}, (_, i) => new Date(Date.UTC(2026, 10, 1, 0, 30 * i)).toISOString().replace('.000Z', '+00:00'));
const states = [true, true, true, false, false, true, true, true, true];
const metric = windows(times, states);

test('countdown to the next change while visible, with the current run length', () => {
  const c = countdown(metric, times, 1, 'sun');
  assert.equal(c.visible, true);
  assert.equal(eventName(c), 'sunset');
  assert.equal(c.hoursToChange, 1); // 00:30 -> 01:30
  assert.equal(c.runHours, 1.5);
  assert.equal(c.runClipped, true); // starts at the window start
});

test('in shadow the countdown points to the next rise and the outage length', () => {
  const c = countdown(metric, times, 3, 'earth');
  assert.equal(c.visible, false);
  assert.equal(eventName(c), 'Earthrise');
  assert.equal(c.hoursToChange, 1);
  assert.equal(c.runHours, 1);
  assert.equal(c.runClipped, false);
});

test('no change before the window ends is reported, never extrapolated', () => {
  for (const index of [5, 8]) {
    const c = countdown(metric, times, index, 'sun');
    assert.equal(c.visible, true);
    assert.equal(c.hoursToChange, null);
    assert.equal(c.hoursToWindowEnd, (8 - index) / 2);
    assert.equal(c.runClipped, true);
  }
});

const snapshot = JSON.parse(readFileSync(new URL('../public/data/snapshot.json', import.meta.url)));

test('countdowns on real analyses agree with the per-sample visibility series', () => {
  for (const analysis of snapshot.analyses.filter(a => a.height_m === 0 || a.height_m === 5).slice(0, 6)) {
    const s = analysis.series, n = s.timestamp_utc.length;
    for (const index of [0, 137, 500, 911, n - 2, n - 1]) {
      const counts = missionCountdowns(analysis, index);
      for (const body of ['sun', 'earth']) {
        const visible = s[`${body}_visible`];
        const c = counts[body];
        // Each sample owns [t_i, t_i+1); the last sample is only the window endpoint.
        const state = visible[Math.min(index, n - 2)];
        assert.equal(c.visible, state);
        let next = Math.min(index, n - 2) + 1;
        while (next <= n - 2 && visible[next] === state) next++;
        if (next > n - 2) assert.equal(c.hoursToChange, null);
        else assert.equal(c.hoursToChange, (Date.parse(s.timestamp_utc[next]) - Date.parse(s.timestamp_utc[index])) / 3_600_000);
      }
    }
  }
});

test('CSV export carries sources and one row per sample from the series', () => {
  const analysis = snapshot.analyses[0];
  const csv = timelineCsv(analysis, {siteName: 'Ridge A', candidateId: analysis.candidate_id, heightM: analysis.height_m, sources: snapshot.methodology.sources});
  const lines = csv.trimEnd().split('\n');
  const comments = lines.filter(l => l.startsWith('#'));
  assert.ok(comments.some(l => l.includes('PGDA products 78 and 90')));
  assert.ok(comments.some(l => l.includes('JPL Horizons')));
  assert.ok(comments.some(l => l.includes('geometric line of sight')));
  const rows = lines.filter(l => !l.startsWith('#'));
  assert.equal(rows[0], 'time_utc,sun_visible,earth_visible,sun_elev_deg,earth_elev_deg');
  assert.equal(rows.length - 1, analysis.series.timestamp_utc.length);
  const [t, sun, earth, elev] = rows[42].split(',');
  assert.equal(t, analysis.series.timestamp_utc[41]);
  assert.equal(sun, String(analysis.series.sun_visible[41]));
  assert.equal(earth, String(analysis.series.earth_visible[41]));
  assert.equal(Number(elev), analysis.series.sun_elevation_deg[41]);
});

const limits = {sites: ['ridge-a', 'ridge-b'], heights: [0, 2, 5, 10, 20]};

test('share link round-trips site, station, mast, window, time and view', () => {
  const state = {site: 'ridge-b', cell: 'r250c262', mast: 5, start: '2026-12-01T00:00:00+00:00', end: '2026-12-31T00:00:00+00:00', at: '2026-12-04T12:30:00+00:00', view: 'designer'};
  const query = encodeShareState(state);
  assert.deepEqual(decodeShareState(`?${query}`, limits), state);
  assert.deepEqual(decodeShareState(new URL(`https://siteforge-moon.vercel.app/?${query}`).search, limits), state);
});

test('share link ignores values outside the cached dataset', () => {
  assert.equal(decodeShareState('?demo=1', limits), null);
  const decoded = decodeShareState('?site=mars&mast=7&view=hack&start=2026-12-01T00:00:00Z&end=2026-11-01T00:00:00Z&at=yesterday', limits);
  assert.deepEqual(decoded, {});
  const rejected = decodeShareState('?site=ridge-a&mast=0&start=2026-12-01T00:00:00Z&end=2026-12-02T00:00:00Z', {...limits, validWindow: () => { throw new Error('outside cache'); }});
  assert.deepEqual(rejected, {site: 'ridge-a', mast: 0});
});
