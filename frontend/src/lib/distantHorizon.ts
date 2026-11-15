import type {Analysis} from './science';
import {observerVector,type GeoPoint,type Vec3} from './sceneGeometry.ts';

export type DistantProfile={points:number[];dominates:boolean[]};
export type DistantHorizon={schema_version:number;detail_radius_km:number;points:Vec3[];profiles:Record<string,DistantProfile>};
export const geographicPoint=([longitude_deg,latitude_deg,elevation_m]:Vec3):GeoPoint=>({longitude_deg,latitude_deg,elevation_m});
export function profileFor(data:DistantHorizon,a:Analysis){return data.profiles[`${a.candidate_id}-${a.height_m}`];}

// The engine interpolates between sector maxima. A highlighted ridge is an actual
// contributing source sample, never an invented point at an interpolated distance.
export function distantCrest(data:DistantHorizon,a:Analysis,body:'sun'|'earth',time:number){
 if(a.series[`${body}_visible`][time])return null;
 const profile=profileFor(data,a);if(!profile)return null;
 const az=((a.series[`${body}_azimuth_deg`][time]%360)+360)%360,lo=Math.floor(az),fraction=az-lo;
 const bins=fraction<1e-9?[lo]:[lo,(lo+1)%360];
 if(!bins.every(i=>profile.dominates[i]))return null;
 const points=bins.map(bin=>{
  const id=profile.points[bin],point=geographicPoint(data.points[id]);
  const enu=observerVector({...a.position,elevation_m:a.position.elevation_m+a.height_m},point);
  return {id,point,bin,distanceKm:Math.hypot(...enu)/1000,elevation:Math.atan2(enu[2],Math.hypot(enu[0],enu[1]))*180/Math.PI};
 });
 // At exact sector boundaries only one maximum contributes. In between, require
 // the far profile itself to block the body before identifying a regional ridge.
 const horizon=points[0].elevation*(1-fraction)+(points[1]?.elevation??points[0].elevation)*fraction;
 if(horizon<a.series[`${body}_elevation_deg`][time])return null;
 const eligible=points.filter(p=>p.elevation>=a.series[`${body}_elevation_deg`][time]);
 return eligible.find(p=>p.bin===(fraction<=.5?lo:(lo+1)%360))??eligible[0]??null;
}
