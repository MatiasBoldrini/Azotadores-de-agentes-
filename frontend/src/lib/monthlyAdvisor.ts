// Planning suggestions read from the precomputed monthly scan only.
import type {MonthlyScan} from './monthlyScan.ts';
import type {Insight} from './advisor.ts';
import {hours} from './story.ts';

type SiteRef = {id:string;name:string};

const monthName = new Intl.DateTimeFormat('en-GB',{month:'short',year:'numeric',timeZone:'UTC'});
const label = (iso:string) => monthName.format(new Date(iso));

/** Consecutive months grouped as "Nov 2026–Jan 2027". */
function ranges(months:{start_utc:string}[],keep:boolean[]):string[] {
 const out:string[] = [];
 for(let i=0;i<months.length;i++){
  if(!keep[i]) continue;
  let j=i; while(j+1<months.length&&keep[j+1]) j++;
  out.push(i===j?label(months[i].start_utc):`${label(months[i].start_utc)}–${label(months[j].start_utc)}`);
  i=j;
 }
 return out;
}

export function monthlyAdvice(scan:MonthlyScan,sites:SiteRef[],monthId:string,height:number):Insight[] {
 const months = scan.months, current = months.findIndex(m=>m.id===monthId);
 const ids = sites.filter(s=>months.every(m=>s.id in m.sites));
 if(!ids.length||current<0) return [];
 const out:Insight[] = [];

 // Lowest infrastructure: the smallest qualifying mast anywhere, and when.
 const lowest = Math.min(...ids.flatMap(s=>months.map(m=>m.sites[s.id].minimum_height_m??Infinity)));
 if(Number.isFinite(lowest)){
  const where = ids.map(s=>({s,when:ranges(months,months.map(m=>m.sites[s.id].minimum_height_m===lowest))})).filter(x=>x.when.length);
  out.push({id:'month-lowest',tone:'opportunity',
   title:`Smallest mast that works: ${lowest} m, at ${where.map(x=>`${x.s.name} in ${x.when.join(', ')}`).join('; ')}`,
   detail:`Across ${months.length} monthly windows and both sites, no qualifying configuration needs less. Land in that window to keep infrastructure to a minimum.`});
 }

 // Months where no tested height qualifies at any site.
 const dead = months.map(m=>ids.every(s=>m.sites[s.id].minimum_height_m===null));
 if(dead.some(Boolean)) out.push({id:'month-none',tone:'risk',
  title:`Avoid ${ranges(months,dead).join(', ')}: no tested mast height meets the limits at either site`,
  detail:`Up to ${Math.max(...scan.heights_m)} m was evaluated. A mission in that period needs relaxed requirements or another site.`});

 // One mast for the whole campaign.
 for(const s of ids){
  const need = months.map(m=>m.sites[s.id].minimum_height_m);
  const covered = need.map(n=>n!==null);
  const span = ranges(months,covered);
  if(span.length===1&&!covered.every(Boolean)||covered.every(Boolean)){
   const max = Math.max(...need.filter((n):n is number=>n!==null));
   out.push({id:`month-campaign-${s.id}`,tone:'alternative',
    title:`${s.name}: one ${max} m mast covers ${span[0]}`,
    detail:`The tallest monthly requirement in that span. ${covered.every(Boolean)?'It covers every scanned month.':'Outside it, no tested height qualifies.'}`});
  }
 }

 // Slip risk: what a one-month delay from the selected month costs.
 const next = months[current+1];
 if(next) for(const s of ids){
  const now = months[current].sites[s.id].minimum_height_m, later = next.sites[s.id].minimum_height_m;
  if(now!==null&&(later===null||later>now)) out.push({id:`month-slip-${s.id}`,tone:'risk',
   title:`If the landing slips to ${label(next.start_utc)}, ${s.name} ${later===null?'no longer qualifies at any tested height':`needs ${later} m instead of ${now} m`}`,
   detail:`Plan the mast for the later month, or keep a margin in the schedule.`});
 }

 // Trade-off between the sites at the selected month and height.
 if(ids.length===2){
  const [a,b] = ids, m = months[current];
  const ha = m.sites[a.id].heights.find(x=>x.height_m===height), hb = m.sites[b.id].heights.find(x=>x.height_m===height);
  if(ha&&hb){
   const dSun = hb.sun_hours-ha.sun_hours, dEarth = hb.earth_hours-ha.earth_hours;
   const sign = (v:number) => `${v>=0?'+':'−'}${hours(Math.abs(v))} h`;
   if(Math.sign(dSun)*Math.sign(dEarth)<0) out.push({id:'month-tradeoff',tone:'alternative',
    title:`${label(m.start_utc)} at ${height} m: ${dEarth>0?b.name:a.name} favours Earth, ${dSun>0?b.name:a.name} favours the Sun`,
    detail:`${b.name} versus ${a.name}: Sun ${sign(dSun)}, Earth ${sign(dEarth)}, longest gap with either blocked ${hours(hb.both_longest_outage_hours)} vs ${hours(ha.both_longest_outage_hours)} h. Pick by what the mission needs most.`});
  }
 }
 const order = {risk:0,opportunity:1,alternative:2};
 return out.map((x,i)=>({x,i})).sort((p,q)=>order[p.x.tone]-order[q.x.tone]||p.i-q.i).map(p=>p.x);
}
