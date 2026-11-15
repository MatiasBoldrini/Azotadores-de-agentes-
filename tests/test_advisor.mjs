// node --test tests/test_advisor.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {advise,bestJointWindow,bindingConstraint,cheapestFix,jointWindow,overbuildAndMargins,upcomingBlackout} from '../frontend/src/lib/advisor.ts';
import {keyFor,optimize,violations,windows} from '../frontend/src/lib/science.ts';

const bundle = JSON.parse(readFileSync(new URL('../public/data/snapshot.json', import.meta.url)));
const C = {minSun:70,minEarth:40,maxOutage:360,maxDistance:1000,maxSlope:20,requireLink:true};
const ridgeA = bundle.sites.find(s => s.id === 'ridge-a');
const cellA = `r${ridgeA.row}c${ridgeA.col}`;
const at = (cell, h) => bundle.analyses.find(a => a.candidate_id === cell && a.height_m === h);
const linksA = bundle.links['ridge-a'];
const input = (selected, extra = {}) => ({selected, all: bundle.analyses, links: linksA, constraints: C, index: 0, ...extra});

// Synthetic fixture (30-minute samples), isolated from production data.
const times = Array.from({length: 11}, (_, i) => new Date(Date.UTC(2026, 10, 1, 0, 30 * i)).toISOString().replace('.000Z', '+00:00'));
const sun   = [true, true, true, true, true, true, true, false, false, true, true];
const earth = [false, true, true, false, false, true, true, true, true, true, true];
const both = sun.map((s, i) => s && earth[i]);
const fixture = {candidate_id: 'fx', height_m: 0, series: {timestamp_utc: times}, metrics: {sun: windows(times, sun), earth: windows(times, earth), both: windows(times, both)}};

test('joint window reports the overlap in progress, then the next one, never past the window', () => {
  const now = jointWindow(fixture, 1);
  assert.equal(now.id, 'joint-now');
  assert.match(now.title, /1 h left/);
  const next = jointWindow(fixture, 3);
  assert.equal(next.id, 'joint-next');
  assert.equal(next.action.index, 5);
  assert.match(next.title, /in 1 h, lasting 1 h/);
  assert.equal(jointWindow(fixture, 8).id, 'joint-next');
  assert.equal(jointWindow(fixture, 8).action.index, 9);
});

test('longest joint window is the longest integrated interval, marked when cut by the window edge', () => {
  const best = bestJointWindow(fixture);
  assert.equal(best.action.index, 1);
  const real = bestJointWindow(at(cellA, 0));
  // Ridge A, 0 m, Nov 2026: the longest continuous Sun + Earth window confirmed in the team room (44 h).
  assert.match(real.title, /^Longest Sun \+ Earth window: 44 h from /);
});

test('upcoming blackout only flags outages of at least 24 h', () => {
  assert.equal(upcomingBlackout(fixture, 0), null);
  const base = at(cellA, 0);
  const b = upcomingBlackout(base, 0);
  assert.equal(b.tone, 'risk');
  const outages = [...base.metrics.sun.outages, ...base.metrics.earth.outages].filter(o => o.duration_hours >= 24);
  assert.ok(outages.length > 0);
});

test('a failing ground-level station gets the lowest passing height at the same cell', () => {
  const fix = cheapestFix(input(at(cellA, 0)));
  assert.equal(fix.id, 'fix-height');
  const lowest = bundle.analyses.filter(a => a.candidate_id === cellA).sort((a, b) => a.height_m - b.height_m)
    .find(a => violations(a, linksA[keyFor(a)], C).length === 0);
  assert.equal(fix.action.height, lowest.height_m);
  assert.equal(fix.action.height, 5);
});

test('when nothing is feasible the advisor names the binding requirement and substitutes nothing', () => {
  const tight = {...C, maxOutage: 240};
  assert.equal(optimize(bundle.analyses, linksA, tight).recommended, null);
  const fix = cheapestFix(input(at(cellA, 0), {constraints: tight}));
  assert.equal(fix.id, 'fix-none');
  const binding = bindingConstraint(bundle.analyses, linksA, tight);
  assert.equal(binding.name, 'Maximum outage');
  assert.equal(binding.feasible, bundle.analyses.filter(a => violations(a, linksA[keyFor(a)], {...tight, maxOutage: Infinity}).length === 0).length);
  assert.match(fix.detail, /No result has been substituted/);
});

