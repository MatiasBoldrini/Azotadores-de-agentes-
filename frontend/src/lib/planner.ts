// Operation planner: finds when a sequence of visibility needs fits the
// precomputed timeline. It only reads integrated intervals; nothing is interpolated
// beyond the 30-minute samples the engine produced.
import {type Analysis,type Interval,type Link,type Constraints,keyFor,violations} from './science.ts';
import {hours} from './story.ts';
import {utcLabel,type Insight} from './advisor.ts';

export type Need = 'sun'|'earth'|'both';
export type Step = {need:Need;hours:number;label:string};
export type Operation = {id:string;name:string;steps:Step[]};
export type Slot = {step:Step;start:number;end:number};
export type Plan = {slots:Slot[];start:number;finish:number};

const HOUR = 3_600_000;
export const NEED_LABEL:Record<Need,string> = {sun:'Sun',earth:'Earth',both:'Sun + Earth'};

export const PRESETS:Operation[] = [
 {id:'experiment',name:'Experiment, then downlink',steps:[{need:'sun',hours:2,label:'Run experiment on solar power'},{need:'earth',hours:0.5,label:'Transmit results to Earth'}]},
 {id:'downlink',name:'Long joint session',steps:[{need:'both',hours:12,label:'Operate with power and a live Earth link'}]},
 {id:'charge-relay',name:'Charge, then relay',steps:[{need:'sun',hours:24,label:'Charge batteries'},{need:'both',hours:6,label:'Relay data while powered'}]},
];

const runsOf = (a:Analysis,need:Need) => a.metrics[need].intervals.map((r:Interval)=>({start:Date.parse(r.start_utc),end:Date.parse(r.end_utc)}));

/** Earliest time ≥ from with `need` continuously visible for `h` hours. */
function earliest(a:Analysis,need:Need,h:number,from:number):number|null {
 for(const r of runsOf(a,need)){
  const s = Math.max(r.start,from);
  if(r.end-s>=h*HOUR) return s;
 }
 return null;
}

/** Greedy earliest completion: each step starts as soon as the previous one ends and its need allows. */
export function planOperation(a:Analysis,op:Operation,from:number):Plan|null {
 const slots:Slot[] = [];
 let t = from;
 for(const step of op.steps){
  const s = earliest(a,step.need,step.hours,t);
  if(s===null) return null;
  slots.push({step,start:s,end:s+step.hours*HOUR});
  t = s+step.hours*HOUR;
 }
 return {slots,start:slots[0].start,finish:t};
}

const stepMs = (a:Analysis) => Date.parse(a.series.timestamp_utc[1])-Date.parse(a.series.timestamp_utc[0]);

/** Hours the first step can start late without adding any wait: the first step still begins
 * on time and the finish moves by no more than the delay (internal waits absorb it). */
export function slackHours(a:Analysis,op:Operation,plan:Plan):number {
 const step = stepMs(a);
 let latest = plan.start;
 for(let t=plan.start+step;;t+=step){
  const p = planOperation(a,op,t);
  if(!p||p.start!==t||p.finish>plan.finish+(t-plan.start)) break;
  latest = t;
 }
 return (latest-plan.start)/HOUR;
}

/** The next opportunity once the slack of the first one has run out. */
export function fallbackPlan(a:Analysis,op:Operation,plan:Plan):Plan|null {
 return planOperation(a,op,plan.start+slackHours(a,op,plan)*HOUR+stepMs(a));
}

export type PlannerInput = {selected:Analysis;all:Analysis[];links:Record<string,Link>;constraints:Constraints;index:number;op:Operation};

const fmtSlots = (plan:Plan) => plan.slots.map(s=>`${s.step.label}: ${NEED_LABEL[s.step.need]} ${hours(s.step.hours)} h from ${utcLabel(new Date(s.start).toISOString())}`).join(' · ');

