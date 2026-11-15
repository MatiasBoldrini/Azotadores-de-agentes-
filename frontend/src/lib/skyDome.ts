import type {Analysis} from './science';
import {classify,horizonAt,type Body} from './panorama.ts';

/** Sky-dome geometry for the 3D scene. Pure functions, no rendering: every state comes from the cached engine data. */
export type SkyState = 'visible' | 'gained' | 'blocked';
export type SkyStep = {state: SkyState; from: [number, number]; to: [number, number]};
export type SkyPaths = Record<SkyState, [number, number][]>;

const RAD = Math.PI / 180;

/** Local east, north, up unit vector for an azimuth (from north, clockwise) and elevation, in degrees. */
export function enu(azimuthDeg: number, elevationDeg: number): [number, number, number] {
 const a = azimuthDeg * RAD, e = elevationDeg * RAD;
 return [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)];
}

/**
 * Each 30-minute step of a body's track, in the state of its first sample (the engine's integration rule).
 * With a lower `reference` height, a step that is visible now but blocked at the reference is "gained".
 * Steps that cross the 0/360 azimuth seam are skipped so no line jumps across the sky.
 */
export function skySteps(analysis: Analysis, body: Body, reference?: Analysis): SkyStep[] {
 const s = analysis.series, az = s[`${body}_azimuth_deg`], el = s[`${body}_elevation_deg`];
 const now = classify(analysis, body), before = reference ? classify(reference, body) : null;
 const steps: SkyStep[] = [];
 for (let i = 0; i < az.length - 1; i++) {
  if (Math.abs(az[i + 1] - az[i]) > 180) continue;
  const state: SkyState = !now[i] ? 'blocked' : before && !before[i] ? 'gained' : 'visible';
  steps.push({state, from: [az[i], el[i]], to: [az[i + 1], el[i + 1]]});
 }
 return steps;
}

/** Steps grouped by state as flat point pairs, ready for one line-segments draw call per state. */
export function skyPaths(steps: SkyStep[]): SkyPaths {
 const paths: SkyPaths = {visible: [], gained: [], blocked: []};
 for (const step of steps) paths[step.state].push(step.from, step.to);
 return paths;
}

/** Closed ring of [azimuth, elevation] along a 360-bin horizon profile, `perBin` points per 1° bin. */
export function horizonRing(profile: number[], perBin = 1): [number, number][] {
 const n = profile.length * perBin, ring: [number, number][] = [];
 for (let k = 0; k <= n; k++) {
  const az = (k % n) * 360 / n;
  ring.push([az, horizonAt(profile, az)]);
 }
 return ring;
}

/** Per-bin sky cleared by raising the observer: [azimuth, upper (lower mast), lower (higher mast)], only where it drops. */
export function skyGained(lower: number[], higher: number[], minDropDeg = 1e-6): [number, number, number][] {
 return lower.flatMap((top, i) => top - higher[i] > minDropDeg ? [[i * 360 / lower.length, top, higher[i]] as [number, number, number]] : []);
}

/** Hours of a body's track gained over the reference, by the engine's sample-owns-the-step rule. */
export function gainedHours(analysis: Analysis, body: Body, reference: Analysis): number {
 const t = analysis.series.timestamp_utc.map(x => Date.parse(x));
 const now = classify(analysis, body), before = classify(reference, body);
 let hours = 0;
 for (let i = 0; i < t.length - 1; i++) if (now[i] && !before[i]) hours += (t[i + 1] - t[i]) / 3600000;
 return hours;
}

/** The "Raise mast" sequence: every tested height from the lowest, in order. Real profiles only, no interpolation. */
export function raiseSequence(heights: number[]): number[] {
 return [...new Set(heights)].sort((a, b) => a - b);
}
