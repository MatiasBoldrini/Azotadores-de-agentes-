import manifest from './observationEphemerisManifest.json' with {type: 'json'};
import {parseInstant, sliceAnalysis, windowIntegrator} from './science.ts';
import type {Analysis} from './science.ts';

type ShardSpec = (typeof manifest.shards)[number];
export type ObservationShard = {spec: ShardSpec; directions: DataView};
type DirectionColumns = Pick<Analysis['series'],
  'sun_azimuth_deg' | 'sun_elevation_deg' | 'earth_azimuth_deg' | 'earth_elevation_deg'>;

const step = manifest.step_minutes * 60_000;
const day = 86_400_000;
const origin = Date.parse(manifest.start_utc);
const splice = Date.parse(manifest.splice_utc);
const last = Date.parse(manifest.end_utc);
const columns = ['sun_azimuth_deg', 'sun_elevation_deg', 'earth_azimuth_deg', 'earth_elevation_deg'] as const;
const bytesPerAngle = Float64Array.BYTES_PER_ELEMENT;
const utc = (instant: number) => new Date(instant).toISOString().replace('.000Z', '+00:00');

export const novemberWindow = {start: manifest.start_utc, end: manifest.splice_utc};
export const observationDays = Array.from({length: (last - origin) / day + 1}, (_, index) => utc(origin + index * day));
export const maxObservationHours = (last - origin) / 3_600_000;

const shards = manifest.shards.map(spec => ({spec, first: Date.parse(spec.start_utc), last: Date.parse(spec.end_utc)}));

export function shardsForWindow(start: string, end: string): ShardSpec[] {
  const first = parseInstant(start);
  const finish = parseInstant(end);
  if (manifest.schema_version !== 1 ||
      first < origin || finish > last || finish <= first || (first - origin) % step || (finish - origin) % step) {
    throw new Error('Choose a window within the covered UTC dates.');
  }
  return shards.filter(shard => first < shard.last && finish > shard.first).map(shard => shard.spec);
}

export async function decodeObservationShard(spec: ShardSpec, buffer: ArrayBuffer): Promise<ObservationShard> {
  const count = (Date.parse(spec.end_utc) - Date.parse(spec.start_utc)) / step + 1;
  if (buffer.byteLength !== count * columns.length * manifest.candidate_ids.length * bytesPerAngle) {
    throw new Error('Unexpected size for the cached observations.');
  }
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const checksum = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (checksum !== spec.sha256) throw new Error('Cached observations failed their integrity check.');
  return {spec, directions: new DataView(buffer)};
}

const cache = new Map<string, Promise<ObservationShard>>();
export function loadObservationShard(spec: ShardSpec, timeoutMs = 15_000): Promise<ObservationShard> {
  const cached = cache.get(spec.file);
  if (cached) return cached;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_,reject)=>{
    timer=setTimeout(()=>{controller.abort();reject(new Error('Cached observation request timed out.'));},timeoutMs);
  });
  const download = fetch(`/data/observation-ephemeris/${spec.file}`,{signal:controller.signal}).then(async response => {
    if (!response.ok) throw new Error(`Observation data unavailable (${response.status}).`);
    return decodeObservationShard(spec, await response.arrayBuffer());
  });
  const request = Promise.race([download,deadline]).finally(()=>clearTimeout(timer)).catch(error => {
    cache.delete(spec.file); // A later selection can retry a failed request.
    throw error;
  });
  cache.set(spec.file, request);
  return request;
}

