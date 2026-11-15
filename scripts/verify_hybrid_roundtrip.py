"""Round-trip actual FastAPI calculations through production TypeScript clients.

Run: .venv/bin/python scripts/verify_hybrid_roundtrip.py
Uses in-process FastAPI TestClient (no listening HTTP server or browser). Only the
transport is substituted: production clients consume actual serialized endpoint
responses. Forced 503 then exercises real static binary shard loading/fallback.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from fastapi.testclient import TestClient
from siteforge.api import app

NODE_CHECK = r'''
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root = process.cwd();
const {backendWindow, backendOptimize} = await import(pathToFileURL(path.join(root,'frontend/src/lib/backendScience.ts')));
const {loadHybridWindow, optimizeHybrid} = await import(pathToFileURL(path.join(root,'frontend/src/lib/hybridScience.ts')));
const {keyFor} = await import(pathToFileURL(path.join(root,'frontend/src/lib/science.ts')));
const evidence=JSON.parse(fs.readFileSync(process.argv[1]));
const snapshot=JSON.parse(fs.readFileSync(path.join(root,'public/data/snapshot.json')));
let mode='backend',current,requestCount=0,shardRequests=0;
const jsonResponse=payload=>({ok:true,status:200,json:async()=>payload});
globalThis.fetch=async(url,init)=>{
 if(String(url).startsWith('/api/science/')) {
  requestCount++;
  if(mode==='unavailable')return {ok:false,status:503};
  const body=JSON.parse(init.body);
  assert.equal(body.snapshot_sha256,evidence.snapshot_sha256);
  assert.equal(Date.parse(body.start),Date.parse(current.start));
  assert.equal(Date.parse(body.end),Date.parse(current.end));
  if(url.endsWith('/window')){
   const candidates=body.candidate_ids;
   const filename=candidates.length===1?current.compare_files[candidates[0]]:current.window_file;
   assert.ok(filename,'actual endpoint response exists for requested candidate set');
   return jsonResponse(JSON.parse(fs.readFileSync(filename)));
  }
  assert.ok(url.endsWith('/optimize'));
  const entry=current.rankings.find(r=>r.site_id===body.site_id&&JSON.stringify(r.constraints)===JSON.stringify(body.constraints));
  assert.ok(entry,'actual endpoint response exists for requested optimization');
  return jsonResponse(JSON.parse(fs.readFileSync(entry.file)));
 }
 assert.match(String(url),/^\/data\/observation-ephemeris\/\d{4}-\d{2}\.f64$/);
 shardRequests++;
 const bytes=fs.readFileSync(path.join(root,'public',String(url)));
 return {ok:true,status:200,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
};
const summary=[];
const ranked=result=>({evaluated:result.evaluated,feasible:result.feasible,recommended:result.recommended?keyFor(result.recommended):null,alternatives:result.alternatives.map(keyFor)});
for(const run of evidence.runs){
 current=run;mode='backend';
 const direct=await backendWindow(snapshot.analyses,run.start,run.end);
 const online=await loadHybridWindow(snapshot.analyses,run.start,run.end);
 assert.equal(online.source,'backend');assert.equal(online.reason,null);
 mode='unavailable';
 const offline=await loadHybridWindow(snapshot.analyses,run.start,run.end);
 assert.equal(offline.source,'cache');assert.match(offline.reason,/503/);
 assert.equal(online.analyses.length,130);assert.equal(offline.analyses.length,130);
 let maxAngleDifference=0,samples=0;
 for(let i=0;i<130;i++){
  const a=online.analyses[i],b=offline.analyses[i];
  assert.equal(keyFor(a),keyFor(b));
  assert.deepEqual(a.metrics,b.metrics);
  assert.deepEqual(a.metrics,direct[i].metrics);
  for(const name of ['sun_visible','earth_visible','both_visible'])assert.deepEqual(a.series[name],b.series[name]);
  for(const name of ['sun_azimuth_deg','earth_azimuth_deg','sun_elevation_deg','earth_elevation_deg','sun_horizon_deg','earth_horizon_deg']){
   assert.equal(a.series[name].length,b.series[name].length);
   for(let j=0;j<a.series[name].length;j++){
    const delta=Math.abs(a.series[name][j]-b.series[name][j]);
    maxAngleDifference=Math.max(maxAngleDifference,delta);assert.ok(delta<1e-9,`${keyFor(a)}/${name}/${j}: ${delta}`);
   }
  }
  samples+=a.series.timestamp_utc.length;
 }
 const comparison=[];
 for(const site of snapshot.sites){
  const initial=snapshot.analyses.filter(a=>a.candidate_id===site.candidate_id&&a.height_m===0);
  mode='backend';const compared=await loadHybridWindow(initial,run.start,run.end);
  assert.equal(compared.source,'backend');assert.equal(compared.analyses.length,1);
  assert.deepEqual(compared.analyses[0].metrics,offline.analyses.find(a=>keyFor(a)===keyFor(initial[0])).metrics);
  comparison.push(site.id);
 }
 const rankings=[];
 for(const test of run.rankings){
  const links=snapshot.links[test.site_id];
  mode='backend';
  const directRank=await backendOptimize(online.analyses,links,test.constraints,test.site_id);
  if(test.label==='infeasible')assert.equal(directRank.feasible,0,'strict case must have no feasible candidates');
  const onlineRank=await optimizeHybrid(online.analyses,links,test.constraints,test.site_id);
  assert.equal(onlineRank.source,'backend');
  mode='unavailable';
  const offlineRank=await optimizeHybrid(offline.analyses,links,test.constraints,test.site_id);
  assert.equal(offlineRank.source,'cache');assert.match(offlineRank.reason,/503/);
  assert.deepEqual(ranked(directRank),ranked(offlineRank.result));
  assert.deepEqual(ranked(onlineRank.result),ranked(offlineRank.result));
  rankings.push({site_id:test.site_id,case:test.label,...ranked(directRank)});
 }
 mode='backend';const recovered=await loadHybridWindow(snapshot.analyses,run.start,run.end);
 assert.equal(recovered.source,'backend');
 summary.push({start:run.start,end:run.end,configurations:130,samples_per_body:samples,max_angle_difference_deg:maxAngleDifference,metric_objects_compared:390,compare_sites:comparison,rankings,backend_to_cache_to_backend:'passed'});
}
console.log(JSON.stringify({status:'passed',runs:summary,transport_requests:requestCount,verified_binary_shard_requests:shardRequests}));
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT/'docs/verification/hybrid-roundtrip.json')
    args = parser.parse_args()
    raw = (ROOT/'public/data/snapshot.json').read_bytes()
    snapshot = json.loads(raw)
    digest = hashlib.sha256(raw).hexdigest()
    defaults = dict(minSun=70, minEarth=40, maxOutage=360, maxDistance=1000, maxSlope=20, requireLink=True)
    ranges = [('2026-11-01','2026-12-01'),('2026-11-29','2026-12-05'),('2027-04-01','2027-05-01')]
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix='nasa-hybrid-roundtrip-') as temporary, TestClient(app) as client:
        directory = Path(temporary)
        requests = []
        def request(endpoint, payload, filename):
            t = time.monotonic()
            response = client.post(endpoint, json={**payload, 'snapshot_sha256':digest})
            if response.status_code != 200:
                raise AssertionError(f'{endpoint}: {response.status_code}: {response.text}')
            target = directory/filename
            target.write_bytes(response.content)
            requests.append(dict(endpoint=endpoint,status=response.status_code,seconds=round(time.monotonic()-t,3),response_bytes=len(response.content)))
            return str(target)
        runs = []
        for index,(start,end) in enumerate(ranges):
            window = dict(start=start+'T00:00:00+00:00',end=end+'T00:00:00+00:00')
            window_file = request('/api/science/window', window, f'window-{index}.json')
            compare_files = {}
            for site in snapshot['sites']:
                candidate = site['candidate_id']
                compare_files[candidate] = request('/api/science/window',{**window,'candidate_ids':[candidate]},f'compare-{index}-{site["id"]}.json')
            rankings = []
            for site in snapshot['sites']:
                for label,constraints in [('default',defaults),('infeasible',{**defaults,'maxSlope':0})]:
                    payload = {**window,'site_id':site['id'],'constraints':constraints}
                    filename = request('/api/science/optimize',payload,f'ranking-{index}-{site["id"]}-{label}.json')
                    rankings.append(dict(site_id=site['id'],label=label,constraints=constraints,file=filename))
            runs.append({**window,'window_file':window_file,'compare_files':compare_files,'rankings':rankings})
            print(f'Calculated real API responses for {start} through {end}',file=sys.stderr,flush=True)
        input_file = directory/'inputs.json'
        input_file.write_text(json.dumps(dict(snapshot_sha256=digest,runs=runs)))
        process = subprocess.run(['node','--input-type=module','-e',NODE_CHECK,str(input_file)],cwd=ROOT,capture_output=True,text=True)
        if process.returncode:
            raise AssertionError(process.stderr or process.stdout)
        result = json.loads(process.stdout)
    result.update(snapshot_sha256=digest,elapsed_seconds=round(time.monotonic()-started,3),actual_api_requests=requests,
                  scope='Actual in-process FastAPI responses consumed by production TypeScript backend and hybrid clients; forced HTTP 503 fallback consumes real verified static .f64 shards.',
                  limitations=['Transport fetch was substituted; no listening HTTP server, proxy, CORS or deployment verified.','No browser DOM, WebGL rendering or visual interaction is claimed.','Parity of the documented model does not establish absolute physical accuracy.'])
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))

if __name__ == '__main__':
    main()
