import {AlertTriangle,ArrowRight,Check,Mountain,Orbit,Square,TrendingUp,X} from 'lucide-react';
import {STORY_STEPS,type Segment,type Story,type StoryAction} from './lib/story';

export function Segments({parts}:{parts:Segment[]}){
 return <>{parts.map((p,i)=>p.c?<span key={i} className={`seg-${p.c}`}>{p.t}</span>:<span key={i}>{p.t}</span>)}</>;
}

const ICONS={limit:AlertTriangle,gain:TrendingUp,plateau:Mountain,optimal:Check,infeasible:X,neutral:Orbit,loss:AlertTriangle};

type Demo={step:number;total:number;label:string;ms:number};

export function StoryBar({story,demo,onAction,onStopDemo}:{story:Story;demo:Demo|null;onAction:(a:StoryAction)=>void;onStopDemo:()=>void}){
 const Icon=ICONS[story.tone];
 const title=story.title.map(s=>s.t).join('');
 return <section className={`story tone-${story.tone}`} aria-label="Analysis story">
  <div className="story-rail">
   <ol className="story-steps">
    {STORY_STEPS.map((s,i)=><li key={s} className={i+1<story.step?'done':i+1===story.step?'active':''} aria-current={i+1===story.step?'step':undefined}><b>{String(i+1).padStart(2,'0')}</b>{s}</li>)}
   </ol>
   <span className="story-kicker" key={story.kicker}><Icon size={14}/>{story.kicker}</span>
   {demo&&<div className="demo-progress" role="status" aria-label={`Guided demo, step ${demo.step+1} of ${demo.total}: ${demo.label}`}>
    <span className="demo-label"><i className="rec-dot"/>Guided demo · {demo.step+1}/{demo.total} · {demo.label}</span>
    <span className="demo-segments">{Array.from({length:demo.total},(_,i)=><i key={i} className={i<demo.step?'done':i===demo.step?'active':''}>{i===demo.step&&<b key={demo.step} style={{animationDuration:`${demo.ms}ms`}}/>}</i>)}</span>
    <button className="demo-stop" onClick={onStopDemo}><Square size={11}/>Stop</button>
   </div>}
  </div>
  <div className="story-body" aria-live="polite">
   <div className="story-text" key={title}>
    <h2 className="story-title"><Segments parts={story.title}/></h2>
    {story.detail.length>0&&<p className="story-detail"><Segments parts={story.detail}/></p>}
   </div>
   {story.actions.length>0&&<div className="story-actions">{story.actions.map((a,i)=><button key={a.label} className={i===0?'primary':'secondary'} onClick={()=>onAction(a)}>{a.label}<ArrowRight size={15}/></button>)}</div>}
  </div>
 </section>;
}
