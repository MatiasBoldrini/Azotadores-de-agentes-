import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import {sceneProjection} from '../frontend/src/lib/sceneGeometry.ts';
import {distantTerrainShell} from '../frontend/src/lib/distantTerrainGeometry.ts';
import {SKY_DISTANCE_KM,stationHorizonElevation,stationHorizonOrigin,stationHorizonPeaks,stationHorizonPoint} from '../frontend/src/lib/stationHorizon.ts';

const THREE=createRequire(new URL('../frontend/package.json',import.meta.url))('three');
const snapshot=JSON.parse(readFileSync(new URL('../public/data/snapshot.json',import.meta.url)));
const terrain=snapshot.terrain,mid=terrain.original_shape[0]/2/terrain.stride;
const heights=terrain.elevation_m.flat().filter(v=>v!==null);
const projection=sceneProjection(terrain.latitude_deg[mid][mid],terrain.longitude_deg[mid][mid],heights.reduce((sum,h)=>sum+h,0)/heights.length);
const analysisAt=height=>snapshot.analyses.find(a=>a.candidate_id==='r384c256'&&a.height_m===height);
const timeAt=(analysis,date)=>analysis.series.timestamp_utc.findIndex(t=>Date.parse(t)===Date.parse(date));
const close=(a,b,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);

test('candidate 23 uses the complete tower horizon at the November 21 crossing',()=>{
 const a=analysisAt(0),before=timeAt(a,'2026-11-21T17:00:00Z'),after=before+1;
 assert.equal(a.series.earth_visible[before],false);
 assert.equal(a.series.earth_visible[after],true);
 close(stationHorizonElevation(a,a.series.earth_azimuth_deg[before]),4.719727830585082);
 for(const i of [before,after])close(stationHorizonElevation(a,a.series.earth_azimuth_deg[i]),a.series.earth_horizon_deg[i]);
 // Changing mast height changes this same contour, rather than retaining only
 // the much lower distant hills (around -2 degrees in this direction).
 assert.ok(stationHorizonElevation(analysisAt(20),a.series.earth_azimuth_deg[before])<1.4);
});

test('rendered shell occludes the body center exactly when the scientific samples are blocked',()=>{
 const cases=[
  [analysisAt(0),'2026-11-21T17:00:00Z'],
  [analysisAt(0),'2026-11-21T17:30:00Z'],
  [analysisAt(20),'2026-11-18T21:00:00Z'],
  [analysisAt(20),'2026-11-21T17:00:00Z'],
  [snapshot.analyses.find(a=>a.candidate_id==='r256c256'&&a.height_m===5),'2026-11-03T23:00:00Z'],
 ];
 const cameras=[[0,.5,1.2],[5,7,-2],[-7,.3,-1],[0,9,.001]];
 for(const [a,date] of cases){
  const time=timeAt(a,date),observer=projection.point(a.position,a.height_m);
  const {positions,indices}=distantTerrainShell(stationHorizonPeaks(a,projection,time),[0,0,0]);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setIndex(indices);
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material);
  try{
   for(const camera of cameras){
    mesh.position.fromArray(stationHorizonOrigin(camera,observer));mesh.updateMatrixWorld();
    for(const body of ['sun','earth']){
     const direction=projection.direction(a.position,a.series[`${body}_azimuth_deg`][time],a.series[`${body}_elevation_deg`][time],SKY_DISTANCE_KM);
     const start=new THREE.Vector3(...camera),end=new THREE.Vector3(...observer).add(new THREE.Vector3(...direction));
     const ray=new THREE.Raycaster(start,end.clone().sub(start).normalize(),.001,start.distanceTo(end));
     const blocked=ray.intersectObject(mesh).length>0;
     assert.equal(blocked,!a.series[`${body}_visible`][time],`${a.candidate_id}/${a.height_m}m ${date} ${body}, camera ${camera}`);
    }
   }
  }finally{geometry.dispose();material.dispose();}
 }
});

test('a center on the horizon stays on its rendered edge across camera and mast movement',()=>{
 const a=analysisAt(20),time=timeAt(a,'2026-11-18T21:00:00Z'),az=a.series.earth_azimuth_deg[time];
 const edge=stationHorizonPoint(a,projection,az);
 const direction=projection.direction(a.position,az,stationHorizonElevation(a,az),SKY_DISTANCE_KM);
 const stationary=projection.point(a.position,a.height_m);
 for(const observer of [stationary,stationary.map((v,i)=>v+[.3,.06,-.2][i])]){
  for(const camera of [[0,.5,1.2],[5,7,-2],[-7,.3,-1]]){
   const origin=stationHorizonOrigin(camera,observer);
   const toEdge=new THREE.Vector3(...origin).add(new THREE.Vector3(...edge)).sub(new THREE.Vector3(...camera));
   const toBody=new THREE.Vector3(...observer).add(new THREE.Vector3(...direction)).sub(new THREE.Vector3(...camera));
   assert.ok(toEdge.length()<toBody.length(),'mask is in front of the background body');
   assert.ok(toEdge.normalize().distanceTo(toBody.normalize())<1e-12,'camera parallax must not move the threshold');
  }
 }
});

test('station horizon wraps at north and matches the visibility profile for every configuration',()=>{
 for(const a of snapshot.analyses){
  close(stationHorizonElevation(a,360),a.horizon.elevation_deg[0]);
  close(stationHorizonElevation(a,-.1),stationHorizonElevation(a,359.9));
  for(let i=0;i<a.series.timestamp_utc.length;i+=31){
   for(const body of ['sun','earth'])close(stationHorizonElevation(a,a.series[`${body}_azimuth_deg`][i]),a.series[`${body}_horizon_deg`][i]);
  }
 }
});
