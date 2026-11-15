import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {distantCrest,geographicPoint,profileFor} from '../frontend/src/lib/distantHorizon.ts';
import {sceneProjection,observerVector,RELIEF_SCALE,LUNAR_RADIUS_M} from '../frontend/src/lib/sceneGeometry.ts';

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
