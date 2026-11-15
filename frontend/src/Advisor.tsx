import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowRight} from 'lucide-react';
import AnalysisDisclosure from './AnalysisDisclosure';
import {backendBaseUrl} from './backendConfig';
import {advise,type AdvisorInput,type Insight,type InsightAction} from './lib/advisor';
import {askAgent,type AgentSource} from './lib/agentClient';
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

export default function Advisor({input,onAction}:{input:AdvisorInput;onAction:(action:InsightAction)=>void}){
 const [op,setOp] = useState<Operation>(loadOperation);
 const [custom,setCustom] = useState<Operation|null>(()=>{const o=loadOperation();return o.id==='custom'?o:null;});
 const [ask,setAsk] = useState('');
 const [busy,setBusy] = useState(false);
 const [reply,setReply] = useState<Reply|null>(null);
 const pending = useRef<AbortController|null>(null);
 useEffect(()=>{try{localStorage.setItem(STORE,JSON.stringify(toSaved(op)));}catch{/* storage unavailable */}},[op]);
 useEffect(()=>()=>pending.current?.abort(),[]);
 const plan = planInsights({...input,op});
 const general = advise(input,4);
 const risks = [...plan,...general].filter(i=>i.tone==='risk').length;
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
   const answer = await askAgent(ask,{baseUrl:backendBaseUrl,signal:controller.signal});
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
  <AnalysisDisclosure title="What to do next"
   summary={<span className={`advisor-count ${risks?'has-risk':''}`}>{risks?`${risks} risk${risks===1?'':'s'}`:'No risks flagged'}</span>}>
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
   <AdviceList items={plan} onAction={onAction}/>
   <h4 className="advisor-sub">Watching this configuration</h4>
   <AdviceList items={general} onAction={onAction}/>
   <p className="fine">The agent only turns your words into steps. Times, durations and configurations come from the timeline at the cursor and the evaluated configurations. Steps run in order, each on one continuous visibility run. Geometric line of sight only.</p>
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
