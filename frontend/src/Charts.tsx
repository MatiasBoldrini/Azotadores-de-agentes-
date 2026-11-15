import {useLayoutEffect,useRef,useState} from 'react';
import type {Analysis} from './lib/science';

const COLORS={sun:'#f4b860',earth:'#82b8ec'} as const;
const AXIS='#8f9a98';

function useWidth<T extends Element>(){
 const ref=useRef<T>(null),[width,setWidth]=useState(0);
 useLayoutEffect(()=>{
  const el=ref.current;if(!el)return;
  setWidth(el.getBoundingClientRect().width);
  const observer=new ResizeObserver(([entry])=>setWidth(entry.contentRect.width));
  observer.observe(el);return()=>observer.disconnect();
 },[]);
 return [ref,width] as const;
}

const range=(values:number[],pad=.6)=>{let lo=Infinity,hi=-Infinity;for(const v of values){if(v<lo)lo=v;if(v>hi)hi=v;}return [Math.floor(lo-pad),Math.ceil(hi+pad)] as const;};
const dayLabel=(s:string)=>new Date(s).toLocaleDateString('en-GB',{timeZone:'UTC',day:'numeric',month:'short'});

function dayTicks(times:string[],plotWidth:number){
 const ticks:number[]=[];
 times.forEach((t,i)=>{if(t.slice(11,16)==='00:00')ticks.push(i);});
 const target=Math.max(2,Math.min(7,Math.floor(plotWidth/56)));
 const every=Math.max(1,Math.ceil(ticks.length/target));
 return ticks.filter((_,i)=>i%every===0);
}

type Track={label:string;analysis:Analysis};

