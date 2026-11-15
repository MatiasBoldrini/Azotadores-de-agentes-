// "Right now" alerts: the next Sun or Earth rise/set within a few hours of the timeline cursor,
// read from the integrated visibility intervals. Recomputed on every cursor move, no model involved.
import type {Analysis} from './science.ts';
import {hours} from './story.ts';
import {utcLabel,type Insight} from './advisor.ts';

export const ALERT_HORIZON_HOURS = 12;
const HOUR = 3_600_000;
type Body = 'sun'|'earth';
const NAME:Record<Body,string> = {sun:'Sun',earth:'Earth'};

function nearestIndex(times:string[],ms:number):number {
 const i = times.findIndex(t=>Date.parse(t)>=ms);
 return i<0?times.length-1:i;
}

export function nowAlerts(a:Analysis,index:number,horizonHours=ALERT_HORIZON_HOURS):Insight[] {
 const times = a.series.timestamp_utc;
 const now = Date.parse(times[Math.max(0,Math.min(index,times.length-1))]);
 const end = Date.parse(times[times.length-1]);
 const out:Insight[] = [];
 for(const body of ['earth','sun'] as Body[]){
  const runs = a.metrics[body].intervals.map(r=>({start:Date.parse(r.start_utc),end:Date.parse(r.end_utc)}));
  const current = runs.find(r=>r.start<=now&&now<r.end);
  if(current){
   const left = (current.end-now)/HOUR;
   if(left<=horizonHours&&current.end<end){
    out.push({id:`now-${body}-set`,tone:'risk',
     title:body==='earth'?`Earth sets in ${hours(left)} h: transmit now`:`Sunset in ${hours(left)} h: finish what needs power`,
     detail:`${NAME[body]} drops below the horizon at ${utcLabel(new Date(current.end).toISOString())}.`});
   }
  } else {
   const next = runs.find(r=>r.start>now);
   if(next&&(next.start-now)/HOUR<=horizonHours){
    const wait = (next.start-now)/HOUR;
    out.push({id:`now-${body}-rise`,tone:'opportunity',
     title:body==='earth'?`Earth rises in ${hours(wait)} h: queue the downlink`:`Sunrise in ${hours(wait)} h: power returns`,
     detail:`${NAME[body]} clears the horizon at ${utcLabel(new Date(next.start).toISOString())} for ${hours((next.end-next.start)/HOUR)} h.`,
     action:{kind:'time',index:nearestIndex(times,next.start),label:'Go there'}});
   }
  }
 }
 return out;
}
