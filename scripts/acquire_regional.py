"""Acquire a bounded NASA regional COG window and preserve near/far terrain peaks.

80 m samples inside 30 km; one actual maximum-elevation sample per 4x4 block
outside 30 km and inside 150 km. This is a documented approximation: a selected
peak does not preserve all sub-block azimuths. No synthetic terrain is generated.
"""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import rasterio
from rasterio.windows import Window
from pyproj import Transformer

ROOT=Path(__file__).resolve().parents[1]
URL='https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF'
with np.load(ROOT/'data/terrain.npz') as local:
    xmin,xmax=float(local['x_m'].min()-2.5),float(local['x_m'].max()+2.5)
    ymin,ymax=float(local['y_m'].min()-2.5),float(local['y_m'].max()+2.5)
    cx,cy=(xmin+xmax)/2,(ymin+ymax)/2
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.TIF',GDAL_HTTP_TIMEOUT='120'):
 with rasterio.open(URL) as ds:
    r,c=ds.index(cx,cy)
    size=3760
    win=Window(c-size//2,r-size//2,size,size)
    print('Reading bounded 300.8 km regional window through COG range requests',flush=True)
    z=ds.read(1,window=win).astype(np.float64)
    tr=ds.window_transform(win)
    rr,cc=np.indices(z.shape)
    x=tr.c+(cc+.5)*tr.a;y=tr.f+(rr+.5)*tr.e
    distance=np.hypot(x-cx,y-cy)
    overlap=(x>=xmin)&(x<=xmax)&(y>=ymin)&(y<=ymax)
    near=(distance<=30000)&(~overlap)&np.isfinite(z)
    # Select the actual highest source pixel in each block, retaining its location.
    block=z.reshape(size//4,4,size//4,4).transpose(0,2,1,3).reshape(size//4,size//4,16)
    peak=np.argmax(np.where(np.isfinite(block),block,-np.inf),axis=-1)
    br,bc=np.indices(peak.shape)
    pr=br*4+peak//4;pc=bc*4+peak%4
    far=(distance[pr,pc]>30000)&(distance[pr,pc]<=150000)&np.isfinite(z[pr,pc])
    outz=np.concatenate((z[near],z[pr[far],pc[far]]))
    outx=np.concatenate((x[near],x[pr[far],pc[far]]));outy=np.concatenate((y[near],y[pr[far],pc[far]]))
    transformer=Transformer.from_crs(ds.crs,ds.crs.geodetic_crs,always_xy=True)
    lon,lat=transformer.transform(outx,outy)
    target=ROOT/'data/regional-terrain.npz'
    np.savez_compressed(target,elevation_m=outz,longitude_deg=lon,latitude_deg=lat,pixel_size_m=80.,radius_m=1737400.,max_distance_m=150000.)
    meta=dict(source=URL,product='https://pgda.gsfc.nasa.gov/products/90',citation='Barker et al. 2023, Planetary Science Journal 4, 183; doi:10.3847/PSJ/acf3e1',data_doi='10.60903/gsfcpgda-lola-spole',accessed_utc=datetime.now(timezone.utc).isoformat(),frame='MOON_ME_DE421',radius_m=1737400.,units='radial elevation metres',source_shape=[ds.height,ds.width],source_resolution_m=80,window=[int(win.col_off),int(win.row_off),size,size],crs=ds.crs.to_wkt(),source_tags=ds.tags(),near_resolution_m=80,near_radius_m=30000,far_block_size_m=320,max_radius_m=150000,near_points=int(near.sum()),far_points=int(far.sum()),total_points=len(outz),local_overlap='Regional samples inside the 5 m ROI are removed; local DEM takes precedence',sampling='Native pixel centers to 30 km; actual highest source pixel per 4x4 block from 30 to 150 km. Source sample coordinates retained.',limitations=['Terrain beyond 150 km is not modeled.','80 m source resolution can omit narrower ridges.','Peak selection in 320 m far blocks does not preserve every sub-block azimuth.','DEM effective resolution and errors vary; pixel spacing is not an accuracy guarantee.'],sha256=hashlib.sha256(target.read_bytes()).hexdigest(),download_method='Bounded window from official Cloud Optimized GeoTIFF via HTTP ranges')
    (ROOT/'data/regional-metadata.json').write_text(json.dumps(meta,indent=2))
    print(json.dumps({k:meta[k] for k in ('near_points','far_points','total_points','sha256')},indent=2))