/** Proactive plan for the selected configuration, with fallback, slack and better configurations. */
export function planInsights({selected,all,links,constraints,index,op}:PlannerInput):Insight[] {
 const times = selected.series.timestamp_utc;
 const from = Date.parse(times[Math.max(0,Math.min(index,times.length-1))]);
 const end = Date.parse(times[times.length-1]);
 const toIndex = (ms:number) => times.findIndex(t=>Date.parse(t)===ms);
 const out:Insight[] = [];
 const plan = planOperation(selected,op,from);
 if(!plan){
  out.push({id:'plan-none',tone:'risk',title:`“${op.name}” does not fit here after ${utcLabel(times[Math.max(0,Math.min(index,times.length-1))])}`,
   detail:`No sequence of ${op.steps.map(s=>`${NEED_LABEL[s.need]} ${hours(s.hours)} h`).join(' → ')} completes before ${utcLabel(times[times.length-1])} at this ${selected.height_m} m configuration.`});
 } else {
  const wait = (plan.start-from)/HOUR, total = (plan.finish-plan.start)/HOUR;
  out.push({id:'plan-first',tone:'opportunity',
   title:wait<0.01?`Start “${op.name}” now: done in ${hours(total)} h`:`Start “${op.name}” in ${hours(wait)} h, done ${hours(total)} h later`,
   detail:fmtSlots(plan)+'.',
   action:toIndex(plan.start)>=0?{kind:'time',index:toIndex(plan.start),label:'Go to start'}:undefined});
  const slack = slackHours(selected,op,plan);
  const fb = fallbackPlan(selected,op,plan);
  out.push({id:'plan-slack',tone:fb?'alternative':'risk',
   title:slack>0?`You can start up to ${hours(slack)} h late and still make it`:'No slack: a late start misses this opportunity',
   detail:fb
    ? `If you miss it, the next opportunity starts ${utcLabel(new Date(fb.start).toISOString())}, ${hours((fb.start-plan.start)/HOUR)} h after the first.`
    : `No second opportunity before ${utcLabel(new Date(end).toISOString())}. Treat this slot as critical.`,
   action:fb&&toIndex(fb.start)>=0?{kind:'time',index:toIndex(fb.start),label:'Go to fallback'}:undefined});
 }
 // Across the evaluated configurations: earliest finish among those meeting the constraints, then lowest mast.
 const ranked = all
  .filter(a=>violations(a,links[keyFor(a)],constraints).length===0)
  .map(a=>({a,p:planOperation(a,op,from)}))
  .filter((x):x is {a:Analysis;p:Plan}=>!!x.p)
  .sort((x,y)=>x.p.finish-y.p.finish||x.a.height_m-y.a.height_m||(links[keyFor(x.a)]?.distance_m??0)-(links[keyFor(y.a)]?.distance_m??0));
 const best = ranked[0];
 if(best&&(!plan||best.p.finish<plan.finish)&&keyFor(best.a)!==keyFor(selected)){
  const link = links[keyFor(best.a)];
  const where = !link||link.distance_m<1?'at the lander':`${hours(Math.round(link.distance_m))} m from the lander`;
  out.push({id:'plan-better',tone:'alternative',
   title:plan?`A ${best.a.height_m} m mast ${where} finishes ${hours((plan.finish-best.p.finish)/HOUR)} h sooner`:`It fits with a ${best.a.height_m} m mast ${where}`,
   detail:`Earliest completion among ${ranked.length} configurations that meet every constraint: done ${utcLabel(new Date(best.p.finish).toISOString())}.`,
   action:{kind:'config',candidate:best.a.candidate_id,height:best.a.height_m,label:'Use this configuration'}});
 } else if(!best&&!plan){
  out.push({id:'plan-nowhere',tone:'risk',title:'No configuration that meets the constraints can run it in this window',
   detail:'Shorten a step, relax a constraint or choose a later window. No result has been substituted.'});
 }
 return out;
}
