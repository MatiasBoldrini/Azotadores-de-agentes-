// Backend-first reading of an operator request: OpenAI on the server when configured,
// the local parser otherwise. Either way only an Operation comes back; the planner computes
// every time and duration shown to the user from the engine output.
import {clampHours,MAX_HOURS,MAX_STEPS,MIN_HOURS,parseOperation} from './intent.ts';
import type {Need,Operation} from './planner.ts';
import type {Insight} from './advisor.ts';

export const AGENT_TIMEOUT_MS = 20_000;
export type AgentSource = 'openai'|'local';
export type AgentAnswer =
 | {ok:true;op:Operation;note:string;source:AgentSource;fallbackReason?:string}
 | {ok:false;note:string;source:AgentSource;fallbackReason?:string};

const NEEDS:Need[] = ['sun','earth','both'];
const isObj = (v:unknown):v is Record<string,any> => v!==null&&typeof v==='object'&&!Array.isArray(v);

/** Accepts only what the planner can run; anything else is treated as a backend failure. */
export function validateAgentPayload(payload:unknown):AgentAnswer {
 if(!isObj(payload)||typeof payload.understood!=='boolean'||typeof payload.note!=='string') throw new Error('invalid agent response');
 if(!payload.understood) return {ok:false,note:payload.note,source:'openai'};
 const op = payload.operation;
 if(!isObj(op)||typeof op.name!=='string'||!Array.isArray(op.steps)||op.steps.length<1||op.steps.length>MAX_STEPS) throw new Error('invalid agent operation');
 const steps = op.steps.map((s:unknown)=>{
  if(!isObj(s)||!NEEDS.includes(s.need)||typeof s.hours!=='number'||!Number.isFinite(s.hours)||s.hours<MIN_HOURS||s.hours>MAX_HOURS||typeof s.label!=='string'||!s.label.trim())
   throw new Error('invalid agent step');
  return {need:s.need as Need,hours:clampHours(s.hours),label:s.label.slice(0,80)};
 });
 return {ok:true,op:{id:'custom',name:op.name.slice(0,60)||'Your request',steps},note:payload.note,source:'openai'};
}

function local(text:string,fallbackReason?:string):AgentAnswer {
 const parsed = parseOperation(text);
 if(!parsed.ok) return {ok:false,note:parsed.reason,source:'local',fallbackReason};
 return {ok:true,op:parsed.op,note:parsed.assumed.length?`Assumed ${parsed.assumed.join('; ')}.`:'',source:'local',fallbackReason};
}

export async function askAgent(text:string,{baseUrl='',timeoutMs=AGENT_TIMEOUT_MS,signal,fetchImpl=fetch}:{baseUrl?:string;timeoutMs?:number;signal?:AbortSignal;fetchImpl?:typeof fetch}={}):Promise<AgentAnswer> {
 const request = text.trim().slice(0,500);
 if(!request) return {ok:false,note:'Describe the operation first.',source:'local'};
 const controller = new AbortController();
 const abort = () => controller.abort();
 signal?.addEventListener('abort',abort,{once:true});
 const timer = setTimeout(abort,timeoutMs);
 try{
  const response = await fetchImpl(`${baseUrl.replace(/\/$/,'')}/api/agent/operation`,{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:request}),signal:controller.signal});
  if(!response.ok) return local(request,response.status===503?'no language agent configured':response.status===422?'language agent declined':'no language agent on this server');
  return validateAgentPayload(await response.json());
 }catch(error){
  if(signal?.aborted) throw error;
  const reason = controller.signal.aborted?'language agent timed out'
   : error instanceof Error&&error.message.startsWith('invalid agent')?'language agent answer failed validation':'language agent unreachable';
  return local(request,reason);
 }finally{
  clearTimeout(timer);
  signal?.removeEventListener('abort',abort);
 }
}

// ---- Proactive briefing -------------------------------------------------------------
// The model only chooses and explains findings the advisor already computed. The server
// rejects any number not present in those findings; the browser checks the ids again.

export type BriefingPick = {id:string;reason:string};
export type Briefing = {headline:string;picks:BriefingPick[];source:AgentSource;fallbackReason?:string};
const TONE_ORDER = {risk:0,opportunity:1,alternative:2} as const;

/** Deterministic briefing: the most urgent finding first, used whenever the model is unavailable. */
export function localBriefing(items:Insight[],fallbackReason?:string):Briefing|null {
 const ranked = items.map((x,i)=>({x,i})).sort((p,q)=>TONE_ORDER[p.x.tone]-TONE_ORDER[q.x.tone]||p.i-q.i).map(p=>p.x);
 if(!ranked.length) return null;
 return {headline:ranked[0].title,picks:ranked.slice(0,3).map(x=>({id:x.id,reason:''})),source:'local',fallbackReason};
}

export function validateBriefing(payload:unknown,items:Insight[]):Briefing {
 if(!isObj(payload)||typeof payload.headline!=='string'||!payload.headline.trim()||!Array.isArray(payload.picks)||!payload.picks.length) throw new Error('invalid briefing');
 const ids = new Set(items.map(i=>i.id));
 const picks = payload.picks.slice(0,3).map((p:unknown)=>{
  if(!isObj(p)||typeof p.id!=='string'||!ids.has(p.id)||typeof p.reason!=='string') throw new Error('invalid briefing pick');
  return {id:p.id,reason:p.reason.slice(0,200)};
 });
 return {headline:payload.headline.slice(0,200),picks,source:'openai'};
}

/** Statuses that mean "no agent here": stop asking for the rest of the session. */
export const AGENT_ABSENT = new Set([404,405,501,503]);

export async function askBriefing(items:Insight[],operation:string,context:string,
 {baseUrl='',timeoutMs=AGENT_TIMEOUT_MS,signal,fetchImpl=fetch}:{baseUrl?:string;timeoutMs?:number;signal?:AbortSignal;fetchImpl?:typeof fetch}={}):Promise<{briefing:Briefing|null;absent:boolean}> {
 const facts = items.slice(0,12).map(i=>({id:i.id,tone:i.tone,title:i.title.slice(0,300),detail:i.detail.slice(0,500)}));
 if(!facts.length) return {briefing:null,absent:false};
 const controller = new AbortController();
 const abort = () => controller.abort();
 signal?.addEventListener('abort',abort,{once:true});
 const timer = setTimeout(abort,timeoutMs);
 try{
  const response = await fetchImpl(`${baseUrl.replace(/\/$/,'')}/api/agent/briefing`,{
   method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
   body:JSON.stringify({facts,operation:operation.slice(0,300),context:context.slice(0,300)})});
  if(!response.ok){
   const absent = AGENT_ABSENT.has(response.status);
   return {briefing:localBriefing(items,absent?'no language agent on this server':'agent briefing failed validation'),absent};
  }
  return {briefing:validateBriefing(await response.json(),items),absent:false};
 }catch(error){
  if(signal?.aborted) throw error;
  return {briefing:localBriefing(items,controller.signal.aborted?'agent briefing timed out':'agent briefing unavailable'),absent:false};
 }finally{
  clearTimeout(timer);
  signal?.removeEventListener('abort',abort);
 }
}
