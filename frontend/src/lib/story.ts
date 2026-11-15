// Presentation helpers. Everything here reads engine output (analyses, links,
// violations, optimize); nothing computes or alters a scientific quantity.
import {type Analysis,type Constraints,type Link,keyFor,optimize,percent,violations} from './science.ts';

export type Search = ReturnType<typeof optimize>;
export type Tone = 'limit'|'gain'|'plateau'|'optimal'|'infeasible'|'neutral'|'loss';
export type Segment = {t:string;c?:'sun'|'earth'|'good'|'bad'|'strong'};
export type StoryAction = {kind:'height';height:number;label:string}|{kind:'optimize';label:string}|{kind:'baseline';label:string};
export type Story = {step:1|2|3|4|5;tone:Tone;kicker:string;title:Segment[];detail:Segment[];actions:StoryAction[]};
export type ConstraintRow = {name:string;label:string;value:string;limit:string;pass:boolean;required:boolean};

export const STORY_STEPS = ['Real site','Limitation','Engineer','Optimize','Explain'] as const;

export const hours = (v:number) => v.toLocaleString('en-US',{maximumFractionDigits:1});
export const pct = (v:number) => v.toLocaleString('en-US',{maximumFractionDigits:1,minimumFractionDigits:1});
export const signed = (v:number) => `${v>0?'+':v<0?'−':'±'}${hours(Math.abs(v))}`;
const list = (items:string[]) => items.join(', ');

export function constraintRows(a:Analysis,link:Link|undefined,c:Constraints):ConstraintRow[] {
 const failed = violations(a,link,c);
 const outage = Math.max(a.metrics.sun.longest_outage_hours,a.metrics.earth.longest_outage_hours);
 const row = (name:string,label:string,value:string,limit:string,required=true):ConstraintRow =>
  ({name,label,value,limit,required,pass:!failed.includes(name)});
 return [
  row('Solar exposure','Solar exposure',`${pct(percent(a.metrics.sun))}%`,`≥ ${c.minSun}%`),
  row('Earth visibility','Earth visibility',`${pct(percent(a.metrics.earth))}%`,`≥ ${c.minEarth}%`),
  row('Maximum outage','Longest individual outage',`${hours(outage)} h`,`≤ ${c.maxOutage} h`),
  row('Installation distance','Distance to lander',link?`${hours(Math.round(link.distance_m))} m`:'—',`≤ ${c.maxDistance} m`),
  row('Terrain slope','Terrain slope',a.position.slope_deg===null?'—':`${pct(a.position.slope_deg)}°`,`≤ ${c.maxSlope}°`),
  row('Local line of sight','Lander line of sight',link?.visible?'Clear':'Obstructed',c.requireLink?'Required':'Not required',c.requireLink),
 ];
}

export function heightSweep(all:Analysis[],candidateId:string) {
 return all.filter(a=>a.candidate_id===candidateId).sort((a,b)=>a.height_m-b.height_m);
}

/** Lowest tested height at which neither Sun nor Earth visibility improves any further at this cell. */
export function peakHeight(sweep:Analysis[]):number|null {
 if(!sweep.length) return null;
 const sun = Math.max(...sweep.map(a=>a.metrics.sun.total_hours)), earth = Math.max(...sweep.map(a=>a.metrics.earth.total_hours));
 const peak = sweep.find(a=>a.metrics.sun.total_hours===sun&&a.metrics.earth.total_hours===earth);
 return peak && peak.height_m>sweep[0].height_m ? peak.height_m : null;
}

/** Middle sample of the longest run where `base` sees neither body and `target` sees both (Earth-only runs as fallback). */
export function contrastIndex(base:Analysis,target:Analysis):number {
 const b=base.series,t=target.series;
 const tests=[
  (i:number)=>!b.sun_visible[i]&&!b.earth_visible[i]&&t.sun_visible[i]&&t.earth_visible[i],
  (i:number)=>!b.earth_visible[i]&&t.earth_visible[i],
  (i:number)=>!b.sun_visible[i]&&t.sun_visible[i],
 ];
 for(const test of tests){
  let best=[0,-1],start=-1;
  for(let i=0;i<=b.timestamp_utc.length;i++){
   const hit=i<b.timestamp_utc.length&&test(i);
   if(hit&&start<0) start=i;
   if(!hit&&start>=0){if(i-1-start>best[1]-best[0]) best=[start,i-1];start=-1;}
  }
  if(best[1]>=best[0]) return Math.floor((best[0]+best[1])/2);
 }
 return 0;
}

function where(link:Link|undefined) {
 if(!link) return 'at an evaluated cell';
 return link.distance_m<1?'at the lander':`${hours(Math.round(link.distance_m))} m from the lander`;
}

