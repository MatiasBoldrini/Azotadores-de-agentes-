import {useEffect,useState} from 'react';
import {ArrowRight} from 'lucide-react';
import AnalysisDisclosure from './AnalysisDisclosure';
import {advise,type AdvisorInput,type Insight,type InsightAction} from './lib/advisor';
import {NEED_LABEL,PRESETS,planInsights,type Operation} from './lib/planner';

const TONE_LABEL:Record<Insight['tone'],string> = {risk:'Risk',opportunity:'Opportunity',alternative:'Alternative'};
const STORE = 'selenarc.operation.v1';
const HOUR_OPTIONS = [0.5,1,2,4,6,12,24,48];

// Per-viewer convenience only: the chosen operation survives a reload when storage is available.
function loadOperation():Operation {
 try{
  const saved = JSON.parse(localStorage.getItem(STORE)??'null') as {id:string;hours:number[]}|null;
  const preset = PRESETS.find(p=>p.id===saved?.id);
  if(preset&&saved&&saved.hours.length===preset.steps.length&&saved.hours.every(h=>HOUR_OPTIONS.includes(h)))
   return {...preset,steps:preset.steps.map((s,i)=>({...s,hours:saved.hours[i]}))};
 }catch{/* storage unavailable */}
 return PRESETS[0];
}

export default function Advisor({input,onAction}:{input:AdvisorInput;onAction:(action:InsightAction)=>void}){
 const [op,setOp] = useState<Operation>(loadOperation);
 useEffect(()=>{try{localStorage.setItem(STORE,JSON.stringify({id:op.id,hours:op.steps.map(s=>s.hours)}));}catch{/* storage unavailable */}},[op]);
 const plan = planInsights({...input,op});
 const general = advise(input,4);
 const risks = [...plan,...general].filter(i=>i.tone==='risk').length;
 const choose = (id:string) => setOp(PRESETS.find(p=>p.id===id)??PRESETS[0]);
 const setHours = (i:number,h:number) => setOp(o=>({...o,steps:o.steps.map((s,j)=>j===i?{...s,hours:h}:s)}));
 return <section className="advisor" aria-label="Mission advisor">
  <AnalysisDisclosure title="What to do next"
   summary={<span className={`advisor-count ${risks?'has-risk':''}`}>{risks?`${risks} risk${risks===1?'':'s'}`:'No risks flagged'}</span>}>
   <div className="advisor-op">
    <label className="advisor-op-pick">Your operation
     <select value={op.id} onChange={e=>choose(e.target.value)}>
      {PRESETS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
     </select>
    </label>
    <ol className="advisor-steps">
     {op.steps.map((s,i)=><li key={i}>
      <span>{s.label}</span>
      <label><span className="sr-only">{s.label}: hours of {NEED_LABEL[s.need]}</span>
       <select value={s.hours} onChange={e=>setHours(i,Number(e.target.value))}>
        {HOUR_OPTIONS.map(h=><option key={h} value={h}>{h} h</option>)}
       </select>
      </label>
      <em className={`need ${s.need}`}>{NEED_LABEL[s.need]}</em>
     </li>)}
    </ol>
   </div>
   <AdviceList items={plan} onAction={onAction}/>
   <h4 className="advisor-sub">Watching this configuration</h4>
   <AdviceList items={general} onAction={onAction}/>
   <p className="fine">Read from the timeline at the cursor and the evaluated configurations. Steps run in order, each on one continuous visibility run. Geometric line of sight only.</p>
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
