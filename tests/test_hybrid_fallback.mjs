import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadHybridWindow,optimizeHybrid} from '../frontend/src/lib/hybridScience.ts';
import {keyFor,optimize} from '../frontend/src/lib/science.ts';
import manifest from '../frontend/src/lib/observationEphemerisManifest.json' with {type:'json'};
const snapshot=JSON.parse(readFileSync(new URL('../public/data/snapshot.json',import.meta.url)));
const all=snapshot.analyses, subset=all.slice(0,5), start=manifest.start_utc,end=manifest.splice_utc;
const constraints={minSun:70,minEarth:40,maxOutage:360,maxDistance:1000,maxSlope:20,requireLink:true};
const originalFetch=globalThis.fetch;
const envelope={schema_version:1,snapshot_sha256:manifest.snapshot_sha256,start,end};
const failed=async()=>new Response('unavailable',{status:503});
test.afterEach(()=>{globalThis.fetch=originalFetch;});

test('healthy backend is used and identified, retaining requested subset',async()=>{
 globalThis.fetch=async()=>Response.json({...envelope,analyses:subset});
 const r=await loadHybridWindow([subset[0]],start,end);
 assert.equal(r.source,'backend');assert.equal(r.reason,null);assert.deepEqual(r.analyses,[subset[0]]);
});
for(const failure of ['http','network','malformed','wrong-version','timeout'])test(`${failure}: verified local window replaces failed backend`,async()=>{
 globalThis.fetch=failure==='http'?failed:failure==='network'?async()=>{throw new TypeError('offline');}:failure==='timeout'?async()=>new Promise(()=>{}):async()=>Response.json(failure==='malformed'?{}:{...envelope,snapshot_sha256:'0'.repeat(64),analyses:subset});
 const r=await loadHybridWindow(subset,start,end,{timeoutMs:10});
 assert.equal(r.source,'cache');assert.ok(r.reason);assert.deepEqual(r.analyses,subset);
});
test('unsupported dates fail without sending a request or synthesizing data',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return failed();};
 await assert.rejects(loadHybridWindow(subset,'2027-05-01T00:00:00Z','2027-05-02T00:00:00Z'),/covered UTC dates/);
 assert.equal(calls,0);
});
test('cancelling a pending request does not invoke fallback',async()=>{
 const abort=new AbortController();let calls=0;
 globalThis.fetch=async()=>{calls++;return new Promise(()=>{});};
 const pending=loadHybridWindow(subset,start,end,{signal:abort.signal});abort.abort();
 await assert.rejects(pending,{name:'AbortError'});assert.equal(calls,1);
});
test('missing monthly fallback fails explicitly rather than using November',async()=>{
 globalThis.fetch=failed;
 await assert.rejects(loadHybridWindow(subset,'2027-03-01T00:00:00Z','2027-04-01T00:00:00Z'),/Observation data unavailable/);
});
test('corrupt monthly fallback fails integrity validation',async()=>{
 globalThis.fetch=async url=>String(url).startsWith('/api/')?failed():new Response(new Uint8Array(8));
 await assert.rejects(loadHybridWindow(subset,'2027-03-01T00:00:00Z','2027-04-01T00:00:00Z'),/Unexpected size/);
});
test('extended month fallback uses validated real binary data',async()=>{
 globalThis.fetch=async url=>String(url).startsWith('/api/')?failed():new Response(readFileSync(new URL('../public'+url,import.meta.url)));
 const r=await loadHybridWindow(subset,'2027-03-01T00:00:00Z','2027-04-01T00:00:00Z');
 assert.equal(r.source,'cache');assert.equal(r.analyses.length,5);
 assert.equal(r.analyses[0].metrics.sun.duration_hours,744);
 assert.equal(r.analyses[0].series.timestamp_utc.at(-1),'2027-04-01T00:00:00+00:00');
});
test('optimizer fallback matches both landers and preserves genuine infeasibility',async()=>{
 globalThis.fetch=failed;
 for(const site of snapshot.sites)for(const limit of [360,240]){
  const c={...constraints,maxOutage:limit};const expected=optimize(all,snapshot.links[site.id],c);
  const response=await optimizeHybrid(all,snapshot.links[site.id],c,site.id);
  assert.equal(response.source,'cache');assert.equal(response.result.feasible,expected.feasible);
  assert.deepEqual(response.result.alternatives.map(keyFor),expected.alternatives.map(keyFor));
  if(limit===240)assert.equal(response.result.recommended,null);
 }
});
test('a recovered backend is attempted again after fallback',async()=>{
 globalThis.fetch=failed;assert.equal((await loadHybridWindow(subset,start,end)).source,'cache');
 globalThis.fetch=async()=>Response.json({...envelope,analyses:subset});
 assert.equal((await loadHybridWindow(subset,start,end)).source,'backend');
});
test('stalled fallback times out and a subsequent selection retries successfully',async()=>{
 globalThis.fetch=async url=>String(url).startsWith('/api/')?failed():new Promise(()=>{});
 await assert.rejects(loadHybridWindow(subset,'2027-02-01T00:00:00Z','2027-03-01T00:00:00Z',{timeoutMs:10}),/Cached observation request timed out/);
 globalThis.fetch=async url=>String(url).startsWith('/api/')?failed():new Response(readFileSync(new URL('../public'+url,import.meta.url)));
 const r=await loadHybridWindow(subset,'2027-02-01T00:00:00Z','2027-03-01T00:00:00Z');
 assert.equal(r.source,'cache');assert.equal(r.analyses[0].metrics.sun.duration_hours,672);
});
test('cancelling a stalled fallback settles the selection immediately',async()=>{
 const abort=new AbortController();let started;
 const downloading=new Promise(resolve=>{started=resolve;});
 globalThis.fetch=async url=>{if(String(url).startsWith('/api/'))return failed();started();return new Promise(()=>{});};
 const pending=loadHybridWindow(subset,'2027-01-01T00:00:00Z','2027-02-01T00:00:00Z',{signal:abort.signal,timeoutMs:30});
 await downloading;abort.abort();await assert.rejects(pending,{name:'AbortError'});
});
test('invalid optimizer inputs never turn a backend rejection into a fabricated local recommendation',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return failed();};
 for(const c of [{...constraints,minSun:NaN},{...constraints,maxDistance:-1},{...constraints,minEarth:101}]){
  await assert.rejects(optimizeHybrid(all,snapshot.links['ridge-a'],c,'ridge-a'),/Invalid scientific search/);
 }
 await assert.rejects(optimizeHybrid(all,snapshot.links['ridge-a'],constraints,'unknown-site'),/Invalid scientific search/);
 assert.equal(calls,0);
});
