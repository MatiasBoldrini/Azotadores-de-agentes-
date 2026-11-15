// Local, offline reading of an operator request ("cargar 24 h y después transmitir 1 h").
// Used when the language agent is not reachable. It only maps words to visibility needs and
// durations; whether and when the operation fits is always computed by the planner.
import type {Need,Operation,Step} from './planner.ts';

export const MIN_HOURS = 0.5, MAX_HOURS = 336, MAX_STEPS = 4;

export type Parsed = {ok:true;op:Operation;assumed:string[]}|{ok:false;reason:string};

const fold = (s:string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');

const SUN = /\b(sol|solar|luz|ilumin\w*|energia|cargar?\w*|carga|bateria\w*|panel\w*|calent\w*|experiment\w*|sun|sunlight|power(ed)?|charg\w*|batter\w*|heat\w*|light)\b/;
const EARTH = /\b(tierra|earth|transmit\w*|enviar?\w*|envio|mandar?\w*|downlink|uplink|comunic\w*|radio|antena|senal|contacto|llamar?\w*|telemetr\w*|send\w*|comm(s|unicat\w*)?|call\w*|link|enlace|data\s+to\s+earth)\b/;
// Simultaneity and live-operation words mean Sun and Earth at the same time.
const BOTH = /\b(a la vez|al mismo tiempo|simultane\w*|mientras|at the same time|while (?:charging|powered|transmitting)|together|ambos|ambas|both)\b/;
const LIVE = /\b(en vivo|live|streaming|video|teleoper\w*|remote control|control remoto)\b/;
const THEN = /\s*(?:\by\s+(?:luego|despues|entonces)\b|\bluego\b|\bdespues(?:\s+de\s+eso)?\b|\bentonces\b|\band\s+then\b|\bthen\b|\bafter\s+that\b|\bafterwards\b|\bfinally\b|\bfinalmente\b|;|\.\s)\s*/;
const AND = /\s*(?:,|\by\b|\band\b)\s*/;

const WORD_NUM:Record<string,number> = {un:1,una:1,uno:1,a:1,an:1,one:1,dos:2,two:2,tres:3,three:3,cuatro:4,four:4,cinco:5,five:5,seis:6,six:6,
 siete:7,seven:7,ocho:8,eight:8,nueve:9,nine:9,diez:10,ten:10,doce:12,twelve:12,media:0.5,medio:0.5,half:0.5};
const UNIT = '(h|hs|hr|hrs|horas?|hours?|min|mins|minutos?|minutes?|d|dias?|days?|semanas?|weeks?)';
const DURATION = new RegExp(`(\\d+(?:[.,]\\d+)?|${Object.keys(WORD_NUM).join('|')})\\s*(?:-\\s*)?${UNIT}\\b`);

const DEFAULT_HOURS:Record<Need,number> = {sun:2,earth:1,both:6};
const LABEL:Record<Need,string> = {sun:'Run on solar power',earth:'Transmit to Earth',both:'Operate with power and an Earth link'};

/** Hours in a clause, or null when none is stated. */
export function hoursIn(clause:string):number|null {
 const text = fold(clause);
 if(/\bmedia hora\b|\bhalf an hour\b|\bhalf hour\b/.test(text)) return 0.5;
 const m = text.match(DURATION);
 if(!m) return null;
 const n = m[1] in WORD_NUM ? WORD_NUM[m[1]] : Number(m[1].replace(',','.'));
 const unit = m[2];
 const factor = /^(min|mins|minutos?|minutes?)$/.test(unit) ? 1/60 : /^(d|dias?|days?)$/.test(unit) ? 24 : /^(semanas?|weeks?)$/.test(unit) ? 168 : 1;
 return n*factor;
}

export const clampHours = (h:number) => Math.min(MAX_HOURS,Math.max(MIN_HOURS,Math.round(h*2)/2));

function needOf(clause:string):Need|null {
 const text = fold(clause);
 const sun = SUN.test(text), earth = EARTH.test(text), both = BOTH.test(text);
 if(LIVE.test(text)||both) return 'both';
 if(sun&&earth) return 'both';
 return sun?'sun':earth?'earth':null;
}

function labelFor(clause:string,need:Need):string {
 const text = fold(clause);
 if(need==='sun'&&/\b(cargar?\w*|carga|bateria\w*|charg\w*|batter\w*)\b/.test(text)) return 'Charge batteries';
 if(need==='sun'&&/\bexperiment\w*\b/.test(text)) return 'Run experiment on solar power';
 if(need==='earth'&&/\b(datos|data|resultados|results)\b/.test(text)) return 'Transmit results to Earth';
 if(need==='both'&&LIVE.test(text)) return 'Live operation with power and an Earth link';
 return LABEL[need];
}

/** Clauses in the order given; "A and B" becomes two steps only when both halves name a need. */
function clauses(text:string):string[] {
 return fold(text).split(THEN).flatMap(part=>{
  if(BOTH.test(part)||LIVE.test(part)) return [part];
  const pieces = part.split(AND).filter(p=>p.trim());
  return pieces.length>1&&pieces.every(p=>needOf(p)) ? pieces : [part];
 }).map(s=>s.trim()).filter(Boolean);
}

export function parseOperation(text:string):Parsed {
 const steps:Step[] = [], assumed:string[] = [];
 for(const clause of clauses(text)){
  const need = needOf(clause);
  if(!need) continue;
  const stated = hoursIn(clause);
  const hours = clampHours(stated??DEFAULT_HOURS[need]);
  if(stated===null) assumed.push(`${hours} h for “${clause}”`);
  else if(hours!==stated) assumed.push(`${stated} h rounded to ${hours} h`);
  steps.push({need,hours,label:labelFor(clause,need)});
 }
 if(!steps.length) return {ok:false,reason:'Could not tell what the operation needs. Say whether it needs the Sun (power), the Earth (radio link) or both, and for how long.'};
 if(steps.length>MAX_STEPS) assumed.push(`only the first ${MAX_STEPS} steps are planned`);
 const kept = steps.slice(0,MAX_STEPS);
 return {ok:true,op:{id:'custom',name:'Your request',steps:kept},assumed};
}
