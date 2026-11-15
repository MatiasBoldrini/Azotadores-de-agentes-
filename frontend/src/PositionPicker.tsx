import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { Point } from './lib/science';
import './PositionPicker.css';

export type EvaluatedPosition = { id: string; label: string; position: Point };

type Props = {
 options: EvaluatedPosition[];
 value: string;
 onPreview: (id: string | null) => void;
 onSelect: (id: string) => void;
};

export default function PositionPicker({options, value, onPreview, onSelect}: Props) {
 const id = useId();
 const root = useRef<HTMLDivElement>(null);
 const trigger = useRef<HTMLButtonElement>(null);
 const list = useRef<HTMLUListElement>(null);
 const [open, setOpen] = useState(false);
 const [active, setActive] = useState<string | null>(null);
 const [placement, setPlacement] = useState({above: false, maxHeight: 260});
 const selected = options.find(option => option.id === value);
 const optionId = (option: string) => `${id}-option-${option}`;

 const preview = (option: string | null) => {
  setActive(option);
  onPreview(option);
 };

 const close = useCallback(() => {
  setOpen(false);
  setActive(null);
  onPreview(null);
 }, [onPreview]);

 const commit = (option: string) => {
  close();
  if (option !== value) onSelect(option);
 };

 useEffect(() => {
  if (!open) return;
  const dismissOutside = (event: PointerEvent) => {
   if (!root.current?.contains(event.target as Node)) close();
  };
  document.addEventListener('pointerdown', dismissOutside);
  return () => document.removeEventListener('pointerdown', dismissOutside);
 }, [open, close]);

 useLayoutEffect(() => {
  if (!open) return;
  const positionList = () => {
   const bounds = trigger.current?.getBoundingClientRect();
   if (!bounds) return;
   const below = window.innerHeight - bounds.bottom - 12;
   const above = bounds.top - 12;
   const flip = below < 230 && above > below;
   setPlacement({above: flip, maxHeight: Math.min(260, Math.max(100, flip ? above : below))});
  };
  positionList();
  window.addEventListener('resize', positionList);
  return () => window.removeEventListener('resize', positionList);
 }, [open]);

 function reveal(option: string) {
  const element = document.getElementById(optionId(option));
  const container = list.current;
  if (!element || !container) return;
  const top = element.offsetTop;
  const bottom = top + element.offsetHeight;
  if (top < container.scrollTop) container.scrollTop = top;
  if (bottom > container.scrollTop + container.clientHeight) {
   container.scrollTop = bottom - container.clientHeight;
  }
 }

 useLayoutEffect(() => {
  if (open) reveal(active ?? value);
 }, [open, value, placement]);

 function handleKey(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.key === 'Tab' && open) {
   close();
   return;
  }
  if (event.key === 'Escape' && open) {
   event.preventDefault();
   close();
   return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
   event.preventDefault();
   if (!open) {
    setOpen(true);
    preview(value);
   } else {
    commit(active ?? value);
   }
   return;
  }
  const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
  const first = event.key === 'Home';
  const last = event.key === 'End';
  if (!direction && !(open && (first || last))) return;
  event.preventDefault();
  const index = options.findIndex(option => option.id === (active ?? value));
  const next = first ? 0 : last ? options.length - 1 : Math.max(0, Math.min(options.length - 1, index + direction));
  const option = options[next]?.id;
  if (!option) return;
  if (!open) setOpen(true);
  preview(option);
  reveal(option);
 }

 return <div className="control-label position-picker" ref={root} onBlur={event => {
  if (open && !event.currentTarget.contains(event.relatedTarget)) close();
 }}>
  <div id={`${id}-label`}>Evaluated position</div>
  <button type="button" ref={trigger} className="position-trigger" role="combobox"
   aria-labelledby={`${id}-label`} aria-expanded={open}
   aria-controls={open ? `${id}-list` : undefined}
   aria-activedescendant={open && active ? optionId(active) : undefined}
   onKeyDown={handleKey} onClick={event => {
    event.currentTarget.focus({preventScroll: true});
    if (open) close();
    else setOpen(true);
   }}>
   {selected?.label}
   <ChevronDown size={14} aria-hidden="true"/>
  </button>
  {open && <ul id={`${id}-list`} className="position-list" role="listbox" tabIndex={-1}
   aria-labelledby={`${id}-label`} ref={list} data-above={placement.above}
   style={{maxHeight: placement.maxHeight}}
   onPointerLeave={event => { if (event.pointerType !== 'touch') preview(null); }}>
   {options.map(option => <li key={option.id} id={optionId(option.id)} role="option"
    aria-selected={option.id === value} data-active={option.id === active}
    onPointerMove={event => {
     if (event.pointerType !== 'touch' && option.id !== active) preview(option.id);
    }}
    onMouseDown={event => event.preventDefault()}
    onClick={() => commit(option.id)}>
    {option.label}
    {option.id === value && <Check size={14} aria-hidden="true"/>}
   </li>)}
  </ul>}
 </div>;
}
