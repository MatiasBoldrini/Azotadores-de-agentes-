// Mission advisor: proactive suggestions read from engine output only.
// Every number below comes from the precomputed analyses, their integrated
// intervals, the local links and violations(); nothing is estimated or extrapolated.
import {type Analysis,type Constraints,type Interval,type Link,type Metric,keyFor,optimize,percent,violations} from './science.ts';
import {hours,pct} from './story.ts';

export type InsightTone = 'risk'|'opportunity'|'alternative';
export type InsightAction =
 | {kind:'time';index:number;label:string}
 | {kind:'config';candidate:string;height:number;label:string};
export type Insight = {id:string;tone:InsightTone;title:string;detail:string;action?:InsightAction;
 /** Start of the interval an insight refers to, used to avoid repeating the same window. */
 ref?:string};

export type AdvisorInput = {
 selected:Analysis;
 /** Every evaluated configuration for the selected window and site. */
 all:Analysis[];
 links:Record<string,Link>;
 constraints:Constraints;
 /** Timeline cursor, as a sample index of `selected`. */
 index:number;
};

const HOUR = 3_600_000;
/** Outages at least this long are flagged as upcoming blackouts. */
export const BLACKOUT_HOURS = 24;
/** A passing constraint closer than this to its limit is reported as a thin margin. */
export const MARGIN_PCT_POINTS = 3;
export const MARGIN_OUTAGE_HOURS = 24;
/** A move to another cell is suggested only above this joint-visibility gain. */
export const MOVE_MIN_GAIN_HOURS = 12;

const stamp = new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export const utcLabel = (iso:string) => `${stamp.format(new Date(iso))} UTC`;
const BODY = {sun:'Sun',earth:'Earth'} as const;

function sampleIndex(a:Analysis,iso:string):number {
 const target = Date.parse(iso);
 return a.series.timestamp_utc.findIndex(t=>Date.parse(t)===target);
}
const span = (run:Interval) => ({start:Date.parse(run.start_utc),end:Date.parse(run.end_utc)});
function windowEdges(a:Analysis) {
 const t = a.series.timestamp_utc;
 return {start:Date.parse(t[0]),end:Date.parse(t[t.length-1])};
}
const clipped = (a:Analysis,run:Interval) => {
 const w = windowEdges(a), s = span(run);
 return s.start===w.start||s.end===w.end;
};
const atLeast = (a:Analysis,run:Interval) => `${clipped(a,run)?'≥ ':''}${hours(run.duration_hours)} h`;
function jump(a:Analysis,iso:string,label:string):InsightAction|undefined {
 const index = sampleIndex(a,iso);
 return index<0?undefined:{kind:'time',index,label};
}
const longest = (runs:Interval[]) => runs.reduce<Interval|null>((best,run)=>!best||run.duration_hours>best.duration_hours?run:best,null);

/** The Sun + Earth overlap in progress at the cursor, or the next one. */
export function jointWindow(a:Analysis,index:number):Insight {
 const now = Date.parse(a.series.timestamp_utc[Math.max(0,Math.min(index,a.series.timestamp_utc.length-1))]);
 const runs = a.metrics.both.intervals;
 const current = runs.find(r=>{const s=span(r);return s.start<=now&&now<s.end;});
 if(current){
  const left = (span(current).end-now)/HOUR;
  return {id:'joint-now',tone:'opportunity',ref:current.start_utc,
   title:`Sun and Earth are both in view now: ${hours(left)} h left`,
   detail:`This overlap runs ${utcLabel(current.start_utc)} to ${utcLabel(current.end_utc)} (${atLeast(a,current)}). Power and a direct Earth link are available at the same time.`};
 }
 const next = runs.find(r=>span(r).start>now);
 if(next) return {id:'joint-next',tone:'opportunity',ref:next.start_utc,
  title:`Next Sun + Earth window in ${hours((span(next).start-now)/HOUR)} h, lasting ${atLeast(a,next)}`,
  detail:`Starts ${utcLabel(next.start_utc)}. Schedule work that needs power and a direct Earth link inside it.`,
  action:jump(a,next.start_utc,'Go to window')};
 return {id:'joint-none',tone:'risk',
  title:'No further Sun + Earth overlap before this window ends',
  detail:`Nothing after the cursor up to ${utcLabel(a.series.timestamp_utc[a.series.timestamp_utc.length-1])}. Choose a later window or another configuration.`};
}

/** Longest continuous Sun + Earth overlap in the window. */
export function bestJointWindow(a:Analysis):Insight|null {
 const best = longest(a.metrics.both.intervals);
 if(!best) return null;
 return {id:'joint-best',tone:'opportunity',ref:best.start_utc,
  title:`Longest Sun + Earth window: ${atLeast(a,best)} from ${utcLabel(best.start_utc)}`,
  detail:`${hours(a.metrics.both.total_hours)} h of overlap in total across ${a.metrics.both.interval_count} window${a.metrics.both.interval_count===1?'':'s'}. This one is the safest slot for joint operations.`,
  action:jump(a,best.start_utc,'Go to window')};
}

