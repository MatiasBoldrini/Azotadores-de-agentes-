// Backend-first reading of an operator request: OpenAI on the server when configured,
// the local parser otherwise. Either way only an Operation comes back; the planner computes
// every time and duration shown to the user from the engine output.
import {MAX_STEPS,parseOperation,validHours} from './intent.ts';
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
 if(!isObj(payload)||payload.source!=='openai'||typeof payload.understood!=='boolean'||typeof payload.note!=='string') throw new Error('invalid agent response');
 if(!payload.understood){
  if(payload.operation!==null) throw new Error('invalid agent operation');
  return {ok:false,note:payload.note,source:'openai'};
 }
 const op = payload.operation;
 if(!isObj(op)||typeof op.name!=='string'||!Array.isArray(op.steps)||op.steps.length<1||op.steps.length>MAX_STEPS) throw new Error('invalid agent operation');
 const steps = op.steps.map((s:unknown)=>{
  if(!isObj(s)||!NEEDS.includes(s.need)||!validHours(s.hours)||typeof s.label!=='string'||!s.label.trim())
   throw new Error('invalid agent step');
  return {need:s.need as Need,hours:s.hours,label:s.label.slice(0,80)};
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
  if(!response.ok) return local(request,response.status===503?'language agent unavailable':response.status===422?'language agent declined':response.status===429?'language agent rate limited':'language agent request failed');
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
// The model only ranks findings already computed by the advisor.

export type Briefing = {picks:string[];source:AgentSource;fallbackReason?:string};
type BriefingResult = {briefing:Briefing|null;absent:boolean;retryAfterMs?:number};
const TONE_ORDER = {risk:0,opportunity:1,alternative:2} as const;

/** Deterministic briefing: the most urgent finding first, used whenever the model is unavailable. */
export function localBriefing(items:Insight[],fallbackReason?:string):Briefing|null {
 const ranked = items.map((x,i)=>({x,i})).sort((p,q)=>TONE_ORDER[p.x.tone]-TONE_ORDER[q.x.tone]||p.i-q.i).map(p=>p.x);
 if(!ranked.length) return null;
 return {picks:ranked.slice(0,3).map(x=>x.id),source:'local',fallbackReason};
}

export function validateBriefing(payload:unknown,items:Pick<Insight,'id'>[]):Briefing {
 if(!isObj(payload)||payload.source!=='openai'||!Array.isArray(payload.picks)||!payload.picks.length||payload.picks.length>3) throw new Error('invalid briefing');
 const ids = new Set(items.map(i=>i.id));
 const picks = payload.picks.map((p:unknown)=>{
  if(typeof p!=='string'||!ids.delete(p)) throw new Error('invalid briefing pick');
  return p;
 });
 return {picks,source:'openai'};
}

/** Statuses that mean "no agent here": stop asking for the rest of the session. */
const AGENT_ABSENT = new Set([404,405,501]);

async function agentDisabled(response:Response):Promise<boolean> {
 if(AGENT_ABSENT.has(response.status)) return true;
 if(response.status!==503) return false;
 const body:unknown = await response.json().catch(()=>null);
 return isObj(body)&&(body.code==='agent_disabled'||body.detail?.code==='agent_disabled');
}

function retryAfterMs(response:Response):number {
 const value = response.headers?.get('Retry-After')?.trim();
 if(!value) return 60_000;
 const delay = /^\d+$/.test(value) ? Number(value)*1000 : Date.parse(value)-Date.now();
 return Number.isFinite(delay) ? Math.max(1000,delay) : 60_000;
}

export async function askBriefing(items:Insight[],operation:string,context:string,
 {baseUrl='',timeoutMs=AGENT_TIMEOUT_MS,signal,fetchImpl=fetch}:{baseUrl?:string;timeoutMs?:number;signal?:AbortSignal;fetchImpl?:typeof fetch}={}):Promise<BriefingResult> {
 signal?.throwIfAborted();
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
   if(response.status===429) return {briefing:localBriefing(items,'language agent rate limited'),absent:false,retryAfterMs:retryAfterMs(response)};
   const absent = await agentDisabled(response);
   controller.signal.throwIfAborted();
   const reason = absent?'no language agent on this server':'agent briefing unavailable';
   return {briefing:localBriefing(items,reason),absent};
  }
  const payload:unknown = await response.json();
  controller.signal.throwIfAborted();
  return {briefing:validateBriefing(payload,facts),absent:false};
 }catch(error){
  if(signal?.aborted) throw error;
  return {briefing:localBriefing(items,controller.signal.aborted?'agent briefing timed out':'agent briefing unavailable'),absent:false};
 }finally{
  clearTimeout(timer);
  signal?.removeEventListener('abort',abort);
 }
}
