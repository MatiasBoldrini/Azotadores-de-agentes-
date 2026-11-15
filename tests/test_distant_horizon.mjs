import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import test from 'node:test';
import {distantCrest,geographicPoint,profileFor} from '../frontend/src/lib/distantHorizon.ts';
import {sceneProjection,observerVector,RELIEF_SCALE,LUNAR_RADIUS_M,DETAIL_RADIUS_KM} from '../frontend/src/lib/sceneGeometry.ts';
import {distantTerrainShell} from '../frontend/src/lib/distantTerrainGeometry.ts';

const THREE=createRequire(new URL('../frontend/package.json',import.meta.url))('three');

const bytes=readFileSync(new URL('../public/data/snapshot.json',import.meta.url));
const snapshot=JSON.parse(bytes);
const data=JSON.parse(readFileSync(new URL('../public/site01/distant-horizon.json',import.meta.url)));
const a=snapshot.analyses.find(a=>a.candidate_id==='r256c256'&&a.height_m===5);
const close=(a,b,epsilon=1e-8)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);

test('every simplified skyline is bounded by the matching scientific horizon',()=>{
 assert.equal(data.snapshot_sha256,createHash('sha256').update(bytes).digest('hex'));
 assert.equal(Object.keys(data.profiles).length,snapshot.analyses.length);
 assert.ok(data.points.length<10000,'keep the shared geographic payload small');
 const meta=JSON.parse(readFileSync(new URL('../data/regional-metadata.json',import.meta.url)));
 assert.equal(data.regional_sha256,meta.sha256);
 for(const analysis of snapshot.analyses){
  const profile=profileFor(data,analysis);
  assert.equal(profile.points.length,360);assert.equal(profile.dominates.length,360);
  profile.points.forEach((id,i)=>{
   const p=geographicPoint(data.points[id]);
   const [e,n,u]=observerVector({...analysis.position,elevation_m:analysis.position.elevation_m+analysis.height_m},p);
   const angle=Math.atan2(u,Math.hypot(e,n))*180/Math.PI;
   assert.ok(angle<=analysis.horizon.elevation_deg[i]+1e-8);
   if(profile.dominates[i])close(angle,analysis.horizon.elevation_deg[i]);
   const az=(Math.atan2(e,n)*180/Math.PI+360)%360;
   assert.equal(Math.floor(az+.5)%360,i);
  });
 }
});

test('the screenshot points to an actual distant sample, and visible bodies have no ridge marker',()=>{
 const crest=distantCrest(data,a,'earth',142);
 assert.ok(crest);assert.ok(crest.distanceKm>134&&crest.distanceKm<136);
 assert.equal(crest.bin,143);
 assert.equal(distantCrest(data,a,'sun',142),null);
 const visible=a.series.earth_visible.findIndex(Boolean);
 assert.equal(distantCrest(data,a,'earth',visible),null);
 const ground=snapshot.analyses.find(b=>b.candidate_id===a.candidate_id&&b.height_m===0);
 assert.equal(distantCrest(data,ground,'earth',142),null,'a local controlling ridge must not be attributed to distant terrain');
});

test('real geographic distance is preserved and the whole scene uses the same vertical transform',()=>{
 const terrain=snapshot.terrain,values=terrain.elevation_m.flat().filter(v=>v!==null);
 const mean=values.reduce((a,b)=>a+b,0)/values.length;
 const projection=sceneProjection(a.position.latitude_deg,a.position.longitude_deg,mean);
 const crest=distantCrest(data,a,'earth',142),ground=projection.point(a.position),observer=projection.point(a.position,5),top=projection.point(crest.point);
 close(observer[1]-ground[1],5*RELIEF_SCALE/1000);
 const delta=top.map((v,i)=>v-observer[i]);
 const physicalAngle=Math.atan2(delta[1]/RELIEF_SCALE,Math.hypot(delta[0],delta[2]))*180/Math.PI;
 close(physicalAngle,crest.elevation);
 close(Math.hypot(delta[0],delta[1]/RELIEF_SCALE,delta[2]),crest.distanceKm);
 const az=a.series.earth_azimuth_deg[142],el=a.series.earth_elevation_deg[142];
 const ray=projection.direction(a.position,az,el,100);
 close(Math.atan2(ray[1]/RELIEF_SCALE,Math.hypot(ray[0],ray[2]))*180/Math.PI,el);
 // The inverse polar-stereographic path used by the detailed mesh agrees with
 // the direct ECEF path used by the distant skyline (including lunar curvature).
 const r=2*LUNAR_RADIUS_M*Math.tan(Math.PI/4+crest.point.latitude_deg*Math.PI/360);
 const fromGrid=projection.gridPoint(r*Math.sin(crest.point.longitude_deg*Math.PI/180),r*Math.cos(crest.point.longitude_deg*Math.PI/180),crest.point.elevation_m);
 fromGrid.forEach((v,i)=>close(v,top[i]));
});

