// Presentation helpers must only restate engine output. Run from the repository root:
// node --test tests/test_frontend_story.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { keyFor, optimize, percent, sliceAnalysis, violations } from '../frontend/src/lib/science.ts';
import { buildStory, constraintRows, contrastIndex, explainRecommendation, heightSweep, hours, peakHeight } from '../frontend/src/lib/story.ts';

const snapshot = JSON.parse(readFileSync(new URL('../public/data/snapshot.json', import.meta.url)));
const times = snapshot.analyses[0].series.timestamp_utc;
const all = snapshot.analyses.map(a => sliceAnalysis(a, times[0], times.at(-1)));
const demo = {minSun: 70, minEarth: 40, maxOutage: 360, maxDistance: 1000, maxSlope: 20, requireLink: true};
const text = segments => segments.map(s => s.t).join('');

for (const site of snapshot.sites) {
  const links = snapshot.links[site.id];
  const sweep = heightSweep(all, site.candidate_id);
  const baseline = sweep.find(a => a.height_m === 0);
  const input = {baseline, sweep, links, constraints: demo, search: null, searching: false, evaluated: all.length};

  test(`${site.name}: constraint rows mirror violations() at every height`, () => {
    for (const a of sweep) {
      const link = links[keyFor(a)];
      const failed = violations(a, link, demo);
      const rows = constraintRows(a, link, demo);
      assert.deepEqual(rows.filter(r => !r.pass).map(r => r.name), failed);
      assert.equal(rows[0].value, `${percent(a.metrics.sun).toFixed(1)}%`);
      assert.equal(rows[1].value, `${percent(a.metrics.earth).toFixed(1)}%`);
      const longestIndividualOutage = Math.max(a.metrics.sun.longest_outage_hours, a.metrics.earth.longest_outage_hours);
      assert.equal(rows.find(row => row.name === 'Maximum outage').value, `${hours(longestIndividualOutage)} h`);
    }
  });

  test(`${site.name}: sweep and peak height come from the cached heights`, () => {
    assert.deepEqual(sweep.map(a => a.height_m), snapshot.heights_m);
    const peak = peakHeight(sweep);
    const maxEarth = Math.max(...sweep.map(a => a.metrics.earth.total_hours));
    const maxSun = Math.max(...sweep.map(a => a.metrics.sun.total_hours));
    if (peak !== null) {
      const at = sweep.find(a => a.height_m === peak);
      assert.equal(at.metrics.earth.total_hours, maxEarth);
      assert.equal(at.metrics.sun.total_hours, maxSun);
      for (const lower of sweep.filter(a => a.height_m < peak)) {
        assert.ok(lower.metrics.earth.total_hours < maxEarth || lower.metrics.sun.total_hours < maxSun);
      }
    }
  });

  test(`${site.name}: every story restates the selected analysis`, () => {
    for (const selected of sweep) {
      const story = buildStory({...input, selected});
      const all_text = text(story.title) + text(story.detail);
      assert.ok(all_text.length > 0);
      if (selected === baseline) assert.ok([1, 2].includes(story.step));
      else assert.ok(all_text.includes(hours(selected.metrics.earth.total_hours)) || all_text.includes(hours(selected.metrics.sun.total_hours)));
      for (const action of story.actions) {
        if (action.kind === 'height') assert.ok(snapshot.heights_m.includes(action.height));
      }
    }
  });

  test(`${site.name}: moving the station keeps the ground-level comparison without a reset action`, () => {
    const moved = all.find(a => a.candidate_id !== baseline.candidate_id && links[keyFor(a)]);
    const movedSweep = heightSweep(all, moved.candidate_id);
    for (const selected of movedSweep) {
      const story = buildStory({...input, sweep: movedSweep, selected});
      assert.match(text(story.title), /versus ground level at the lander/);
      assert.deepEqual(story.actions.map(action => action.kind), ['optimize']);
    }
  });

  test(`${site.name}: optimizer stories and explanations follow optimize()`, () => {
    for (const constraints of [demo, {...demo, maxOutage: 240}]) {
      const search = optimize(all, links, constraints);
      if (!search.recommended) {
        const story = buildStory({...input, constraints, selected: baseline, search});
        assert.equal(story.tone, 'infeasible');
        assert.match(text(story.title), /No feasible configuration found within the evaluated search space/);
        assert.deepEqual(explainRecommendation(search, all, links, constraints, baseline), []);
        continue;
      }
      const story = buildStory({...input, constraints, selected: search.recommended, search});
      assert.equal(story.step, 5);
      assert.ok(story.kicker.includes(`${search.feasible} of ${search.evaluated}`));
      assert.ok(text(story.title).includes(`${search.recommended.height_m} m mast`));
      const lines = explainRecommendation(search, all, links, constraints, baseline).map(text);
      assert.ok(lines[0].includes(search.cost(search.recommended).toFixed(3)));
    }
  });
}

test('Ridge A contrast instant is a real blocked-at-ground, visible-with-mast sample', () => {
  const site = snapshot.sites.find(s => s.id === 'ridge-a');
  const sweep = heightSweep(all, site.candidate_id);
  const base = sweep[0];
  const target = sweep.find(a => a.height_m === peakHeight(sweep));
  const i = contrastIndex(base, target);
  assert.ok(i > 0);
  assert.equal(base.series.earth_visible[i], false);
  assert.equal(target.series.earth_visible[i], true);
});
