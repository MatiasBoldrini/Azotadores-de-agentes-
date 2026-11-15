# Resolution sensitivity: replace the 5 m local DEM with 60 m block means (12x12), keep regional terrain.
import sys,json,numpy as np
sys.argv=[sys.argv[0],'999']
exec(open('/workspace/pgda69/analyze.py').read().split("res={'sites'")[0])
k=12
def blk(A): n=A.shape[0]//k*k; return A[:n,:n].reshape(n//k,k,n//k,k).mean(axis=(1,3))
TC=Terrain(elevation_m=blk(D['elevation_m']),longitude_deg=blk(D['longitude_deg']),latitude_deg=blk(D['latitude_deg']),pixel_size_m=60.0,radius_m=float(D['radius_m']),regional=dict(np.load(ROOT+'data/regional-terrain.npz')))
T=TC
out=[]
for s in sites:
  r,c=s['row']//k,s['col']//k
  for h in (0,2,10):
    p,f=fractions(r,c,h)
    out.append(dict(site=s['id'],height_m=h,coarse_cell=[r,c],elev=p['elevation_m'],ours=f,pgda=pgda(p['longitude_deg'],p['latitude_deg'])))
    print(s['id'],h,p['elevation_m'],{kk:round(v,4) for kk,v in f.items() if '18.6' in kk},out[-1]['pgda']['sun'],out[-1]['pgda']['earth'],flush=True)
json.dump(out,open('/workspace/pgda69/coarse_results.json','w'),indent=1)
