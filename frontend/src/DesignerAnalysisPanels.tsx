import {useId,useLayoutEffect,useRef,useState,type DragEvent,type KeyboardEvent,type PointerEvent,type RefObject} from 'react';
import {GripVertical,Pin,PinOff} from 'lucide-react';
import AnalysisDisclosure,{type DisclosureControls} from './AnalysisDisclosure';
import {HorizonChart,TimelineChart,timelineTitle} from './Charts';
import type {Analysis} from './lib/science';

const titles={sun:timelineTitle('sun'),earth:timelineTitle('earth'),horizon:'Horizon from the station'};
type PanelId=keyof typeof titles;
type Point={x:number;y:number};
type DropTarget={id:PanelId;side:'before'|'after'};
type Move={id:PanelId;pointer:number;offset:Point};

export function HorizonPanel({analysis,index,baseline,controls}:{
 analysis:Analysis;index:number;baseline:Analysis;controls?:DisclosureControls;
}){
 const compare=baseline.candidate_id!==analysis.candidate_id||baseline.height_m!==analysis.height_m;
 return <AnalysisDisclosure title={titles.horizon} controls={controls}>
  <HorizonChart analysis={analysis} index={index} baseline={baseline}/>
  <div className="horizon-legend"><span><i className="lg-line"/>Horizon at {analysis.height_m} m</span>{compare&&<span><i className="lg-line dotted"/>Ground level</span>}<span><i className="dot-fill"/>In view <i className="dot-ring"/>Blocked</span></div>
 </AnalysisDisclosure>;
}