test('a passing taller mast is compared with the lowest passing height', () => {
  const [over] = overbuildAndMargins(input(at(cellA, 20)));
  assert.equal(over.id, 'overbuild');
  assert.equal(over.action.height, 5);
  const margins = overbuildAndMargins(input(at(cellA, 5)));
  assert.ok(margins.some(m => m.id === 'margin' && /342.5 h vs 360 h/.test(m.detail)));
});

test('advise ranks risks first, caps the list and every time action points at a real sample', () => {
  for (const site of bundle.sites) for (const h of [0, 2, 5, 10, 20]) for (const index of [0, 500, 1400]) {
    const selected = at(`r${site.row}c${site.col}`, h);
    const items = advise({selected, all: bundle.analyses, links: bundle.links[site.id], constraints: C, index});
    assert.ok(items.length >= 1 && items.length <= 5);
    const order = items.map(i => ({risk: 0, opportunity: 1, alternative: 2}[i.tone]));
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    assert.equal(new Set(items.map(i => i.id)).size, items.length);
    for (const i of items) if (i.action?.kind === 'time') assert.ok(i.action.index >= 0 && i.action.index < selected.series.timestamp_utc.length);
    for (const i of items) if (i.action?.kind === 'config') assert.ok(bundle.analyses.some(a => a.candidate_id === i.action.candidate && a.height_m === i.action.height));
  }
});

import {monthlyAdvice} from '../frontend/src/lib/monthlyAdvisor.ts';
const scan = JSON.parse(readFileSync(new URL('../public/data/monthly-site-scan.json', import.meta.url)));
const sites = [{id: 'ridge-a', name: 'Ridge A'}, {id: 'ridge-b', name: 'Ridge B'}];

test('monthly advice reads the scan: smallest mast, dead months and campaign masts', () => {
  const items = monthlyAdvice(scan, sites, '2026-11', 0);
  const need = id => scan.months.map(m => m.sites[id].minimum_height_m);
  const lowest = Math.min(...sites.flatMap(s => need(s.id).filter(n => n !== null)));
  assert.match(items.find(i => i.id === 'month-lowest').title, new RegExp(`^Smallest mast that works: ${lowest} m`));
  const dead = scan.months.filter(m => sites.every(s => m.sites[s.id].minimum_height_m === null));
  assert.equal(items.some(i => i.id === 'month-none'), dead.length > 0);
  for (const s of sites) {
    const campaign = items.find(i => i.id === `month-campaign-${s.id}`);
    if (campaign) assert.match(campaign.title, new RegExp(`one ${Math.max(...need(s.id).filter(n => n !== null))} m mast`));
  }
});

test('slip risk appears only when the next month needs more mast or none qualifies', () => {
  scan.months.forEach((m, i) => {
    const next = scan.months[i + 1];
    const items = monthlyAdvice(scan, sites, m.id, 0);
    for (const s of sites) {
      const now = m.sites[s.id].minimum_height_m, later = next?.sites[s.id].minimum_height_m;
      const expected = Boolean(next) && now !== null && (later === null || later > now);
      assert.equal(items.some(x => x.id === `month-slip-${s.id}`), expected, `${m.id} ${s.id}`);
    }
  });
});

test('site trade-off uses the scanned hours at the selected month and height', () => {
  const m = scan.months[0];
  const a = m.sites['ridge-a'].heights.find(h => h.height_m === 0), b = m.sites['ridge-b'].heights.find(h => h.height_m === 0);
  const t = monthlyAdvice(scan, sites, m.id, 0).find(i => i.id === 'month-tradeoff');
  if (Math.sign(b.sun_hours - a.sun_hours) * Math.sign(b.earth_hours - a.earth_hours) < 0) {
    assert.ok(t);
    assert.ok(t.detail.includes(`${Math.abs(b.earth_hours - a.earth_hours)} h`));
  } else assert.equal(t, undefined);
});
