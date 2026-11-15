import {useId,useLayoutEffect,useRef,useState,type KeyboardEvent,type PointerEvent,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {Pin,PinOff} from 'lucide-react';
import AnalysisDisclosure,{type DisclosureControls} from './AnalysisDisclosure';
import {HorizonChart,TimelineChart,timelineTitle} from './Charts';
import type {Analysis} from './lib/science';

const titles={sun:timelineTitle('sun'),earth:timelineTitle('earth'),horizon:'Horizon from the station'};
const FLOATING_WIDTH=420;
type PanelId=keyof typeof titles;
type Point={x:number;y:number};
const PANEL_ORDER:PanelId[]=['sun','earth','horizon'];
type Move={id:PanelId;pointer:number;origin:Point;position:Point;dragged:boolean};

export function HorizonPanel({analysis,index,baseline,controls,compact=false}:{
 analysis:Analysis;index:number;baseline:Analysis;controls?:DisclosureControls;compact?:boolean;
}){
 const compare=baseline.candidate_id!==analysis.candidate_id||baseline.height_m!==analysis.height_m;
 return <AnalysisDisclosure title={titles.horizon} controls={controls}>
  <HorizonChart height={compact?112:undefined} analysis={analysis} index={index} baseline={baseline}/>
  {!compact&&<div className="horizon-legend"><span><i className="lg-line"/>Horizon at {analysis.height_m} m</span>{compare&&<span><i className="lg-line dotted"/>Ground level</span>}<span><i className="dot-fill"/>In view <i className="dot-ring"/>Blocked</span></div>}
 </AnalysisDisclosure>;
}

export default function DesignerAnalysisPanels({analysis,index,baseline,onIndex,timeline}:{
 analysis:Analysis;index:number;baseline:Analysis;onIndex:(index:number)=>void;timeline:RefObject<HTMLElement|null>;
}){
 const [expanded,setExpanded]=useState<Record<PanelId,boolean>>({sun:true,earth:true,horizon:true});
 // Insertion order doubles as the floating windows' stacking order.
 const [floating,setFloating]=useState(new Map<PanelId,Point>());
 const [announcement,setAnnouncement]=useState('');
 const dock=useRef<HTMLElement>(null);
 const cards=useRef<Partial<Record<PanelId,HTMLElement|null>>>({});
 const pins=useRef<Partial<Record<PanelId,HTMLButtonElement|null>>>({});
 const move=useRef<Move|null>(null);
 const suppressClick=useRef<PanelId|null>(null);
 const instructions=useId();
 const activeWindows=Array.from(floating.keys());

 function constrain(id:PanelId,point:Point):Point{
  const card=cards.current[id];
  if(!card)return point;
  const top=(timeline.current?.parentElement?.getBoundingClientRect().top??0)+8;
  const bottom=Math.min(window.innerHeight,timeline.current?.getBoundingClientRect().top??window.innerHeight)-8;
  return {
   x:Math.max(8,Math.min(point.x,window.innerWidth-card.offsetWidth-8)),
   y:Math.max(top,Math.min(point.y,bottom-card.offsetHeight)),
  };
 }

 useLayoutEffect(()=>{
  const fitWindows=()=>{
   if(!dock.current?.getClientRects().length)return;
   setFloating(current=>{
    let fittedWindows:Map<PanelId,Point>|undefined;
    for(const [id,point] of current){
     const fitted=constrain(id,point);
     if(fitted.x===point.x&&fitted.y===point.y)continue;
     fittedWindows??=new Map(current);
     fittedWindows.set(id,fitted);
    }
    return fittedWindows??current;
   });
  };
  fitWindows();
  const observer=new ResizeObserver(fitWindows);
  for(const element of [dock.current,timeline.current,...Object.values(cards.current)]){
   if(element)observer.observe(element);
  }
  window.addEventListener('resize',fitWindows);
  return ()=>{
   observer.disconnect();
   window.removeEventListener('resize',fitWindows);
   move.current=null;
  };
 },[timeline,floating.size]);

 function raise(id:PanelId){
  setFloating(current=>{
   const point=current.get(id);
   if(!point||Array.from(current.keys()).at(-1)===id)return current;
   const next=new Map(current);
   next.delete(id);
   next.set(id,point);
   return next;
  });
 }

 function toggleFloating(id:PanelId){
  const card=cards.current[id]?.getBoundingClientRect();
  const resultsBox=dock.current?.parentElement?.getBoundingClientRect();
  if(!card||!resultsBox)return;
  const wasFloating=floating.has(id);
  setFloating(current=>{
   const next=new Map(current);
   if(wasFloating)next.delete(id);
   else next.set(id,{x:resultsBox.left-FLOATING_WIDTH-12-current.size*16,y:card.top});
   return next;
  });
  setAnnouncement(`${titles[id]} ${wasFloating?'docked':'floating'}.`);
  requestAnimationFrame(()=>{
   if(wasFloating)cards.current[id]?.scrollIntoView({block:'nearest'});
   pins.current[id]?.focus({preventScroll:true});
  });
 }

 function moveFloating(id:PanelId,point:Point){
  const fitted=constrain(id,point);
  setFloating(current=>{
   const previous=current.get(id);
   if(!previous||(previous.x===fitted.x&&previous.y===fitted.y))return current;
   return new Map(current).set(id,fitted);
  });
 }

 function moveWithKeyboard(event:KeyboardEvent<HTMLButtonElement>,id:PanelId,position:Point){
  const step=event.shiftKey?48:16;
  const offsets:Partial<Record<string,Point>>={
   ArrowUp:{x:0,y:-step},ArrowDown:{x:0,y:step},ArrowLeft:{x:-step,y:0},ArrowRight:{x:step,y:0},
  };
  const offset=offsets[event.key];
  if(!offset)return;
  event.preventDefault();
  moveFloating(id,{x:position.x+offset.x,y:position.y+offset.y});
 }

 function startMove(event:PointerEvent<HTMLElement>,id:PanelId){
  const position=floating.get(id);
  if(!position||!event.isPrimary||event.button!==0)return;
  suppressClick.current=null;
  const element=event.target;
  if(!(element instanceof Element)||element.closest('button, input, a, select, textarea, [contenteditable]'))return;
  // Keep a short click on the original element, including a point on an SVG plot.
  element.setPointerCapture(event.pointerId);
  move.current={id,pointer:event.pointerId,origin:{x:event.clientX,y:event.clientY},position,dragged:false};
 }

 function updateMove(event:PointerEvent<HTMLElement>,id:PanelId){
  const moving=move.current;
  if(!moving||moving.id!==id||moving.pointer!==event.pointerId)return;
  const dx=event.clientX-moving.origin.x,dy=event.clientY-moving.origin.y;
  if(!moving.dragged&&Math.hypot(dx,dy)<4)return;
  moving.dragged=true;
  suppressClick.current=id;
  moveFloating(id,{x:moving.position.x+dx,y:moving.position.y+dy});
 }

 return <aside className="analysis-dock" ref={dock} aria-label="Analysis plots">
  <p className="sr-only" id={instructions}>Use the arrow keys to move a floating panel.</p>
  <div className="sr-only" role="status">{announcement}</div>
  {PANEL_ORDER.map(id=>{
   const title=titles[id];
   const position=floating.get(id);
   const toggleLabel=position?`Dock ${title}`:`Float ${title}`;
   const controls:DisclosureControls={
    open:expanded[id],
    onToggle:()=>setExpanded(current=>({...current,[id]:!current[id]})),
    action:<button type="button" className="analysis-panel-icon" title={toggleLabel} aria-label={toggleLabel}
     aria-describedby={position?instructions:undefined} ref={el=>{pins.current[id]=el;}}
     onKeyDown={position?event=>moveWithKeyboard(event,id,position):undefined} onClick={()=>toggleFloating(id)}>
     {position?<PinOff size={15} aria-hidden="true"/>:<Pin size={15} aria-hidden="true"/>}
    </button>,
   };
   const panel=<section key={id} ref={el=>{cards.current[id]=el;}} aria-label={title}
    className={`analysis-dock-card${position?' is-floating':''}`}
    style={position?{left:position.x,top:position.y,width:FLOATING_WIDTH,zIndex:activeWindows.indexOf(id)+6}:undefined}
    onPointerDown={position?event=>{raise(id);startMove(event,id);}:undefined}
    onPointerMove={position?event=>updateMove(event,id):undefined}
    onLostPointerCapture={event=>{if(move.current?.pointer===event.pointerId)move.current=null;}}
    onClickCapture={event=>{
     if(suppressClick.current!==id||event.detail===0)return;
     suppressClick.current=null;
     event.preventDefault();
     event.stopPropagation();
    }}
    onFocus={position?()=>raise(id):undefined}>
    {id==='horizon'?<HorizonPanel analysis={analysis} index={index} baseline={baseline} controls={controls}/>:
     <TimelineChart body={id} analysis={analysis} index={index} onIndex={onIndex} baseline={baseline} baselineLabel="0 m" currentLabel={`${analysis.height_m} m`} collapsible controls={controls} floating={!!position}/>}
   </section>;
   // Render floating plots alongside the timeline, outside the Results scroll container.
   const workspace=timeline.current?.parentElement;
   return position&&workspace?createPortal(panel,workspace,id):panel;
  })}
 </aside>;
}