test('0/360 seam and exact bins select actual contributing points without stale markers',()=>{
 const base={...a,series:{...a.series,earth_visible:[false],earth_azimuth_deg:[359.9],earth_elevation_deg:[-89]}};
 const profile={...profileFor(data,a),dominates:Array(360).fill(true)};
 const fixture={...data,profiles:{[`${a.candidate_id}-${a.height_m}`]:profile}};
 assert.equal(distantCrest(fixture,base,'earth',0).bin,0);
 base.series.earth_azimuth_deg[0]=360;
 assert.equal(distantCrest(fixture,base,'earth',0).bin,0);
 profile.dominates[0]=false;
 assert.equal(distantCrest(fixture,base,'earth',0),null);
});

test('looking down past the detailed terrain hits the closed lunar backing instead of empty sky',()=>{
 const analysis=snapshot.analyses.find(a=>a.candidate_id==='r384c256'&&a.height_m===20);
 const projection=sceneProjection(analysis.position.latitude_deg,analysis.position.longitude_deg,analysis.position.elevation_m);
 const observer=projection.point(analysis.position,analysis.height_m);
 const peaks=profileFor(data,analysis).points.map(id=>projection.point(geographicPoint(data.points[id])));
 const {positions,indices}=distantTerrainShell(peaks,observer);
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setIndex(indices);
 const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
 const mesh=new THREE.Mesh(geometry,material);mesh.updateMatrixWorld();
 try{
  let checked=0;
  for(const bin of [0,45,90,135,180,225,270,315]){
   const peak=peaks[bin],dx=peak[0]-observer[0],dz=peak[2]-observer[2],distance=Math.hypot(dx,dz);
   if(distance<=DETAIL_RADIUS_KM+1)continue;
   const fraction=(DETAIL_RADIUS_KM+distance)/(2*distance);
   const origin=new THREE.Vector3(observer[0]+dx*fraction,10,observer[2]+dz*fraction);
   const hits=new THREE.Raycaster(origin,new THREE.Vector3(0,-1,0),0,1000).intersectObject(mesh);
   assert.ok(hits.length>0,`top view beyond the detailed disc must have a floor in sector ${bin}`);
   checked++;
  }
  assert.ok(checked>=4,'check the gap beyond the detailed disc in several directions');
  // A low-angle view could previously look straight under the curtain's -80 km edge.
  const hits=new THREE.Raycaster(new THREE.Vector3(...observer),new THREE.Vector3(1,-20,0).normalize(),0,1000).intersectObject(mesh);
  assert.ok(hits.length>0,'the lower opening must also be closed from an oblique view');
 }finally{geometry.dispose();material.dispose();}
});

test('closing the lower shell preserves every measured crest and has no open bottom edges',()=>{
 const projection=sceneProjection(a.position.latitude_deg,a.position.longitude_deg,a.position.elevation_m);
 const observer=projection.point(a.position,a.height_m);
 for(const analysis of snapshot.analyses){
  const peaks=profileFor(data,analysis).points.map(id=>projection.point(geographicPoint(data.points[id])));
  const {positions,indices}=distantTerrainShell(peaks,projection.point(analysis.position));
  const edges=new Map();
  for(let i=0;i<indices.length;i+=3){
   const triangle=indices.slice(i,i+3);
   triangle.forEach((from,j)=>{
    const to=triangle[(j+1)%3],key=[Math.min(from,to),Math.max(from,to)].join(',');
    edges.set(key,(edges.get(key)??0)+1);
   });
  }
  peaks.forEach((peak,i)=>{
   peak.forEach((v,j)=>assert.equal(positions[i*6+j],Math.fround(v),'crest must not move'));
   assert.ok(positions[i*6+4]<Math.min(peak[1],observer[1]),'backing stays below the skyline and observer');
  });
  for(const [edge,count] of edges){
   const [from,to]=edge.split(',').map(Number);
   const skylineEdge=from<peaks.length*2&&to<peaks.length*2&&from%2===0&&to%2===0;
   assert.equal(count,skylineEdge?1:2,`unsealed shell edge ${edge}`);
  }
 }
});
