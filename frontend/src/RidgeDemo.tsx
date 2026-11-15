import type { Analysis } from './lib/science';

export const DEMO_STEPS = [
 { height: 0, label: 'Ground level' },
 { height: 10, label: 'Raise the mast to 10 m' },
 { height: 20, label: 'Check the plateau at 20 m' },
 { height: null, label: 'Find the lowest-cost feasible station' },
] as const;

const hours = (total: number) => total.toLocaleString('en-US', { maximumFractionDigits: 1 });

export function RidgeFinding({ sweep, onHeight }: { sweep: Analysis[]; onHeight: (height: number) => void }) {
 const baseline = sweep.find(point => point.height_m === 0);
 const feasible = sweep.find(point => point.height_m === 5);
 const plateau = sweep.find(point => point.height_m === 10);
 const highest = sweep.find(point => point.height_m === 20);
 if (!baseline || !feasible || !plateau || !highest) return null;

 return (
  <section className="ridge-finding" aria-label="Connecting Ridge November experiment">
   <div>
    <h1>Earth visibility reaches {hours(plateau.metrics.earth.total_hours)} hours at 10 m.</h1>
    <p>In November 2026 (UTC), ground level at the same Ridge A terrain cell gives {hours(baseline.metrics.earth.total_hours)} hours. The longest gap with no simultaneous visibility drops from {hours(baseline.metrics.both.longest_outage_hours)} to {hours(plateau.metrics.both.longest_outage_hours)} hours.</p>
   </div>
   <div className="ridge-options">
    <button onClick={() => onHeight(5)}><strong>5 m · lowest-cost feasible</strong><span>{hours(feasible.metrics.earth.total_hours)} h Earth visibility with the default search constraints and 360 h outage limit.</span></button>
    <button onClick={() => onHeight(10)}><strong>10 m · first height at the plateau</strong><span>{hours(plateau.metrics.earth.total_hours)} h Earth visibility at this cell among the tested heights.</span></button>
    <button onClick={() => onHeight(20)}><strong>20 m · same Earth visibility</strong><span>{hours(highest.metrics.earth.total_hours)} h Earth visibility at this cell.</span></button>
   </div>
  </section>
 );
}
