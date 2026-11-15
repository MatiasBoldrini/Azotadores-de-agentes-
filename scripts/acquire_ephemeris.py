"""Fetch traceable NASA Horizons observer tables for the two verified lunar points."""
import sys,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT))
from siteforge.horizons import acquire
output=ROOT/'data/ephemeris'; output.mkdir(exist_ok=True)
for site in json.loads((ROOT/'data/sites.json').read_text()):
 for name,body in [('sun','10'),('earth','399')]:
  dest=output/f"{site['id']}_{name}.json"
  if dest.exists(): continue
  result=acquire(site['longitude_deg'],site['latitude_deg'],site['elevation_m']/1000,body,'2026-11-01','2026-12-01')
  header=result['raw']['result'].split('$$SOE')[0]
  print(header.split('Center pole/equ :')[1].splitlines()[0],flush=True)
  if not ('MOON_ME' in header or 'MEAN_ME (high precision)' in header) or '1737.4' not in header: raise ValueError('Unexpected Horizons lunar reference')
  result['model_metadata']={'frame':'MOON_ME_DE421','body':name,'site_id':site['id'],'altitude_reference_radius_km':1737.4,'angular_reference':'north-clockwise azimuth; airless elevation; center of body','time_scale':'UTC','temporal_step_minutes':30,'source_class':'Real NASA data'}
  dest.write_text(json.dumps(result,indent=2)); print(dest.name,len(result['records']),flush=True)
