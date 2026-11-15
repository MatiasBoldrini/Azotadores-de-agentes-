import json,sys,gzip
from urllib.parse import urlencode
from urllib.request import urlopen
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0,'/tmp/azrepo')
from siteforge.horizons import parse_response
lon,lat,alt=-137.50198490762307,-89.46315775697231,1.94476708984375
def job(a):
  body,y=a
  out=f'/workspace/pgda69/eph/{body}_{y}.json.gz'
  import os
  if os.path.exists(out): return out
  p=dict(COMMAND=body,MAKE_EPHEM='YES',OBJ_DATA='NO',EPHEM_TYPE='OBSERVER',CENTER='coord@301',COORD_TYPE='GEODETIC',SITE_COORD=f'{lon},{lat},{alt}',START_TIME=f'{y}-01-01',STOP_TIME=f'{y+1}-01-01',STEP_SIZE='60 min',QUANTITIES='4',CSV_FORMAT='YES',APPARENT='AIRLESS',ANG_FORMAT='DEG',TIME_DIGITS='MINUTES')
  url='https://ssd.jpl.nasa.gov/api/horizons.api?'+urlencode({'format':'json',**{k:f"'{v}'" for k,v in p.items()}})
  for t in range(4):
    try:
      payload=json.load(urlopen(url,timeout=180)); rec=parse_response(payload); break
    except Exception as e: print('retry',a,e,flush=True)
  hdr=payload['result'].split('$$SOE')[0]
  assert 'MEAN_ME' in hdr or 'MOON_ME' in hdr
  json.dump(dict(url=url,records=rec,header=hdr[-1500:]),gzip.open(out,'wt'))
  print(out,len(rec),flush=True); return out
jobs=[(b,y) for y in range(2009,2029) for b in ('10','399')]
with ThreadPoolExecutor(4) as ex: list(ex.map(job,jobs))
