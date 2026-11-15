"""Small, geographic skyline from the actual regional horizon maxima.

No invented ridge or fixed-distance sky ring: each vertex retains the source
sample's longitude, latitude and radial elevation. A curtain below those vertices
is only a visual silhouette, not a new DEM or a replacement visibility model.
"""
import hashlib
import json
from pathlib import Path
import sys
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from siteforge import api


def export(output=ROOT/'public/site01/distant-horizon.json'):
    snapshot_path=ROOT/'public/data/snapshot.json'
    snapshot=json.loads(snapshot_path.read_text())
    grid=api.terrain()
    regional=grid.regional
    if regional is None:
        raise ValueError('Regional NASA terrain is required; no synthetic fallback')
    lon=np.asarray(regional['longitude_deg']); lat=np.asarray(regional['latitude_deg'])
    radius=2*grid.radius_m*np.tan(np.pi/4+np.radians(lat)/2)
    rx=radius*np.sin(np.radians(lon)); ry=radius*np.cos(np.radians(lon))
    row,col=np.array(grid.valid.shape)//2
    center=grid.point(row,col)
    rho=2*grid.radius_m*np.tan(np.pi/4+np.radians(center['latitude_deg'])/2)
    cx=rho*np.sin(np.radians(center['longitude_deg']));cy=rho*np.cos(np.radians(center['longitude_deg']))
    outside=np.hypot(rx-cx,ry-cy)>7950
    source_ids=np.flatnonzero(outside)
    xyz=grid.regional_xyz[outside]
    points=[];point_ids={};profiles={}
    candidates={a['candidate_id']:a['position'] for a in snapshot['analyses']}
    for candidate,p in candidates.items():
        l,b=np.radians([p['longitude_deg'],p['latitude_deg']])
        east=np.array([-np.sin(l),np.cos(l),0.]);north=np.array([-np.sin(b)*np.cos(l),-np.sin(b)*np.sin(l),np.cos(b)])
        up=grid.xyz[p['row'],p['col']];up=up/np.linalg.norm(up)
        delta=xyz-grid.xyz[p['row'],p['col']]
        e,n,u=delta@east,delta@north,delta@up
        distance=np.hypot(e,n);az=np.mod(np.degrees(np.arctan2(e,n)),360)
        sector=np.floor(az+.5).astype(int)%360
        for a in (a for a in snapshot['analyses'] if a['candidate_id']==candidate):
            angle=np.degrees(np.arctan2(u-a['height_m'],distance))
            maximum=np.full(360,-np.inf);np.maximum.at(maximum,sector,angle)
            # Deterministic argmax, preserving the exact source pixel location.
            winners=np.full(360,len(angle),dtype=np.int64)
            maxima=np.flatnonzero(angle==maximum[sector])
            np.minimum.at(winners,sector[maxima],maxima)
            if np.any(winners==len(angle)):
                raise ValueError('Incomplete distant azimuth coverage')
            ids=[]
            for winner in winners:
                source=int(source_ids[winner])
                if source not in point_ids:
                    point_ids[source]=len(points)
                    points.append([float(lon[source]),float(lat[source]),float(regional['elevation_m'][source])])
                ids.append(point_ids[source])
            combined=np.array(a['horizon']['elevation_deg'])
            if np.any(maximum>combined+1e-8):
                raise ValueError('Snapshot and regional terrain disagree; regenerate the scientific cache first')
            profiles[f"{candidate}-{a['height_m']:g}"]={'points':ids,'dominates':(np.abs(maximum-combined)<1e-8).tolist()}
        print(f'Exported distant horizon for {candidate}',flush=True)
    result={'schema_version':1,'detail_radius_km':7.95,'angular_bin_width_deg':1,
            'snapshot_sha256':hashlib.sha256(snapshot_path.read_bytes()).hexdigest(),
            'regional_sha256':hashlib.sha256((ROOT/'data/regional-terrain.npz').read_bytes()).hexdigest(),
            'point_fields':['longitude_deg','latitude_deg','elevation_m'],'points':points,'profiles':profiles,
            'method':'Actual regional maximum cell-center per 1 degree sector, outside the detailed disc. Geographic vertices, simplified silhouette only.'}
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(result,separators=(',',':'),allow_nan=False)+'\n')
    print(f'{len(points)} unique source points; {len(profiles)} profiles; {output.stat().st_size} bytes',flush=True)
    return result


if __name__=='__main__': export()
