import type {Analysis, Metric} from './science.ts';

export type Body = 'sun' | 'earth';
export type Countdown = {
 body: Body;
 visible: boolean;
 /** Hours from the selected sample to the next change of state, or null if none happens before the window ends. */
 hoursToChange: number | null;
 /** Hours left in the analysed window after the selected sample (used when no change happens before the end). */
 hoursToWindowEnd: number;
 /** Length of the current visible or blocked run, taken directly from the computed intervals. */
 runHours: number;
 /** True when the run is cut by the start or end of the analysed window, so its real length may be longer. */
 runClipped: boolean;
};

const HOUR = 3_600_000;

// Uses only the intervals the science engine already integrated (each sample owns [t_i, t_i+1)).
export function countdown(metric: Metric, timestamps: string[], index: number, body: Body): Countdown {
 if (!timestamps.length) throw new Error('The observation window is empty.');
 const i = Math.max(0, Math.min(index, timestamps.length - 1));
 const now = Date.parse(timestamps[i]);
 const windowStart = Date.parse(timestamps[0]), windowEnd = Date.parse(timestamps[timestamps.length - 1]);
 const runs = [...metric.intervals.map(run => ({run, visible: true})), ...metric.outages.map(run => ({run, visible: false}))]
  .map(({run, visible}) => ({run, visible, start: Date.parse(run.start_utc), end: Date.parse(run.end_utc)}))
  .sort((a, b) => a.start - b.start);
 // The final sample is the window endpoint; it belongs to the last run.
 const current = runs.find(r => r.start <= now && now < r.end) ?? runs.find(r => r.end === now);
 if (!current) throw new Error('The selected time is outside the computed visibility windows.');
 const changes = current.end < windowEnd;
 return {
  body,
  visible: current.visible,
  hoursToChange: changes ? (current.end - now) / HOUR : null,
  hoursToWindowEnd: (windowEnd - now) / HOUR,
  runHours: current.run.duration_hours,
  runClipped: current.start === windowStart || current.end === windowEnd,
 };
}

export function missionCountdowns(analysis: Analysis, index: number): Record<Body, Countdown> {
 const times = analysis.series.timestamp_utc;
 return {
  sun: countdown(analysis.metrics.sun, times, index, 'sun'),
  earth: countdown(analysis.metrics.earth, times, index, 'earth'),
 };
}

export function eventName(c: Countdown): string {
 if (c.body === 'sun') return c.visible ? 'sunset' : 'sunrise';
 return c.visible ? 'Earthset' : 'Earthrise';
}

export type CsvContext = {siteName: string; candidateId: string; heightM: number; sources: {name: string; url: string}[]};

const csvCell = (value: string | number | boolean) => {
 const text = String(value);
 return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function timelineCsv(analysis: Analysis, context: CsvContext): string {
 const s = analysis.series, times = s.timestamp_utc;
 const header = [
  '# SITE//FORGE per-step visibility timeline',
  `# Site: ${context.siteName} · station cell ${context.candidateId} · mast ${context.heightM} m above ground`,
  `# Window (UTC): ${times[0]} to ${times[times.length - 1]} · ${times.length} samples`,
  '# Method: geometric line of sight; a body is visible when its center clears the terrain horizon at its azimuth.',
  '# Terrain: NASA LOLA south-pole DEMs (PGDA products 78 and 90). Sun and Earth directions: JPL Horizons.',
  ...context.sources.map(source => `# Source: ${source.name} <${source.url}>`),
  '# Each sample represents the interval until the next sample; the final row is the window endpoint.',
 ];
 const columns = ['time_utc', 'sun_visible', 'earth_visible', 'sun_elev_deg', 'earth_elev_deg'];
 const rows = times.map((t, i) => [t, s.sun_visible[i], s.earth_visible[i], s.sun_elevation_deg[i], s.earth_elevation_deg[i]].map(csvCell).join(','));
 return [...header, columns.join(','), ...rows].join('\n') + '\n';
}
