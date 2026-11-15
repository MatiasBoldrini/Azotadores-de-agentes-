"""Compare real FastAPI routes with production TypeScript calculations.
Run from any directory: .venv/bin/python scripts/verify_api_parity.py [report.json]
Exit 1 means API/frontend incompatibilities were observed, not a passing integration.
Uses in-process ASGI HTTP, not a listening server or browser interaction.
"""
import hashlib, json, os, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
sys.path.insert(0,str(ROOT))
from fastapi.testclient import TestClient
from siteforge.api import app
s=json.load(open('public/data/snapshot.json'))
c=TestClient(app)
report={'timestamp_utc':datetime.now(timezone.utc).isoformat(),'snapshot_sha256':hashlib.sha256(Path('public/data/snapshot.json').read_bytes()).hexdigest(),'transport':'FastAPI TestClient, no listening HTTP server','mismatches':[],'optimizations':[]}
js="""
import fs from 'node:fs';
import {sliceAnalysis,optimize,keyFor} from './frontend/src/lib/science.ts';
const s=JSON.parse(fs.readFileSync('public/data/snapshot.json'));
const ranges=[['2026-11-01T00:00:00Z','2026-12-01T00:00:00Z'],['2026-11-21T16:00:00Z','2026-11-21T18:00:00Z'],['2026-11-10T00:00:00Z','2026-11-17T00:00:00Z']];
ranges.push(['2026-11-01T00:00:00Z','2026-11-01T00:30:00Z'],['2026-11-30T23:30:00Z','2026-12-01T00:00:00Z'],['2026-11-21T13:00:00-03:00','2026-11-21T15:00:00-03:00']);
const windows=ranges.map(([start,end])=>({start,end,metrics:s.analyses.map(a=>sliceAnalysis(a,start,end).metrics)}));
const rankings=s.sites.map(site=>{const r=optimize(s.analyses,s.links[site.id],{minSun:70,minEarth:40,maxOutage:360,maxDistance:1000,maxSlope:20,requireLink:true});return {site:site.id,evaluated:r.evaluated,feasible:r.feasible,recommended:r.recommended?keyFor(r.recommended):null}});
console.log(JSON.stringify({windows,rankings}));
"""
e=json.loads(subprocess.check_output(['node','--input-type=module','-e',js],text=True))
candidates={a['id']:a for a in s['candidates']}
counts={'visibility':0,'links':0,'compare':0}
for window in e['windows']:
 for i,a in enumerate(s['analyses']):
  p=a['position']; payload={'site_id':candidates[a['candidate_id']]['reference_site_id'],'row':p['row'],'col':p['col'],'height_m':a['height_m'],'start':window['start'],'end':window['end']}
  r=c.post('/api/visibility',json=payload)
  assert r.status_code==200,r.text
  actual=r.json()
  assert actual['metrics']==window['metrics'][i],('metrics',payload)
  assert actual['horizon']==a['horizon'],('horizon',payload)
  if window is e['windows'][0]:
   assert actual['series']==a['series'],('series',payload)
  counts['visibility']+=1
 print('PASS visibility window',window['start'],window['end'],flush=True)
for site in s['sites']:
 for a in s['analyses']:
  p=a['position'];key=f"{a['candidate_id']}-{a['height_m']:g}"
  r=c.post('/api/local-link',json={'lander':{'site_id':site['id'],'height_m':2},'station':{'site_id':site['id'],'row':p['row'],'col':p['col'],'height_m':a['height_m']}})
  assert r.status_code==200,r.text
  expected=s['links'][site['id']][key]
  assert all(r.json()[k]==v for k,v in expected.items()),('link',site['id'],key)
  counts['links']+=1
 print('PASS links',site['id'],flush=True)
r=c.post('/api/compare',json={'sites':[{'site_id':site['id'],'height_m':5,'start':e['windows'][i]['start'],'end':e['windows'][i]['end']} for i,site in enumerate(s['sites'])]})
assert r.status_code==200,r.text
for i,site in enumerate(s['sites']):
 idx=next(j for j,a in enumerate(s['analyses']) if a['candidate_id']==site['candidate_id'] and a['height_m']==5)
 assert r.json()[i]['metrics']==e['windows'][i]['metrics'][idx]
 counts['compare']+=1
report['passed_comparisons']=counts
print('PASS COUNTS',counts,flush=True)
for site in s['sites']:
 for start,end in [('2026-11-29','2026-12-05'),('2026-12-01','2027-01-01'),('2027-04-01','2027-05-01')]:
  r=c.post('/api/visibility',json={'site_id':site['id'],'start':start+'T00:00:00Z','end':end+'T00:00:00Z'})
  if r.status_code!=200:
   report['mismatches'].append({'kind':'frontend_supported_dates_rejected','site':site['id'],'start':start,'end':end,'status':r.status_code,'detail':r.json().get('detail')})
for expected in e['rankings']:
 r=c.post('/api/optimize',json={'site_id':expected['site'],'constraints':{'min_sun_percent':70,'min_earth_percent':40,'max_sun_outage_hours':360,'max_earth_outage_hours':360,'max_distance_m':1000,'max_slope_deg':20,'require_local_link':True}})
 assert r.status_code==200,r.text
 result=r.json();best=result['recommended'];key=None if best is None else f"r{best['position']['row']}c{best['position']['col']}-{best['height_m']:g}"
 actual={'site':expected['site'],'evaluated':result['evaluated_configurations'],'feasible':result['feasible_count'],'recommended':key}
 comparison={'frontend':expected,'backend':actual}
 report['optimizations'].append(comparison)
 if actual!=expected:
  report['mismatches'].append({'kind':'optimizer_search_space',**comparison})
report['frontend_api_connected']=False
report['limitations']=['Frontend still fetches static files; no end-to-end backend integration established.','No browser interaction or live HTTP transport verified.','Agreement does not independently validate source DEM or celestial ephemerides.']
report['status']='incompatible' if report['mismatches'] else 'pass'
encoded=json.dumps(report,indent=2)
if len(sys.argv)>1:
 Path(sys.argv[1]).write_text(encoded+'\n')
print(encoded)
sys.exit(bool(report['mismatches']))