type StoryInput = {selected:Analysis;baseline:Analysis;sweep:Analysis[];links:Record<string,Link>;constraints:Constraints;search:Search|null;searching:boolean;evaluated:number};

export function buildStory({selected,baseline,sweep,links,constraints,search,searching,evaluated}:StoryInput):Story {
 const link = links[keyFor(selected)];
 const failed = violations(selected,link,constraints), checks = constraintRows(selected,link,constraints).filter(r=>r.required).length;
 const m = selected.metrics, b = baseline.metrics, window = m.sun.duration_hours;
 const optimizeAction:StoryAction = {kind:'optimize',label:'Find optimal configuration'};
 if(searching) return {step:4,tone:'neutral',kicker:'Optimizer running',title:[{t:`Evaluating ${evaluated} precomputed configurations against your constraints…`}],detail:[],actions:[]};
 if(search&&!search.recommended) return {step:4,tone:'infeasible',kicker:`Optimizer · ${search.evaluated} evaluated · 0 feasible`,
  title:[{t:'No feasible configuration found within the evaluated search space.'}],
  detail:[{t:`Relax a requirement, for example the ${constraints.maxOutage} h outage limit, and search again. No result has been substituted.`}],actions:[]};
 if(search?.recommended){
  const rank = search.alternatives.findIndex(a=>keyFor(a)===keyFor(selected));
  if(rank===0) return {step:5,tone:'optimal',kicker:`Optimizer · ${search.feasible} of ${search.evaluated} configurations feasible`,
   title:[{t:'Recommended: a '},{t:`${selected.height_m} m mast`,c:'strong'},{t:` ${where(link)} — the lowest-cost option that meets all ${checks} constraints.`}],
   detail:[{t:'Earth '},{t:`${hours(b.earth.total_hours)} → ${hours(m.earth.total_hours)} h`,c:'earth'},{t:' · Sun '},{t:`${hours(b.sun.total_hours)} → ${hours(m.sun.total_hours)} h`,c:'sun'},{t:` · longest gap with Sun or Earth blocked ${hours(b.both.longest_outage_hours)} → ${hours(m.both.longest_outage_hours)} h, versus ground level.`}],
   actions:[]};
  if(rank>0) return {step:5,tone:'optimal',kicker:`Optimizer · alternative ${rank} of ${search.feasible - 1}`,
   title:[{t:`Ranked #${rank+1}: a ${selected.height_m} m mast ${where(link)}.`}],
   detail:[{t:`Cost ${search.cost(selected).toFixed(3)} versus ${search.cost(search.alternatives[0]).toFixed(3)} for the recommended ${search.alternatives[0].height_m} m option. Feasible, but it asks for more infrastructure.`}],
   actions:[]};
 }
 const sameCell = selected.candidate_id===baseline.candidate_id;
 const peak = peakHeight(sweep);
 if(sameCell&&selected.height_m===baseline.height_m){
  if(!failed.length) return {step:1,tone:'neutral',kicker:'Ground level',title:[{t:'Ground level already meets every selected constraint.'}],
   detail:[{t:`Sun ${hours(m.sun.total_hours)} h · Earth ${hours(m.earth.total_hours)} h of a ${hours(window)} h window.`}],actions:[optimizeAction]};
  const title:Segment[] = failed.includes('Earth visibility')
   ? [{t:'At ground level, Earth is in view only '},{t:`${hours(m.earth.total_hours)} h`,c:'earth'},{t:` of ${hours(window)} h (${pct(percent(m.earth))}%).`}]
   : failed.includes('Solar exposure')
   ? [{t:'At ground level, the Sun clears the horizon only '},{t:`${hours(m.sun.total_hours)} h`,c:'sun'},{t:` of ${hours(window)} h (${pct(percent(m.sun))}%).`}]
   : [{t:`Ground level fails ${failed.length} of ${checks} constraints.`}];
  return {step:2,tone:'limit',kicker:'Limitation found · ground level',title,
   detail:[{t:`Fails ${failed.length} of ${checks} constraints: `},{t:list(failed),c:'bad'},{t:`. Longest gap with Sun or Earth blocked: ${hours(m.both.longest_outage_hours)} h.`}],
   actions:peak?[{kind:'height',height:peak,label:`Raise the mast to ${peak} m`}]:[optimizeAction]};
 }
 const status:Segment = failed.length?{t:`still fails ${list(failed)}`,c:'bad'}:{t:'meets every selected constraint',c:'good'};
 if(sameCell){
  const lower = [...sweep].reverse().find(a=>a.height_m<selected.height_m);
  const plateau = lower&&lower.metrics.sun.total_hours===m.sun.total_hours&&lower.metrics.earth.total_hours===m.earth.total_hours&&lower.metrics.both.longest_outage_hours===m.both.longest_outage_hours;
  if(lower&&plateau) return {step:3,tone:'plateau',kicker:`No further gain at ${selected.height_m} m`,
   title:[{t:`${selected.height_m} m adds nothing over ${lower.height_m} m: Earth visibility stays at `},{t:`${hours(m.earth.total_hours)} h`,c:'earth'},{t:'.'}],
   detail:[{t:`Sun ${hours(m.sun.total_hours)} h and longest gap with Sun or Earth blocked ${hours(m.both.longest_outage_hours)} h are unchanged. A taller mast buys no extra line of sight at this cell.`}],
   actions:[optimizeAction]};
  const dE = m.earth.total_hours-b.earth.total_hours, dS = m.sun.total_hours-b.sun.total_hours;
  const title:Segment[] = dE!==0
   ? [{t:`A ${selected.height_m} m mast ${dE>0?'raises':'changes'} Earth visibility from ${hours(b.earth.total_hours)} to `},{t:`${hours(m.earth.total_hours)} h`,c:'earth'},{t:` (${signed(dE)} h).`}]
   : [{t:`A ${selected.height_m} m mast ${dS>0?'raises':'changes'} solar exposure from ${hours(b.sun.total_hours)} to `},{t:`${hours(m.sun.total_hours)} h`,c:'sun'},{t:` (${signed(dS)} h).`}];
  const next = sweep.find(a=>a.height_m>selected.height_m);
  const actions:StoryAction[] = peak!==null&&selected.height_m<peak ? [{kind:'height',height:peak,label:`Raise the mast to ${peak} m`},optimizeAction]
   : next ? [optimizeAction,{kind:'height',height:next.height_m,label:`Check ${next.height_m} m`}] : [optimizeAction];
  return {step:3,tone:dE<0||dS<0?'loss':'gain',kicker:`Engine recalculated · ${selected.height_m} m mast`,title,
   detail:[{t:`Sun ${hours(b.sun.total_hours)} → ${hours(m.sun.total_hours)} h · longest gap with Sun or Earth blocked ${hours(b.both.longest_outage_hours)} → ${hours(m.both.longest_outage_hours)} h · `},status,{t:'.'}],actions};
 }
 const dE = m.earth.total_hours-b.earth.total_hours;
 return {step:3,tone:dE<0?'loss':dE>0?'gain':'neutral',kicker:`Station moved ${where(link)} · ${selected.height_m} m`,
  title:[{t:`Here, Earth visibility is `},{t:`${hours(m.earth.total_hours)} h`,c:'earth'},{t:` (${signed(dE)} h versus ground level at the lander).`}],
  detail:[{t:`Sun ${hours(m.sun.total_hours)} h · lander line of sight `},link?.visible?{t:'clear',c:'good'}:{t:'obstructed by terrain',c:'bad'},{t:' · '},status,{t:'.'}],
  actions:[optimizeAction,{kind:'baseline',label:'Back to ground level'}]};
}

