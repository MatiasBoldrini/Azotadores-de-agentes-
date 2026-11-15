import {ArrowRight} from 'lucide-react';
import AnalysisDisclosure from './AnalysisDisclosure';
import {advise,type AdvisorInput,type Insight,type InsightAction} from './lib/advisor';

const TONE_LABEL:Record<Insight['tone'],string> = {risk:'Risk',opportunity:'Opportunity',alternative:'Alternative'};

export default function Advisor({input,onAction}:{input:AdvisorInput;onAction:(action:InsightAction)=>void}){
 const items = advise(input);
 const risks = items.filter(i=>i.tone==='risk').length;
 return <section className="advisor" aria-label="Mission advisor">
  <AnalysisDisclosure title="What to do next"
   summary={<span className={`advisor-count ${risks?'has-risk':''}`}>{risks?`${risks} risk${risks===1?'':'s'}`:'No risks flagged'}</span>}>
   <AdviceList items={items} onAction={onAction}/>
   <p className="fine">Read from the precomputed timeline at the cursor and the evaluated configurations. Geometric line of sight only.</p>
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