/** Most imminent blackout of at least BLACKOUT_HOURS for either body, current or upcoming. */
export function upcomingBlackout(a:Analysis,index:number):Insight|null {
 const now = Date.parse(a.series.timestamp_utc[Math.max(0,Math.min(index,a.series.timestamp_utc.length-1))]);
 const candidates = (['sun','earth'] as const).flatMap(body=>(a.metrics[body] as Metric).outages
  .filter(r=>r.duration_hours>=BLACKOUT_HOURS&&span(r).end>now)
  .map(run=>({body,run,start:span(run).start,end:span(run).end})))
  .sort((x,y)=>Math.max(x.start,now)-Math.max(y.start,now)||y.run.duration_hours-x.run.duration_hours);
 const hit = candidates[0];
 if(!hit) return null;
 const name = BODY[hit.body], loss = hit.body==='sun'?'no solar power':'no direct Earth link';
 if(hit.start<=now) return {id:`blackout-${hit.body}`,tone:'risk',
  title:`${name} blocked now for another ${hours((hit.end-now)/HOUR)} h`,
  detail:`Outage ${utcLabel(hit.run.start_utc)} to ${utcLabel(hit.run.end_utc)} (${atLeast(a,hit.run)}): ${loss} at this mast height.`};
 return {id:`blackout-${hit.body}`,tone:'risk',
  title:`${name} goes dark in ${hours((hit.start-now)/HOUR)} h for ${atLeast(a,hit.run)}`,
  detail:`${utcLabel(hit.run.start_utc)} to ${utcLabel(hit.run.end_utc)}: ${loss}. Finish anything that depends on it before then.`,
  action:jump(a,hit.run.start_utc,'Go to outage')};
}

const RELAX:{name:string;label:string;relax:(c:Constraints)=>Constraints}[] = [
 {name:'Solar exposure',label:'minimum solar exposure',relax:c=>({...c,minSun:0})},
 {name:'Earth visibility',label:'minimum Earth visibility',relax:c=>({...c,minEarth:0})},
 {name:'Maximum outage',label:'maximum outage',relax:c=>({...c,maxOutage:Infinity})},
 {name:'Installation distance',label:'installation distance',relax:c=>({...c,maxDistance:Infinity})},
 {name:'Terrain slope',label:'terrain slope',relax:c=>({...c,maxSlope:Infinity})},
 {name:'Local line of sight',label:'lander line of sight',relax:c=>({...c,requireLink:false})},
];
const feasibleCount = (all:Analysis[],links:Record<string,Link>,c:Constraints) => all.filter(a=>violations(a,links[keyFor(a)],c).length===0).length;

/** Which single requirement blocks the most configurations when nothing is feasible. */
export function bindingConstraint(all:Analysis[],links:Record<string,Link>,c:Constraints) {
 return RELAX.map(r=>({...r,feasible:feasibleCount(all,links,r.relax(c))}))
  .filter(r=>r.feasible>0)
  .sort((x,y)=>y.feasible-x.feasible)[0]??null;
}

function where(link:Link|undefined) {
 if(!link) return 'at an evaluated cell';
 return link.distance_m<1?'at the lander':`${hours(Math.round(link.distance_m))} m from the lander`;
}

/** Smallest change that fixes a failing configuration, or the binding requirement when none exists. */
export function cheapestFix({selected,all,links,constraints}:AdvisorInput):Insight|null {
 const failed = violations(selected,links[keyFor(selected)],constraints);
 if(!failed.length) return null;
 const sameCell = all.filter(a=>a.candidate_id===selected.candidate_id).sort((a,b)=>a.height_m-b.height_m)
  .find(a=>violations(a,links[keyFor(a)],constraints).length===0);
 if(sameCell) return {id:'fix-height',tone:'alternative',
  title:`Raise the mast to ${sameCell.height_m} m to meet every constraint here`,
  detail:`Lowest tested height at this cell that passes. Sun ${hours(selected.metrics.sun.total_hours)} → ${hours(sameCell.metrics.sun.total_hours)} h, Earth ${hours(selected.metrics.earth.total_hours)} → ${hours(sameCell.metrics.earth.total_hours)} h.`,
  action:{kind:'config',candidate:sameCell.candidate_id,height:sameCell.height_m,label:`Use ${sameCell.height_m} m`}};
 const result = optimize(all,links,constraints);
 if(result.recommended){
  const r = result.recommended;
  return {id:'fix-move',tone:'alternative',
   title:`No height fixes this cell. Best option: ${r.height_m} m ${where(links[keyFor(r)])}`,
   detail:`Lowest-cost of ${result.feasible} feasible configurations out of ${result.evaluated}. Sun ${hours(r.metrics.sun.total_hours)} h, Earth ${hours(r.metrics.earth.total_hours)} h.`,
   action:{kind:'config',candidate:r.candidate_id,height:r.height_m,label:'Move station'}};
 }
 const binding = bindingConstraint(all,links,constraints);
 return {id:'fix-none',tone:'risk',
  title:`None of the ${all.length} evaluated configurations meets every constraint in this window`,
  detail:binding
   ? `The binding requirement is the ${binding.label}: relaxing it alone would allow ${binding.feasible} configuration${binding.feasible===1?'':'s'}. No result has been substituted.`
   : 'Relaxing any single requirement is not enough. Try another window. No result has been substituted.'};
}

