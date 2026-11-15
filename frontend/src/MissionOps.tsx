import {Sun,Globe2,Download,Link2} from 'lucide-react';
import type {Analysis} from './lib/science';
import {eventName,missionCountdowns,type Countdown} from './lib/missionOps';
import {hours} from './lib/story';
import AnalysisDisclosure from './AnalysisDisclosure';

function Row({c}:{c:Countdown}){
 const Icon=c.body==='sun'?Sun:Globe2;
 const name=eventName(c);
 const label=c.body==='sun'?(c.visible?'Sunlit':'In shadow'):(c.visible?'Earth in view':'Earth blocked');
 return <div className={`ops-row ${c.body}`}>
  <dt><Icon size={12} aria-hidden="true"/>{c.hoursToChange===null?`No ${name} in window`:`Next ${name} in`}</dt>
  <dd>{c.hoursToChange===null?<>&gt;&nbsp;{hours(c.hoursToWindowEnd)} h</>:<>{hours(c.hoursToChange)} h</>}
   <small>{label} · {c.runClipped?'≥ ':''}{hours(c.runHours)} h {c.visible?'window':'outage'}</small>
  </dd>
 </div>;
}

export default function MissionOps({analysis,index,onExportCsv,onCopyLink,copied}:{analysis:Analysis;index:number;onExportCsv:()=>void;onCopyLink:()=>void;copied:boolean}){
 const {sun,earth}=missionCountdowns(analysis,index);
 return <section className="mission-ops" aria-label="Mission operations countdown">
  <AnalysisDisclosure title="Mission ops · from timeline cursor">
   <dl className="joint ops">
    <Row c={sun}/>
    <Row c={earth}/>
   </dl>
   <p className="fine">“≥” marks a run cut by the window edge.</p>
   <div className="ops-actions">
    <button type="button" className="text-button" onClick={onExportCsv}><Download size={14} aria-hidden="true"/>Export CSV</button>
    <button type="button" className="text-button" onClick={onCopyLink}><Link2 size={14} aria-hidden="true"/>{copied?'Link copied':'Copy link'}</button>
   </div>
  </AnalysisDisclosure>
 </section>;
}
