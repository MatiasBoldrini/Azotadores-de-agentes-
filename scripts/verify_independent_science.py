"""Independent numerical audit of the checked-in scientific snapshot.

Run: .venv/bin/python scripts/verify_independent_science.py [--output PATH]
No siteforge engine or frontend scientific implementation is imported.
Checks the documented discrete geometric model, not physical mission accuracy.
"""
import argparse, json, math, itertools, hashlib
from datetime import datetime
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, help='Optional JSON evidence destination')
args=parser.parse_args()
s=json.loads((ROOT/'public/data/snapshot.json').read_text())
counters=dict(configurations=0,body_samples=0,metric_fields=0,local_links=0,profile_samples=0,height_comparisons=0)
errors=[]
max_horizon_error=0.;max_distance_error=0.;max_line_error=0.;max_ground_error=0.
metrics={}
def check(condition,label):
 if not condition:errors.append(label)
def integrate(t,states):
 durations=[(datetime.fromisoformat(b)-datetime.fromisoformat(a)).total_seconds()/3600 for a,b in zip(t,t[1:])]
 groups=[]
 for state,g in itertools.groupby(enumerate(states[:-1]),lambda q:q[1]):
  indices=[i for i,_ in g];f,l=indices[0],indices[-1]
  groups.append((state,dict(start_utc=t[f],end_utc=t[l+1],duration_hours=sum(durations[f:l+1]))))
 on=[v for st,v in groups if st];off=[v for st,v in groups if not st]
 return dict(total_hours=sum(d for d,st in zip(durations,states) if st),duration_hours=sum(durations),longest_outage_hours=max([g['duration_hours'] for g in off],default=0),longest_visible_hours=max([g['duration_hours'] for g in on],default=0),intervals=on,outages=off,interval_count=len(on),max_step_hours=max(durations))
for a in s['analyses']:
 key=f"{a['candidate_id']}-{a['height_m']:g}";series=a['series'];angles=a['horizon']['azimuth_deg'];h=a['horizon']['elevation_deg'];n=len(h)
 check(angles==list(range(360)),key+' sector definition')
 states={}
 for body in ['sun','earth']:
  states[body]=[]
  for i,(az,el) in enumerate(zip(series[body+'_azimuth_deg'],series[body+'_elevation_deg'])):
   az%=360;lo=math.floor(az);frac=az-lo
   threshold=h[lo]*(1-frac)+h[(lo+1)%360]*frac
   delta=abs(threshold-series[body+'_horizon_deg'][i]);max_horizon_error=max(max_horizon_error,delta)
   check(delta<1e-12,key+' horizon '+str(i))
   states[body].append(el>threshold)
   check(states[body][-1]==series[body+'_visible'][i],key+' visibility '+str(i))
   counters['body_samples']+=1
 states['both']=[u and v for u,v in zip(states['sun'],states['earth'])]
 check(states['both']==series['both_visible'],key+' both visibility')
 metrics[key]={}
 for body in ['sun','earth','both']:
  result=integrate(series['timestamp_utc'],states[body]);metrics[key][body]=result
  for k,v in result.items():check(v==a['metrics'][body][k],key+' '+body+' '+k);counters['metric_fields']+=1
 counters['configurations']+=1
# Independent spherical chord and raw DEM bilinear reconstruction, no engine imports.
dem=np.load(ROOT/'data/terrain.npz');R=float(dem['radius_m']);elev=dem['elevation_m'];lat=dem['latitude_deg'];lon=dem['longitude_deg']
def xyz(row,col,height):
 phi=math.radians(float(lat[row,col]));lam=math.radians(float(lon[row,col]));r=R+float(elev[row,col])+height
 return (r*math.cos(phi)*math.cos(lam),r*math.cos(phi)*math.sin(lam),r*math.sin(phi))
