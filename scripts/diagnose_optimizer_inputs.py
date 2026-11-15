"""Controlled experiment: change candidate grid and ephemeris reference separately.
Run from repo root: .venv/bin/python scripts/diagnose_optimizer_inputs.py [output.json]
Recomputes from the DEM via the real engine, never uses CachedTerrain adapter.
"""
import json, sys, subprocess
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from siteforge import api
from siteforge.engine import optimize
s=json.loads((ROOT/'public/data/snapshot.json').read_text())
grid=api.terrain()
cells=[(x['row'],x['col']) for x in s['candidates']]
refs={(x['row'],x['col']):x['reference_site_id'] for x in s['candidates']}
limits=dict(min_sun_hours=504,min_earth_hours=288,max_sun_outage_hours=360,max_earth_outage_hours=360,max_distance_m=1000,max_slope_deg=20,require_local_link=True)
results=[]
def summarize(result):
 best=result['recommended']
 return dict(candidate_count=result['candidate_count'],evaluated_after_prefilter=result['evaluated_configurations'],feasible=result['feasible_count'],recommended=None if best is None else dict(row=best['position']['row'],col=best['position']['col'],height_m=best['height_m'],cost=best['score'],metrics=best['metrics']),rejected=result['rejected'])
for site in s['sites']:
 lander=(site['row'],site['col'])
 radius=200
 rows=np.unique(np.linspace(max(4,lander[0]-radius),min(grid.valid.shape[0]-5,lander[0]+radius),5).astype(int))
 cols=np.unique(np.linspace(max(4,lander[1]-radius),min(grid.valid.shape[1]-5,lander[1]+radius),5).astype(int))
 api_cells=sorted(set([(int(r),int(c)) for r in rows for c in cols if grid.valid[r,c]]+[lander]))
 data=dict(site=site['id'],static_cells=cells,api_cells=api_cells,intersection=sorted(set(cells)&set(api_cells)),runs=[])
 for name,space,nearest in [('api_grid_site_reference',api_cells,False),('static_grid_site_reference',cells,False),('static_grid_nearest_reference',cells,True)]:
  eph={cell:{body:api.local_records(api.AnalysisRequest(site_id=refs[cell] if nearest else site['id']),body,*cell) for body in ['sun','earth']} for cell in space}
  result=optimize(grid,space,eph,lander,limits,s['heights_m'])
  entry=dict(experiment=name,**summarize(result));data['runs'].append(entry)
  best=entry['recommended'];print(site['id'],name,entry['candidate_count'],entry['evaluated_after_prefilter'],entry['feasible'],None if best is None else (best['row'],best['col'],best['height_m'],best['cost']),flush=True)
 # Counterexample: let the production frontend see the API winner as one additional candidate.
 best=data['runs'][0]['recommended']
 req=api.AnalysisRequest(site_id=site['id'],row=best['row'],col=best['col'],height_m=int(best['height_m']))
 analysis=api.analyze(req)
 analysis['candidate_id']=f"r{best['row']}c{best['col']}"
 link=grid.local_link(lander,(best['row'],best['col']),2.,best['height_m'])
 js="""
 import fs from 'node:fs';
 import {optimize,keyFor,violations} from './frontend/src/lib/science.ts';
 const {snapshot:s,site,analysis:a,link}=JSON.parse(fs.readFileSync(0,'utf8'));
 const c={minSun:70,minEarth:40,maxOutage:360,maxDistance:1000,maxSlope:20,requireLink:true};
 const links={...s.links[site],[keyFor(a)]:link};
 const all=[...s.analyses.filter(v=>keyFor(v)!==keyFor(a)),a];
 const r=optimize(all,links,c);
 console.log(JSON.stringify({candidate:keyFor(a),distance_m:link.distance_m,violations:violations(a,link,c),frontend_winner_with_api_candidate:keyFor(r.recommended),frontend_cost:r.cost(r.recommended)}));
 """
 data['frontend_counterexample']=json.loads(subprocess.check_output(['node','--input-type=module','-e',js],cwd=ROOT,input=json.dumps(dict(snapshot=s,site=site['id'],analysis=analysis,link=link)),text=True))
 print('FRONTEND WITNESS',site['id'],data['frontend_counterexample'],flush=True)
 results.append(data)
encoded=json.dumps(results,indent=2)
if len(sys.argv)>1:Path(sys.argv[1]).write_text(encoded+'\n')
else:print(encoded)
