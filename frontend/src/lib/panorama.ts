import type {Analysis, Series} from './science';

export type Body = 'sun' | 'earth';
export type TrackSegment = {visible: boolean; points: [number, number][]};

/** Periodic linear interpolation of a horizon profile; mirrors engine.angular_interpolate (np.interp, period=360). */
export function horizonAt(profile: number[], azimuthDeg: number): number {
 const n = profile.length, step = 360 / n;
 const az = ((azimuthDeg % 360) + 360) % 360;
 const i = Math.floor(az / step), f = az / step - i;
 return profile[i % n] * (1 - f) + profile[(i + 1) % n] * f;
}

/** Geometric line of sight of a body's center: visible when its elevation exceeds the terrain horizon at its azimuth. */
export function classify(analysis: Analysis, body: Body): boolean[] {
 const s = analysis.series, profile = analysis.horizon.elevation_deg;
 const az = s[`${body}_azimuth_deg`], el = s[`${body}_elevation_deg`];
 return az.map((a, i) => el[i] > horizonAt(profile, a));
}

/**
 * Splits a body's sky track into drawable runs. Each sample owns the step to the next sample, like the
 * time integration, so a run's color is the state at its first sample. Runs also break at the 360/0 seam.
 */
export function trackSegments(series: Series, body: Body, visible: boolean[]): TrackSegment[] {
 const az = series[`${body}_azimuth_deg`], el = series[`${body}_elevation_deg`];
 const segments: TrackSegment[] = [];
 let current: TrackSegment | null = null;
 for (let i = 0; i < az.length - 1; i++) {
  const wraps = Math.abs(az[i + 1] - az[i]) > 180;
  if (!current || current.visible !== visible[i]) {
   current = {visible: visible[i], points: [[az[i], el[i]]]};
   segments.push(current);
  }
  if (wraps) {
   current = null;
   continue;
  }
  current.points.push([az[i + 1], el[i + 1]]);
 }
 return segments;
}

/** One elevation range for every height, so the horizon visibly drops as the mast rises. */
export function panoramaRange(sweep: Analysis[], pad = 0.5): [number, number] {
 let lo = Infinity, hi = -Infinity;
 const take = (values: number[]) => {for (const v of values) {if (v < lo) lo = v; if (v > hi) hi = v;}};
 for (const a of sweep) take(a.horizon.elevation_deg);
 if (sweep[0]) {take(sweep[0].series.sun_elevation_deg); take(sweep[0].series.earth_elevation_deg);}
 return [Math.floor(lo - pad), Math.ceil(hi + pad)];
}
