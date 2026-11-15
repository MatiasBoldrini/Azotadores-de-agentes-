import type {Analysis, Constraints, Link} from './science.ts';
import {optimize} from './science.ts';
import {backendOptimize, backendWindow} from './backendScience.ts';
import {calculateObservationWindow, loadObservationShard, shardsForWindow} from './observationEphemeris.ts';

export type ScienceSource = 'backend' | 'cache';
export type HybridOptions = {signal?: AbortSignal; baseUrl?: string; timeoutMs?: number};
const message = (error: unknown) => error instanceof Error ? error.message : 'Backend request failed';
function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
}

export async function loadHybridWindow(initial: Analysis[], start: string, end: string, options: HybridOptions = {}) {
  if (!initial.length) throw new Error('No verified scientific dataset is loaded.');
  // Reject unsupported requests before trying either engine: fallback cannot invent coverage.
  const required = shardsForWindow(start, end);
  checkAbort(options.signal);
  try {
    const analyses = await backendWindow(initial, start, end, options.signal, options.baseUrl, options.timeoutMs);
    checkAbort(options.signal);
    return {analyses, source: 'backend' as ScienceSource, reason: null};
  } catch (error) {
    checkAbort(options.signal);
    let stop: () => void = () => {};
    const cancellation = new Promise<never>((_,reject)=>{
      stop=()=>reject(new DOMException('Request cancelled','AbortError'));
      options.signal?.addEventListener('abort',stop,{once:true});
    });
    let shards;
    try {
      shards = await Promise.race([Promise.all(required.map(spec=>loadObservationShard(spec,options.timeoutMs??15_000))),cancellation]);
    } finally {options.signal?.removeEventListener('abort',stop);}
    checkAbort(options.signal);
    const analyses = calculateObservationWindow(initial, start, end, shards);
    return {analyses, source: 'cache' as ScienceSource, reason: message(error)};
  }
}

export async function optimizeHybrid(analyses: Analysis[], links: Record<string, Link>, constraints: Constraints, siteId: string, options: HybridOptions = {}) {
  if (!analyses.length) throw new Error('No scientific analyses are available.');
  const bounded: [number, number][] = [[constraints.minSun,100],[constraints.minEarth,100],[constraints.maxOutage,8760],[constraints.maxDistance,5000],[constraints.maxSlope,90]];
  if (bounded.some(([value,max])=>!Number.isFinite(value)||value<0||value>max)||typeof constraints.requireLink!=='boolean'||!['ridge-a','ridge-b'].includes(siteId)) {
    throw new Error('Invalid scientific search constraints or landing site.');
  }
  const times = analyses[0].series.timestamp_utc;
  shardsForWindow(times[0], times.at(-1)!);
  checkAbort(options.signal);
  try {
    const result = await backendOptimize(analyses, links, constraints, siteId, options.signal, options.baseUrl, options.timeoutMs);
    checkAbort(options.signal);
    return {result, source: 'backend' as ScienceSource, reason: null};
  } catch (error) {
    checkAbort(options.signal);
    return {result: optimize(analyses, links, constraints), source: 'cache' as ScienceSource, reason: message(error)};
  }
}
