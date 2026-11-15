import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowRight} from 'lucide-react';
import AnalysisDisclosure from './AnalysisDisclosure';
import {advise,utcLabel,type AdvisorInput,type Insight,type InsightAction} from './lib/advisor';
import {nowAlerts} from './lib/alerts';
import {askAgent,askBriefing,localBriefing,type AgentSource,type Briefing} from './lib/agentClient';
import {MAX_HOURS,MAX_STEPS,MIN_HOURS} from './lib/intent';
import {NEED_LABEL,PRESETS,planInsights,type Need,type Operation} from './lib/planner';

const TONE_LABEL:Record<Insight['tone'],string> = {risk:'Risk',opportunity:'Opportunity',alternative:'Alternative'};
const STORE = 'selenarc.operation.v2';
const HOUR_OPTIONS = [0.5,1,2,4,6,12,24,48];
const NEEDS:Need[] = ['sun','earth','both'];

type Saved = {id:string;hours:number[]}|{id:'custom';name:string;steps:Operation['steps']};
const validHours = (h:unknown) => typeof h==='number'&&h>=MIN_HOURS&&h<=MAX_HOURS&&Math.round(h*2)===h*2;

// Per-viewer convenience only: the chosen operation survives a reload when storage is available.
function loadOperation():Operation {
 try{
  const saved = JSON.parse(localStorage.getItem(STORE)??'null') as Saved|null;
  if(saved&&'steps' in saved&&Array.isArray(saved.steps)&&saved.steps.length>=1&&saved.steps.length<=MAX_STEPS
   &&saved.steps.every(s=>NEEDS.includes(s.need)&&validHours(s.hours)&&typeof s.label==='string'))
   return {id:'custom',name:String(saved.name).slice(0,60),steps:saved.steps};
  const preset = PRESETS.find(p=>p.id===saved?.id);
  if(preset&&saved&&'hours' in saved&&saved.hours.length===preset.steps.length&&saved.hours.every(h=>HOUR_OPTIONS.includes(h)))
   return {...preset,steps:preset.steps.map((s,i)=>({...s,hours:saved.hours[i]}))};
 }catch{/* storage unavailable */}
 return PRESETS[0];
}
const toSaved = (op:Operation):Saved => op.id==='custom'?{id:'custom',name:op.name,steps:op.steps}:{id:op.id,hours:op.steps.map(s=>s.hours)};

type Reply = {text:string;source:AgentSource;fallback?:string;error?:boolean};
const SOURCE_LABEL:Record<AgentSource,string> = {openai:'Read by OpenAI',local:'Read by the offline parser'};

// Proactive briefing: refreshed on its own when the configuration, operation or cursor changes
// (debounced, paused while the timeline plays). Cached per set of findings; once the server shows
// it has no agent, the session stays on the automatic briefing.
const briefingCache = new Map<string,Briefing>();
let agentAbsent = false;
let nextBriefingAt = 0;
const BRIEF_DEBOUNCE_MS = 1200;

function useBriefing(items:Insight[],operation:string,context:string,enabled:boolean){
 const key = JSON.stringify([items.map(i=>[i.id,i.tone,i.title,i.detail]),operation,context]);
 const [state,setState] = useState<{key:string;briefing:Briefing|null}|null>(null);
 const cached = briefingCache.get(key);
 const fallbackReason = agentAbsent?'no language agent on this server'
  : Date.now()<nextBriefingAt?'language agent rate limited':undefined;
 const canRequest = enabled&&!cached&&!fallbackReason&&items.length>0;
 useEffect(()=>{
  if(!canRequest) return;
  const controller = new AbortController();
  const timer = setTimeout(async()=>{
   if(controller.signal.aborted||agentAbsent||Date.now()<nextBriefingAt) return;
   try{
    const r = await askBriefing(items,operation,context,{signal:controller.signal});
    if(controller.signal.aborted) return;
    if(r.absent) agentAbsent = true;
    if(r.retryAfterMs) nextBriefingAt = Date.now()+r.retryAfterMs;
    if(r.briefing?.source==='openai'){ if(briefingCache.size>50) briefingCache.clear(); briefingCache.set(key,r.briefing); }
    setState({key,briefing:r.briefing});
   }catch{/* superseded */}
  },BRIEF_DEBOUNCE_MS);
  return ()=>{clearTimeout(timer);controller.abort();};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key,canRequest]);
 const current = enabled&&state?.key===key ? state : null;
 return {briefing:cached??current?.briefing??localBriefing(items,fallbackReason),loading:canRequest&&!current};
}

