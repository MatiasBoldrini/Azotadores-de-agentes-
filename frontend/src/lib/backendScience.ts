import manifest from './observationEphemerisManifest.json' with {type: 'json'};
import {keyFor, optimize, parseInstant, sliceAnalysis} from './science.ts';
import type {Analysis, Constraints, Link, Metric} from './science.ts';

export const BACKEND_TIMEOUT_MS = 45_000;
const heights = [0, 2, 5, 10, 20];
const invalid = () => new Error('Backend scientific response failed validation.');
const object = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value);
const close = (a: unknown, b: number) => typeof a === 'number' && Number.isFinite(a) && Math.abs(a - b) <= 1e-8;
const sameInstant = (a: unknown, b: string) => typeof a === 'string' && parseInstant(a) === parseInstant(b);

async function post(path: string, body: object, signal?: AbortSignal, baseUrl = '', timeoutMs = BACKEND_TIMEOUT_MS): Promise<Record<string, any>> {
 if (signal?.aborted) throw new DOMException('Observation request cancelled.', 'AbortError');
 const controller = new AbortController();
 let timer: ReturnType<typeof setTimeout> | undefined;
 let cancel: () => void = () => {};
 const interrupted = new Promise<never>((_, reject) => {
  cancel = () => { controller.abort(); reject(new DOMException('Observation request cancelled.', 'AbortError')); };
  signal?.addEventListener('abort', cancel, {once: true});
  timer = setTimeout(() => { controller.abort(); reject(new DOMException('Backend scientific request timed out.', 'TimeoutError')); }, timeoutMs);
 });
 try {
  const request = (async () => {
   const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/science/${path}`, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, signal: controller.signal,
    body: JSON.stringify({...body, snapshot_sha256: manifest.snapshot_sha256}),
   });
   if (!response.ok) throw new Error(`Backend scientific request failed (${response.status}).`);
   const payload: unknown = await response.json();
   if (!object(payload)) throw invalid();
   return payload;
  })();
  const payload = await Promise.race([request, interrupted]);
  if (signal?.aborted) throw new DOMException('Observation request cancelled.', 'AbortError');
  return payload;
 } finally {
  clearTimeout(timer);
  signal?.removeEventListener('abort', cancel);
 }
}

function envelope(payload: Record<string, any>, start: string, end: string) {
 if (payload.schema_version !== 1 || payload.snapshot_sha256 !== manifest.snapshot_sha256 ||
     !sameInstant(payload.start, start) || !sameInstant(payload.end, end)) throw invalid();
}

function metricMatches(actual: unknown, expected: Metric): boolean {
 if (!object(actual)) return false;
 for (const field of ['total_hours', 'duration_hours', 'longest_outage_hours', 'longest_visible_hours', 'interval_count', 'max_step_hours'] as const) {
  if (!close(actual[field], expected[field])) return false;
 }
 for (const field of ['intervals', 'outages'] as const) {
  const intervals = actual[field];
  if (!Array.isArray(intervals) || intervals.length !== expected[field].length) return false;
  for (const [i, item] of intervals.entries()) {
   const target = expected[field][i];
   if (!object(item) || !sameInstant(item.start_utc, target.start_utc) || !sameInstant(item.end_utc, target.end_utc) || !close(item.duration_hours, target.duration_hours)) return false;
  }
 }
 return true;
}

function validateAnalysis(value: unknown, reference: Analysis, start: string, end: string): Analysis {
 if (!object(value) || !object(value.position) || !object(value.horizon) || !object(value.series) || !object(value.metrics)) throw invalid();
 const a = value as Analysis;
 for (const field of ['row', 'col', 'longitude_deg', 'latitude_deg', 'elevation_m'] as const) {
  if (!close(a.position[field], reference.position[field])) throw invalid();
 }
 if (reference.position.slope_deg === null ? a.position.slope_deg !== null : !close(a.position.slope_deg, reference.position.slope_deg)) throw invalid();
 if (!heights.includes(a.height_m) || a.candidate_id !== reference.candidate_id) throw invalid();
 const h = a.horizon.elevation_deg, azimuth = a.horizon.azimuth_deg;
 if (!Array.isArray(h) || h.length !== 360 || !h.every(Number.isFinite) || !Array.isArray(azimuth) || azimuth.length !== h.length || !azimuth.every((v, i) => v === i)) throw invalid();
 if (a.height_m === reference.height_m && h.some((v, i) => !close(v, reference.horizon.elevation_deg[i]))) throw invalid();
 const times = a.series.timestamp_utc;
 const first = parseInstant(start), count = (parseInstant(end) - first) / 1_800_000 + 1;
 if (!Array.isArray(times) || times.length !== count || !times.every((t, i) => typeof t === 'string' && parseInstant(t) === first + i * 1_800_000)) throw invalid();
 const numbers = ['sun_azimuth_deg', 'sun_elevation_deg', 'sun_horizon_deg', 'earth_azimuth_deg', 'earth_elevation_deg', 'earth_horizon_deg'] as const;
 const flags = ['sun_visible', 'earth_visible', 'both_visible'] as const;
 for (const name of numbers) if (!Array.isArray(a.series[name]) || a.series[name].length !== count || !a.series[name].every(Number.isFinite)) throw invalid();
 for (const name of flags) if (!Array.isArray(a.series[name]) || a.series[name].length !== count || !a.series[name].every(v => typeof v === 'boolean')) throw invalid();
 for (let i = 0; i < count; i++) {
  for (const body of ['sun', 'earth'] as const) {
   const az = ((a.series[`${body}_azimuth_deg`][i] % 360) + 360) % 360;
   const left = Math.floor(az), fraction = az - left;
   const horizon = h[left] * (1 - fraction) + h[(left + 1) % h.length] * fraction;
   const elevation = a.series[`${body}_elevation_deg`][i];
   if (Math.abs(elevation) > 90 || !close(a.series[`${body}_horizon_deg`][i], horizon) || a.series[`${body}_visible`][i] !== (elevation > horizon)) throw invalid();
  }
  if (a.series.both_visible[i] !== (a.series.sun_visible[i] && a.series.earth_visible[i])) throw invalid();
 }
 const integrated = sliceAnalysis(a, start, end);
 for (const body of ['sun', 'earth', 'both'] as const) if (!metricMatches(a.metrics[body], integrated.metrics[body])) throw invalid();
 return a;
}

/** Requests all heights for the requested positions, then preserves the caller's subset and order. */
export async function backendWindow(analyses: Analysis[], start: string, end: string, signal?: AbortSignal, baseUrl = '', timeoutMs = BACKEND_TIMEOUT_MS): Promise<Analysis[]> {
 if (!analyses.length || parseInstant(end) <= parseInstant(start)) throw invalid();
 const candidates = [...new Set(analyses.map(a => a.candidate_id))];
 const payload = await post('window', {start, end, candidate_ids: candidates}, signal, baseUrl, timeoutMs);
 envelope(payload, start, end);
 if (!Array.isArray(payload.analyses) || payload.analyses.length !== candidates.length * heights.length) throw invalid();
 const known = new Map(analyses.map(a => [keyFor(a), a]));
 const positions = new Map(analyses.map(a => [a.candidate_id, a]));
 const received = new Map<string, Analysis>();
 for (const value of payload.analyses) {
  if (!object(value) || typeof value.candidate_id !== 'string' || !heights.includes(value.height_m)) throw invalid();
  const key = keyFor(value as Analysis), reference = known.get(key) ?? positions.get(value.candidate_id);
  if (!reference || received.has(key)) throw invalid();
  received.set(key, validateAnalysis(value, reference, start, end));
 }
 if (signal?.aborted) throw new DOMException('Observation request cancelled.', 'AbortError');
 return analyses.map(a => { const found = received.get(keyFor(a)); if (!found) throw invalid(); return found; });
}

export async function backendOptimize(analyses: Analysis[], links: Record<string, Link>, constraints: Constraints, siteId: string, signal?: AbortSignal, baseUrl = '', timeoutMs = BACKEND_TIMEOUT_MS): Promise<ReturnType<typeof optimize>> {
 if (!analyses.length) throw invalid();
 const start = analyses[0].series.timestamp_utc[0], end = analyses[0].series.timestamp_utc.at(-1)!;
 if (!analyses.every(a => sameInstant(a.series.timestamp_utc[0], start) && sameInstant(a.series.timestamp_utc.at(-1), end))) throw invalid();
 const payload = await post('optimize', {start, end, site_id: siteId, constraints}, signal, baseUrl, timeoutMs);
 envelope(payload, start, end);
 const expected = optimize(analyses, links, constraints);
 if (payload.site_id !== siteId || payload.evaluated !== expected.evaluated || payload.feasible !== expected.feasible ||
     payload.recommended !== (expected.recommended ? keyFor(expected.recommended) : null) ||
     !Array.isArray(payload.alternatives) || payload.alternatives.length !== expected.alternatives.length ||
     payload.alternatives.some((key: unknown, i: number) => key !== keyFor(expected.alternatives[i]))) throw invalid();
 if (signal?.aborted) throw new DOMException('Observation request cancelled.', 'AbortError');
 return expected;
}
