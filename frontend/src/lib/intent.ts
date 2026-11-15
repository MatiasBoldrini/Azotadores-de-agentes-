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
const JOINT_BODIES = /\b(?:sol\s+y\s+tierra|tierra\s+y\s+sol|sun\s+and\s+earth|earth\s+and\s+sun)\b/;
const THEN = /\s*(?:\by\s+(?:luego|despues|entonces)\b|\bluego\b|\bdespues(?:\s+de\s+eso)?\b|\bentonces\b|\band\s+then\b|\bthen\b|\bafter\s+that\b|\bafterwards\b|\bfinally\b|\bfinalmente\b|;|\.\s)\s*/;
const AND = /\s*(?:,(?!\d)|\by\b|\band\b)\s*/;
const UNSUPPORTED = /\b(?:no|not|never|without|sin|wait\w*|esperar|espera|paus\w*|temperature|temperatura|slope|pendiente)\b|n['’]t\b/;
const DATE_OR_TIME = /\b(?:yesterday|today|tomorrow|ayer|hoy|manana|monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunes|martes|miercoles|jueves|viernes|sabado|domingo|utc|gmt)\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}(?::\d{2}|\s*[ap]m\b)/;

const WORD_NUM:Record<string,number> = {un:1,una:1,uno:1,a:1,an:1,one:1,dos:2,two:2,tres:3,three:3,cuatro:4,four:4,cinco:5,five:5,seis:6,six:6,
 siete:7,seven:7,ocho:8,eight:8,nueve:9,nine:9,diez:10,ten:10,doce:12,twelve:12,media:0.5,medio:0.5,half:0.5};
const UNIT = '(h|hs|hr|hrs|horas?|hours?|min|mins|minutos?|minutes?|d|dias?|days?|semanas?|weeks?)';
const DURATION = new RegExp(`(-?(?:\\d+(?:[.,]\\d+)?|[.,]\\d+)|\\b(?:half an|${Object.keys(WORD_NUM).join('|')}))\\s*(?:-\\s*)?${UNIT}\\b`, 'g');
const UNIT_WORD = /\b(?:h|hr|hrs|min|mins|horas?|hours?|minutos?|minutes?|dias?|days?|semanas?|weeks?)\b/;
const DURATION_WITH_OFFSET = new RegExp(`\\b(?:in|within|after|before|until|en|dentro de|despues de|antes de|hasta)\\s+${DURATION.source}`);

const DEFAULT_HOURS:Record<Need,number> = {sun:2,earth:1,both:6};
const LABEL:Record<Need,string> = {sun:'Run on solar power',earth:'Transmit to Earth',both:'Operate with power and an Earth link'};

function durationHours(m:RegExpMatchArray):number {
 const amount = m[1] === 'half an' ? 'half' : m[1];
 const n = WORD_NUM[amount] ?? Number(amount.replace(',','.'));
 const unit = m[2];
 const factor = /^(min|mins|minutos?|minutes?)$/.test(unit) ? 1/60 : /^(d|dias?|days?)$/.test(unit) ? 24 : /^(semanas?|weeks?)$/.test(unit) ? 168 : 1;
 return n*factor;
}

export function hoursIn(clause:string):number|null {
 const [duration] = fold(clause).matchAll(DURATION);
 return duration ? durationHours(duration) : null;
}

export function validHours(value:unknown):value is number {
 return typeof value==='number'&&value>=MIN_HOURS&&value<=MAX_HOURS&&Number.isInteger(value*2);
}

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

/** Keep every step in the order given, including clauses that need validation. */
function clauses(text:string):string[] {
 return text.split(THEN).flatMap(part=>{
  const pieces = part.split(AND).filter(piece=>piece.trim());
  if((BOTH.test(part)||LIVE.test(part)||JOINT_BODIES.test(part))&&pieces.every(piece=>needOf(piece))) return [part];
  return pieces;
 }).map(s=>s.trim()).filter(Boolean);
}

export function parseOperation(text:string):Parsed {
 const normalized = fold(text);
 const parts = clauses(normalized);
 if(!parts.length||UNSUPPORTED.test(normalized)||DATE_OR_TIME.test(normalized)||DURATION_WITH_OFFSET.test(normalized)) return {ok:false,reason:'Describe each step using only Sun (power), the Earth (radio link) or both, and a duration. The planner cannot represent waits, dates, negations or other conditions.'};
 if(parts.length>MAX_STEPS) return {ok:false,reason:`The planner can run at most ${MAX_STEPS} steps. Split this request into shorter operations.`};
 const steps:Step[] = [], assumed:string[] = [];
 for(const clause of parts){
  const need = needOf(clause);
  if(!need) return {ok:false,reason:'Could not tell what every step needs. Say whether each needs the Sun (power), the Earth (radio link) or both, and for how long.'};
  const durations = [...clause.matchAll(DURATION)];
  if(durations.length>1||UNIT_WORD.test(clause.replace(DURATION,''))) return {ok:false,reason:'Give one duration per step, for example 1.5 h or 30 minutes.'};
  const stated = durations.length===1 ? durationHours(durations[0]) : null;
  if(stated!==null&&!(stated>0&&stated<=MAX_HOURS)) return {ok:false,reason:`Each step needs a positive duration up to ${MAX_HOURS} h.`};
  const hours = stated===null ? DEFAULT_HOURS[need] : Math.ceil(stated*2)/2;
  if(stated===null) assumed.push(`${hours} h for “${clause}”`);
  else if(hours!==stated) assumed.push(`${stated} h rounded to ${hours} h`);
  steps.push({need,hours,label:labelFor(clause,need)});
 }
 return {ok:true,op:{id:'custom',name:'Your request',steps},assumed};
}
