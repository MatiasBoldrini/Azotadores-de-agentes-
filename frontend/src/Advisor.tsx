import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowRight,Check,LoaderCircle} from 'lucide-react';
import AnalysisDisclosure from './AnalysisDisclosure';
import {advise,utcLabel,type AdvisorInput,type Insight,type InsightAction} from './lib/advisor';
import {nowAlerts} from './lib/alerts';
import {askAgent,askBriefing,localBriefing,type AgentSource,type Briefing} from './lib/agentClient';
import {MAX_HOURS,MAX_STEPS,MIN_HOURS} from './lib/intent';
import {NEED_LABEL,PRESETS,fallbackPlan,planInsights,planOperation,slackHours,type Need,type Operation,type Plan} from './lib/planner';
import {hours} from './lib/story';

const TONE_LABEL:Record<Insight['tone'],string> = {risk:'Risk',opportunity:'Opportunity',alternative:'Option'};
const STORE = 'selenarc.operation.v2';
const HOUR_OPTIONS = [0.5,1,2,4,6,12,24,48];
const NEEDS:Need[] = ['sun','earth','both'];
// Short chip labels; the full preset name stays as the accessible name.
const CHIP_LABEL:Record<string,string> = {experiment:'Experiment','downlink':'Joint session','charge-relay':'Charge & relay',custom:'Yours'};

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
const SOURCE_LABEL:Record<AgentSource,string> = {openai:'Read by OpenAI',local:'Read offline'};

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

function Badge({tone}:{tone:Insight['tone']}){
 return <span className={`adv-badge ${tone}`}>{TONE_LABEL[tone]}</span>;
}

function ActionButton({action,onAction,primary}:{action:InsightAction;onAction:(a:InsightAction)=>void;primary?:boolean}){
 return <button type="button" className={primary?'adv-btn adv-btn-primary':'adv-link'} onClick={()=>onAction(action)}>
  {action.label}<ArrowRight size={14} aria-hidden="true"/>
 </button>;
}

/** The single most important thing to do now, with its action. The model only ranks the computed
 * findings; every word here is the finding's own text. Other picks are secondary rows. */
function NextAction({briefing,loading,items,onAction}:{briefing:Briefing|null;loading:boolean;items:Insight[];onAction:(a:InsightAction)=>void}){
 const byId = new Map(items.map(i=>[i.id,i]));
 const picks = (briefing?.picks??[]).map(id=>byId.get(id)).filter((x):x is Insight=>!!x);
 if(!briefing||!picks.length) return <div className="adv-card adv-next is-empty" aria-live="polite">
  <p className="adv-caption">Nothing to flag</p>
  <p className="adv-headline">No risks or opportunities at this time and configuration.</p>
 </div>;
 const [lead,...rest] = picks;
 const action = lead.action;
 return <div className={`adv-card adv-next tone-${lead.tone}`} aria-live="polite" aria-busy={loading}>
  <div className="adv-next-meta">
   <Badge tone={lead.tone}/>
   <span className="adv-caption adv-source">
    {loading?<><LoaderCircle size={12} className="adv-spin" aria-hidden="true"/>OpenAI is reviewing</>
     :briefing.source==='openai'?<><Check size={12} aria-hidden="true"/>Ranked by OpenAI</>
     :`Automatic${briefing.fallbackReason?` · ${briefing.fallbackReason}`:''}`}
   </span>
  </div>
  <p className="adv-headline">{lead.title}</p>
  <p className="adv-body">{lead.detail}</p>
  {action&&<ActionButton action={action} onAction={onAction} primary/>}
  {rest.length>0&&<ul className="adv-also">
   {rest.map(item=><li key={item.id}><span className={`adv-dot ${item.tone}`} aria-hidden="true"/><span><span className="sr-only">{TONE_LABEL[item.tone]}: </span>{item.title}</span></li>)}
  </ul>}
 </div>;
}

/** The operation drawn on the analysed window: each step where it runs, the cursor and the fallback start. */
function PlanStrip({plan,fallback,slack,windowStart,windowEnd,cursor}:{plan:Plan|null;fallback:Plan|null;slack:number|null;windowStart:number;windowEnd:number;cursor:number}){
 const span = windowEnd-windowStart;
 const at = (ms:number) => `${Math.max(0,Math.min(100,(ms-windowStart)/span*100))}%`;
 const day = (ms:number) => utcLabel(new Date(ms).toISOString());
 const label = plan
  ? `Plan from ${day(plan.start)} to ${day(plan.finish)}: ${plan.slots.map(s=>`${NEED_LABEL[s.step.need]} ${hours(s.step.hours)} h at ${day(s.start)}`).join(', ')}.`
  : 'The operation does not fit in the rest of this window.';
 return <div className="adv-strip">
  <div className="adv-strip-track" role="img" aria-label={label}>
   {plan?.slots.map((s,i)=><span key={i} className={`adv-strip-slot ${s.step.need}`} style={{left:at(s.start),width:`max(4px, ${(s.end-s.start)/span*100}%)`}}/>)}
   {fallback&&<span className="adv-strip-fallback" style={{left:at(fallback.start)}}/>}
   <span className="adv-strip-cursor" style={{left:at(cursor)}}/>
  </div>
  <div className="adv-strip-scale" aria-hidden="true"><span>{day(windowStart).split(',')[0]}</span><span>{day(windowEnd).split(',')[0]}</span></div>
  {plan?<dl className="adv-facts">
   <div><dt>Start</dt><dd>{day(plan.start)}</dd></div>
   <div><dt>Done</dt><dd>{day(plan.finish)}</dd></div>
   <div><dt>Slack</dt><dd>{slack?`${hours(slack)} h`:'None'}</dd></div>
  </dl>:<p className="adv-caption adv-strip-empty">Does not fit after the cursor. See the suggestion above.</p>}
 </div>;
}