function BriefingCard({briefing,loading,items,onAction}:{briefing:Briefing;loading:boolean;items:Insight[];onAction:(a:InsightAction)=>void}){
 const byId = new Map(items.map(i=>[i.id,i]));
 const label = loading?'OpenAI is reviewing the findings…'
  : briefing.source==='openai'?'Findings ranked by OpenAI'
  : `Automatic briefing${briefing.fallbackReason?` (${briefing.fallbackReason})`:''}`;
 return <div className="advisor-brief" aria-live="polite">
  <p className="advisor-source">{label}</p>
  <ol className="advisor-picks">
   {briefing.picks.map(id=>{const item = byId.get(id); if(!item) return null;
    return <li key={id} className={item.tone}>
     <span className="advisor-pick-title">{item.title}</span>
     <span className="advisor-pick-detail">{item.detail}</span>
     {item.action&&<button type="button" className="text-button advisor-action" onClick={()=>onAction(item.action!)}>{item.action.label}<ArrowRight size={13} aria-hidden="true"/></button>}
    </li>;})}
  </ol>
 </div>;
}

export default function Advisor({input,onAction,active,playing}:{input:AdvisorInput;onAction:(action:InsightAction)=>void;active:boolean;playing:boolean}){
 const [op,setOp] = useState<Operation>(loadOperation);
 const [custom,setCustom] = useState<Operation|null>(()=>{const o=loadOperation();return o.id==='custom'?o:null;});
 const [ask,setAsk] = useState('');
 const [busy,setBusy] = useState(false);
 const [reply,setReply] = useState<Reply|null>(null);
 const [expanded,setExpanded] = useState(true);
 const pending = useRef<AbortController|null>(null);
 useEffect(()=>{try{localStorage.setItem(STORE,JSON.stringify(toSaved(op)));}catch{/* storage unavailable */}},[op]);
 useEffect(()=>()=>pending.current?.abort(),[]);
 const plan = planInsights({...input,op});
 const general = advise(input,4);
 const alerts = nowAlerts(input.selected,input.index);
 const findings = [...alerts,...plan,...general];
 const risks = findings.filter(i=>i.tone==='risk').length;
 const times = input.selected.series.timestamp_utc;
 const cursor = times[Math.max(0,Math.min(input.index,times.length-1))];
 const opText = `${op.name}: ${op.steps.map(s=>`${NEED_LABEL[s.need]} ${s.hours} h`).join(' then ')}`;
 const context = `Station ${input.selected.candidate_id} with a ${input.selected.height_m} m mast; timeline cursor ${utcLabel(cursor)}`;
 const brief = useBriefing(findings,opText,context,active&&expanded&&!playing);
 const choose = (id:string) => setOp(id==='custom'&&custom?custom:PRESETS.find(p=>p.id===id)??PRESETS[0]);
 const setHours = (i:number,h:number) => setOp(o=>{
  const next = {...o,steps:o.steps.map((s,j)=>j===i?{...s,hours:h}:s)};
  if(next.id==='custom') setCustom(next);
  return next;
 });
 const submit = async (e:FormEvent) => {
  e.preventDefault();
  if(busy||!ask.trim()) return;
  pending.current?.abort();
  const controller = new AbortController();
  pending.current = controller;
  setBusy(true);
  try{
   const answer = await askAgent(ask,{signal:controller.signal});
   if(controller.signal.aborted) return;
   if(answer.ok){
    setCustom(answer.op); setOp(answer.op);
    const understood = answer.op.steps.map(s=>`${NEED_LABEL[s.need]} ${s.hours} h`).join(' → ');
    setReply({text:[`Understood: ${understood}.`,answer.note].filter(Boolean).join(' '),source:answer.source,fallback:answer.fallbackReason});
   } else setReply({text:answer.note,source:answer.source,fallback:answer.fallbackReason,error:true});
  }catch{/* superseded or unmounted */}
  finally{ if(pending.current===controller){pending.current=null;setBusy(false);} }
 };
 return <section className="advisor" aria-label="Mission advisor">
  <AnalysisDisclosure title="What to do next" onOpenChange={setExpanded}
   summary={<span className={`advisor-count ${risks?'has-risk':''}`}>{risks?`${risks} risk${risks===1?'':'s'}`:'No risks flagged'}</span>}>
   {brief.briefing&&<BriefingCard briefing={brief.briefing} loading={brief.loading} items={findings} onAction={onAction}/>}
   <form className="advisor-ask" onSubmit={submit}>
    <label htmlFor="advisor-ask-input">Tell the agent what you need to do</label>
    <div className="advisor-ask-row">
     <input id="advisor-ask-input" type="text" value={ask} maxLength={500} autoComplete="off"
      placeholder="Charge for a day, then transmit 1 h" onChange={e=>setAsk(e.target.value)}/>
     <button type="submit" className="advisor-ask-go" disabled={busy||!ask.trim()}>{busy?'Reading…':'Plan it'}</button>
    </div>
    {reply&&<p className={`advisor-reply ${reply.error?'is-error':''}`} role="status">
     <span className="advisor-source">{SOURCE_LABEL[reply.source]}{reply.fallback?` (${reply.fallback})`:''}</span>
     {reply.text&&<span>{reply.text}</span>}
    </p>}
   </form>
   <div className="advisor-op">
    <label className="advisor-op-pick">Your operation
     <select value={op.id} onChange={e=>choose(e.target.value)}>
      {custom&&<option value="custom">{custom.name}</option>}
      {PRESETS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
     </select>
    </label>
    <ol className="advisor-steps">
     {op.steps.map((s,i)=><li key={i}>
      <span>{s.label}</span>
      <label><span className="sr-only">{s.label}: hours of {NEED_LABEL[s.need]}</span>
       <select value={s.hours} onChange={e=>setHours(i,Number(e.target.value))}>
        {[...new Set([...HOUR_OPTIONS,s.hours])].sort((a,b)=>a-b).map(h=><option key={h} value={h}>{h} h</option>)}
       </select>
      </label>
      <em className={`need ${s.need}`}>{NEED_LABEL[s.need]}</em>
     </li>)}
    </ol>
   </div>
   {alerts.length>0&&<><h4 className="advisor-sub">Right now</h4><AdviceList items={alerts} onAction={onAction}/></>}
   <h4 className="advisor-sub">Your operation</h4>
   <AdviceList items={plan} onAction={onAction}/>
   <h4 className="advisor-sub">Watching this configuration</h4>
   <AdviceList items={general} onAction={onAction}/>
   <p className="fine">The agent turns your words into steps and ranks the findings. The planner computes times, durations and configurations using geometric line of sight. Each step runs in order within one continuous visibility window.</p>
  </AnalysisDisclosure>
 </section>;
}

export function AdviceList({items,onAction}:{items:Insight[];onAction?:(action:InsightAction)=>void}){
 return <ol className="advisor-list">
  {items.map(item=><li key={item.id} className={`advisor-item ${item.tone}`}>
   <span className="sr-only">{TONE_LABEL[item.tone]}: </span>
   <p className="advisor-title">{item.title}</p>
   <p className="advisor-detail">{item.detail}</p>
   {item.action&&onAction&&<button type="button" className="text-button advisor-action" onClick={()=>onAction(item.action!)}>
    {item.action.label}<ArrowRight size={13} aria-hidden="true"/>
   </button>}
  </li>)}
 </ol>;
}