function candidateDirections(
  analysis: Analysis, first: number, finish: number, source: ObservationShard[],
): DirectionColumns {
  const candidate = manifest.candidate_ids.indexOf(analysis.candidate_id);
  if (candidate < 0) throw new Error('Candidate is missing from the observation cache.');
  const length = (finish - first) / step + 1;
  const directions: DirectionColumns = {sun_azimuth_deg: [], sun_elevation_deg: [], earth_azimuth_deg: [], earth_elevation_deg: []};
  if (first <= splice) {
    const begin = (first - origin) / step;
    const end = (splice - origin) / step + 1;
    for (const column of columns) directions[column] = analysis.series[column].slice(begin, end);
  }
  let next = first + directions.sun_azimuth_deg.length * step;
  for (const {spec, directions: bytes} of source) {
    const start = Date.parse(spec.start_utc);
    const end = Date.parse(spec.end_utc);
    const samples = (end - start) / step + 1;
    const until = Math.min(end, finish);
    if (next < start) throw new Error('A month is missing from the observation cache.');
    for (const [columnIndex, column] of columns.entries()) {
      const offset = (candidate * columns.length + columnIndex) * samples;
      for (let instant = next; instant <= until; instant += step) {
        const index = (instant - start) / step;
        directions[column].push(bytes.getFloat64((offset + index) * bytesPerAngle, true));
      }
    }
    next = Math.max(next, until + step);
  }
  if (directions.sun_azimuth_deg.length !== length) throw new Error('The observation window is incomplete.');
  return directions;
}

function interpolateHorizon(azimuth: number, profile: number[]): number {
  const index = (azimuth % 360) / (360 / profile.length);
  const left = Math.floor(index);
  const base = profile[left];
  return base + (index - left) * (profile[(left + 1) % profile.length] - base);
}

export function calculateObservationWindow(
  analyses: Analysis[], start: string, end: string, source: ObservationShard[],
): Analysis[] {
  const required = shardsForWindow(start, end);
  if (!required.length) {
    if (start === novemberWindow.start && end === novemberWindow.end) return analyses;
    return analyses.map(analysis => sliceAnalysis(analysis, start, end));
  }
  if (required.length !== source.length || !required.every((spec, index) => spec.file === source[index].spec.file)) {
    throw new Error('The observation window is incomplete.');
  }
  const first = Date.parse(start);
  const finish = Date.parse(end);
  const times = Array.from({length: (finish - first) / step + 1}, (_, index) => utc(first + index * step));
  const integrate = windowIntegrator(times);
  const byCandidate = new Map<string, DirectionColumns>();
  return analyses.map(analysis => {
    const reference = analysis.provenance?.site_id as keyof typeof manifest.sources;
    if (!Object.hasOwn(manifest.sources, reference)) throw new Error('Candidate reference site is missing.');
    let directions = byCandidate.get(analysis.candidate_id);
    if (!directions) {
      directions = candidateDirections(analysis, first, finish, source);
      byCandidate.set(analysis.candidate_id, directions);
    }
    const horizon = analysis.horizon.elevation_deg;
    const novemberCount = first <= splice ? (splice - first) / step + 1 : 0;
    const novemberOffset = (first - origin) / step;
    const sun_horizon_deg = directions.sun_azimuth_deg.map((azimuth, index) => index < novemberCount
      ? analysis.series.sun_horizon_deg[novemberOffset + index] : interpolateHorizon(azimuth, horizon));
    const earth_horizon_deg = directions.earth_azimuth_deg.map((azimuth, index) => index < novemberCount
      ? analysis.series.earth_horizon_deg[novemberOffset + index] : interpolateHorizon(azimuth, horizon));
    const sun_visible = directions.sun_elevation_deg.map((elevation, index) => elevation > sun_horizon_deg[index]);
    const earth_visible = directions.earth_elevation_deg.map((elevation, index) => elevation > earth_horizon_deg[index]);
    const both_visible = sun_visible.map((visible, index) => visible && earth_visible[index]);
    return {
      ...analysis,
      series: {timestamp_utc: times, ...directions, sun_horizon_deg, earth_horizon_deg, sun_visible, earth_visible, both_visible},
      metrics: {sun: integrate(sun_visible), earth: integrate(earth_visible), both: integrate(both_visible)},
      provenance: {
        ...analysis.provenance,
        ephemeris_sources: manifest.sources[reference],
        observation_cache: {
          step_minutes: manifest.step_minutes,
          snapshot_sha256: manifest.snapshot_sha256,
          direction_shards: required,
        },
      },
    };
  });
}
