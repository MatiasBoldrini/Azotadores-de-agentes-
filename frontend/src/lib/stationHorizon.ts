import type {Analysis} from './science.ts';
import type {sceneProjection,Vec3} from './sceneGeometry.ts';

export const SKY_DISTANCE_KM=400;
export const HORIZON_DEPTH_RATIO=.5;
type Projection=ReturnType<typeof sceneProjection>;
const wrap=(azimuth:number)=>((azimuth%360)+360)%360;

// Match the visibility engine's periodic angular interpolation, including nearby
// terrain. Geographic samples outside the detail disc alone are not this horizon.
export function stationHorizonElevation(analysis:Analysis,azimuth:number){
 const profile=analysis.horizon.elevation_deg,index=wrap(azimuth)*profile.length/360;
 const bin=Math.floor(index),fraction=index-bin;
 return profile[bin]*(1-fraction)+profile[(bin+1)%profile.length]*fraction;
}

export function stationHorizonPoint(analysis:Analysis,projection:Projection,azimuth:number):Vec3{
 return projection.direction(analysis.position,azimuth,stationHorizonElevation(analysis,azimuth),SKY_DISTANCE_KM*HORIZON_DEPTH_RATIO);
}

export function stationHorizonPeaks(analysis:Analysis,projection:Projection,time:number):Vec3[]{
 // Subdivide the angular curve and include each body's exact azimuth so the
 // rendered edge agrees with its visibility threshold even during a crossing.
 const count=analysis.horizon.elevation_deg.length*4;
 const angles=Array.from({length:count},(_,i)=>i*360/count);
 for(const body of ['sun','earth'] as const)angles.push(wrap(analysis.series[`${body}_azimuth_deg`][time]));
 return [...new Set(angles)].sort((a,b)=>a-b).map(azimuth=>stationHorizonPoint(analysis,projection,azimuth));
}

// The sky markers live at observer + skyDirection. Project the mask halfway from
// the camera to that same sky sphere: its screen alignment then survives orbit,
// zoom and mast motion, while its depth remains behind the detailed terrain.
export function stationHorizonOrigin(camera:Vec3,observer:Vec3):Vec3{
 return camera.map((v,i)=>v+(observer[i]-v)*HORIZON_DEPTH_RATIO) as Vec3;
}
