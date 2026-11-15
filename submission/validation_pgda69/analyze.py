import sys,json,gzip,time,glob
import numpy as np
sys.path.insert(0,'/tmp/azrepo')
from siteforge.engine import Terrain,reproject_ephemeris,angular_interpolate
import rasterio
R=1737400.0
ROOT='/tmp/azrepo/'
D=np.load(ROOT+'data/terrain.npz')
T=Terrain(**{k:D[k] for k in ('elevation_m','longitude_deg','latitude_deg','pixel_size_m','radius_m')},regional=dict(np.load(ROOT+'data/regional-terrain.npz')))
sites=json.load(open(ROOT+'data/sites.json'))
# ephemeris
def load(body):
  recs={}
  for f in sorted(glob.glob(f'/workspace/pgda69/eph/{body}_*.json.gz')):
    for r in json.load(gzip.open(f))['records']: recs[r['timestamp_utc']]=r
  ks=sorted(recs); return ks,[recs[k] for k in ks]
ts,sun=load('10'); ts2,earth=load('399'); assert ts==ts2
ts=np.array(ts)
def arr(recs): return np.array([[r['azimuth_deg'],r['elevation_deg']] for r in recs]).T
S0=arr(sun);E0=arr(earth)
start='2009-07-13T17:00:00+00:00'
i0=np.searchsorted(ts,start); n186=int(round(18.6*365.25*24)); i1=i0+n186
W={'18.6y':(i0,i1),'6mo_2026-11_2027-04':(np.searchsorted(ts,'2026-11-01T00:00:00+00:00'),np.searchsorted(ts,'2027-05-01T00:00:00+00:00')),
   'Nov2026':(np.searchsorted(ts,'2026-11-01T00:00:00+00:00'),np.searchsorted(ts,'2026-12-01T00:00:00+00:00'))}
print({k:(ts[a],ts[b-1],b-a) for k,(a,b) in W.items()},flush=True)
SUN_R=0.2666; EARTH_R=0.95
src=sites[0]
def reproj(A,lon,lat):
  recs=[dict(azimuth_deg=a,elevation_deg=e) for a,e in zip(*A)]
  out=reproject_ephemeris(recs,src['longitude_deg'],src['latitude_deg'],lon,lat)
  return np.array([[r['azimuth_deg'],r['elevation_deg']] for r in out]).T
def fractions(row,col,h):
  p=T.point(row,col); hz=T.horizon(row,col,h)['elevation_deg']
  if (row,col)==(src.get('row'),src.get('col')): S,E=S0,E0
  else: S,E=reproj(S0,p['longitude_deg'],p['latitude_deg']),reproj(E0,p['longitude_deg'],p['latitude_deg'])
  out={}
  for nm,A,rad in (('sun',S,SUN_R),('earth',E,EARTH_R)):
    hh=angular_interpolate(A[0],hz)
    c=A[1]>hh; d=A[1]+rad>hh
    for w,(a,b) in W.items():
      out[f'{nm}_center_{w}']=float(c[a:b].mean()); out[f'{nm}_disc_{w}']=float(d[a:b].mean())
  return p,out
sunR=rasterio.open('/workspace/pgda69/AVGVISIB_85S_060M_201608.TIF'); earR=rasterio.open('/workspace/pgda69/AVGVISIB_85S_060M_201608_EARTH.TIF')
SA=sunR.read(1).astype(float)*4e-5; EA=earR.read(1).astype(float)*4e-5
def xy(lon,lat):
  rho=2*R*np.tan(np.radians(90+lat)/2); return rho*np.sin(np.radians(lon)),rho*np.cos(np.radians(lon))
def pgda(lon,lat):
  x,y=xy(lon,lat); c=(x+151740)/60; r=(151740-y)/60
  ri,ci=int(np.floor(r)),int(np.floor(c)); x,y=float(x),float(y)
  # bilinear on pixel centers
  rr,cc=r-0.5,c-0.5; r0,c0=int(np.floor(rr)),int(np.floor(cc)); fr,fc=rr-r0,cc-c0
  def bil(A): return float((1-fr)*(1-fc)*A[r0,c0]+fr*(1-fc)*A[r0+1,c0]+(1-fr)*fc*A[r0,c0+1]+fr*fc*A[r0+1,c0+1])
  return dict(x=x,y=y,row=ri,col=ci,sun=float(SA[ri,ci]),earth=float(EA[ri,ci]),sun_bil=bil(SA),earth_bil=bil(EA),
    sun_3x3=[float(SA[ri-1:ri+2,ci-1:ci+2].min()),float(SA[ri-1:ri+2,ci-1:ci+2].max())],earth_3x3=[float(EA[ri-1:ri+2,ci-1:ci+2].min()),float(EA[ri-1:ri+2,ci-1:ci+2].max())])
res={'sites':[],'grid':[]}
for s in sites:
  for h in (0,2,5,10,20):
    t=time.time(); p,f=fractions(s['row'],s['col'],h)
    res['sites'].append(dict(site=s['id'],height_m=h,lon=p['longitude_deg'],lat=p['latitude_deg'],ours=f,pgda=pgda(p['longitude_deg'],p['latitude_deg'])))
    print(s['id'],h,round(time.time()-t,1),{k:round(v,4) for k,v in f.items() if '18.6' in k or '6mo' in k},res['sites'][-1]['pgda']['sun'],res['sites'][-1]['pgda']['earth'],flush=True)
json.dump(res,open('/workspace/pgda69/results.json','w'),indent=1)
# grid: local cells nearest to PGDA pixel centres inside crop, 0 m only
lx,ly=xy(T.longitude_deg,T.latitude_deg)
pr=np.floor((151740-ly)/60).astype(int); pc=np.floor((lx+151740)/60).astype(int)
cells=sorted(set(zip(pr.ravel(),pc.ravel())))
step=int(sys.argv[1]) if len(sys.argv)>1 else 3
sel=[(a,b) for a,b in cells if a%step==0 and b%step==0]
print('grid points',len(sel),flush=True)
for a,b in sel:
  cx,cy=-151740+(b+0.5)*60,151740-(a+0.5)*60
  d=(lx-cx)**2+(ly-cy)**2; i,j=np.unravel_index(np.argmin(d),d.shape)
  if d[i,j]>10**2*2 or i<1 or j<1 or i>=T.valid.shape[0]-1 or j>=T.valid.shape[1]-1: continue
  try: p,f=fractions(int(i),int(j),0)
  except ValueError: continue
  res['grid'].append(dict(row=int(i),col=int(j),pgda_row=int(a),pgda_col=int(b),ours=f,pgda_sun=float(SA[a,b]),pgda_earth=float(EA[a,b])))
  json.dump(res,open('/workspace/pgda69/results.json','w'),indent=1)
print('done',len(res['grid']))
