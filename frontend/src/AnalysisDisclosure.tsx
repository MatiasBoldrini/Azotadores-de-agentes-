import {useId,useState,type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';

export default function AnalysisDisclosure({title,headingClassName='block-head',titleClassName,summary,children}:{title:string;headingClassName?:string;titleClassName?:string;summary?:ReactNode;children:ReactNode}){
 const contentId=useId();
 const [open,setOpen]=useState(true);
 return <>
  <div className={headingClassName}>
   <h3 className="analysis-disclosure-title">
    <button type="button" className="analysis-disclosure-toggle" aria-expanded={open} aria-controls={contentId} onClick={()=>setOpen(value=>!value)}>
     <ChevronDown size={13} aria-hidden="true"/>
     <span className={titleClassName}>{title}</span>
    </button>
   </h3>
   {summary}
  </div>
  <div id={contentId} hidden={!open}>{children}</div>
 </>;
}
