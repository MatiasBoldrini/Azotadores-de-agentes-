// The Compare season summary must keep "neither site qualifies" apart from "same mast".
// Run from the repository root: node --test tests/test_monthly_season.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { mastSeason, parseMonthlyScan } from '../frontend/src/lib/monthlyScan.ts';

const scan = parseMonthlyScan(JSON.parse(readFileSync(new URL('../public/data/monthly-site-scan.json', import.meta.url))));

test('published months: Ridge A shorter in 4, one equal viable month, one month with no viable mast', () => {
  assert.deepEqual(mastSeason(scan, 'ridge-a', 'ridge-b'), { aShorter: 4, bShorter: 0, sameMast: 1, neither: 1, months: 6 });
});

test('a month where neither site qualifies is never counted as the same mast', () => {
  const months = scan.months.map(month => ({ ...month, sites: {
    'ridge-a': { ...month.sites['ridge-a'], minimum_height_m: null },
    'ridge-b': { ...month.sites['ridge-b'], minimum_height_m: null },
  } }));
  assert.deepEqual(mastSeason({ ...scan, months }, 'ridge-a', 'ridge-b'), { aShorter: 0, bShorter: 0, sameMast: 0, neither: 6, months: 6 });
});

test('a site that qualifies beats one that does not', () => {
  const months = scan.months.map(month => ({ ...month, sites: {
    'ridge-a': { ...month.sites['ridge-a'], minimum_height_m: null },
    'ridge-b': { ...month.sites['ridge-b'], minimum_height_m: 20 },
  } }));
  assert.deepEqual(mastSeason({ ...scan, months }, 'ridge-a', 'ridge-b'), { aShorter: 0, bShorter: 6, sameMast: 0, neither: 0, months: 6 });
});
