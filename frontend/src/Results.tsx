import {useId,useState,type ReactNode} from 'react';
import {Check,Minus,Radio,Sun,Globe2,X,Info,ArrowUpRight} from 'lucide-react';
import {keyFor,percent,type Analysis,type Constraints,type Link} from './lib/science';
import {hours,pct,type ConstraintRow,type Search,type Segment} from './lib/story';
import {Segments} from './Story';
import AnalysisDisclosure from './AnalysisDisclosure';

function MetricCard({body,analysis,baseline,threshold}:{body:'sun'|'earth';analysis:Analysis;baseline:Analysis;threshold:number}){
 const m=analysis.metrics[body],b=baseline.metrics[body],same=keyFor(analysis)===keyFor(baseline);
 const Icon=body==='sun'?Sun:Globe2;
 const tooltipId=useId();
 const [active,setActive]=useState<'current'|'ground'|'minimum'|null>(null);
 const label=body==='sun'?'Solar exposure':'Earth visibility';
 const details={
  current:{title:label,value:`${hours(m.total_hours)} h · ${pct(percent(m))}%`,description:`Colored bar: time the ${body==='sun'?'Sun':'Earth'} is above the terrain horizon for the selected configuration.`},
  ground:{title:'Ground level',value:`${hours(b.total_hours)} h · ${pct(percent(b))}%`,description:'Solid marker: visibility at ground level at the lander, for comparison.'},
  minimum:{title:'Minimum required',value:`${threshold}% of window`,description:'Dotted marker: the minimum visibility set in your search constraints.'},
 };
 const detail=details[active??'current'];
 return <div className={`metric-card ${body}`}>
  <span className="metric-label"><Icon size={14}/>{body==='sun'?'Solar exposure':'Earth visibility'}</span>
  <div className="metric-value"><b key={m.total_hours}>{hours(m.total_hours)}</b><small>h</small><span className="metric-pct">{pct(percent(m))}% of window</span></div>
  <div className={`meter-interaction${active?' active':''}`} tabIndex={0}
   aria-label={`${label}: ${pct(percent(m))}% of window. Ground ${pct(percent(b))}%. Minimum ${threshold}%.`}
   aria-describedby={active?tooltipId:undefined}
   onMouseEnter={()=>setActive('current')} onMouseLeave={()=>setActive(null)}
   onFocus={()=>setActive('current')} onBlur={()=>setActive(null)}
   onKeyDown={event=>{if(event.key==='Escape')setActive(null);}}
   onClick={()=>setActive(active?null:'current')}>
   <div className="meter" aria-hidden="true" onMouseEnter={()=>setActive('current')}>
    <span className="meter-fill" style={{width:`${percent(m)}%`}}/>
    {!same&&<span className="meter-base" style={{left:`${percent(b)}%`}} onMouseEnter={()=>setActive('ground')} onMouseLeave={()=>setActive('current')}/>}
    <span className="meter-req" style={{left:`${threshold}%`}} onMouseEnter={()=>setActive('minimum')} onMouseLeave={()=>setActive('current')}/>
   </div>
   <div className="meter-legend"><span onMouseEnter={()=>setActive('ground')}>{!same?<><i className="tick-base"/>Ground {hours(b.total_hours)} h</>:<>Ground level</>}</span><span onMouseEnter={()=>setActive('minimum')}><i className="tick-req"/>Min {threshold}%</span></div>
   {active&&<div className="meter-tooltip" id={tooltipId} role="tooltip">
    <strong>{detail.title}</strong><b>{detail.value}</b><span>{detail.description}</span>
    {active==='current'&&<span>Solid marker: ground level · dotted marker: minimum required.</span>}
   </div>}
  </div>
 </div>;
}

