"""Bounded DEM geometry, sampled visibility and reproducible discrete search.

All coordinates must use the same lunar body-fixed frame as the ephemeris.
Terrain heights are radial metres above ``radius_m``; no frame conversion is
silently performed. Synthetic terrain belongs only in tests.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
import math
import numpy as np

VERSION = 'sphere-enu-sector-regional-v2'


def _utc(value):
    date = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if date.tzinfo is None:
        raise ValueError('Timestamps must include a UTC offset')
    return date.astimezone(timezone.utc)


def ecef(longitude_deg, latitude_deg, radius):
    lon, lat = np.radians(longitude_deg), np.radians(latitude_deg)
    return np.stack((radius*np.cos(lat)*np.cos(lon), radius*np.cos(lat)*np.sin(lon), radius*np.sin(lat)), axis=-1)


def angular_interpolate(azimuth_deg, horizon_deg):
    """Periodic linear interpolation, including the 359/0 degree seam."""
    values = np.asarray(horizon_deg, dtype=float)
    if values.ndim != 1 or len(values) < 4 or not np.isfinite(values).all():
        raise ValueError('A finite, complete horizon profile is required')
    return np.interp(np.mod(azimuth_deg, 360), np.linspace(0, 360, len(values), endpoint=False), values, period=360)


def windows(timestamps, visible):
    """Left-endpoint integration on [first,last); final sample has zero weight.

    Irregular sampling is accepted. The state at t[i] represents [t[i],t[i+1]).
    No extra sample duration is appended beyond the requested final instant.
    """
    if len(timestamps) != len(visible) or len(timestamps) < 2:
        raise ValueError('At least two matching timestamps/states are required')
    times = [_utc(t) for t in timestamps]
    delta = np.array([(b-a).total_seconds()/3600 for a,b in zip(times,times[1:])])
    if np.any(delta <= 0):
        raise ValueError('Timestamps must increase strictly')
    states = np.asarray(visible, dtype=bool)[:-1]
    intervals, outages = [], []
    start = 0
    for stop in range(1, len(states)+1):
        if stop == len(states) or states[stop] != states[start]:
            item = dict(start_utc=times[start].isoformat(), end_utc=times[stop].isoformat(), duration_hours=float(delta[start:stop].sum()))
            (intervals if states[start] else outages).append(item)
            start = stop
    return dict(total_hours=float(delta[states].sum()), duration_hours=float(delta.sum()),
                longest_outage_hours=max((x['duration_hours'] for x in outages), default=0.0),
                longest_visible_hours=max((x['duration_hours'] for x in intervals), default=0.0),
                intervals=intervals, outages=outages, interval_count=len(intervals),
                max_step_hours=float(delta.max()))


@dataclass
class Terrain:
    elevation_m: np.ndarray
    longitude_deg: np.ndarray
    latitude_deg: np.ndarray
    pixel_size_m: float = 5.0
    radius_m: float = 1737400.0
    regional: dict | None = None

    def __post_init__(self):
        self.elevation_m = np.asarray(self.elevation_m, dtype=float)
        self.longitude_deg = np.asarray(self.longitude_deg, dtype=float)
        self.latitude_deg = np.asarray(self.latitude_deg, dtype=float)
        if self.elevation_m.ndim != 2 or min(self.elevation_m.shape) < 3:
            raise ValueError('DEM must be a two-dimensional grid of at least 3x3 cells')
        if self.longitude_deg.shape != self.elevation_m.shape or self.latitude_deg.shape != self.elevation_m.shape:
            raise ValueError('Coordinate grids must match DEM shape')
        if not math.isfinite(self.pixel_size_m) or self.pixel_size_m <= 0 or not math.isfinite(self.radius_m) or self.radius_m <= 0:
            raise ValueError('Resolution and reference radius must be positive')
        self.valid = np.isfinite(self.elevation_m) & np.isfinite(self.longitude_deg) & np.isfinite(self.latitude_deg)
        if np.any(np.abs(self.latitude_deg[self.valid]) > 90):
            raise ValueError('Invalid latitude')
        self.xyz = ecef(self.longitude_deg, self.latitude_deg, self.radius_m+self.elevation_m)
        # Use physical chord distances between neighboring samples, not map scale.
        dzr, dzc = np.gradient(self.elevation_m)
        unit_xyz = ecef(self.longitude_deg, self.latitude_deg, np.ones_like(self.elevation_m))
        dr = np.linalg.norm(np.gradient(unit_xyz, axis=0), axis=-1)*(self.radius_m+self.elevation_m)
        dc = np.linalg.norm(np.gradient(unit_xyz, axis=1), axis=-1)*(self.radius_m+self.elevation_m)
        self.slope_deg = np.degrees(np.arctan(np.hypot(dzr/np.maximum(dr, 1e-9), dzc/np.maximum(dc, 1e-9))))
        self._horizons = {}
        self._geometry = None
        self.regional_xyz = None
        if self.regional is not None:
            rz=np.asarray(self.regional['elevation_m'],dtype=float).ravel()
            rlon=np.asarray(self.regional['longitude_deg'],dtype=float).ravel()
            rlat=np.asarray(self.regional['latitude_deg'],dtype=float).ravel()
            if not (rz.shape==rlon.shape==rlat.shape) or not len(rz) or not all(np.isfinite(v).all() for v in (rz,rlon,rlat)):
                raise ValueError('Regional terrain must contain matching finite samples')
            if abs(float(self.regional['radius_m'])-self.radius_m)>1e-6:
                raise ValueError('Local and regional radial reference must match')
            if np.any(np.abs(rlat)>90): raise ValueError('Invalid regional latitude')
            self.regional_xyz=ecef(rlon,rlat,self.radius_m+rz)
        self.coverage = ('Local 5 m DEM plus regional terrain to 150 km; 80 m source samples to 30 km and actual block peaks at 320 m spacing beyond. Incomplete beyond 150 km and below terrain sampling resolution.' if self.regional_xyz is not None else 'Incomplete coverage: obstacles outside this local DEM are not modeled.')

    def point(self, row, col):
        if isinstance(row, bool) or isinstance(col, bool) or int(row) != row or int(col) != col:
            raise ValueError('Grid indices must be integers')
        row,col = int(row),int(col)
        if not (0 <= row < self.valid.shape[0] and 0 <= col < self.valid.shape[1]) or not self.valid[row,col]:
            raise ValueError('Position is outside valid DEM coverage')
        slope = float(self.slope_deg[row,col])
        return dict(row=row, col=col, longitude_deg=float(self.longitude_deg[row,col]), latitude_deg=float(self.latitude_deg[row,col]), elevation_m=float(self.elevation_m[row,col]), slope_deg=slope if math.isfinite(slope) else None)

    def horizon(self, row, col, height_m=0.0, bins=360):
        p = self.point(row,col)
        if not math.isfinite(height_m) or not 0 <= height_m <= 1000:
            raise ValueError('Observer height must be between 0 and 1000 metres')
        if not isinstance(bins,int) or not 36 <= bins <= 1440:
            raise ValueError('Horizon bins must be between 36 and 1440')
        key = (row,col,float(height_m),bins)
        if key in self._horizons:
            return self._horizons[key]
        lon, lat = np.radians([p['longitude_deg'],p['latitude_deg']])
        east = np.array([-np.sin(lon),np.cos(lon),0])
        north = np.array([-np.sin(lat)*np.cos(lon),-np.sin(lat)*np.sin(lon),np.cos(lat)])
        up = self.xyz[row,col]/np.linalg.norm(self.xyz[row,col])
        geometry_key=(row,col,bins)
        if self._geometry is not None and self._geometry[0]==geometry_key:
            horizontal,vertical,sector=self._geometry[1:]
        else:
            xyz=self.xyz[self.valid]
            if self.regional_xyz is not None: xyz=np.concatenate((xyz,self.regional_xyz))
            delta=xyz-self.xyz[row,col]
            e,n,u=delta@east,delta@north,delta@up
            horizontal=np.hypot(e,n)
            valid=horizontal>self.pixel_size_m*0.1
            az=np.mod(np.degrees(np.arctan2(e[valid],n[valid])),360)
            horizontal=horizontal[valid];vertical=u[valid]
            sector=np.floor(az/(360/bins)+0.5).astype(int)%bins
            # Retain geometry for the most recently evaluated point only.
            self._geometry=(geometry_key,horizontal,vertical,sector)
        angle=np.degrees(np.arctan2(vertical-height_m,horizontal))
        profile=np.full(bins,-np.inf)
        np.maximum.at(profile,sector,angle)
        known = np.isfinite(profile)
        if known.sum() < bins*0.9:
            raise ValueError('Observer too near DEM edge: insufficient azimuth coverage')
        if not known.all():
            profile[~known] = np.interp(np.flatnonzero(~known),np.flatnonzero(known),profile[known],period=bins)
        result = dict(azimuth_deg=np.linspace(0,360,bins,endpoint=False).tolist(), elevation_deg=profile.tolist(), height_m=float(height_m),
                      algorithm=VERSION, coverage=self.coverage,
                      interpolated_bins=int((~known).sum()), angular_bin_width_deg=360/bins,
                      method='Maximum cell-center elevation per azimuth sector; periodic linear interpolation. Spherical ECEF/true ENU geometry.')
        self._horizons[key] = result
        return result

    def evaluate(self,row,col,height_m,sun_records,earth_records):
        horizon = self.horizon(row,col,height_m)
        if len(sun_records) != len(earth_records) or len(sun_records) < 2:
            raise ValueError('Sun and Earth ephemerides must contain matching samples')
        timestamps = [x['timestamp_utc'] for x in sun_records]
        if timestamps != [x['timestamp_utc'] for x in earth_records]:
            raise ValueError('Sun and Earth timestamps must match')
        series = dict(timestamp_utc=timestamps)
        for name,records in [('sun',sun_records),('earth',earth_records)]:
            az,el = np.array([[x['azimuth_deg'],x['elevation_deg']] for x in records]).T
            if not np.isfinite(az).all() or not np.isfinite(el).all() or np.any(np.abs(el)>90):
                raise ValueError('Invalid ephemeris angles')
            h = angular_interpolate(az,horizon['elevation_deg'])
            series[name+'_azimuth_deg'] = az.tolist()
            series[name+'_elevation_deg'] = el.tolist()
            series[name+'_horizon_deg'] = h.tolist()
            series[name+'_visible'] = (el>h).tolist()
        both = np.logical_and(series['sun_visible'],series['earth_visible']).tolist()
        series['both_visible'] = both
        metrics = {name:windows(timestamps,series[name+'_visible']) for name in ('sun','earth','both')}
        return dict(position=self.point(row,col),height_m=float(height_m),horizon=horizon,series=series,metrics=metrics,algorithm=VERSION,
                    classification='NASA-derived calculation', limitations=[self.coverage,'Body centers, geometric visibility only; no radio link or electrical power model.','Left-endpoint temporal integration may miss events shorter than sampling interval.'])

    def local_link(self, a, b, height_a_m=2.0, height_b_m=2.0):
        self.point(*a); self.point(*b)
        if not all(math.isfinite(h) and 0 <= h <= 1000 for h in (height_a_m,height_b_m)):
            raise ValueError('Invalid equipment height')
        pa,pb = self.xyz[a],self.xyz[b]
        ua,ub = pa/np.linalg.norm(pa),pb/np.linalg.norm(pb)
        start,end = pa+height_a_m*ua,pb+height_b_m*ub
        distance = float(np.linalg.norm(pb-pa))
        if a == b:
            return dict(visible=True,distance_m=0.0,elevation_difference_m=0.0,min_clearance_m=min(height_a_m,height_b_m),profile=[])
        # Half-cell sampling with bilinear radial terrain interpolation.
        samples = max(3,int(np.ceil(np.hypot(b[0]-a[0],b[1]-a[1])*2))+1)
        t = np.linspace(0,1,samples)
        rows = a[0]+t*(b[0]-a[0]); cols=a[1]+t*(b[1]-a[1])
        r0=np.floor(rows).astype(int); c0=np.floor(cols).astype(int)
        r1=np.minimum(r0+1,self.valid.shape[0]-1); c1=np.minimum(c0+1,self.valid.shape[1]-1)
        if not (self.valid[r0,c0]&self.valid[r1,c0]&self.valid[r0,c1]&self.valid[r1,c1]).all():
            raise ValueError('Local link crosses missing DEM data')
        fr,fc=rows-r0,cols-c0
        ground=(1-fr)*(1-fc)*self.elevation_m[r0,c0]+fr*(1-fc)*self.elevation_m[r1,c0]+(1-fr)*fc*self.elevation_m[r0,c1]+fr*fc*self.elevation_m[r1,c1]
        line=start[None,:]+t[:,None]*(end-start)
        line_height=np.linalg.norm(line,axis=1)-self.radius_m
        clearance=line_height-ground
        return dict(visible=bool(np.all(clearance[1:-1]>0)),distance_m=distance,elevation_difference_m=float(self.elevation_m[b]-self.elevation_m[a]),min_clearance_m=float(clearance[1:-1].min()),
                    profile=[dict(distance_m=float(f*distance),terrain_elevation_m=float(g),line_elevation_m=float(h),clearance_m=float(c)) for f,g,h,c in zip(t,ground,line_height,clearance)],
                    method='Straight ECEF chord; bilinear terrain sampled every half pixel; geometric only, no Fresnel clearance.')


def optimize(terrain,candidates,ephemeris_by_candidate,lander,constraints=None,heights=(0,2,5,10,20)):
    """Deterministic constrained search. Ephemerides must be specific per candidate.

    ephemeris_by_candidate[(row,col)] = {'sun': records, 'earth': records}.
    A caller using a shared reference must first transform to local ENU and
    explicitly document positional/parallax uncertainty in its provenance.
    """
    defaults=dict(min_sun_hours=0.,min_earth_hours=0.,max_sun_outage_hours=1e9,max_earth_outage_hours=1e9,max_distance_m=1e9,max_slope_deg=90.,require_local_link=False)
    if constraints:
        unknown=set(constraints)-set(defaults)
        if unknown: raise ValueError('Unknown constraints: '+','.join(sorted(unknown)))
        defaults.update(constraints)
    c=defaults
    for k,v in c.items():
        if k != 'require_local_link' and (not math.isfinite(v) or v<0): raise ValueError('Constraints must be finite and nonnegative')
    candidates=sorted(set(tuple(x) for x in candidates))
    heights=sorted(set(float(h) for h in heights))
    if not candidates or len(candidates)>1024 or not heights or len(heights)>16 or any(not math.isfinite(h) or not 0<=h<=1000 for h in heights):
        raise ValueError('Search must contain 1–1024 candidates and 1–16 valid heights')
    terrain.point(*lander)
    feasible=[]; evaluated=0; rejected=[]
    for candidate in candidates:
        point=terrain.point(*candidate)
        distance=float(np.linalg.norm(terrain.xyz[candidate]-terrain.xyz[tuple(lander)]))
        if point['slope_deg'] is None or point['slope_deg']>c['max_slope_deg'] or distance>c['max_distance_m']:
            rejected.append(dict(position=point,reason='Slope or distance constraint')); continue
        if candidate not in ephemeris_by_candidate:
            rejected.append(dict(position=point,reason='Missing candidate ephemeris')); continue
        eph=ephemeris_by_candidate[candidate]
        for height in heights:
            try:
                result=terrain.evaluate(*candidate,height,eph['sun'],eph['earth'])
                link=terrain.local_link(tuple(lander),candidate,2.,height)
            except ValueError as error:
                rejected.append(dict(position=point,height_m=height,reason=str(error))); continue
            evaluated+=1
            m=result['metrics']
            checks=dict(sun_hours=m['sun']['total_hours']>=c['min_sun_hours'],earth_hours=m['earth']['total_hours']>=c['min_earth_hours'],sun_outage=m['sun']['longest_outage_hours']<=c['max_sun_outage_hours'],earth_outage=m['earth']['longest_outage_hours']<=c['max_earth_outage_hours'],local_link=link['visible'] or not c['require_local_link'])
            if not all(checks.values()):
                rejected.append(dict(position=point,height_m=height,failed_constraints=[k for k,v in checks.items() if not v])); continue
            # Dimensionless engineering preference, not mass, money or feasibility.
            score=height/20+distance/1000+point['slope_deg']/90
            feasible.append(dict(position=point,height_m=height,score=score,distance_m=distance,metrics=m,local_link=link,constraints_passed=checks))
    feasible.sort(key=lambda x:(x['score'],x['height_m'],x['position']['row'],x['position']['col']))
    return dict(status='feasible' if feasible else 'infeasible',message='Feasible configurations ranked by declared heuristic.' if feasible else 'No feasible configuration found within the evaluated search space.',recommended=feasible[0] if feasible else None,alternatives=feasible[1:6],evaluated_configurations=evaluated,feasible_count=len(feasible),candidate_count=len(candidates),constraints=c,rejected=rejected,objective='height_m / 20 + distance_m / 1000 + slope_deg / 90',objective_kind='Dimensionless heuristic; not physical cost',algorithm=VERSION)


def reproject_ephemeris(records, source_lon, source_lat, target_lon, target_lat):
    """Rotate a far-field direction between local true ENU bases.

    This corrects local vertical/north rotation but neglects observer translation
    parallax. Bound that separately by asin(observer separation / body distance).
    This function does not convert between different lunar reference frames.
    """
    def basis(lon,lat):
        lon,lat=np.radians([lon,lat])
        return np.array([[-np.sin(lon),np.cos(lon),0],[-np.sin(lat)*np.cos(lon),-np.sin(lat)*np.sin(lon),np.cos(lat)],[np.cos(lat)*np.cos(lon),np.cos(lat)*np.sin(lon),np.sin(lat)]])
    if not all(math.isfinite(x) for x in (source_lon,source_lat,target_lon,target_lat)) or abs(source_lat)>90 or abs(target_lat)>90:
        raise ValueError('Invalid observer coordinates')
    if not records: raise ValueError('No ephemeris samples')
    az,el=np.radians(np.array([[r['azimuth_deg'],r['elevation_deg']] for r in records])).T
    local=np.stack((np.cos(el)*np.sin(az),np.cos(el)*np.cos(az),np.sin(el)),axis=-1)
    target=local@basis(source_lon,source_lat)@basis(target_lon,target_lat).T
    az_out=np.mod(np.degrees(np.arctan2(target[:,0],target[:,1])),360)
    el_out=np.degrees(np.arctan2(target[:,2],np.hypot(target[:,0],target[:,1])))
    return [{**r,'azimuth_deg':float(a),'elevation_deg':float(e)} for r,a,e in zip(records,az_out,el_out)]
