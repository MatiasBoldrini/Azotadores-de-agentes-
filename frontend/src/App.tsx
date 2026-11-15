import {useState,useEffect,useLayoutEffect,useMemo,useRef,Component,ReactNode} from 'react';
import {ArrowUpRight,ArrowRight,ChevronDown,Layers3,RotateCcw,Maximize2,SlidersHorizontal,Play,Pause,AlertTriangle,Download,Mountain,ExternalLink,Crosshair,Telescope,ArrowUp,Orbit} from 'lucide-react';
import MastPanorama from './MastPanorama';
import {SKY_DOME_CAPTION} from './SkyDome';
import {raiseSequence} from './lib/skyDome';
import TerrainView,{MAST_EXAGGERATION,VERTICAL_EXAGGERATION,TerrainScope,terrainMean} from './TerrainView';
import {siteFrame,viewAzimuth} from './moon/frame';
import {loadSite01} from './site01';
import {PRODUCT_NAME,TAGLINE} from './brand';
import DateWindowPicker from './DateWindowPicker';
import CompareUtcWindow from './CompareUtcWindow';
import MonthlyCompare from './MonthlyCompare';
import PositionPicker,{type EvaluatedPosition} from './PositionPicker';
import {demoSteps} from './RidgeDemo';
import DesignerAnalysisPanels,{HorizonPanel} from './DesignerAnalysisPanels';
import {TimelineChart,TimelineStack} from './Charts';
import {StoryBar} from './Story';
import {ResultsPanel,OptimizerCard} from './Results';
import MoonLanding,{type MoonMode} from './moon/MoonLanding';
import {Analysis,Bundle,Constraints,Link,keyFor,optimize,percent,violations} from './lib/science';
import {maxObservationHours, observationDays, shardsForWindow} from './lib/observationEphemeris';
import MissionOps from './MissionOps';
import {timelineCsv} from './lib/missionOps';
import {decodeShareState,encodeShareState,type ShareState,type ShareView} from './lib/shareLink';
import {useObservationWindow} from './useObservationWindow';
import {buildStory,constraintRows,contrastIndex,explainRecommendation,heightSweep,hours,peakHeight,type Search,type StoryAction} from './lib/story';
const DEFAULT_CONSTRAINTS: Constraints = {minSun:70,minEarth:40,maxOutage:360,maxDistance:1000,maxSlope:20,requireLink:true};
const fmt=(n:number,d=1)=>n.toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
const windowHours=new Intl.NumberFormat('en-US',{maximumFractionDigits:1});
const utc=(s:string)=>new Date(s).toLocaleString('en-GB',{timeZone:'UTC',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
type Tab='Landing Sites'|'Infrastructure Designer'|'Compare'|'Science & Sources';
const TABS:Tab[]=['Landing Sites','Infrastructure Designer','Compare','Science & Sources'];
const SHORT_TABS:Record<Tab,string>={'Landing Sites':'Sites','Infrastructure Designer':'Designer','Compare':'Compare','Science & Sources':'Science'};
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const ANALYSIS_DOCK_MEDIA='(width > 900px)';
const MOON_IMAGERY_SOURCES=[
 {href:'https://www.lroc.asu.edu/',label:'NASA/GSFC/Arizona State University (LROC)'},
 {href:'https://svs.gsfc.nasa.gov/4720',label:'NASA SVS CGI Moon Kit'},
];
class SceneBoundary extends Component<{children:ReactNode},{error:boolean}>{state={error:false};static getDerivedStateFromError(){return {error:true};}render(){return this.state.error?<div className="scene-error"><Mountain/><p>3D rendering is unavailable on this device.</p><span>Use the station selector and scientific charts.</span></div>:this.props.children;}}
function MetricBlock({label,value,unit,detail,color}:{label:string;value:string;unit:string;detail:ReactNode;color:string}){return <div className="metric-block"><span className={`eyebrow ${color}`}>{label}</span><div className="metric-number">{value}<small>{unit}</small></div><span className="metric-detail">{detail}</span></div>;}
function App(){
 const [data,setData]=useState<Bundle|null>(null),[error,setError]=useState(''),[progress,setProgress]=useState<number|null>(null);
 const [tab,setTab]=useState<Tab>('Landing Sites'),[siteId,setSiteId]=useState('ridge-a'),[candidate,setCandidate]=useState('r256c256'),[height,setHeight]=useState(0);
 const [positionPreview,setPositionPreview]=useState<string|null>(null);
 const [compareTime,setCompareTime]=useState(0);
 const designer=useObservationWindow(data?.analyses??[]);
 const comparisonLeft=useMemo(()=>data?.analyses.filter(a=>a.height_m===0&&a.position.row===data.sites[0].row&&a.position.col===data.sites[0].col)??[],[data]);
 const comparisonRight=useMemo(()=>data?.analyses.filter(a=>a.height_m===0&&a.position.row===data.sites[1].row&&a.position.col===data.sites[1].col)??[],[data]);
 const compareA=useObservationWindow(comparisonLeft);
 const compareB=useObservationWindow(comparisonRight);
 const {start,end,analyses:all}=designer.window;
 const [time,setTime]=useState(0),[playing,setPlaying]=useState(false),[wire,setWire]=useState(false),[mapView,setMapView]=useState(false),[reset,setReset]=useState(0);
 const [constraints,setConstraints]=useState<Constraints>(DEFAULT_CONSTRAINTS);
 const [demoStep,setDemoStep]=useState<number|null>(null);
 const [autoDemo,setAutoDemo]=useState(()=>new URLSearchParams(location.search).get('demo')==='1');
 const [moon,setMoon]=useState<MoonMode>(()=>new URLSearchParams(location.search).get('demo')==='1'?'site':'globe'),[descend,setDescend]=useState(false);
 const focusRef=useRef<HTMLDivElement>(null);
 const timelineRef=useRef<HTMLElement>(null);
 const [showAnalysisDock,setShowAnalysisDock]=useState(()=>matchMedia(ANALYSIS_DOCK_MEDIA).matches);
 useEffect(()=>{
  const query=matchMedia(ANALYSIS_DOCK_MEDIA);
  const update=()=>setShowAnalysisDock(query.matches);
  update();
  query.addEventListener('change',update);
  return()=>query.removeEventListener('change',update);
 },[]);
 const configureRef=useRef<HTMLDivElement>(null),configureButton=useRef<HTMLButtonElement>(null);
 const configurePanel=useRef<HTMLDivElement>(null);
 const [showConfigure,setShowConfigure]=useState(false);
 const [showReferences,setShowReferences]=useState(true);
 const [showPanorama,setShowPanorama]=useState(false);
 const [showSky,setShowSky]=useState(true),[raising,setRaising]=useState(false);
 const [search,setSearch]=useState<Search|null>(null),[searching,setSearching]=useState(false),[showConstraints,setShowConstraints]=useState(false),[notice,setNotice]=useState('');
 const searchTimer=useRef<number|undefined>(undefined);
 const [linkCopied,setLinkCopied]=useState(false);
 const pendingAt=useRef<string|null>(null);
 const pendingShare=useRef<Partial<ShareState>|null|undefined>(undefined);
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
  setData(d);setSiteId(d.sites[0].id);setCandidate(`r${d.sites[0].row}c${d.sites[0].col}`);
 })().catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[]);
 useEffect(()=>{loadSite01();},[]);
 const frame=useMemo(()=>{
  if(!data)return null;const t=data.terrain,i=t.original_shape[0]/2/t.stride,j=t.original_shape[1]/2/t.stride;
  // Faces what is in view at the opening instant of the first site; fixed afterwards so the terrain is built once.
  const sweep=heightSweep(data.analyses,`r${data.sites[0].row}c${data.sites[0].col}`),peak=sweep.find(a=>a.height_m===peakHeight(sweep));
  return siteFrame(t.latitude_deg[i][j],t.longitude_deg[i][j],terrainMean(t),viewAzimuth(sweep[0].series,peak?contrastIndex(sweep[0],peak):0));
 },[data]);
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
 useEffect(()=>{window.clearTimeout(searchTimer.current);setSearching(false);setTime(focusIndex);setSearch(null);setPlaying(false);},[start,end,siteId,focusIndex]);
 useEffect(()=>{
  // A shared link's cursor time is applied once its window is loaded, after the window reset above.
  const at=pendingAt.current,shared=pendingShare.current;if(!at||!selected)return;
  if(shared?.start&&shared.end&&(Date.parse(shared.start)!==Date.parse(start)||Date.parse(shared.end)!==Date.parse(end)))return;
  const target=Date.parse(at),i=selected.series.timestamp_utc.findIndex(t=>Date.parse(t)===target);
  pendingAt.current=null;
  if(i>=0)setTime(i);
 },[selected,start,end,siteId,focusIndex]);
 useEffect(()=>{setSearch(null);},[constraints]);
 useEffect(()=>{
  if(!data||pendingShare.current!==undefined)return;
  const shared=decodeShareState(location.search,{sites:data.sites.map(s=>s.id),heights:[...new Set(data.analyses.map(a=>a.height_m))],validWindow:(a,b)=>{shardsForWindow(a,b);return true;}});
  pendingShare.current=shared;
  if(!shared)return;
  const s=data.sites.find(x=>x.id===shared.site)??data.sites[0];
  setSiteId(s.id);
  setCandidate(shared.cell&&data.analyses.some(a=>a.candidate_id===shared.cell)?shared.cell:`r${s.row}c${s.col}`);
  if(shared.mast!==undefined)setHeight(shared.mast);
  if(shared.start&&shared.end)void designer.select(shared.start,shared.end);
  if(shared.at)pendingAt.current=shared.at;
  const view=shared.view;
  if(view&&view!=='globe'){setMoon('site');setTab(view==='designer'?'Infrastructure Designer':view==='compare'?'Compare':view==='science'?'Science & Sources':'Landing Sites');}
 },[data]);
 useLayoutEffect(()=>{
  if(!showConfigure||!showAnalysisDock)return;
  const panel=configurePanel.current,button=configureButton.current;
  if(!panel||!button)return;
  const viewport=window.visualViewport;
  const position=()=>{
   const anchor=button.getBoundingClientRect();
   const left=(viewport?.offsetLeft??0)+12;
   const top=(viewport?.offsetTop??0)+12;
   const bottom=top+(viewport?.height??window.innerHeight)-24;
   const right=left+(viewport?.width??document.documentElement.clientWidth)-24;
   const menuTop=Math.max(top,anchor.bottom+8);
   panel.style.maxWidth=`${right-left}px`;
   panel.style.maxHeight=`${Math.max(0,bottom-menuTop)}px`;
   panel.style.left=`${Math.max(left,Math.min(anchor.right,right)-panel.offsetWidth)}px`;
   panel.style.top=`${menuTop}px`;
  };
  panel.showPopover();
  position();
  window.addEventListener('scroll',position,true);
  window.addEventListener('resize',position);
  viewport?.addEventListener('scroll',position);
  viewport?.addEventListener('resize',position);
  return()=>{
   if(panel.matches(':popover-open'))panel.hidePopover();
   window.removeEventListener('scroll',position,true);
   window.removeEventListener('resize',position);
   viewport?.removeEventListener('scroll',position);
   viewport?.removeEventListener('resize',position);
  };
 },[showAnalysisDock,showConfigure]);
 useEffect(()=>{
  if(!showConfigure)return;
  const closeOutside=(event:PointerEvent)=>{
   if(!configureRef.current?.contains(event.target as Node))setShowConfigure(false);
  };
  const closeOnEscape=(event:KeyboardEvent)=>{
   if(event.key!=='Escape'||event.defaultPrevented)return;
   setShowConfigure(false);
   configureButton.current?.focus({preventScroll:true});
  };
  document.addEventListener('pointerdown',closeOutside);
  window.addEventListener('keydown',closeOnEscape);
  return()=>{
   document.removeEventListener('pointerdown',closeOutside);
   window.removeEventListener('keydown',closeOnEscape);
  };
 },[showConfigure]);
 useEffect(()=>{if(!playing)return;const id=window.setInterval(()=>setTime(t=>(t+4)%count),140);return()=>window.clearInterval(id);},[playing,count]);
 useEffect(()=>{
  if(!raising)return;
  const heights=raiseSequence(all.filter(a=>a.candidate_id===candidate).map(a=>a.height_m)),next=heights.find(h=>h>height);
  if(next===undefined){setRaising(false);return;}
  const id=window.setTimeout(()=>setHeight(next),reducedMotion()?400:1500);
  return()=>window.clearTimeout(id);
 },[raising,height,all,candidate]);
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
  window.clearTimeout(searchTimer.current);
  setSearching(false);
  const times = sweep[0].series.timestamp_utc;
  setSiteId(ridge.id);
  setCandidate(sweep[0].candidate_id);
  void designer.select(times[0],times[times.length - 1]);
  setHeight(nextHeight);
  setTab('Infrastructure Designer');
  setMoon('site');
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
  setShowConfigure(false);
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
 const stopDemo=()=>setDemoStep(null);
 const flyTo=(id:string)=>{
  const s=data?.sites.find(x=>x.id===id);if(!s)return;
  setDemoStep(null);setTab('Landing Sites');setDescend(false);
  if(id!==siteId){setSiteId(id);setCandidate(`r${s.row}c${s.col}`);setHeight(0);setSearch(null);}
  window.scrollTo(0,0);
  setMoon(reducedMotion()?'site':'in');
 };
 const backToMoon=()=>{setShowConfigure(false);setDemoStep(null);setPlaying(false);setDescend(false);setTab('Landing Sites');setMoon(reducedMotion()?'globe':'out');};
 const openTab=(t:Tab)=>{setDemoStep(null);if(t==='Landing Sites'){if(moon==='site')backToMoon();return;}if(t!=='Infrastructure Designer')setShowConfigure(false);setTab(t);setMoon('site');};
 const workspaceTab=tab==='Landing Sites'||tab==='Infrastructure Designer';
 const ready=Boolean(data&&selected&&baseline&&site);
 const shell=(content:ReactNode,actions?:ReactNode)=><div className={`app moon-${moon} ${workspaceTab&&moon!=='globe'?'is-workspace':''} ${demoStep!==null?'is-demo':''}`}>
  <h1 className="sr-only">{PRODUCT_NAME} — {TAGLINE}</h1>
  <header className="topbar">
   <button className="brand" onClick={()=>moon==='site'&&backToMoon()} aria-label={`${PRODUCT_NAME}, back to the Moon`}>{PRODUCT_NAME}</button>
   <nav aria-label="Main navigation">{TABS.map(t=><button className={tab===t?'active':''} aria-label={t} aria-current={tab===t?'page':undefined} key={t} onClick={()=>openTab(t)}><span className="tab-full">{t}</span><span className="tab-short" aria-hidden="true">{SHORT_TABS[t]}</span></button>)}</nav>
   <div className="top-actions">
    {actions}
    <button className={`demo-button ${demoStep!==null?'running':''}`} disabled={!ready} onClick={demoStep === null ? startDemo : stopDemo}>{demoStep===null?<><Play size={13}/>Play 25 s demo</>:<><Pause size={13}/>Stop demo</>}</button>
   </div>
  </header>
  <MoonLanding sites={data?.sites??[]} frame={frame} ready={ready} progress={progress} error={error} mode={moon} onFly={flyTo} onCompare={()=>openTab('Compare')} onTile={()=>setDescend(true)} onArrive={()=>{setMoon('site');setDescend(false);}} onLeft={()=>setMoon('globe')}/>
  {content}
 </div>;
 if(error)return shell(moon==='globe'?null:<div className="loading"><AlertTriangle/><h2>Scientific data unavailable</h2><p>{error}</p><p>No synthetic results have been substituted.</p><button onClick={()=>location.reload()}>Retry loading</button></div>);
 if(!data||!selected||!baseline||!site||!frame)return shell(moon==='globe'?null:<div className="loading" role="status"><div className="brand">{PRODUCT_NAME}</div><p className="tagline">{TAGLINE}</p><div className={`load-bar ${progress===null?'indeterminate':''}`}><span style={progress===null?undefined:{width:`${progress*100}%`}}/></div><small>{progress===null?'Loading precomputed NASA LOLA terrain and JPL Horizons geometry':`Loading precomputed NASA LOLA terrain and JPL Horizons geometry · ${Math.round(progress*100)}%`}</small></div>);
 const links=data.links[siteId];
 const heightsTested=[...new Set(all.map(a=>a.height_m))].sort((a,b)=>a-b);
 const selectedSweep=heightSweep(all,selected.candidate_id);
 const atSiteCell=selected.candidate_id===siteCell;
 const rows=constraintRows(selected,link,constraints);
 const story=buildStory({selected,baseline,sweep:selectedSweep,links,constraints,search,searching,evaluated:all.length});
 const chooseSite=(id:string)=>{setDemoStep(null);const s=data.sites.find(s=>s.id===id)!;setSiteId(id);setCandidate(`r${s.row}c${s.col}`);setHeight(0);setSearch(null);};
 const chooseCandidate=(id:string)=>{setDemoStep(null);setCandidate(id);setTab('Infrastructure Designer');setNotice('Station moved to the nearest evaluated terrain cell.');};
 const raiseMast=()=>{setDemoStep(null);setPlaying(false);setMapView(false);setShowSky(true);setHeight(heightsTested[0]??0);setRaising(true);setNotice('Raising the mast through each tested height. Each step loads that height’s own LOLA horizon.');};
 const skyBase=selectedSweep[0];
 const gainedSun=selected.metrics.sun.total_hours-skyBase.metrics.sun.total_hours,gainedEarth=selected.metrics.earth.total_hours-skyBase.metrics.earth.total_hours;
 const chooseHeight=(h:number)=>{setDemoStep(null);setRaising(false);setHeight(h);setTab('Infrastructure Designer');setNotice(`Loaded the precomputed ${h} m terrain horizon; metrics re-integrated over the selected window.`);};
 const setWindow=(nextStart:string,nextEnd:string)=>{
  setDemoStep(null);
  window.clearTimeout(searchTimer.current);
  setSearching(false);
  void designer.select(nextStart,nextEnd);
 };
 const runSearch=()=>{if(searching||designer.status==='loading')return;setShowConfigure(false);setDemoStep(null);performSearch(all,links,constraints);};
 const onStoryAction=(a:StoryAction)=>{if(a.kind==='height')chooseHeight(a.height);else runSearch();};
 const exportCsv=()=>{const csv=timelineCsv(selected,{siteName:site.name,candidateId:selected.candidate_id,heightM:selected.height_m,sources:data.methodology.sources});const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download=`selenarc-${site.id}-${selected.height_m}m-${start.slice(0,10)}_${end.slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);};
 const shareView:ShareView=moon==='globe'?'globe':tab==='Infrastructure Designer'?'designer':tab==='Compare'?'compare':tab==='Science & Sources'?'science':'site';
 const copyLink=()=>{
  const query=encodeShareState({site:siteId,cell:selected.candidate_id===siteCell?undefined:selected.candidate_id,mast:selected.height_m,start,end,at:selected.series.timestamp_utc[index],view:shareView});
  const url=`${location.origin}${location.pathname}?${query}`;
  history.replaceState(null,'',`?${query}`);
  const done=()=>{setLinkCopied(true);setNotice('Link copied: site, station, mast height, window, time and view.');window.setTimeout(()=>setLinkCopied(false),2400);};
  if(navigator.clipboard?.writeText)navigator.clipboard.writeText(url).then(done,()=>setNotice(`Copy this link: ${url}`));else setNotice(`Copy this link: ${url}`);
 };
 const exportResult=()=>{const blob=new Blob([JSON.stringify({analysis:selected,baseline,local_link:link,constraints,optimizer:search?{evaluated:search.evaluated,feasible:search.feasible,objective:'height/20 + distance/1000 + slope/90'}:null,methodology:data.methodology},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='selenarc-analysis.json';a.click();URL.revokeObjectURL(url);};

 const demo=demoStep===null?null:{step:demoStep,total:plan.length,label:plan[demoStep].label,ms:plan[demoStep].ms};
 const stage=moon==='globe'?'hidden':moon==='in'?(descend?'descend':'arrive'):moon==='out'?'leave':'on';
 const compare=<MonthlyCompare sites={data.sites} renderTimelines={()=><>
  <div className="compare-intro"><p>Choose independent UTC windows at ground level.</p></div>
  <div className="compare-grid">
   {data.sites.map((site, i)=>{
    const comparison = i===0 ? compareA : compareB;
    const analysis = comparison.window.analyses[0];
    const timestamps = analysis.series.timestamp_utc;
    const windowStart = timestamps[0], windowEnd = timestamps[timestamps.length-1];
    const cursor = Math.min(compareTime, timestamps.length-1);
    return <article className="comparison" key={site.id}>
     <div className="comparison-title">
      <div><h2>{site.name}</h2><small>{fmt(Math.abs(site.latitude_deg),5)}° S / {fmt(Math.abs(site.longitude_deg),5)}° W</small></div>
      <span className="eyebrow">0 M AGL</span>
     </div>
     <DateWindowPicker days={observationDays} start={windowStart} end={windowEnd} label={`${site.name} observation window`} onChange={comparison.select} status={comparison.status}/>
     <p className="micro">Cursor: {utc(timestamps[cursor])} UTC</p>
     <div className="comparison-metrics">
      {(['sun','earth','both'] as const).map(body=>{
       const metric = analysis.metrics[body];
       return <MetricBlock
        key={body}
        label={body==='both'?'SIMULTANEOUS':body==='sun'?'SOLAR EXPOSURE':'EARTH VISIBILITY'}
        value={fmt(metric.total_hours)}
        unit="h"
        detail={<>
         {fmt(percent(metric),1)}% of {windowHours.format(metric.duration_hours)}&nbsp;h
         <CompareUtcWindow start={windowStart} end={windowEnd}/>
        </>}
        color={body}
       />;
      })}
     </div>
     <TimelineChart analysis={analysis} index={cursor} onIndex={setCompareTime} body="sun"/>
     <TimelineChart analysis={analysis} index={cursor} onIndex={setCompareTime} body="earth"/>
     <dl className="facts">
      <div><dt>Longest solar outage</dt><dd>{fmt(analysis.metrics.sun.longest_outage_hours)} h</dd></div>
      <div><dt>Longest Earth outage</dt><dd>{fmt(analysis.metrics.earth.longest_outage_hours)} h</dd></div>
      <div><dt>Longest continuous Sun + Earth window</dt><dd>{fmt(analysis.metrics.both.longest_visible_hours)} h</dd></div>
      <div><dt>Local slope</dt><dd>{fmt(analysis.position.slope_deg??0)}°</dd></div>
     </dl>
     <button className="secondary wide" onClick={()=>{chooseSite(site.id);setTab('Infrastructure Designer');}}>Engineer this site <ArrowRight size={15}/></button>
    </article>;
   })}
  </div>
  <p className="footnote">Curves share elapsed sample time from each window’s start; the shorter window stops at its endpoint. For matching dates, cursors show the same UTC instant. Each cursor’s timestamp is shown above.</p>
 </>}/>;
 const timelineTimestamp=selected.series.timestamp_utc[index];
 const timelineDate=`${utc(timelineTimestamp)} · ${timelineTimestamp.slice(0,4)} UTC`;
 const playback=<div className="timeline-controls">
  <button type="button" aria-label={playing?'Pause timeline':'Play timeline'} onClick={()=>setPlaying(!playing)}>{playing?<Pause size={14}/>:<Play size={14}/>}</button>
  {focusIndex>0&&atSiteCell&&<button type="button" className="jump" title="Jump to the contrast instant" aria-label="Jump to the contrast instant" onClick={()=>{setPlaying(false);setTime(focusIndex);}}><Crosshair size={14}/></button>}
 </div>;
 const configure=
 <div className="map-config" ref={configureRef}>
  <button type="button" ref={configureButton} className={showAnalysisDock?'text-button configure-button':'secondary'} aria-expanded={showConfigure} aria-controls="map-configuration" onClick={()=>setShowConfigure(!showConfigure)}><SlidersHorizontal size={14} aria-hidden="true"/>Configure</button>
  <div ref={configurePanel} className="map-config-panel glass" id="map-configuration"
   popover={showAnalysisDock?'manual':undefined} hidden={!showConfigure}>
   {showConfigure&&<>
    <h2 className="panel-title"><label htmlFor="landing-site">Landing site</label></h2>
    <select id="landing-site" value={siteId} onChange={e=>chooseSite(e.target.value)}>{data.sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
    <DateWindowPicker days={observationDays} start={start} end={end} label="Observation window" onChange={setWindow} status={designer.status}/>
    <div className="section-rule"/>
    <h2 className="panel-title">Station</h2>
    <PositionPicker options={positions} value={selected.candidate_id} onPreview={setPositionPreview} onSelect={chooseCandidate}/>
    <span className="control-label" id="height-label">Mast height</span>
    <div className="height-buttons" role="group" aria-labelledby="height-label">{heightsTested.map(h=><button key={h} aria-label={`Station height ${h} meters`} aria-pressed={height===h} className={height===h?'selected':''} onClick={()=>chooseHeight(h)}>{h}<small>m</small></button>)}</div>
    <details className="panel-details">
     <summary>Station cell details</summary>
     <p>Cell {selected.position.row}, {selected.position.col} · slope {fmt(selected.position.slope_deg??0)}°</p>
    </details>
    <div className="section-rule"/>
    <button className="constraints-toggle" aria-expanded={showConstraints} aria-controls="search-constraints" onClick={()=>setShowConstraints(!showConstraints)}><SlidersHorizontal size={14}/> Search constraints <ChevronDown size={14}/></button>
    <div className="constraint-fields" id="search-constraints" hidden={!showConstraints}>{([['minSun','Minimum solar exposure','%'],['minEarth','Minimum Earth visibility','%'],['maxOutage','Maximum outage per resource','h'],['maxDistance','Maximum distance','m'],['maxSlope','Maximum slope','°']] as const).map(([key,label,unit])=><label key={key}>{label}<div><input type="number" aria-label={label} aria-describedby={key==='maxOutage'?'resource-outage-help':undefined} min="0" max={key==='minSun'||key==='minEarth'?100:key==='maxSlope'?90:key==='maxDistance'?5000:maxObservationHours} value={constraints[key]} onChange={e=>setConstraints({...constraints,[key]:Math.max(0,Math.min(key==='minSun'||key==='minEarth'?100:key==='maxSlope'?90:key==='maxDistance'?5000:maxObservationHours,Number(e.target.value)))})}/><span>{unit}</span></div></label>)}<p id="resource-outage-help" className="fine">The longest Sun outage and the longest Earth outage must each stay within this limit.</p><label className="checkbox"><input type="checkbox" checked={constraints.requireLink} onChange={e=>setConstraints({...constraints,requireLink:e.target.checked})}/> Require local line of sight</label><p className="fine">{all.length} precomputed configurations across {positions.length} cells and {heightsTested.length} heights.</p></div>
   </>}
  </div>
 </div>;
 const results=<ResultsPanel selected={selected} baseline={baseline} sweep={selectedSweep} link={link} rows={rows} constraints={constraints} onHeight={chooseHeight} recommended={search?.recommended?keyFor(search.recommended):undefined} headerAction={showAnalysisDock?configure:undefined}>
  <MissionOps analysis={selected} index={index} onExportCsv={exportCsv} onCopyLink={copyLink} copied={linkCopied}/>
 {showAnalysisDock&&<DesignerAnalysisPanels analysis={selected} index={index} baseline={baseline} onIndex={setTime} timeline={timelineRef}/>}
 </ResultsPanel>;
 const workspace=<main className={`workspace stage-${stage}${showAnalysisDock?' has-analysis-dock':''}`} inert={moon==='globe'||moon==='out'}>
  <div className="scene-layer"><SceneBoundary><TerrainView active={moon==='in'||moon==='site'} approach={moon==='in'?(descend?'descend':'hold'):null} focus={focusRef} frame={frame} terrain={data.terrain} positions={positions} previewId={positionPreview} selected={selected} lander={site} time={index} onSelect={chooseCandidate} wireframe={wire} mapView={mapView} reset={reset} linkVisible={link?.visible??false} feasible={feasible} recommended={search?.recommended?.candidate_id} skyReference={selected.height_m>0&&skyBase.height_m===0?skyBase:undefined} showSky={showSky}/></SceneBoundary></div>
  <div className="workspace-heading">
   <StoryBar story={story} demo={demo} hideSummary={!!search} onAction={onStoryAction} onStopDemo={stopDemo}/>
   <button type="button" className="secondary view-from-mast" onClick={()=>{setDemoStep(null);setPlaying(false);setShowPanorama(true);}}><Telescope size={15} aria-hidden="true"/>View from mast</button>
   <button type="button" className={`primary map-optimize ${searching?'is-busy':''}`} onClick={runSearch} aria-disabled={searching||designer.status==='loading'}>Find optimal configuration<ArrowUpRight size={15} aria-hidden="true"/></button>
  </div>
  <section className="terrain-panel" aria-label="Interactive lunar terrain">
   <div ref={focusRef} className="map-frame">
    <div className="map-references">
     <div className="map-reference-content" id="map-reference-content" hidden={!showReferences}>
      <ul className="map-legend" aria-label="Map legend">
       <li><i className="lg-station"/>Station mast</li><li><i className="lg-lander"/>Lander</li><li><i className="lg-cell"/>Evaluated cell</li>{feasible&&<li><i className="lg-feasible"/>Feasible cell</li>}
       <li><i className="lg-ray"/>In view <i className="lg-ray blocked"/>Blocked</li>
       {showSky&&<><li><i className="lg-sky-track sun"/>Sun path <i className="lg-sky-track earth"/>Earth path <i className="lg-sky-track blocked"/>Blocked</li><li><i className="lg-horizon"/>Horizon at {selected.height_m} m{selected.height_m>0&&<> <i className="lg-gained"/>Sky gained vs 0 m</>}</li></>}
      </ul>
      <TerrainScope terrain={data.terrain} regionalRadiusM={data.methodology.regional_provenance?.max_radius_m} sky={showSky}/>
     </div>
     <button type="button" className="map-references-toggle" aria-expanded={showReferences} aria-controls="map-reference-content" onClick={()=>setShowReferences(value=>!value)}><ChevronDown size={14} aria-hidden="true"/>{showReferences?'Hide references':'Show references'}</button>
    </div>
    {!showAnalysisDock&&<div className="map-actions">{configure}</div>}
  <div className="sky-panel" role="group" aria-label="Sky paths from the mast top">
   <button type="button" className="sky-toggle" aria-pressed={showSky} onClick={()=>setShowSky(v=>!v)}><Orbit size={14} aria-hidden="true"/>Sky paths</button>
   <button type="button" className="sky-raise" onClick={raiseMast} disabled={raising}><ArrowUp size={14} aria-hidden="true"/>{raising?`Raising… ${selected.height_m} m`:`Raise mast ${heightsTested[0]??0} → ${heightsTested[heightsTested.length-1]??20} m`}</button>
   {showSky&&<p className="sky-readout" aria-live="polite"><b>{selected.height_m} m mast</b>{selected.height_m>0?<> · sky gained vs 0 m: <span className="sun">Sun +{fmt(gainedSun)} h</span> · <span className="earth">Earth +{fmt(gainedEarth)} h</span></>:<> · Sun {fmt(selected.metrics.sun.total_hours)} h · Earth {fmt(selected.metrics.earth.total_hours)} h</>}<small>{SKY_DOME_CAPTION}; {VERTICAL_EXAGGERATION}× vertical exaggeration in 3D, so sky angles look steeper</small></p>}
  </div>
  <div className="map-tools"><button title="Reset camera" aria-label="Reset camera" onClick={()=>setReset(reset+1)}><RotateCcw size={16}/></button><button title="Toggle top view" aria-label="Toggle top view" aria-pressed={mapView} onClick={()=>setMapView(!mapView)}><Maximize2 size={16}/></button><button title="Toggle wireframe" aria-label="Toggle wireframe" aria-pressed={wire} onClick={()=>setWire(!wire)}><Layers3 size={16}/></button></div>
  {notice&&<div className="toast" role="status" key={notice}>{notice}</div>}
  {searching&&<div className="scan" aria-hidden><span>Evaluating {all.length} configurations</span></div>}
   </div>
  {search&&<OptimizerCard search={search} lines={explainRecommendation(search,all,links,constraints,baseline)} links={links} selectedKey={keyFor(selected)} onPick={a=>{setDemoStep(null);setCandidate(a.candidate_id);setHeight(a.height_m);}} onClose={()=>setSearch(null)}/>}
  </section>
  {results}
  <section className="timeline glass" ref={timelineRef} aria-label="Sun and Earth over time">
  <div className="timeline-side">
   <div className="timeline-heading">
    <h2 className="panel-title">Connecting Ridge</h2>
    {!showAnalysisDock&&playback}
   </div>
   <p className="timeline-coordinates"><span className="sr-only">Landing site coordinates: </span>{fmt(Math.abs(site.latitude_deg),5)}°&nbsp;S · {fmt(Math.abs(site.longitude_deg),5)}°&nbsp;W · {fmt(site.elevation_m,0)}&nbsp;m elevation</p>
  </div>
  <div className="timeline-plots">
   {showAnalysisDock&&playback}
   {!showAnalysisDock&&<TimelineStack height={64} analysis={selected} index={index} onIndex={setTime} baseline={baseline} baselineLabel="0 m" currentLabel={`${selected.height_m} m`}/>}
   <div className="time-scrubber">
    <input className="time-slider" aria-label="Timeline time" aria-valuetext={timelineDate} type="range" min="0" max={count-1} value={index} onChange={e=>{setTime(Number(e.target.value));setPlaying(false);}}/>
    <time className="time-tooltip" dateTime={timelineTimestamp} aria-hidden="true" style={{left:`clamp(min(86px, 50%), ${index/Math.max(1,count-1)*100}%, max(50%, 100% - 86px))`}}>{timelineDate}</time>
   </div>
   <DateWindowPicker compact days={observationDays} start={start} end={end} label="Timeline observation window" onChange={setWindow} status={designer.status}/>
  </div>
  {!showAnalysisDock&&<div className="timeline-horizon"><HorizonPanel compact analysis={selected} index={index} baseline={baseline}/></div>}
 </section>
 {showPanorama&&<MastPanorama sweep={selectedSweep} siteName={atSiteCell?site.name:`${site.name} · cell ${selected.position.row}, ${selected.position.col}`} initialHeight={selected.height_m} initialIndex={index} onClose={()=>setShowPanorama(false)}/>}
 </main>;
 return shell(workspaceTab?workspace:moon==='site'?<main className="page">{tab==='Science & Sources'?<Science data={data}/>:compare}</main>:null,
  moon==='site'&&<button className="text-button" onClick={exportResult}><Download size={14}/>Export</button>);
}
function Science({data}:{data:Bundle}){return <section className="science-page"><article><h1>Observations first.<br/>Engineering assumptions, explicit.</h1><p className="lead">This study uses geometric line of sight to assess visibility at two locations on Connecting Ridge near the lunar south pole. The terrain comes from NASA LOLA; Sun and Earth directions come from JPL Horizons. Changing a station selects a newly calculated horizon, never an invented improvement.</p><div className="method-steps"><div><b>01</b><h3>Measure the terrain</h3><p>A real 5 m DEM in MOON_ME/DE421 supplies elevation and coordinates. The 3D close-up draws every 5 m sample of the evaluated window, inside the rest of the same 16 km LOLA Site01 DEM (10 and 20 m block means), with a gray background mask showing the complete horizon from the selected station. The mask follows the same angular profile and interpolation as the visibility calculation, including nearby and regional terrain. The scene uses {VERTICAL_EXAGGERATION}× vertical exaggeration. Horizon and visibility calculations use the original elevations.</p></div><div><b>02</b><h3>Reconstruct the horizon</h3><p>Terrain is converted to spherical body-fixed Cartesian coordinates. Elevation angles use true local east, north and up, including lunar curvature. Obstacles are accumulated into azimuth sectors.</p></div><div><b>03</b><h3>Compare angular elevations</h3><p>A body’s center is visible when its elevation exceeds the terrain horizon at its azimuth. Samples are 30 minutes apart. Each sample represents the interval until the next; the final endpoint adds no extra time.</p></div><div><b>04</b><h3>Search the finite grid</h3><p>The optimizer checks all cached candidate and height combinations against your hard constraints. Feasible configurations are ranked by height/20 + distance/1000 + slope/90. This is an engineering preference, not money, mass or mission certification.</p></div></div><h3>What the model does not establish</h3><ul>{data.methodology.limitations.map((t,i)=><li key={i}>{t}</li>)}<li>DEM interpolation and angular sampling introduce uncertainty. Thirty-minute output does not imply thirty-minute accuracy.</li><li>Local links use a 2 m lander reference and terrain clearance. Antenna gain, frequency, Fresnel zones, radio power and station orientation are not modeled.</li><li>Nearby candidate directions are rotated into their own true local frame; small translational parallax is bounded in the exported provenance.</li><li>The IM-2 landing coordinates lie outside this local dataset. Connecting Ridge is not presented as the IM-2 landing location.</li><li>The 3D view applies the same {VERTICAL_EXAGGERATION}× vertical transform to terrain, lunar curvature, mast heights and sightlines. The gray background shows the station’s angular horizon. It is projected alongside the Sun and Earth so their visibility crossings remain aligned as the camera moves. Ridge distance tooltips use the original NASA coordinates. The display uses the centers of the enlarged celestial discs to determine visibility.</li></ul><h3>NASA data and primary references</h3><div className="source-list">{data.methodology.sources.map(s=><a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.name}<ExternalLink size={16}/></a>)}</div>
 <h3>Moon imagery credits</h3>
 <div className="source-list">
  {MOON_IMAGERY_SOURCES.map(source=><a key={source.href} href={source.href} target="_blank" rel="noreferrer">{source.label}<ExternalLink size={16}/></a>)}
 </div>
 <details><summary>Inspect dataset provenance</summary>
  <p>The local DEM covers {fmt(data.terrain.original_shape[1]*data.terrain.pixel_size_m/1000,2)} × {fmt(data.terrain.original_shape[0]*data.terrain.pixel_size_m/1000,2)} km.</p>
  <pre>{JSON.stringify(data.methodology.provenance,null,2)}</pre>
 </details><p className="footnote">Implemented with assistance from OpenAI Codex. {PRODUCT_NAME} is an independent prototype; no NASA endorsement or operational mission certification is implied.</p></article><aside><div className="science-stamp"><Mountain size={36}/><span className="eyebrow">CONNECTING RIDGE</span><strong>89.46° S</strong></div><dl className="facts"><div><dt>Reference sphere</dt><dd>1,737.4 km</dd></div><div><dt>Local DEM</dt><dd>5 m / pixel</dd></div><div><dt>Mesh display</dt><dd>5 m / vertex, 10–20 m around</dd></div><div><dt>Time resolution</dt><dd>30 minutes</dd></div><div><dt>Cached observation window</dt><dd>Nov 2026 – Apr 2027 UTC</dd></div><div><dt>Observer heights</dt><dd>0 / 2 / 5 / 10 / 20 m</dd></div><div><dt>Cached configurations</dt><dd>{data.analyses.length}</dd></div></dl><p className="micro">Every result remains usable without a live NASA API connection. New terrain, dates outside the cache, or new candidate positions require regeneration of the scientific dataset.</p></aside></section>;}
export default App;