function HeightResponse({sweep,selected,onHeight,recommended,constraints}:{sweep:Analysis[];selected:Analysis;onHeight:(h:number)=>void;recommended?:string;constraints:Constraints}){
 const [hovered,setHovered]=useState<number>();
 const [focused,setFocused]=useState<number>();
 const minHeight=sweep[0].height_m,maxHeight=sweep[sweep.length-1].height_m;
 const x=(height:number)=>(height-minHeight)/(maxHeight-minHeight)*100;
 const points=sweep.map(analysis=>({analysis,position:x(analysis.height_m)}));
 const tracks=[
  {body:'sun',label:'Sun',min:constraints.minSun},
  {body:'earth',label:'Earth',min:constraints.minEarth},
 ] as const;
 const active=sweep.find(a=>a.height_m===(hovered??focused))??selected;
 const recommendedHeight=sweep.find(a=>keyFor(a)===recommended)?.height_m;

 return <>
  <div className="hr-readout">
   <b>{active.height_m} m</b>
   {tracks.map(({body,label})=><span key={body} className={body}>{label} <b>{hours(active.metrics[body].total_hours)} h</b></span>)}
   {recommendedHeight!==undefined&&<span className="hr-rec">{recommendedHeight} m recommended</span>}
  </div>
  <div className="hr-axis-title">% of window</div>
  <div className="hr-plot">
   <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
    {[0,50,100].map(value=><line key={value} className="hr-grid" x1="0" x2="100" y1={100-value} y2={100-value}/>)}
    {tracks.map(({body,min})=><line key={body} className={`hr-limit ${body}`} x1="0" x2="100" y1={100-min} y2={100-min}/>)}
    <line className="hr-selected" x1={x(selected.height_m)} x2={x(selected.height_m)} y1="0" y2="100"/>
    {active.height_m!==selected.height_m&&<line className="hr-preview" x1={x(active.height_m)} x2={x(active.height_m)} y1="0" y2="100"/>}
    {tracks.map(({body})=><polyline key={body} className={`hr-series ${body}`}
     points={points.map(({analysis,position})=>`${position},${100-percent(analysis.metrics[body])}`).join(' ')}/>)}
   </svg>
   {[0,50,100].map(value=><span key={value} className="hr-tick" aria-hidden="true" style={{bottom:`${value}%`}}>{value}</span>)}
   {tracks.map(({body})=>points.map(({analysis,position})=><span key={`${body}-${analysis.height_m}`} aria-hidden="true"
    className={`hr-marker ${body}${analysis===active?' active':''}${analysis.height_m===selected.height_m?' current':''}`}
    style={{left:`${position}%`,bottom:`${percent(analysis.metrics[body])}%`}}/>))}
   <div className="hr-options" role="group" aria-label="Tested mast heights" onPointerLeave={()=>setHovered(undefined)}>
    {points.map(({analysis,position},index)=>{
     const {height_m:height,metrics}=analysis;
     const current=height===selected.height_m,rec=keyFor(analysis)===recommended;
     const left=index>0?(points[index-1].position+position)/2:-8;
     const right=index<points.length-1?(points[index+1].position+position)/2:104;
     return <button key={height} className="hr-option" style={{left:`${left}%`,width:`${right-left}%`}}
      aria-pressed={current} aria-label={`${height} metre mast, Sun ${hours(metrics.sun.total_hours)} hours, Earth ${hours(metrics.earth.total_hours)} hours${rec?', recommended':''}`}
      onPointerEnter={event=>{if(event.pointerType==='mouse'||event.pointerType==='pen')setHovered(height);}}
      onFocus={()=>{setHovered(undefined);setFocused(height);}} onBlur={()=>setFocused(undefined)}
      onClick={()=>{onHeight(height);setFocused(undefined);}}>
      <span className="hr-height" aria-hidden="true" style={{left:`${(position-left)/(right-left)*100}%`}}>{height}{height===maxHeight?" m":""}</span>
     </button>;
    })}
   </div>
  </div>
  <div className="hr-limits">
   {tracks.map(({body,label,min})=><span key={body} className={body}><i aria-hidden="true"/>{label} min {min}%</span>)}
  </div>
 </>;
}

function Checks({rows}:{rows:ConstraintRow[]}){
 const required=rows.filter(r=>r.required),met=required.filter(r=>r.pass).length;
 return <section className="checks">
  <AnalysisDisclosure title="Mission constraints" summary={<span className={`pass-count ${met===required.length?'all':''}`}>{met} / {required.length} met</span>}>
   <ul>{rows.map(r=><li key={r.name} className={!r.required?'na':r.pass?'pass':'fail'}>
    <span className="check-icon" aria-hidden>{!r.required?<Minus size={12}/>:r.pass?<Check size={12}/>:<X size={12}/>}</span>
    <span className="check-label">{r.label}<span className="sr-only">: {!r.required?'not required':r.pass?'met':'not met'}</span></span>
    <span className="check-value">{r.value}</span><span className="check-limit">{r.limit}</span>
   </li>)}</ul>
  </AnalysisDisclosure>
 </section>;
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
  {sweep.length>=2&&<section className="height-response">
   <AnalysisDisclosure title="Visibility by mast height">
    <HeightResponse key={selected.candidate_id} sweep={sweep} selected={selected} onHeight={onHeight} recommended={recommended} constraints={constraints}/>
   </AnalysisDisclosure>
  </section>}
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