/** For a passing configuration: a lower mast that also passes, and margins close to a limit. */
export function overbuildAndMargins({selected,all,links,constraints}:AdvisorInput):Insight[] {
 const out:Insight[] = [];
 if(violations(selected,links[keyFor(selected)],constraints).length) return out;
 const lower = all.filter(a=>a.candidate_id===selected.candidate_id&&a.height_m<selected.height_m).sort((a,b)=>a.height_m-b.height_m)
  .find(a=>violations(a,links[keyFor(a)],constraints).length===0);
 if(lower){
  const dS = selected.metrics.sun.total_hours-lower.metrics.sun.total_hours, dE = selected.metrics.earth.total_hours-lower.metrics.earth.total_hours;
  out.push({id:'overbuild',tone:'alternative',
   title:`${lower.height_m} m already meets every constraint here`,
   detail:dS===0&&dE===0
    ? `The extra ${hours(selected.height_m-lower.height_m)} m of mast adds no Sun or Earth hours at this cell.`
    : `The extra ${hours(selected.height_m-lower.height_m)} m adds ${[dS?`Sun +${hours(dS)} h`:'',dE?`Earth +${hours(dE)} h`:''].filter(Boolean).join(' and ')}. Decide whether that margin is worth the taller mast.`,
   action:{kind:'config',candidate:lower.candidate_id,height:lower.height_m,label:`Use ${lower.height_m} m`}});
 }
 const thin:string[] = [];
 const sunMargin = percent(selected.metrics.sun)-constraints.minSun, earthMargin = percent(selected.metrics.earth)-constraints.minEarth;
 const outage = Math.max(selected.metrics.sun.longest_outage_hours,selected.metrics.earth.longest_outage_hours);
 if(sunMargin<MARGIN_PCT_POINTS) thin.push(`Sun ${pct(percent(selected.metrics.sun))}% vs ${constraints.minSun}% minimum`);
 if(earthMargin<MARGIN_PCT_POINTS) thin.push(`Earth ${pct(percent(selected.metrics.earth))}% vs ${constraints.minEarth}% minimum`);
 if(constraints.maxOutage-outage<MARGIN_OUTAGE_HOURS) thin.push(`longest outage ${hours(outage)} h vs ${hours(constraints.maxOutage)} h limit`);
 if(thin.length) out.push({id:'margin',tone:'risk',
  title:'Passes, but with a thin margin',
  detail:`${thin.join('; ').replace(/^./,c=>c.toUpperCase())}. DEM uncertainty or a date shift could flip this result.`});
 return out;
}

/** Another cell at the same height that adds clearly more Sun + Earth overlap and still meets distance, slope and line of sight. */
export function betterPosition({selected,all,links,constraints}:AdvisorInput):Insight|null {
 const base = selected.metrics.both.total_hours;
 const best = all
  .filter(a=>a.height_m===selected.height_m&&a.candidate_id!==selected.candidate_id)
  .filter(a=>{const l=links[keyFor(a)];return l&&l.distance_m<=constraints.maxDistance&&(!constraints.requireLink||l.visible)&&a.position.slope_deg!==null&&a.position.slope_deg<=constraints.maxSlope;})
  .sort((a,b)=>b.metrics.both.total_hours-a.metrics.both.total_hours)[0];
 if(!best) return null;
 const link = links[keyFor(best)];
 const gain = best.metrics.both.total_hours-base;
 if(gain<Math.max(MOVE_MIN_GAIN_HOURS,base*0.1)) return null;
 return {id:'move',tone:'alternative',
  title:`Moving ${where(link)} adds +${hours(gain)} h of Sun + Earth together`,
  detail:`Same ${best.height_m} m mast: overlap ${hours(base)} → ${hours(best.metrics.both.total_hours)} h, longest gap with either blocked ${hours(selected.metrics.both.longest_outage_hours)} → ${hours(best.metrics.both.longest_outage_hours)} h. Slope ${pct(best.position.slope_deg!)}°, lander line of sight ${link.visible?'clear':'blocked'}.`,
  action:{kind:'config',candidate:best.candidate_id,height:best.height_m,label:'Move station'}};
}

const ORDER:Record<InsightTone,number> = {risk:0,opportunity:1,alternative:2};

/** Ranked, de-duplicated suggestions for the current configuration and cursor time. */
export function advise(input:AdvisorInput,limit=5):Insight[] {
 const {selected,index} = input;
 const joint = jointWindow(selected,index), best = bestJointWindow(selected);
 const items = [
  upcomingBlackout(selected,index),
  cheapestFix(input),
  ...overbuildAndMargins(input),
  joint,
  best&&best.ref!==joint.ref?best:null,
  betterPosition(input),
 ].filter((x):x is Insight=>!!x);
 return items.map((x,i)=>({x,i})).sort((p,q)=>ORDER[p.x.tone]-ORDER[q.x.tone]||p.i-q.i).map(p=>p.x).slice(0,limit);
}
