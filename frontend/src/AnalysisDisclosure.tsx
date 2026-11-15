import {useId,useState,type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';

export type DisclosureControls={action:ReactNode;open:boolean;onToggle:()=>void};

export default function AnalysisDisclosure({title,headingClassName='block-head',titleClassName,summary,controls,children}:{title:string;headingClassName?:string;titleClassName?:string;summary?:ReactNode;controls?:DisclosureControls;children:ReactNode}){
 const contentId=useId();
 const [localOpen,setLocalOpen]=useState(true);
 const open=controls?.open??localOpen;
 return <>
  <div className={`${headingClassName}${controls?' analysis-panel-heading':''}`}>
   <div className="analysis-disclosure-title-row">
    <h3 className="analysis-disclosure-title">
     <button type="button" className="analysis-disclosure-toggle" aria-expanded={open} aria-controls={contentId} onClick={controls?.onToggle??(()=>setLocalOpen(value=>!value))}>
      <ChevronDown size={13} aria-hidden="true"/>
      <span className={titleClassName}>{title}</span>
     </button>
    </h3>
    {controls?.action}
   </div>
   {summary}
  </div>
  <div id={contentId} hidden={!open}>{children}</div>
 </>;
}