/** Structured reasons behind the recommendation, built from optimizer output and constraint checks. */
export function explainRecommendation(search:Search,all:Analysis[],links:Record<string,Link>,constraints:Constraints,baseline:Analysis):Segment[][] {
 const r = search.recommended;
 if(!r) return [];
 const lines:Segment[][] = [[{t:'Lowest dimensionless cost among '},{t:`${search.feasible} feasible`,c:'strong'},{t:` of ${search.evaluated} configurations: height/20 + distance/1000 + slope/90 = ${search.cost(r).toFixed(3)}.`}]];
 const lower = heightSweep(all,r.candidate_id).filter(a=>a.height_m<r.height_m).reverse()[0];
 if(lower){
  const failed = violations(lower,links[keyFor(lower)],constraints);
  if(failed.length) lines.push([{t:`A shorter ${lower.height_m} m mast at this cell fails `},{t:list(failed),c:'bad'},{t:'.'}]);
 }
 lines.push([{t:'Versus ground level at the lander: Sun '},{t:`${signed(r.metrics.sun.total_hours-baseline.metrics.sun.total_hours)} h`,c:'sun'},{t:' · Earth '},{t:`${signed(r.metrics.earth.total_hours-baseline.metrics.earth.total_hours)} h`,c:'earth'},{t:` · longest gap with Sun or Earth blocked ${hours(baseline.metrics.both.longest_outage_hours)} → ${hours(r.metrics.both.longest_outage_hours)} h.`}]);
 return lines;
}
