import {useState,useEffect,useMemo,useRef,Component,ReactNode} from 'react';
import {ArrowUpRight,ArrowRight,ChevronDown,Layers3,RotateCcw,Maximize2,Telescope,SlidersHorizontal,Play,Pause,AlertTriangle,Download,Mountain,ExternalLink,Crosshair,Radio,Target} from 'lucide-react';
import TerrainView,{CelestialRayLegend,MAST_EXAGGERATION,VERTICAL_EXAGGERATION} from './TerrainView';
import DateWindowPicker from './DateWindowPicker';
import MonthlyCompare from './MonthlyCompare';
import PositionPicker,{type EvaluatedPosition} from './PositionPicker';
import {demoSteps} from './RidgeDemo';
import {TimelineChart,HorizonChart} from './Charts';
import {StoryBar} from './Story';
import {ResultsPanel,OptimizerCard} from './Results';
import {Analysis,Bundle,Constraints,Link,keyFor,optimize,percent,sliceAnalysis,violations} from './lib/science';
import {buildStory,constraintRows,contrastIndex,explainRecommendation,heightSweep,hours,peakHeight,type Search,type StoryAction} from './lib/story';
const DEFAULT_CONSTRAINTS: Constraints = {minSun:70,minEarth:40,maxOutage:360,maxDistance:1000,maxSlope:20,requireLink:true};
const fmt=(n:number,d=1)=>n.toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
const windowDates=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const windowHours=new Intl.NumberFormat('en-US',{maximumFractionDigits:1});
const utc=(s:string)=>new Date(s).toLocaleString('en-GB',{timeZone:'UTC',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
type Tab='Landing Sites'|'Infrastructure Designer'|'Compare'|'Science & Sources';
const TABS:Tab[]=['Landing Sites','Infrastructure Designer','Compare','Science & Sources'];
const SOURCES=[{href:'https://pgda.gsfc.nasa.gov/products/78',label:'NASA LOLA · PGDA 78 · Site01 5 m DEM'},{href:'https://pgda.gsfc.nasa.gov/products/90',label:'NASA LOLA · PGDA 90 · regional 80 m'},{href:'https://ssd.jpl.nasa.gov/horizons/',label:'JPL Horizons · Sun & Earth ephemerides'}];
class SceneBoundary extends Component<{children:ReactNode},{error:boolean}>{state={error:false};static getDerivedStateFromError(){return {error:true};}render(){return this.state.error?<div className="scene-error"><Mountain/><p>3D rendering is unavailable on this device.</p><span>Use the station selector and scientific charts below.</span></div>:this.props.children;}}
function MetricBlock({label,value,unit,detail,color}:{label:string;value:string;unit:string;detail:string;color:string}){return <div className="metric-block"><span className={`eyebrow ${color}`}>{label}</span><div className="metric-number">{value}<small>{unit}</small></div><span className="metric-detail">{detail}</span></div>;}
function VisibilityWindow({analysis,id}:{analysis:Analysis;id:string}){
 const times=analysis.series.timestamp_utc;
 const dates=windowDates.formatRange(new Date(times[0]),new Date(times[times.length-1]));
 return <p id={id} className="visibility-window" aria-live="polite">{windowHours.format(analysis.metrics.sun.duration_hours)} h window · {dates} UTC</p>;
}
function App(){
 const [data,setData]=useState<Bundle|null>(null),[error,setError]=useState(''),[progress,setProgress]=useState<number|null>(null);
 const [tab,setTab]=useState<Tab>('Landing Sites'),[siteId,setSiteId]=useState('ridge-a'),[candidate,setCandidate]=useState('r256c256'),[height,setHeight]=useState(0);
 const [positionPreview,setPositionPreview]=useState<string|null>(null);
 const [start,setStart]=useState(''),[end,setEnd]=useState(''),[compareStart,setCompareStart]=useState(''),[compareEnd,setCompareEnd]=useState('');
 const [time,setTime]=useState(0),[playing,setPlaying]=useState(false),[wire,setWire]=useState(false),[mapView,setMapView]=useState(false),[reset,setReset]=useState(0);
 const [constraints,setConstraints]=useState<Constraints>(DEFAULT_CONSTRAINTS);
 const [demoStep,setDemoStep]=useState<number|null>(null);
 const [autoDemo,setAutoDemo]=useState(()=>new URLSearchParams(location.search).get('demo')==='1');
 const [search,setSearch]=useState<Search|null>(null),[searching,setSearching]=useState(false),[showConstraints,setShowConstraints]=useState(false),[notice,setNotice]=useState('');
 const searchTimer=useRef<number|undefined>(undefined);
 useEffect(()=>{const controller=new AbortController();(async()=>{
  const r=await fetch('/data/snapshot.json',{signal:controller.signal});
  if(!r.ok)throw new Error(`Scientific dataset could not be loaded (${r.status}).`);
  const total=Number(r.headers.get('content-length'))||0;let d:Bundle;
  if(r.body&&total&&!r.headers.get('content-encoding')){
   const reader=r.body.getReader(),chunks:Uint8Array[]=[];let got=0,shown=0;
   for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);got+=value.length;if(got/total-shown>.01){shown=got/total;setProgress(Math.min(1,shown));}}
   const bytes=new Uint8Array(got);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
   d=JSON.parse(new TextDecoder().decode(bytes));
  } else d=await r.json();
  if(!d.analyses?.length)throw new Error('The scientific cache contains no analyses.');
  setData(d);const s=d.analyses[0].series.timestamp_utc;setStart(s[0]);setEnd(s[s.length-1]);setCompareStart(s[0]);setCompareEnd(s[s.length-1]);setSiteId(d.sites[0].id);setCandidate(`r${d.sites[0].row}c${d.sites[0].col}`);
 })().catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[]);
 const all=useMemo(()=>{if(!data||!start||!end)return [];try{return data.analyses.map(a=>sliceAnalysis(a,start,end));}catch{return [];}},[data,start,end]);
 const site=data?.sites.find(s=>s.id===siteId);
 const siteCell=site?`r${site.row}c${site.col}`:'';
 const positions=useMemo<EvaluatedPosition[]>(()=>{const links=data?.links[siteId]??{};let n=0;return all.filter(a=>a.height_m===0).map(a=>{const lander=a.candidate_id===siteCell;if(!lander)n++;return {id:a.candidate_id,label:lander?'At lander':`Candidate ${String(n).padStart(2,'0')} · ${hours(Math.round(links[keyFor(a)]?.distance_m??0))} m away`,position:a.position};});},[all,data,siteId,siteCell]);
 const baseline=all.find(a=>a.position.row===site?.row&&a.position.col===site.col&&a.height_m===0);
 const selected=all.find(a=>a.candidate_id===candidate&&a.height_m===height)??baseline;
 const link=data?.links[siteId]?.[selected?keyFor(selected):''];
 const count=selected?.series.timestamp_utc.length??1;
 const siteSweep=useMemo(()=>heightSweep(all,siteCell),[all,siteCell]);
 const sitePeak=peakHeight(siteSweep);
 const focusIndex=useMemo(()=>{const target=siteSweep.find(a=>a.height_m===sitePeak);return target?contrastIndex(siteSweep[0],target):0;},[siteSweep,sitePeak]);
 useEffect(()=>{window.clearTimeout(searchTimer.current);setSearching(false);setTime(focusIndex);setSearch(null);setPlaying(false);},[start,end,siteId]);
 useEffect(()=>{setSearch(null);},[constraints]);
 useEffect(()=>{if(!playing)return;const id=window.setInterval(()=>setTime(t=>(t+4)%count),140);return()=>window.clearInterval(id);},[playing,count]);
 useEffect(()=>{if(!notice)return;const id=window.setTimeout(()=>setNotice(''),5200);return()=>window.clearTimeout(id);},[notice]);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setDemoStep(null);};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[]);
 const ridge = data?.sites.find(item => item.id === 'ridge-a');
 const sweep = useMemo(() => ridge&&data ? heightSweep(data.analyses,`r${ridge.row}c${ridge.col}`) : [], [data, ridge]);
 const plan = useMemo(() => demoSteps(sweep), [sweep]);
 const ridgeFocus = useMemo(() => { const peak = peakHeight(sweep), target = sweep.find(a => a.height_m === peak); return target ? contrastIndex(sweep[0], target) : 0; }, [sweep]);
 const performSearch=(analyses:Analysis[],links:Record<string,Link>,c:Constraints)=>{
  window.clearTimeout(searchTimer.current);setSearching(true);setSearch(null);setNotice('');
  searchTimer.current=window.setTimeout(()=>{const result=optimize(analyses,links,c);setSearch(result);setSearching(false);if(result.recommended){setCandidate(result.recommended.candidate_id);setHeight(result.recommended.height_m);setNotice(`Selected the lowest-cost feasible configuration from ${result.evaluated} evaluated configurations.`);}setTab('Infrastructure Designer');},650);
 };
 const showRidgeHeight = (nextHeight: number) => {
  if (!ridge || !sweep.length) return;
  const times = sweep[0].series.timestamp_utc;
  setSiteId(ridge.id);
  setCandidate(sweep[0].candidate_id);
  setStart(times[0]);
  setEnd(times[times.length - 1]);
  setHeight(nextHeight);
  setTab('Infrastructure Designer');
  setTime(ridgeFocus);
  setPlaying(false);
  setSearch(null);
  setNotice('');
 };
 const startDemo = () => {
  if (!ridge || !sweep.length) return;
  showRidgeHeight(plan[0].height ?? 0);
  setConstraints(DEFAULT_CONSTRAINTS);
  setShowConstraints(false);
  setMapView(false);
  setReset(r => r + 1);
  setDemoStep(0);
 };
 useEffect(() => {
  if (!autoDemo || !data || !ridge || !sweep.length) return;
  setAutoDemo(false);
  startDemo();
 }, [autoDemo, data, ridge, sweep]);
 useEffect(() => {
  if (demoStep === null || !data || !ridge || !sweep.length) return;
  const timer = window.setTimeout(() => {
   const next = demoStep + 1;
   if (next >= plan.length) {
    setDemoStep(null);
    return;
   }
   const nextHeight = plan[next].height;
   if (nextHeight !== null) setHeight(nextHeight);
   else performSearch(data.analyses, data.links[ridge.id], DEFAULT_CONSTRAINTS);
   setDemoStep(next);
  }, plan[demoStep].ms);
  return () => window.clearTimeout(timer);
 }, [demoStep, data, ridge, sweep, plan]);
 const feasible=useMemo(()=>{if(!search?.recommended||!data)return undefined;const links=data.links[siteId];return new Set(all.filter(a=>violations(a,links[keyFor(a)],constraints).length===0).map(a=>a.candidate_id));},[search,all,data,siteId,constraints]);
 const index=Math.min(time,count-1);
 if(error)return <div className="loading"><AlertTriangle/><h1>Scientific data unavailable</h1><p>{error}</p><p>No synthetic results have been substituted.</p><button onClick={()=>location.reload()}>Retry loading</button></div>;
 if(!data||!selected||!baseline||!site)return <div className="loading" role="status"><div className="brand">SITE<span>//</span>FORGE</div><p className="tagline">Don’t find the perfect landing site. Engineer one!</p><div className={`load-bar ${progress===null?'indeterminate':''}`}><span style={progress===null?undefined:{width:`${progress*100}%`}}/></div><small>{progress===null?'Loading precomputed NASA LOLA terrain and JPL Horizons geometry':`Loading precomputed NASA LOLA terrain and JPL Horizons geometry · ${Math.round(progress*100)}%`}</small></div>;
 const links=data.links[siteId];
 const times=data.analyses[0].series.timestamp_utc,days=times.filter((_,i)=>i%48===0);
 const heightsTested=[...new Set(all.map(a=>a.height_m))].sort((a,b)=>a-b);
 const selectedSweep=heightSweep(all,selected.candidate_id);
 const atSiteCell=selected.candidate_id===siteCell;
 const rows=constraintRows(selected,link,constraints);
 const story=buildStory({selected,baseline,sweep:selectedSweep,links,constraints,search,searching,evaluated:all.length});
 const extent=data.terrain.original_shape.map(n=>n*data.terrain.pixel_size_m/1000);
 const peakAnalysis=siteSweep.find(a=>a.height_m===sitePeak);
 const contrast=atSiteCell&&peakAnalysis&&index===focusIndex?(['sun','earth'] as const).filter(b=>!siteSweep[0].series[`${b}_visible`][index]&&peakAnalysis.series[`${b}_visible`][index]):[];
 const stopDemo=()=>setDemoStep(null);
 const chooseSite=(id:string)=>{setDemoStep(null);const s=data.sites.find(s=>s.id===id)!;setSiteId(id);setCandidate(`r${s.row}c${s.col}`);setHeight(0);setSearch(null);};
 const chooseCandidate=(id:string)=>{setDemoStep(null);setCandidate(id);setTab('Infrastructure Designer');setNotice('Station moved to the nearest evaluated terrain cell.');};
 const chooseHeight=(h:number)=>{setDemoStep(null);setHeight(h);setTab('Infrastructure Designer');setNotice(`Loaded the precomputed ${h} m terrain horizon; metrics re-integrated over the selected window.`);};
 const setWindow=(nextStart:string,nextEnd:string)=>{setDemoStep(null);setStart(nextStart);setEnd(nextEnd);};
 const setCompareWindow=(nextStart:string,nextEnd:string)=>{setCompareStart(nextStart);setCompareEnd(nextEnd);};
 const runSearch=()=>{setDemoStep(null);performSearch(all,links,constraints);};
 const onStoryAction=(a:StoryAction)=>{if(a.kind==='height')chooseHeight(a.height);else if(a.kind==='optimize')runSearch();else {setDemoStep(null);setCandidate(siteCell);setHeight(0);}};
 const exportResult=()=>{const blob=new Blob([JSON.stringify({analysis:selected,baseline,local_link:link,constraints,optimizer:search?{evaluated:search.evaluated,feasible:search.feasible,objective:'height/20 + distance/1000 + slope/90'}:null,methodology:data.methodology},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='site-forge-analysis.json';a.click();URL.revokeObjectURL(url);};
 const workspaceTab=tab==='Landing Sites'||tab==='Infrastructure Designer';
 const demo=demoStep===null?null:{step:demoStep,total:plan.length,label:plan[demoStep].label,ms:plan[demoStep].ms};
 return <div className={`app ${workspaceTab?'is-workspace':''} ${demoStep!==null?'is-demo':''}`}>
 <h1 className="sr-only">SITE//FORGE — lunar landing site engineering on real NASA terrain</h1>
 <header className="topbar">
  <button className="brand" onClick={()=>setTab('Landing Sites')} aria-label="SITE FORGE home">SITE<span>//</span>FORGE</button>
  <nav aria-label="Main navigation">{TABS.map(t=><button className={tab===t?'active':''} aria-current={tab===t?'page':undefined} key={t} onClick={()=>{setDemoStep(null);setTab(t);}}>{t}</button>)}</nav>
  <div className="top-actions">
   <button className="text-button" onClick={exportResult}><Download size={14}/>Export</button>
   <button className={`demo-button ${demoStep!==null?'running':''}`} onClick={demoStep === null ? startDemo : stopDemo}>{demoStep===null?<><Play size={13}/>Play 25 s demo</>:<><Pause size={13}/>Stop demo</>}</button>
  </div>
 </header>
 {workspaceTab&&<StoryBar story={story} demo={demo} onAction={onStoryAction} onStopDemo={stopDemo}/>}
 {tab==='Science & Sources'?<Science data={data}/>:tab==='Compare'?<MonthlyCompare sites={data.sites} renderNovember={()=><><div className="compare-intro"><p>Choose independent November 2026 windows at ground level. All times are UTC.</p></div><div className="compare-grid">{data.sites.map((s,i)=>{const raw=data.analyses.find(a=>a.position.row===s.row&&a.position.col===s.col&&a.height_m===0)!;const a=sliceAnalysis(raw,i===0?start:compareStart,i===0?end:compareEnd);return <article className="comparison" key={s.id}><div className="comparison-title"><div><h2>{s.name}</h2><small>{fmt(Math.abs(s.latitude_deg),5)}° S / {fmt(Math.abs(s.longitude_deg),5)}° W</small></div><span className="eyebrow">0 M AGL</span></div><DateWindowPicker days={days} start={i?compareStart:start} end={i?compareEnd:end} label={`${s.name} observation window`} onChange={i?setCompareWindow:setWindow}/><p className="micro">Cursor: {utc(a.series.timestamp_utc[Math.min(time,a.series.timestamp_utc.length-1)])} UTC</p><div className="comparison-metrics" aria-describedby={`${s.id}-visibility-window`}><VisibilityWindow analysis={a} id={`${s.id}-visibility-window`}/>{(['sun','earth','both'] as const).map(body=><MetricBlock key={body} label={body==='both'?'SIMULTANEOUS':body==='sun'?'SOLAR EXPOSURE':'EARTH VISIBILITY'} value={fmt(a.metrics[body].total_hours)} unit="h" detail={`${fmt(percent(a.metrics[body]),1)}% of window`} color={body}/>)}</div><TimelineChart analysis={a} index={Math.min(time,a.series.timestamp_utc.length-1)} onIndex={setTime} body="sun"/><TimelineChart analysis={a} index={Math.min(time,a.series.timestamp_utc.length-1)} onIndex={setTime} body="earth"/><dl className="facts"><div><dt>Longest solar outage</dt><dd>{fmt(a.metrics.sun.longest_outage_hours)} h</dd></div><div><dt>Longest Earth outage</dt><dd>{fmt(a.metrics.earth.longest_outage_hours)} h</dd></div><div><dt>Longest continuous Sun + Earth window</dt><dd>{fmt(a.metrics.both.longest_visible_hours)} h</dd></div><div><dt>Local slope</dt><dd>{fmt(a.position.slope_deg??0)}°</dd></div></dl><button className="secondary wide" onClick={()=>{chooseSite(s.id);setTab('Infrastructure Designer');}}>Engineer this site <ArrowRight size={15}/></button></article>;})}</div><p className="footnote">Curves share elapsed sample time from each window’s start; the shorter window stops at its endpoint. For matching dates, cursors show the same UTC instant. Each cursor’s timestamp is shown above.</p></>}/>:<>
 <main className="workspace">
 <aside className="controls" aria-label="Site, station and search controls">
  <div className="panel-heading"><span className="eyebrow">01 / Landing site</span><Telescope size={14}/></div>
  <label className="control-label">Site<select aria-label="Landing site" value={siteId} onChange={e=>chooseSite(e.target.value)}>{data.sites.map(s=><option key={s.id} value={s.id}>{s.name} · Connecting Ridge</option>)}</select></label>
  <div className="coordinate-readout"><span>{fmt(Math.abs(site.latitude_deg),5)}° S</span><span>{fmt(Math.abs(site.longitude_deg),5)}° W</span><span>{fmt(site.elevation_m,0)} m</span></div>
  <DateWindowPicker days={days} start={start} end={end} label="Observation window" onChange={setWindow}/>
  <div className="section-rule"/>
  <div className="panel-heading" title="One mast for solar exposure and direct-to-Earth line of sight"><span className="eyebrow">02 / Sun + Earth station</span><Radio size={14}/></div>
  <PositionPicker options={positions} value={selected.candidate_id} onPreview={setPositionPreview} onSelect={chooseCandidate}/>
  <span className="control-label" id="height-label">Mast height <span>{height} m</span></span>
  <div className="height-buttons" role="group" aria-labelledby="height-label">{heightsTested.map(h=><button key={h} aria-label={`Station height ${h} meters`} aria-pressed={height===h} className={height===h?'selected':''} onClick={()=>chooseHeight(h)}>{h}<small>m</small></button>)}</div>
  <div className="mini-info"><span>Cell {selected.position.row}, {selected.position.col} · slope {fmt(selected.position.slope_deg??0)}°</span><span>{link&&link.distance_m>=1?`${fmt(link.distance_m,0)} m from lander`:'At lander'}</span></div>
  <div className="section-rule"/>
  <div className="panel-heading"><span className="eyebrow">03 / Optimizer</span><Target size={14}/></div>
  <button className="constraints-toggle" aria-expanded={showConstraints} onClick={()=>setShowConstraints(!showConstraints)}><SlidersHorizontal size={14}/> Search constraints <span className="toggle-summary">Sun ≥{constraints.minSun}% · Earth ≥{constraints.minEarth}% · outage per resource ≤{constraints.maxOutage} h</span><ChevronDown size={14}/></button>
  {showConstraints&&<div className="constraint-fields">{([['minSun','Minimum solar exposure','%'],['minEarth','Minimum Earth visibility','%'],['maxOutage','Maximum outage per resource','h'],['maxDistance','Maximum distance','m'],['maxSlope','Maximum slope','°']] as const).map(([key,label,unit])=><label key={key}>{label}<div><input type="number" aria-label={label} aria-describedby={key==='maxOutage'?'resource-outage-help':undefined} min="0" max={key==='minSun'||key==='minEarth'?100:key==='maxSlope'?90:key==='maxDistance'?5000:744} value={constraints[key]} onChange={e=>setConstraints({...constraints,[key]:Math.max(0,Math.min(key==='minSun'||key==='minEarth'?100:key==='maxSlope'?90:key==='maxDistance'?5000:744,Number(e.target.value)))})}/><span>{unit}</span></div></label>)}<p id="resource-outage-help" className="fine">The longest Sun outage and the longest Earth outage must each stay within this limit.</p><label className="checkbox"><input type="checkbox" checked={constraints.requireLink} onChange={e=>setConstraints({...constraints,requireLink:e.target.checked})}/> Require local line of sight</label></div>}
  <button className={`primary wide ${searching?'is-busy':''}`} onClick={runSearch} disabled={searching}>{searching?'Evaluating configurations…':'Find optimal configuration'}<ArrowUpRight size={16}/></button>
  <p className="micro">{all.length} precomputed configurations · {positions.length} cells × {heightsTested.length} heights · finite search</p>
 </aside>
 <section className={`terrain-panel ${searching?'is-searching':''}`} aria-label="Interactive lunar terrain">
  <div className="scene"><SceneBoundary><TerrainView terrain={data.terrain} positions={positions} previewId={positionPreview} selected={selected} lander={site} time={index} onSelect={chooseCandidate} wireframe={wire} mapView={mapView} reset={reset} linkVisible={link?.visible??false} feasible={feasible} recommended={search?.recommended?.candidate_id}/></SceneBoundary></div>
  <div className="terrain-title"><span className="eyebrow">NASA LOLA · 5 m DEM</span><h2>Connecting Ridge <span>{site.name}</span></h2><CelestialRayLegend selected={selected} time={index}/></div>
  <ul className="map-legend" aria-label="Map legend">
   <li><i className="lg-station"/>Station mast</li><li><i className="lg-lander"/>Lander</li><li><i className="lg-cell"/>Evaluated cell</li>{feasible&&<li><i className="lg-feasible"/>Feasible cell</li>}
   <li><i className="lg-ray"/>In view <i className="lg-ray blocked"/>Blocked</li>
  </ul>
  <div className="map-tools"><button title="Reset camera" aria-label="Reset camera" onClick={()=>setReset(reset+1)}><RotateCcw size={16}/></button><button title="Toggle top view" aria-label="Toggle top view" aria-pressed={mapView} className={mapView?'selected':''} onClick={()=>setMapView(!mapView)}><Maximize2 size={16}/></button><button title="Toggle wireframe" aria-label="Toggle wireframe" aria-pressed={wire} className={wire?'selected':''} onClick={()=>setWire(!wire)}><Layers3 size={16}/></button></div>
  {notice&&<div className="toast" role="status" key={notice}>{notice}</div>}
  {searching&&<div className="scan" aria-hidden><span>Evaluating {all.length} configurations</span></div>}
  {search&&<OptimizerCard search={search} lines={explainRecommendation(search,all,links,constraints,baseline)} links={links} selectedKey={keyFor(selected)} onPick={a=>{setDemoStep(null);setCandidate(a.candidate_id);setHeight(a.height_m);}} onClose={()=>setSearch(null)}/>}
  <div className="map-foot"><span>Drag to orbit · scroll to zoom · click a cell to move the station</span><span>ROI {fmt(extent[1],2)} × {fmt(extent[0],2)} km · relief ×{VERTICAL_EXAGGERATION} · mast glyph ×{MAST_EXAGGERATION} · MOON_ME / DE421</span></div>
 </section>
 <ResultsPanel window={<VisibilityWindow analysis={selected} id="selected-visibility-window"/>} site={site.name} selected={selected} baseline={baseline} sweep={selectedSweep} link={link} rows={rows} constraints={constraints} onHeight={chooseHeight} recommended={search?.recommended?keyFor(search.recommended):undefined} onMethod={()=>setTab('Science & Sources')}/>
 </main>
 <section className="timeline" aria-label="Sun and Earth over time">
  <div className="timeline-side">
   <span className="eyebrow">04 / Time</span>
   <div className="time-current"><button aria-label={playing?'Pause timeline':'Play timeline'} onClick={()=>setPlaying(!playing)}>{playing?<Pause size={14}/>:<Play size={14}/>}</button><div><b>{utc(selected.series.timestamp_utc[index])}</b><small>2026 · UTC</small></div>{focusIndex>0&&atSiteCell&&<button className="jump" title="Jump to the contrast instant" aria-label="Jump to the contrast instant" onClick={()=>{setPlaying(false);setTime(focusIndex);}}><Crosshair size={14}/></button>}</div>
   {contrast.length>0?<p className="contrast-note">Contrast instant: {contrast.map(b=>b==='sun'?'Sun':'Earth').join(' and ')} blocked at 0 m, in view at {sitePeak} m.</p>:<p className="micro">Hover a chart or drag the slider to scrub through the window.</p>}
  </div>
  <div className="timeline-plots">
   <div className="chart-grid"><TimelineChart analysis={selected} index={index} onIndex={setTime} body="sun" baseline={baseline} baselineLabel="0 m" currentLabel={`${selected.height_m} m`}/><TimelineChart analysis={selected} index={index} onIndex={setTime} body="earth" baseline={baseline} baselineLabel="0 m" currentLabel={`${selected.height_m} m`}/></div>
   <input className="time-slider" aria-label="Timeline time" type="range" min="0" max={count-1} value={index} onChange={e=>{setTime(Number(e.target.value));setPlaying(false);}}/>
   <div className="time-labels"><span>{utc(start)} UTC</span><ul className="timeline-legend"><li><i className="lg-line solid"/>Body elevation</li><li><i className="lg-line"/>Terrain horizon at body azimuth</li>{keyFor(selected)!==keyFor(baseline)&&<li><i className="lg-line dotted"/>Ground-level horizon</li>}<li><i className="lg-band"/>Visible intervals</li></ul><span>{utc(end)} UTC</span></div>
  </div>
  <div className="timeline-horizon">
   <div className="block-head"><span>360° horizon at cursor</span><span>{selected.height_m} m mast</span></div>
   <HorizonChart analysis={selected} index={index} baseline={baseline}/>
   <div className="horizon-legend"><span><i className="lg-line"/>Horizon at {selected.height_m} m</span>{keyFor(selected)!==keyFor(baseline)&&<span><i className="lg-line dotted"/>Ground level</span>}<span><i className="dot-fill"/>In view <i className="dot-ring"/>Blocked</span></div>
  </div>
 </section>
 </>}
 <footer>
  <span className="foot-brand">SITE<span>//</span>FORGE<em>Don’t find the perfect landing site. Engineer one!</em></span>
  <p className="geometry-note"><AlertTriangle size={13}/><span><b>Geometric line-of-sight only.</b> Not a radio link budget, not electrical power, not mission certification.</span></p>
  <nav className="footer-sources" aria-label="Data sources"><span>Data</span>{SOURCES.map(s=><a key={s.href} href={s.href} target="_blank" rel="noreferrer">{s.label}</a>)}</nav>
  <button onClick={()=>setTab('Science & Sources')}>Methods & limitations <ArrowUpRight size={12}/></button>
 </footer>
 </div>;
}
function Science({data}:{data:Bundle}){return <section className="science-page"><article><h1>Observations first.<br/>Engineering assumptions, explicit.</h1><p className="lead">This is a bounded geometric study of two locations on Connecting Ridge near the lunar south pole. The terrain comes from NASA LOLA; Sun and Earth directions come from JPL Horizons. Changing a station selects a newly calculated horizon, never an invented improvement.</p><div className="method-steps"><div><b>01</b><h3>Measure the terrain</h3><p>A real 5 m DEM in MOON_ME/DE421 supplies elevation and coordinates. The visual mesh is reduced to 20 m spacing; scientific calculations retain the documented terrain sampling. The scene uses {VERTICAL_EXAGGERATION}× vertical exaggeration. Horizon and visibility calculations use the original elevations.</p></div><div><b>02</b><h3>Reconstruct the horizon</h3><p>Terrain is converted to spherical body-fixed Cartesian coordinates. Elevation angles use true local east, north and up, including lunar curvature. Obstacles are accumulated into azimuth sectors.</p></div><div><b>03</b><h3>Compare angular elevations</h3><p>A body’s center is visible when its elevation exceeds the terrain horizon at its azimuth. Samples are 30 minutes apart. Each sample represents the interval until the next; the final endpoint adds no extra time.</p></div><div><b>04</b><h3>Search the finite grid</h3><p>The optimizer checks all cached candidate and height combinations against your hard constraints. Feasible configurations are ranked by height/20 + distance/1000 + slope/90. This is an engineering preference, not money, mass or mission certification.</p></div></div><h3>What the model does not establish</h3><ul>{data.methodology.limitations.map((t,i)=><li key={i}>{t}</li>)}<li>DEM interpolation and angular sampling introduce uncertainty. Thirty-minute output does not imply thirty-minute accuracy.</li><li>Local links use a 2 m lander reference and terrain clearance. Antenna gain, frequency, Fresnel zones, radio power and station orientation are not modeled.</li><li>Nearby candidate directions are rotated into their own true local frame; small translational parallax is bounded in the exported provenance.</li><li>The IM-2 landing coordinates lie outside this local dataset. Connecting Ridge is not presented as the IM-2 landing location.</li><li>In the 3D view the station mast glyph is stretched {MAST_EXAGGERATION}× (beyond the {VERTICAL_EXAGGERATION}× relief) so metre-scale heights remain visible.</li></ul><h3>NASA data and primary references</h3><div className="source-list">{data.methodology.sources.map(s=><a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.name}<ExternalLink size={16}/></a>)}</div><details><summary>Inspect dataset provenance</summary><pre>{JSON.stringify(data.methodology.provenance,null,2)}</pre></details><p className="footnote">Implemented with assistance from OpenAI Codex. SITE//FORGE is an independent prototype; no NASA endorsement or operational mission certification is implied.</p></article><aside><div className="science-stamp"><Mountain size={36}/><span className="eyebrow">CONNECTING RIDGE</span><strong>89.46° S</strong></div><dl className="facts"><div><dt>Reference sphere</dt><dd>1,737.4 km</dd></div><div><dt>Local DEM</dt><dd>5 m / pixel</dd></div><div><dt>Mesh display</dt><dd>20 m / vertex</dd></div><div><dt>Time resolution</dt><dd>30 minutes</dd></div><div><dt>Observer heights</dt><dd>0 / 2 / 5 / 10 / 20 m</dd></div><div><dt>Cached configurations</dt><dd>{data.analyses.length}</dd></div></dl><p className="micro">Every result remains usable without a live NASA API connection. New terrain, dates outside the cache, or new candidate positions require regeneration of the scientific dataset.</p></aside></section>;}
export default App;
