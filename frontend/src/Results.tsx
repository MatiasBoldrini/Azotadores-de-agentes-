import type {ReactNode} from 'react';
import {Check,Minus,Radio,Sun,Globe2,X,Info,ArrowUpRight} from 'lucide-react';
import {keyFor,percent,type Analysis,type Constraints,type Link} from './lib/science';
import {hours,pct,signed,type ConstraintRow,type Search,type Segment} from './lib/story';
import {Segments} from './Story';

function MetricCard({body,analysis,baseline,threshold}:{body:'sun'|'earth';analysis:Analysis;baseline:Analysis;threshold:number}){
 const m=analysis.metrics[body],b=baseline.metrics[body],delta=m.total_hours-b.total_hours,same=keyFor(analysis)===keyFor(baseline);
 const Icon=body==='sun'?Sun:Globe2;
 return <div className={`metric-card ${body}`}>
  <div className="metric-head">
   <span className="metric-label"><Icon size={14}/>{body==='sun'?'Solar exposure':'Earth visibility'}</span>
   {!same&&<span key={delta} className={`delta ${delta>0?'up':delta<0?'down':''}`} title="Versus ground level at the lander">{signed(delta)} h</span>}
  </div>
  <div className="metric-value"><b key={m.total_hours}>{hours(m.total_hours)}</b><small>h</small><span className="metric-pct">{pct(percent(m))}% of window</span></div>
  <div className="meter" role="img" aria-label={`${pct(percent(m))} percent; ground level ${pct(percent(b))} percent; requirement ${threshold} percent`}>
   <span className="meter-fill" style={{width:`${percent(m)}%`}}/>
   {!same&&<span className="meter-base" style={{left:`${percent(b)}%`}}/>}
   <span className="meter-req" style={{left:`${threshold}%`}}/>
  </div>
  <div className="meter-legend">{!same?<span title="Ground level at the lander"><i className="tick-base"/>Ground {hours(b.total_hours)} h</span>:<span>Ground level</span>}<span title="Search constraint"><i className="tick-req"/>Min {threshold}%</span></div>
 </div>;
}

function HeightResponse({sweep,selected,onHeight,recommended,constraints}:{sweep:Analysis[];selected:Analysis;onHeight:(h:number)=>void;recommended?:string;constraints:Constraints}){
 if(sweep.length<2) return null;
 const window=sweep[0].metrics.sun.duration_hours;
 return <div className="height-response">
  <div className="block-head"><span>Visibility by height</span><span className="legend"><i className="earth-sq"/>Earth <i className="sun-sq"/>Sun <i className="req-sq"/>Min</span></div>
  <div className="hr-plot">
   <div className="hr-guides" aria-hidden>
    <span className="hr-req earth" style={{bottom:`${constraints.minEarth}%`}}><em>{constraints.minEarth}%</em></span>
    <span className="hr-req sun" style={{bottom:`${constraints.minSun}%`}}><em style={Math.abs(constraints.minSun-constraints.minEarth)<14?{top:constraints.minSun>=constraints.minEarth?-15:1}:undefined}>{constraints.minSun}%</em></span>
   </div>
   {sweep.map(a=>{const current=a.height_m===selected.height_m,rec=recommended===keyFor(a);return <button key={a.height_m} className={`hr-col ${current?'current':''}`} aria-pressed={current}
    aria-label={`${a.height_m} metre mast: Earth ${hours(a.metrics.earth.total_hours)} hours, Sun ${hours(a.metrics.sun.total_hours)} hours${rec?', recommended':''}`} onClick={()=>onHeight(a.height_m)}>
    <span className="hr-val">{hours(a.metrics.earth.total_hours)}</span>
    <span className="hr-pair"><i className="earth" style={{height:`${a.metrics.earth.total_hours/window*100}%`}}/><i className="sun" style={{height:`${a.metrics.sun.total_hours/window*100}%`}}/></span>
    <span className="hr-h">{a.height_m} m{rec&&<em>REC</em>}</span>
   </button>;})}
  </div>
 </div>;
}

function Checks({rows}:{rows:ConstraintRow[]}){
 const required=rows.filter(r=>r.required),met=required.filter(r=>r.pass).length;
 return <div className="checks">
  <div className="block-head"><span>Mission constraints</span><span className={`pass-count ${met===required.length?'all':''}`}>{met} / {required.length} met</span></div>
  <ul>{rows.map(r=><li key={r.name} className={!r.required?'na':r.pass?'pass':'fail'}>
   <span className="check-icon" aria-hidden>{!r.required?<Minus size={12}/>:r.pass?<Check size={12}/>:<X size={12}/>}</span>
   <span className="check-label">{r.label}<span className="sr-only">: {!r.required?'not required':r.pass?'met':'not met'}</span></span>
   <span className="check-value">{r.value}</span><span className="check-limit">{r.limit}</span>
  </li>)}</ul>
 </div>;
}