for site in s['sites']:
 ar,ac=site['row'],site['col'];start=xyz(ar,ac,2);surface=xyz(ar,ac,0)
 for a in s['analyses']:
  key=f"{a['candidate_id']}-{a['height_m']:g}";link=s['links'][site['id']][key];br,bc=a['position']['row'],a['position']['col'];end=xyz(br,bc,a['height_m']);bsurface=xyz(br,bc,0)
  distance=math.dist(surface,bsurface);max_distance_error=max(max_distance_error,abs(distance-link['distance_m']));check(abs(distance-link['distance_m'])<1e-7,key+' distance')
  clearances=[];profile=link['profile']
  for i,p in enumerate(profile):
   t=i/(len(profile)-1);row=ar+(br-ar)*t;col=ac+(bc-ac)*t;r0=math.floor(row);c0=math.floor(col);fr=row-r0;fc=col-c0
   ground=sum(float(elev[r0+dr,c0+dc])*wr*wc for dr,wr in [(0,1-fr),(1,fr)] for dc,wc in [(0,1-fc),(1,fc)])
   line=math.sqrt(sum(((1-t)*u+t*v)**2 for u,v in zip(start,end)))-R
   clearances.append(line-ground)
   max_line_error=max(max_line_error,abs(line-p['line_elevation_m']));max_ground_error=max(max_ground_error,abs(ground-p['terrain_elevation_m']))
   check(abs(line-p['line_elevation_m'])<1e-7,key+' line');check(abs(ground-p['terrain_elevation_m'])<1e-8,key+' ground');counters['profile_samples']+=1
  if profile:
   check(all(x>0 for x in clearances[1:-1])==link['visible'],key+' link visibility')
   check(abs(min(clearances[1:-1])-link['min_clearance_m'])<1e-7,key+' clearance')
  counters['local_links']+=1
rankings=[]
for site in s['sites']:
 for outage in [360,240]:
  choices=[]
  for a in s['analyses']:
   key=f"{a['candidate_id']}-{a['height_m']:g}";m=metrics[key];link=s['links'][site['id']][key];slope=a['position']['slope_deg']
   if m['sun']['total_hours']<m['sun']['duration_hours']*.7 or m['earth']['total_hours']<m['earth']['duration_hours']*.4:continue
   if max(m[b]['longest_outage_hours'] for b in ['sun','earth'])>outage or link['distance_m']>1000 or slope is None or slope>20 or not link['visible']:continue
   choices.append((a['height_m']/20+link['distance_m']/1000+slope/90,a['height_m'],a['position']['row'],a['position']['col'],key))
  choices.sort();rankings.append(dict(site=site['id'],outage=outage,feasible=len(choices),top5=[x[-1] for x in choices[:5]]))
for candidate in s['candidates']:
 group=sorted([a for a in s['analyses'] if a['candidate_id']==candidate['id']],key=lambda a:a['height_m'])
 for low,high in zip(group,group[1:]):
  check(all(h<=l+1e-12 for l,h in zip(low['horizon']['elevation_deg'],high['horizon']['elevation_deg'])),candidate['id']+' monotone horizon')
  for body in ['sun','earth']:
   check(all(not l or h for l,h in zip(low['series'][body+'_visible'],high['series'][body+'_visible'])),candidate['id']+' monotone visibility')
  counters['height_comparisons']+=1
report=dict(snapshot_sha256=hashlib.sha256((ROOT/'public/data/snapshot.json').read_bytes()).hexdigest(),counts=counters,errors=errors,max_horizon_error_deg=max_horizon_error,max_distance_error_m=max_distance_error,max_line_error_m=max_line_error,max_ground_error_m=max_ground_error,rankings=rankings)
report['status']='passed' if not errors else 'failed'
report['scope']={
 'period_utc':['2026-11-01','2026-12-01'],
 'optimization_constraints':{'min_sun_percent':70,'min_earth_percent':40,'max_individual_outage_hours':[360,240],'max_distance_m':1000,'max_slope_deg':20,'require_local_link':True},
 'independence':'Python standard-library numerical formulas plus NumPy solely to load raw DEM arrays; no imports from application science code.',
 'limitations':[
  'Horizon profiles and ephemeris directions are inputs: their full NASA acquisition and regional horizon construction are not independently recomputed.',
  'Checks left-endpoint integration at the existing 30-minute samples, periodic linear horizon interpolation and the documented body-center visibility rule.',
  'Local-link ground and chord are independently reconstructed from raw terrain.npz using the documented half-cell sampling, not a continuous collision proof.',
  'Rankings validate the finite exported grid and heuristic cost only; they do not prove a global optimum or radio/energy feasibility.',
  'No browser, deployed HTTP service, atmospheric model, eclipse model or absolute scientific accuracy certification is included.'
 ]}
encoded=json.dumps(report,indent=2)
if args.output:
 args.output.parent.mkdir(parents=True,exist_ok=True)
 args.output.write_text(encoded+'\n')
print(encoded)
raise SystemExit(1 if errors else 0)
