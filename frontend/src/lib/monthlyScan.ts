import type { Constraints } from './science';

type MonthlyHeight = {
  height_m: number;
  sun_hours: number;
  earth_hours: number;
  both_longest_outage_hours: number;
};

type MonthlySite = {
  minimum_height_m: number | null;
  heights: MonthlyHeight[];
};

export type MonthlyWindow = {
  id: string;
  start_utc: string;
  end_utc: string;
  duration_hours: number;
  sites: Record<string, MonthlySite>;
};

export type MonthlyScan = {
  schema_version: 1;
  heights_m: number[];
  defaults: Constraints;
  months: MonthlyWindow[];
};

const siteIds = ['ridge-a', 'ridge-b'];

function validWindow(month: MonthlyWindow, index: number, heights: number[]): boolean {
  const start = Date.UTC(2026, 10 + index);
  const end = Date.UTC(2026, 11 + index);
  const { duration_hours: duration } = month;
  if (
    month.id !== new Date(start).toISOString().slice(0, 7) ||
    Date.parse(month.start_utc) !== start || Date.parse(month.end_utc) !== end ||
    duration !== (end - start) / 3_600_000
  ) return false;

  return siteIds.every(id => {
    const site = month.sites?.[id];
    return Array.isArray(site?.heights) && site.heights.length === heights.length &&
      (site.minimum_height_m === null || heights.includes(site.minimum_height_m)) &&
      heights.every(height => {
        const sample = site.heights.find(item => item.height_m === height);
        return sample && [sample.sun_hours, sample.earth_hours, sample.both_longest_outage_hours]
          .every(hours => Number.isFinite(hours) && hours >= 0 && hours <= duration);
      });
  });
}

export function parseMonthlyScan(value: unknown): MonthlyScan {
  const scan = value as MonthlyScan | null;
  const defaults = scan?.defaults;
  if (
    scan?.schema_version !== 1 || !defaults ||
    ![defaults.minSun, defaults.minEarth, defaults.maxOutage, defaults.maxDistance, defaults.maxSlope].every(Number.isFinite) ||
    typeof defaults.requireLink !== 'boolean' ||
    !Array.isArray(scan.heights_m) || !scan.heights_m.includes(0) ||
    !scan.heights_m.every(height => Number.isFinite(height) && height >= 0) ||
    new Set(scan.heights_m).size !== scan.heights_m.length ||
    !Array.isArray(scan.months) || scan.months.length !== 6 ||
    !scan.months.every((month, index) => month && validWindow(month, index, scan.heights_m))
  ) throw new Error('Invalid monthly site dataset.');
  return scan;
}

export type MastSeason = { aShorter: number; bShorter: number; sameMast: number; neither: number; months: number };

// Compares the lowest qualifying mast month by month. A month where neither site qualifies at any
// tested height is its own outcome: it is not a tie between two equal masts.
export function mastSeason(scan: MonthlyScan, a: string, b: string): MastSeason {
  const season = { aShorter: 0, bShorter: 0, sameMast: 0, neither: 0, months: scan.months.length };
  for (const month of scan.months) {
    const ha = month.sites[a].minimum_height_m, hb = month.sites[b].minimum_height_m;
    if (ha === null && hb === null) season.neither++;
    else if (hb === null || (ha !== null && ha < hb)) season.aShorter++;
    else if (ha === null || hb < ha) season.bShorter++;
    else season.sameMast++;
  }
  return season;
}