export function ResultsPanel({window,selected,baseline,sweep,link,rows,constraints,onHeight,recommended,onMethod}:{window:ReactNode;selected:Analysis;baseline:Analysis;sweep:Analysis[];link?:Link;rows:ConstraintRow[];constraints:Constraints;onHeight:(h:number)=>void;recommended?:string;onMethod:()=>void}){
 const m=selected.metrics,b=baseline.metrics,same=keyFor(selected)===keyFor(baseline);
 return <aside className="results glass" aria-labelledby="results-title">
  <div className="panel-heading"><h2 className="panel-title" id="results-title">Results</h2><button className="text-button method-link" onClick={onMethod} title="How these numbers are computed"><Info size={13}/>Method<ArrowUpRight size={12}/></button></div>
  {window}
  <div className="metric-pair" role="group" aria-label="Visibility metrics" aria-describedby="selected-visibility-window">
   <MetricCard body="sun" analysis={selected} baseline={baseline} threshold={constraints.minSun}/>
   <MetricCard body="earth" analysis={selected} baseline={baseline} threshold={constraints.minEarth}/>
   <p className="metric-note">Visible hours count when each body’s center clears the terrain horizon.</p>
  </div>
  <dl className="joint">
   <div><dt>Sun + Earth together</dt><dd>{hours(m.both.total_hours)} h{!same&&<small>{hours(b.both.total_hours)} h at ground</small>}</dd></div>
   <div><dt>Longest gap with Sun or Earth blocked</dt><dd className={m.both.longest_outage_hours<b.both.longest_outage_hours?'good':''}>{hours(m.both.longest_outage_hours)} h{!same&&<small>{hours(b.both.longest_outage_hours)} h at ground</small>}</dd></div>
   <div><dt><Radio size={12}/>Lander ↔ station</dt><dd className={link?.visible?'good':'warn'}>{link?.visible?'Clear line of sight':'Terrain obstructed'}{link&&link.distance_m>=1&&<small>{hours(Math.round(link.distance_m))} m apart</small>}</dd></div>
  </dl>
  <HeightResponse sweep={sweep} selected={selected} onHeight={onHeight} recommended={recommended} constraints={constraints}/>
  <Checks rows={rows}/>
 </aside>;
}

export function OptimizerCard({search,lines,links,selectedKey,onPick,onClose}:{search:Search;lines:Segment[][];links:Record<string,Link>;selectedKey:string;onPick:(a:Analysis)=>void;onClose:()=>void}){
 const r=search.recommended;
 return <section className={`optimizer-card ${r?'':'infeasible'}`} aria-label="Optimizer result">
  <div className="opt-head">
   <span className="eyebrow">Optimizer · {search.evaluated} evaluated · {search.feasible} feasible</span>
   <button className="icon-button" aria-label="Dismiss optimizer result" onClick={onClose}><X size={15}/></button>
  </div>
  {r?<>
   <h3>Recommended: <b>{r.height_m} m mast</b> {links[keyFor(r)].distance_m<1?'at the lander':`${hours(Math.round(links[keyFor(r)].distance_m))} m from the lander`}</h3>
   <ul className="why">{lines.map((l,i)=><li key={i}><Segments parts={l}/></li>)}</ul>
   <div className="ranked" role="list" aria-label="Ranked feasible configurations">
    <div className="ranked-head" aria-hidden><span>#</span><span>Configuration</span><span>Earth</span><span>Cost</span></div>
    {search.alternatives.slice(0,4).map((a,i)=>{const link=links[keyFor(a)];return <button role="listitem" key={keyFor(a)} className={keyFor(a)===selectedKey?'selected':''} onClick={()=>onPick(a)}>
     <span className="rank">#{i+1}</span><span className="cfg">{a.height_m} m · {link.distance_m<1?'at lander':`${hours(Math.round(link.distance_m))} m away`}</span><span className="earth">{hours(a.metrics.earth.total_hours)} h</span><span className="cost">{search.cost(a).toFixed(3)}</span>
    </button>;})}
   </div>
   <p className="fine">Finite grid of precomputed cells × heights; not a global optimum. Cost is a dimensionless preference, not mass or money.</p>
  </>:<>
   <h3>No feasible configuration found within the evaluated search space.</h3>
   <p className="fine">Try a longer permitted outage, a lower availability target, or a less restrictive distance or slope. No result has been substituted.</p>
  </>}
 </section>;
}