export function TimelineChart({analysis,index,onIndex,body,baseline,height=88,currentLabel,baselineLabel}:{analysis:Analysis;index:number;onIndex:(i:number)=>void;body:'sun'|'earth';baseline?:Analysis;height?:number;currentLabel?:string;baselineLabel?:string}){
 const [ref,width]=useWidth<HTMLDivElement>();
 const s=analysis.series,values=s[`${body}_elevation_deg`],horizon=s[`${body}_horizon_deg`],n=values.length;
 const compare=baseline&&(baseline.candidate_id!==analysis.candidate_id||baseline.height_m!==analysis.height_m)?baseline:undefined;
 const baseHorizon=compare?.series[`${body}_horizon_deg`];
 const [min,max]=range([...values,...horizon,...(baseHorizon??[])]);
 const left=44,right=56,top=6,bottom=18,w=Math.max(width,160);
 const x=(i:number)=>left+i/(n-1)*(w-left-right);
 const y=(v:number)=>top+(1-(v-min)/(max-min))*(height-top-bottom);
 const line=(v:number[])=>v.map((v,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
 const t0=Date.parse(s.timestamp_utc[0]),span=Date.parse(s.timestamp_utc[n-1])-t0;
 const visible=s[`${body}_visible`][index];
 const pick=(clientX:number,el:Element)=>{const r=el.getBoundingClientRect();onIndex(Math.round(Math.max(0,Math.min(1,(clientX-r.left-left)/(r.width-left-right)))*(n-1)));};
 const tracks:Track[]=compare?[{label:baselineLabel??`${compare.height_m} m`,analysis:compare},{label:currentLabel??`${analysis.height_m} m`,analysis}]:[{label:currentLabel??`${analysis.height_m} m`,analysis}];
 const name=body==='sun'?'Sun':'Earth';
 return <div className="time-chart" ref={ref}>
  <div className="chart-head">
   <span className={`chart-title ${body}`}>{name} elevation vs terrain horizon</span>
   <span className="chart-readout"><b>{values[index].toFixed(2)}°</b> / horizon {horizon[index].toFixed(2)}° <em className={visible?'in-view':'blocked'}>{visible?'In view':'Blocked'}</em></span>
  </div>
  <svg role="img" aria-label={`${name} elevation and terrain horizon over time. At the cursor ${name} is ${values[index].toFixed(2)} degrees against a ${horizon[index].toFixed(2)} degree horizon: ${visible?'in view':'blocked'}.`} width={w} height={height} viewBox={`0 0 ${w} ${height}`}
   onPointerMove={e=>pick(e.clientX,e.currentTarget)} onPointerDown={e=>pick(e.clientX,e.currentTarget)}>
   {analysis.metrics[body].intervals.map((v,i)=>{const a=left+(Date.parse(v.start_utc)-t0)/span*(w-left-right),b=left+(Date.parse(v.end_utc)-t0)/span*(w-left-right);return <rect key={i} x={a} y={top} width={Math.max(1,b-a)} height={height-top-bottom} fill={COLORS[body]} opacity=".08"/>;})}
   {[min,0,max].filter((v,i,a)=>a.indexOf(v)===i).map(v=><g key={v}><line x1={left} x2={w-right} y1={y(v)} y2={y(v)} stroke={v===0?'#3a4247':'#262d31'} strokeDasharray={v===0?undefined:'2 4'}/><text x={left-6} y={y(v)+3.5} textAnchor="end" fill={AXIS}>{v}°</text></g>)}
   {dayTicks(s.timestamp_utc,w-left-right).map(i=><text key={i} x={x(i)} y={height-4} textAnchor={i===0?'start':'middle'} fill={AXIS}>{dayLabel(s.timestamp_utc[i])}</text>)}
   {baseHorizon&&<path d={line(baseHorizon)} fill="none" stroke="#6c767b" strokeWidth="1" strokeDasharray="1 3"/>}
   <path key={`${analysis.candidate_id}-${analysis.height_m}`} className="fade-in" d={line(horizon)} fill="none" stroke="#b5bfbd" strokeWidth="1.1" strokeDasharray="4 3"/>
   <path d={line(values)} fill="none" stroke={COLORS[body]} strokeWidth="1.8"/>
   <line x1={x(index)} x2={x(index)} y1={top} y2={height-bottom} stroke="#eef2ef" opacity=".55"/>
   <circle cx={x(index)} cy={y(horizon[index])} r="6" fill="none" stroke="#b8c1bd" strokeWidth="1"/>
   <circle cx={x(index)} cy={y(values[index])} r="3.5" fill={visible?COLORS[body]:'#0d1012'} stroke={COLORS[body]} strokeWidth="1.5"/>
  </svg>
  <div className="tracks">
   {tracks.map((track,k)=><div className={`track ${k===tracks.length-1?'current':''}`} key={k} style={{marginLeft:left,marginRight:right}}>
    <span className="track-label">{track.label}</span>
    {track.analysis.metrics[body].intervals.map((v,i)=><span className="track-span" key={i} style={{left:`${(Date.parse(v.start_utc)-t0)/span*100}%`,width:`${v.duration_hours/track.analysis.metrics[body].duration_hours*100}%`,background:COLORS[body]}} title={`${v.start_utc} → ${v.end_utc}: ${v.duration_hours} h`}/>)}
    <span className="track-total">{track.analysis.metrics[body].total_hours.toLocaleString('en-US',{maximumFractionDigits:1})} h</span>
   </div>)}
  </div>
 </div>;
}

export function HorizonChart({analysis,index,baseline,height=132}:{analysis:Analysis;index:number;baseline?:Analysis;height?:number}){
 const [ref,width]=useWidth<HTMLDivElement>();
 const h=analysis.horizon.elevation_deg,s=analysis.series;
 const compare=baseline&&(baseline.candidate_id!==analysis.candidate_id||baseline.height_m!==analysis.height_m)?baseline.horizon.elevation_deg:undefined;
 const bodies=(['sun','earth'] as const).map(b=>({b,az:s[`${b}_azimuth_deg`][index],el:s[`${b}_elevation_deg`][index],visible:s[`${b}_visible`][index]}));
 const [min,max]=range([...h,...(compare??[]),...bodies.map(b=>b.el)],.8);
 const left=30,right=8,top=16,bottom=18,w=Math.max(width,160);
 const x=(az:number)=>left+((az%360+360)%360)/360*(w-left-right);
 const y=(v:number)=>top+(1-(v-min)/(max-min))*(height-top-bottom);
 const profile=(v:number[])=>v.map((e,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(e).toFixed(1)}`).join('')+`L${x(359.999).toFixed(1)},${y(v[0]).toFixed(1)}`;
 return <div className="horizon-wrap" ref={ref}>
  <svg className="horizon-chart" role="img" width={w} height={height} viewBox={`0 0 ${w} ${height}`}
   aria-label={`360 degree terrain horizon at ${analysis.height_m} metres. ${bodies.map(b=>`${b.b==='sun'?'Sun':'Earth'} at azimuth ${b.az.toFixed(0)} degrees, elevation ${b.el.toFixed(2)} degrees, ${b.visible?'in view':'blocked'}`).join('. ')}.`}>
   {[min,0,max].filter((v,i,a)=>a.indexOf(v)===i).map(v=><g key={v}><line x1={left} x2={w-right} y1={y(v)} y2={y(v)} stroke={v===0?'#3a4247':'#232a2e'} strokeDasharray={v===0?undefined:'2 4'}/><text x={left-5} y={y(v)+3.5} textAnchor="end" fill={AXIS}>{v}°</text></g>)}
   <path key={`${analysis.candidate_id}-${analysis.height_m}`} className="fade-in" d={`${profile(h)}L${x(359.999)},${height-bottom}L${left},${height-bottom}Z`} fill="#262d31"/>
   {compare&&<path d={profile(compare)} fill="none" stroke="#7b858a" strokeWidth="1" strokeDasharray="2 3"/>}
   <path key={`l-${analysis.candidate_id}-${analysis.height_m}`} className="fade-in" d={profile(h)} fill="none" stroke="#c9d1ce" strokeWidth="1.2"/>
   {[0,90,180,270].map((v,i)=><text key={v} x={x(v)+(i?0:2)} y={height-4} textAnchor={i?'middle':'start'} fill={AXIS}>{['N','E','S','W'][i]}</text>)}
   {bodies.map(({b,az,el,visible},i)=>{
    const other=bodies[1-i],close=Math.abs(x(az)-x(other.az))<120,below=close&&el<other.el;
    const anchor=x(az)<left+50?'start':x(az)>w-right-50?'end':'middle';
    return <g key={b}>
     <line x1={x(az)} x2={x(az)} y1={y(el)} y2={height-bottom} stroke={COLORS[b]} strokeOpacity=".35" strokeDasharray="1 2"/>
     <circle cx={x(az)} cy={y(el)} r="5" fill={visible?COLORS[b]:'#0d1012'} stroke={COLORS[b]} strokeWidth="1.6"/>
     <text x={x(az)} y={below?y(el)+18:y(el)-9} textAnchor={anchor} fill={COLORS[b]} className="body-label" paintOrder="stroke" stroke="#0f1214" strokeWidth="3">{b==='sun'?'SUN':'EARTH'}{visible?'':' · BLOCKED'}</text>
    </g>;})}
  </svg>
 </div>;
}
