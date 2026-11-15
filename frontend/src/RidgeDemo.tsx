import type { Analysis } from './lib/science';
import { peakHeight } from './lib/story';

export type DemoStep = { height: number | null; label: string; ms: number };

// 5 + 6 + 5 + 9 s ≈ a 25-second recording. Heights come from the cached sweep at the lander cell.
export function demoSteps(sweep: Analysis[]): DemoStep[] {
 const peak = peakHeight(sweep);
 const above = sweep.find(point => peak !== null && point.height_m > peak);
 return [
  { height: sweep[0]?.height_m ?? 0, label: 'Ground level · find the limitation', ms: 5000 },
  ...(peak !== null ? [{ height: peak, label: `Raise the mast to ${peak} m`, ms: 6000 }] : []),
  ...(above ? [{ height: above.height_m, label: `Check ${above.height_m} m · diminishing return`, ms: 5000 }] : []),
  { height: null, label: 'Optimize and explain', ms: 9000 },
 ];
}