function FindingRow({item,onAction}:{item:Insight;onAction:(a:InsightAction)=>void}){
 return <li className="adv-finding">
  <div className="adv-finding-head"><Badge tone={item.tone}/><p className="adv-finding-title">{item.title}</p></div>
  <p className="adv-body">{item.detail}</p>
  {item.action&&<ActionButton action={item.action} onAction={onAction}/>}
 </li>;
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
 const cursorMs = Date.parse(cursor);
 const opText = `${op.name}: ${op.steps.map(s=>`${NEED_LABEL[s.need]} ${s.hours} h`).join(' then ')}`;
 const context = `Station ${input.selected.candidate_id} with a ${input.selected.height_m} m mast; timeline cursor ${utcLabel(cursor)}`;
 const brief = useBriefing(findings,opText,context,active&&expanded&&!playing);
 const schedule = planOperation(input.selected,op,cursorMs);
 const slack = schedule?slackHours(input.selected,op,schedule):null;
 const fallback = schedule?fallbackPlan(input.selected,op,schedule):null;
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
 const options = [...(custom?[custom]:[]),...PRESETS];
 const groups:[string,Insight[]][] = [['Right now',alerts],['Your operation',plan],['This configuration',general]];
 return <section className="advisor" aria-label="Mission advisor">
  <AnalysisDisclosure title="What to do next" onOpenChange={setExpanded}
   summary={<span className={`advisor-count ${risks?'has-risk':''}`}>{risks?`${risks} risk${risks===1?'':'s'}`:'No risks flagged'}</span>}>
   <NextAction briefing={brief.briefing} loading={brief.loading} items={findings} onAction={onAction}/>

   <div className="adv-section">
    <div className="adv-section-head">
     <h4 className="adv-label" id="adv-op-label">Your operation</h4>
     <span className="adv-caption">{op.id==='custom'?op.name:''}</span>
    </div>
    <div className="adv-chips" role="radiogroup" aria-labelledby="adv-op-label">
     {options.map(p=><button key={p.id} type="button" role="radio" aria-checked={op.id===p.id} aria-label={p.name}
      className={`adv-chip ${op.id===p.id?'is-selected':''}`} onClick={()=>choose(p.id)}>{CHIP_LABEL[p.id]??p.name}</button>)}
    </div>
    <ol className="adv-steps">
     {op.steps.map((s,i)=><li key={i}>
      <span className={`adv-need ${s.need}`}>{NEED_LABEL[s.need]}</span>
      <span className="adv-step-label">{s.label}</span>
      <label className="adv-hours"><span className="sr-only">{s.label}: hours of {NEED_LABEL[s.need]}</span>
       <select value={s.hours} onChange={e=>setHours(i,Number(e.target.value))}>
        {[...new Set([...HOUR_OPTIONS,s.hours])].sort((a,b)=>a-b).map(h=><option key={h} value={h}>{h} h</option>)}
       </select>
      </label>
     </li>)}
    </ol>
    <PlanStrip plan={schedule} fallback={fallback} slack={slack} cursor={cursorMs}
     windowStart={Date.parse(times[0])} windowEnd={Date.parse(times[times.length-1])}/>
   </div>

   <form className="adv-section adv-ask" onSubmit={submit} noValidate>
    <label className="adv-label" htmlFor="advisor-ask-input">Describe an operation</label>
    <div className="adv-ask-row">
     <input id="advisor-ask-input" type="text" value={ask} maxLength={500} autoComplete="off"
      aria-invalid={reply?.error||undefined} aria-describedby={reply?'advisor-ask-reply':undefined}
      placeholder="Charge for a day, then transmit 1 h" onChange={e=>setAsk(e.target.value)}/>
     <button type="submit" className="adv-btn" disabled={busy||!ask.trim()} aria-busy={busy}>
      {busy?<><LoaderCircle size={14} className="adv-spin" aria-hidden="true"/>Reading</>:'Plan'}
     </button>
    </div>
    {reply&&<p id="advisor-ask-reply" className={`adv-caption adv-reply ${reply.error?'is-error':''}`} role="status">
     <span className="adv-reply-source">{SOURCE_LABEL[reply.source]}{reply.fallback?` · ${reply.fallback}`:''}</span>{reply.text&&<span>{reply.text}</span>}
    </p>}
   </form>

   <details className="adv-all">
    <summary><span>All findings</span><span className="adv-caption">{findings.length}</span></summary>
    {groups.filter(([,items])=>items.length).map(([title,items])=><div key={title} className="adv-group">
     <h4 className="adv-label">{title}</h4>
     <ol className="adv-findings">{items.map(i=><FindingRow key={i.id} item={i} onAction={onAction}/>)}</ol>
    </div>)}
   </details>
   <p className="fine">The agent turns your words into steps and ranks the findings. The planner computes times, durations and configurations using geometric line of sight. Each step runs in order within one continuous visibility window.</p>
  </AnalysisDisclosure>
 </section>;
}

export function AdviceList({items,onAction}:{items:Insight[];onAction?:(action:InsightAction)=>void}){
 return <ol className="adv-findings">
  {items.map(item=><li key={item.id} className="adv-finding">
   <div className="adv-finding-head"><Badge tone={item.tone}/><p className="adv-finding-title">{item.title}</p></div>
   <p className="adv-body">{item.detail}</p>
   {item.action&&onAction&&<ActionButton action={item.action} onAction={onAction}/>}
  </li>)}
 </ol>;
}
