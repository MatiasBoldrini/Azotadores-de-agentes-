import type {Vec3} from './sceneGeometry.ts';

// Close the schematic skyline underneath the detailed terrain. This is an opaque
// backing, not additional elevation data: every supplied skyline vertex stays untouched.
export function distantTerrainShell(peaks:Vec3[],observer:Vec3){
 if(peaks.length<3)return {positions:new Float32Array(),indices:[] as number[]};
 const bottom=Math.min(-80,...peaks.map(p=>p[1]-1));
 const positions=new Float32Array((peaks.length*2+1)*3),indices:number[]=[];
 const center=peaks.length*2;
 // The horizon sectors are ordered around this observer, so the fan stays inside
 // their outline even when adjacent crests have very different distances.
 positions.set([observer[0],bottom,observer[2]],center*3);
 peaks.forEach((p,i)=>{
  const a=i*2,b=((i+1)%peaks.length)*2;
  positions.set(p,a*3);
  positions.set([p[0],bottom,p[2]],(a+1)*3);
  indices.push(a,a+1,b,b,a+1,b+1,center,b+1,a+1);
 });
 return {positions,indices};
}
