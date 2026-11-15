"""Reproducible bounded LOLA crop and coordinate conversion; run after official download."""
from pathlib import Path
import hashlib,json
from datetime import datetime,timezone
import numpy as np
import rasterio
from rasterio.windows import Window
from pyproj import Transformer
import pyproj

ROOT=Path(__file__).resolve().parents[1]
SOURCE='https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_surf.tif'
source=ROOT/'data/Site01_final_adj_5mpp_surf.tif'
with rasterio.open(source) as ds:
    size=512
    win=Window(1344,1344,size,size)
    z=ds.read(1,window=win).astype(float)
    if not np.isfinite(z).all(): raise ValueError('ROI includes missing data')
    transform=ds.window_transform(win)
    row,col=np.indices(z.shape)
    x=transform.c+(col+.5)*transform.a
    y=transform.f+(row+.5)*transform.e
    crs=ds.crs
    tr=Transformer.from_crs(crs,crs.geodetic_crs,always_xy=True)
    lon,lat=tr.transform(x,y)
    np.savez_compressed(ROOT/'data/terrain.npz',elevation_m=z,longitude_deg=lon,latitude_deg=lat,x_m=x,y_m=y,pixel_size_m=5.,radius_m=1737400.)
    profile=ds.profile.copy(); profile.update(width=size,height=size,transform=transform,compress='deflate')
    with rasterio.open(ROOT/'data/connecting-ridge-roi.tif','w',**profile) as out: out.write(z.astype('float32'),1)
    meta=dict(source=SOURCE,accessed_utc=datetime.now(timezone.utc).isoformat(),source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),source_shape=[ds.height,ds.width],window=[1344,1344,size,size],crs=crs.to_wkt(),transform=list(transform),tags=ds.tags(),units='meters',radius_m=1737400,frame='MOON_ME_DE421',pixel_size_m=5,coverage='Local 2.56 km square only; distant terrain is not modelled',vertical_datum='Radial elevation relative to 1737.4 km sphere',source_last_modified='2020-06-05T18:39:35Z',software_versions={'numpy':np.__version__,'rasterio':rasterio.__version__,'pyproj':pyproj.__version__},coordinate_convention='East-positive longitude; pixel centers; planetocentric latitude equals planetodetic for sphere')
    (ROOT/'data/terrain-metadata.json').write_text(json.dumps(meta,indent=2))
    sites=[]
    for name,r,c in [('Ridge A',256,256),('Ridge B',160,352)]:
        sites.append(dict(id='ridge-'+name[-1].lower(),name=name,row=r,col=c,longitude_deg=float(lon[r,c]),latitude_deg=float(lat[r,c]),elevation_m=float(z[r,c])))
    (ROOT/'data/sites.json').write_text(json.dumps(sites,indent=2))
    print(json.dumps(sites,indent=2))