export default function DesignerAnalysisPanels({enabled,analysis,index,baseline,onIndex,timeline}:{
 enabled:boolean;analysis:Analysis;index:number;baseline:Analysis;onIndex:(index:number)=>void;timeline:RefObject<HTMLElement|null>;
}){
 const [order,setOrder]=useState<PanelId[]>(['sun','earth','horizon']);
 // Insertion order doubles as the floating windows' stacking order.
 const [floating,setFloating]=useState(new Map<PanelId,Point>());
 const [dragged,setDragged]=useState<PanelId|null>(null);
 const [dropTarget,setDropTarget]=useState<DropTarget|null>(null);
 const [announcement,setAnnouncement]=useState('');
 const dock=useRef<HTMLElement>(null);
 const cards=useRef<Partial<Record<PanelId,HTMLElement|null>>>({});
 const handles=useRef<Partial<Record<PanelId,HTMLButtonElement|null>>>({});
 const drag=useRef<PanelId|null>(null);
 const move=useRef<Move|null>(null);
 const instructions=useId();
 const activeWindows=Array.from(floating.keys());

 function constrain(id:PanelId,point:Point):Point{
  const card=cards.current[id];
  if(!card)return point;
  const top=(dock.current?.parentElement?.getBoundingClientRect().top??0)+8;
  const bottom=Math.min(window.innerHeight,timeline.current?.getBoundingClientRect().top??window.innerHeight)-8;
  return {
   x:Math.max(8,Math.min(point.x,window.innerWidth-card.offsetWidth-8)),
   y:Math.max(top,Math.min(point.y,bottom-card.offsetHeight)),
  };
 }

 useLayoutEffect(()=>{
  if(!enabled)return;
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
   drag.current=null;
   move.current=null;
  };
 },[enabled,timeline]);

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
  const dockBox=dock.current?.getBoundingClientRect();
  if(!card||!dockBox)return;
  const wasFloating=floating.has(id);
  setFloating(current=>{
   const next=new Map(current);
   if(wasFloating)next.delete(id);
   else next.set(id,{x:dockBox.right+12+current.size*16,y:card.top});
   return next;
  });
  setAnnouncement(`${titles[id]} ${wasFloating?'docked':'floating'}.`);
  if(wasFloating)requestAnimationFrame(()=>cards.current[id]?.scrollIntoView({block:'nearest'}));
 }

 function moveFloating(id:PanelId,point:Point){
  const fitted=constrain(id,point);
  setFloating(current=>{
   const previous=current.get(id);
   if(!previous||(previous.x===fitted.x&&previous.y===fitted.y))return current;
   return new Map(current).set(id,fitted);
  });
 }

 function reorder(id:PanelId,target:DropTarget){
  const docked=order.filter(panel=>panel!==id&&!floating.has(panel));
  docked.splice(docked.indexOf(target.id)+(target.side==='after'?1:0),0,id);
  let slot=0;
  setOrder(order.map(panel=>floating.has(panel)?panel:docked[slot++]));
  setAnnouncement(`${titles[id]}, position ${docked.indexOf(id)+1} of ${docked.length}.`);
 }

 function handleKey(event:KeyboardEvent<HTMLButtonElement>,id:PanelId){
  const position=floating.get(id);
  if(position){
   const step=event.shiftKey?48:16;
   const offset:Partial<Record<string,Point>>={
    ArrowUp:{x:0,y:-step},ArrowDown:{x:0,y:step},ArrowLeft:{x:-step,y:0},ArrowRight:{x:step,y:0},
   };
   const direction=offset[event.key];
   if(!direction)return;
   event.preventDefault();
   moveFloating(id,{x:position.x+direction.x,y:position.y+direction.y});
   return;
  }
  if(event.key!=='ArrowUp'&&event.key!=='ArrowDown')return;
  event.preventDefault();
  const docked=order.filter(panel=>!floating.has(panel));
  const up=event.key==='ArrowUp';
  const neighbor=docked[docked.indexOf(id)+(up?-1:1)];
  if(!neighbor)return;
  reorder(id,{id:neighbor,side:up?'before':'after'});
  requestAnimationFrame(()=>handles.current[id]?.focus());
 }

 function startDrag(event:DragEvent<HTMLButtonElement>,id:PanelId){
  const card=cards.current[id];
  if(!card||floating.has(id)){event.preventDefault();return;}
  const box=card.getBoundingClientRect();
  event.dataTransfer.effectAllowed='move';
  event.dataTransfer.setData('application/x-siteforge-analysis',id);
  event.dataTransfer.setDragImage(card,event.clientX-box.left,event.clientY-box.top);
  drag.current=id;
  setDragged(id);
 }

 function targetAt(y:number){
  let last:PanelId|undefined;
  for(const id of order){
   const card=cards.current[id];
   if(!card||id===drag.current||floating.has(id))continue;
   const box=card.getBoundingClientRect();
   if(y<box.top+box.height/2)return {id,side:'before'} as const;
   last=id;
  }
  return last?{id:last,side:'after'} as const:null;
 }

 function stopDrag(){
  drag.current=null;
  setDragged(null);
  setDropTarget(null);
 }

 function startMove(event:PointerEvent<HTMLButtonElement>,id:PanelId){
  const position=floating.get(id);
  if(!position||!event.isPrimary||event.button!==0)return;
  event.currentTarget.setPointerCapture(event.pointerId);
  move.current={id,pointer:event.pointerId,offset:{x:event.clientX-position.x,y:event.clientY-position.y}};
 }

 if(!enabled)return null;
 return <aside className="analysis-dock" ref={dock} aria-label="Analysis plots"
  onDragOver={event=>{
   if(!drag.current)return;
   event.preventDefault();
   event.dataTransfer.dropEffect='move';
   const target=targetAt(event.clientY);
   setDropTarget(previous=>previous?.id===target?.id&&previous?.side===target?.side?previous:target);
  }}
  onDrop={event=>{
   const id=drag.current;
   if(!id)return;
   event.preventDefault();
   const target=targetAt(event.clientY);
   if(target)reorder(id,target);
   stopDrag();
  }}>
  <p className="sr-only" id={instructions}>Use Up and Down to reorder docked panels. Use the arrow keys to move a floating panel.</p>
  <div className="sr-only" role="status">{announcement}</div>
  {order.map(id=>{
   const title=titles[id];
   const position=floating.get(id);
   const toggleLabel=position?`Dock ${title}`:`Float ${title}`;
   const handleLabel=position?`Move ${title}`:`Reorder ${title}`;
   const controls={
    handle:<button type="button" className="analysis-panel-icon analysis-panel-handle" title={handleLabel} aria-label={handleLabel}
     aria-describedby={instructions} draggable={!position} ref={el=>{handles.current[id]=el;}}
     onDragStart={event=>startDrag(event,id)} onDragEnd={stopDrag}
     onKeyDown={event=>handleKey(event,id)} onPointerDown={event=>startMove(event,id)}
     onPointerMove={event=>{
      const moving=move.current;
      if(!moving||moving.id!==id||moving.pointer!==event.pointerId)return;
      moveFloating(id,{x:event.clientX-moving.offset.x,y:event.clientY-moving.offset.y});
     }}
     onLostPointerCapture={()=>{if(move.current?.id===id)move.current=null;}}>
     <GripVertical size={15} aria-hidden="true"/>
    </button>,
    action:<button type="button" className="analysis-panel-icon" title={toggleLabel} aria-label={toggleLabel} onClick={()=>toggleFloating(id)}>
     {position?<PinOff size={15} aria-hidden="true"/>:<Pin size={15} aria-hidden="true"/>}
    </button>,
   };
   return <section key={id} ref={el=>{cards.current[id]=el;}} aria-label={title}
    className={`analysis-dock-card${position?' is-floating':''}${dragged===id?' is-dragging':''}`}
    data-drop={dropTarget?.id===id?dropTarget.side:undefined}
    style={position?{left:position.x,top:position.y,zIndex:activeWindows.indexOf(id)+1}:undefined}
    onPointerDown={position?()=>raise(id):undefined} onFocus={position?()=>raise(id):undefined}>
    {id==='horizon'?<HorizonPanel analysis={analysis} index={index} baseline={baseline} controls={controls}/>:
     <TimelineChart body={id} analysis={analysis} index={index} onIndex={onIndex} baseline={baseline} baselineLabel="0 m" currentLabel={`${analysis.height_m} m`} collapsible controls={controls}/>}
   </section>;
  })}
 </aside>;
}
