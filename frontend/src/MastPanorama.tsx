import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ArrowUp,Pause,Play,X} from 'lucide-react';
import type {Analysis} from './lib/science';
import {classify,horizonAt,panoramaRange,trackSegments,type Body} from './lib/panorama';
import './MastPanorama.css';

const COLORS={sun:'#FFC46B',earth:'#8FD3FF'} as const;
const BLOCKED='#ff625e',AXIS='#A3A3A3';
const RAISE_MS=1300;
export const PANORAMA_CAPTION='Geometric line of sight from LOLA terrain, no vertical exaggeration';
const utc=(s:string)=>new Date(s).toLocaleString('en-GB',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
const h1=(n:number)=>n.toLocaleString('en-US',{maximumFractionDigits:1});

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

/** 360° view from the mast top: the engine's cached LOLA horizon per height, with the JPL Horizons Sun and Earth tracks. */
export default function MastPanorama({sweep,siteName,initialHeight,initialIndex,onClose}:{
 sweep:Analysis[];siteName:string;initialHeight:number;initialIndex:number;onClose:()=>void;
}){
 const dialog=useRef<HTMLDialogElement>(null);
 // Open before the plot measures its width: a closed dialog has no layout box.
 useLayoutEffect(()=>{const d=dialog.current;if(d&&!d.open)d.showModal();},[]);
 const heights=sweep.map(a=>a.height_m);
 const [height,setHeight]=useState(heights.includes(initialHeight)?initialHeight:heights[0]);
 const [previous,setPrevious]=useState<number|null>(null);
 const [raising,setRaising]=useState(false),[playing,setPlaying]=useState(false);
 const analysis=sweep.find(a=>a.height_m===height)??sweep[0];
 const before=previous===null||previous>=height?undefined:sweep.find(a=>a.height_m===previous);
 const s=analysis.series,count=s.timestamp_utc.length;
 const [index,setIndex]=useState(Math.min(initialIndex,count-1));
 const [ref,width]=useWidth<HTMLDivElement>();

 useEffect(()=>{if(!playing)return;const id=window.setInterval(()=>setIndex(i=>(i+4)%count),120);return()=>window.clearInterval(id);},[playing,count]);
 useEffect(()=>{
  if(!raising)return;
  const next=heights.find(h=>h>height);
  if(next===undefined){setRaising(false);return;}
  const id=window.setTimeout(()=>{setPrevious(height);setHeight(next);},height===heights[0]&&previous===null?250:RAISE_MS);
  return()=>window.clearTimeout(id);
 },[raising,height]);

 const pick=(h:number)=>{setRaising(false);if(h!==height){setPrevious(height);setHeight(h);}};
 const raise=()=>{setPlaying(false);setPrevious(null);setHeight(heights[0]);setRaising(true);};

 const [min,max]=useMemo(()=>panoramaRange(sweep),[sweep]);
 const w=Math.max(width,300),plotH=w<560?230:300;
 const left=34,right=10,top=14,bottom=24;
 const x=(az:number)=>left+((az%360+360)%360)/360*(w-left-right);
 const y=(v:number)=>top+(1-(v-min)/(max-min))*(plotH-top-bottom);
 const profile=(v:number[])=>v.map((e,i)=>`${i?'L':'M'}${x(i*360/v.length).toFixed(1)},${y(e).toFixed(1)}`).join('')+`L${x(359.999).toFixed(1)},${y(v[0]).toFixed(1)}`;
 const reversed=(v:number[])=>`L${x(359.999).toFixed(1)},${y(v[0]).toFixed(1)}`+v.map((_,k)=>{const i=v.length-1-k;return `L${x(i*360/v.length).toFixed(1)},${y(v[i]).toFixed(1)}`;}).join('');
 const ground=analysis.horizon.elevation_deg;
 const tracks=useMemo(()=>(['sun','earth'] as Body[]).map(body=>({body,segments:trackSegments(s,body,classify(analysis,body))})),[analysis,s]);
 const path=(points:[number,number][])=>points.map(([a,e],i)=>`${i?'L':'M'}${x(a).toFixed(1)},${y(e).toFixed(1)}`).join('');
 const ticks=[];for(let v=Math.ceil(min);v<=max;v+=max-min>10?2:1)ticks.push(v);
 const bodies=(['sun','earth'] as Body[]).map(body=>{
  const az=s[`${body}_azimuth_deg`][index],el=s[`${body}_elevation_deg`][index];
  return {body,az,el,horizon:horizonAt(ground,az),visible:s[`${body}_visible`][index]};
 });
 const baseline=sweep[0];
 return <dialog ref={dialog} className="mast-panorama" aria-labelledby="mast-panorama-title" onClose={onClose} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}>
  <div className="mast-panorama-card glass">
   <header className="mast-panorama-head">
    <div>
     <span className="eyebrow">View from mast top · {siteName}</span>
     <h2 id="mast-panorama-title">{height} m mast: what the antenna and panel see</h2>
    </div>
    <button type="button" className="mast-panorama-close" aria-label="Close view from mast" onClick={()=>dialog.current?.close()}><X size={18}/></button>
   </header>
   <div className="mast-panorama-controls">
    <div className="mast-panorama-heights" role="group" aria-label="Mast height">
     {sweep.map(a=><button key={a.height_m} type="button" aria-pressed={a.height_m===height} className={a.height_m===height?'selected':''} onClick={()=>pick(a.height_m)}>
      <b>{a.height_m}<small>m</small></b>
      <span><i className="sun">☀ {h1(a.metrics.sun.total_hours)} h</i><i className="earth">⊕ {h1(a.metrics.earth.total_hours)} h</i></span>
     </button>)}
    </div>
    <button type="button" className="primary mast-panorama-raise" onClick={raise} disabled={raising}><ArrowUp size={15}/>{raising?'Raising mast…':'Raise mast 0 → 20 m'}</button>
   </div>
   <div className="mast-panorama-plot" ref={ref}>
    <svg role="img" width={w} height={plotH} viewBox={`0 0 ${w} ${plotH}`}
     aria-label={`360 degree terrain horizon seen from ${height} metres. ${bodies.map(b=>`${b.body==='sun'?'Sun':'Earth'} at azimuth ${b.az.toFixed(0)} degrees, elevation ${b.el.toFixed(2)} degrees against a ${b.horizon.toFixed(2)} degree horizon: ${b.visible?'in view':'blocked'}`).join('. ')}.`}>
     {ticks.map(v=><g key={v}><line x1={left} x2={w-right} y1={y(v)} y2={y(v)} stroke={v===0?'#4A4A4A':'#202020'} strokeDasharray={v===0?undefined:'2 4'}/><text x={left-5} y={y(v)+3.5} textAnchor="end" fill={AXIS}>{v}°</text></g>)}
     {[0,30,60,90,120,150,180,210,240,270,300,330].map(a=><g key={a}><line x1={x(a)} x2={x(a)} y1={top} y2={plotH-bottom} stroke="#1A1A1A"/><text x={x(a)+(a?0:2)} y={plotH-8} textAnchor={a?'middle':'start'} fill={a%90?'#6B6B6B':AXIS} fontWeight={a%90?400:600}>{a%90?(w<560?'':`${a}°`):['N','E','S','W'][a/90]}</text></g>)}
     {tracks.map(({body,segments})=>segments.map((seg,i)=><path key={`${body}-${i}`} d={path(seg.points)} fill="none" stroke={seg.visible?COLORS[body]:BLOCKED} strokeOpacity={seg.visible?.95:.35} strokeWidth={seg.visible?2:1.2} strokeDasharray={seg.visible?undefined:'2 3'}/>))}
     <path key={`fill-${height}`} className="mast-terrain" d={`${profile(ground)}L${x(359.999)},${plotH-bottom}L${left},${plotH-bottom}Z`}/>
     {before&&<path key={`cleared-${previous}-${height}`} className="mast-cleared" d={`${profile(before.horizon.elevation_deg)}${reversed(ground)}Z`}/>}
     {before&&<path d={profile(before.horizon.elevation_deg)} fill="none" stroke="#8F8F8F" strokeWidth="1" strokeDasharray="2 3"/>}
     {baseline.height_m!==height&&baseline.height_m!==previous&&<path d={profile(baseline.horizon.elevation_deg)} fill="none" stroke="#5A5A5A" strokeWidth="1" strokeDasharray="1 3"/>}
     <path key={`line-${height}`} className="mast-ridge" d={profile(ground)}/>
     {bodies.map(({body,az,el,visible},i)=>{
      const color=visible?COLORS[body]:BLOCKED,other=bodies[1-i],close=Math.abs(x(az)-x(other.az))<110,below=close&&el<other.el;
      const anchor=x(az)<left+60?'start':x(az)>w-right-60?'end':'middle';
      return <g key={body}>
       <line x1={x(az)} x2={x(az)} y1={y(el)} y2={plotH-bottom} stroke={color} strokeOpacity=".4" strokeDasharray="1 2"/>
       <circle cx={x(az)} cy={y(el)} r={body==='sun'?7:6} fill={visible?color:'#050505'} stroke={color} strokeWidth="2"/>
       <text x={x(az)} y={below?y(el)+20:y(el)-12} textAnchor={anchor} fill={color} className="body-label" paintOrder="stroke" stroke="#050505" strokeWidth="3">{body==='sun'?'SUN':'EARTH'}{visible?'':' · BLOCKED'}</text>
      </g>;
     })}
    </svg>
   </div>
   <div className="mast-panorama-time">
    <button type="button" aria-label={playing?'Pause sky tracks':'Play sky tracks'} onClick={()=>setPlaying(!playing)}>{playing?<Pause size={15}/>:<Play size={15}/>}</button>
    <input type="range" min="0" max={count-1} value={index} aria-label="Time in the observation window" aria-valuetext={`${utc(s.timestamp_utc[index])} UTC`} onChange={e=>{setPlaying(false);setIndex(Number(e.target.value));}}/>
    <time dateTime={s.timestamp_utc[index]}>{utc(s.timestamp_utc[index])} UTC</time>
   </div>
   <dl className="mast-panorama-readout">
    {bodies.map(b=><div key={b.body}>
     <dt className={b.body}>{b.body==='sun'?'Sun':'Earth'}</dt>
     <dd>az {b.az.toFixed(1)}° · el {b.el.toFixed(2)}° vs horizon {b.horizon.toFixed(2)}° <em className={b.visible?'in-view':'blocked'}>{b.visible?'In view':'Blocked'}</em></dd>
    </div>)}
    <div><dt>Window at {height} m</dt><dd>Sun {h1(analysis.metrics.sun.total_hours)} h · Earth {h1(analysis.metrics.earth.total_hours)} h of {h1(analysis.metrics.sun.duration_hours)} h{height!==baseline.height_m&&<> (ground: {h1(baseline.metrics.sun.total_hours)} h / {h1(baseline.metrics.earth.total_hours)} h)</>}</dd></div>
   </dl>
   <ul className="mast-panorama-legend">
    <li><i className="lg-ridge"/>Terrain horizon at {height} m</li>
    {before&&<li><i className="lg-cleared"/>Sky cleared from {previous} m</li>}
    <li><i className="lg-track sun"/>Sun track <i className="lg-track earth"/>Earth track (in view)</li>
    <li><i className="lg-track blocked"/>Below the horizon</li>
   </ul>
   <p className="mast-panorama-caption">{PANORAMA_CAPTION}. Horizon: NASA LOLA 5 m DEM (PGDA 78) plus regional 80 m DEM (PGDA 90) to 150 km, maximum elevation angle per 1° azimuth sector, the same cached horizon the engine integrates. Tracks: JPL Horizons body centers every 30 min over the selected window.</p>
  </div>
 </dialog>;
}
