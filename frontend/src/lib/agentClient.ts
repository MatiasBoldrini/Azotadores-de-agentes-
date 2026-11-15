// Backend-first reading of an operator request: OpenAI on the server when configured,
// the local parser otherwise. Either way only an Operation comes back; the planner computes
// every time and duration shown to the user from the engine output.
import {MAX_STEPS,parseOperation,validHours} from './intent.ts';
import type {Need,Operation} from './planner.ts';

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
