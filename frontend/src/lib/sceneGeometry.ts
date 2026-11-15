// A single affine transform for terrain, sightlines and observer heights. Stretching
// all vertical coordinates equally preserves intersections (stretching only relief does not).
export const RELIEF_SCALE = 4;
export const LUNAR_RADIUS_M = 1737400;
export const DETAIL_RADIUS_KM = 7.95;
export type Vec3 = [number, number, number];
export type GeoPoint = {longitude_deg:number; latitude_deg:number; elevation_m:number};
const RAD=Math.PI/180;
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export function lunarBasis(lon:number,lat:number){
 const l=lon*RAD,p=lat*RAD;
 return {east:[-Math.sin(l),Math.cos(l),0] as Vec3,
  north:[-Math.sin(p)*Math.cos(l),-Math.sin(p)*Math.sin(l),Math.cos(p)] as Vec3,
  up:[Math.cos(p)*Math.cos(l),Math.cos(p)*Math.sin(l),Math.sin(p)] as Vec3};
}
export function lunarPoint(p:GeoPoint):Vec3 {
 return lunarBasis(p.longitude_deg,p.latitude_deg).up.map(v=>v*(LUNAR_RADIUS_M+p.elevation_m)) as Vec3;
}
export function observerVector(observer:GeoPoint,target:GeoPoint):Vec3 {
 const a=lunarPoint(observer),b=lunarPoint(target),d=b.map((v,i)=>v-a[i]) as Vec3;
 const basis=lunarBasis(observer.longitude_deg,observer.latitude_deg);
 return [dot(d,basis.east),dot(d,basis.north),dot(d,basis.up)];
}
export function sceneProjection(lat:number,lon:number,mean:number){
 const basis=lunarBasis(lon,lat),origin=lunarPoint({latitude_deg:lat,longitude_deg:lon,elevation_m:mean});
 const l=lon*RAD;
 const vector=(d:Vec3):Vec3=>{
  const e=dot(d,basis.east),n=dot(d,basis.north),u=dot(d,basis.up);
  return [(e*Math.cos(l)+n*Math.sin(l))/1000,u*RELIEF_SCALE/1000,(e*Math.sin(l)-n*Math.cos(l))/1000];
 };
 const point=(p:GeoPoint,height=0):Vec3=>{
  const xyz=lunarPoint({...p,elevation_m:p.elevation_m+height});
  return vector(xyz.map((v,i)=>v-origin[i]) as Vec3);
 };
 return {point,
  gridPoint:(x:number,y:number,h:number):Vec3=>point({longitude_deg:Math.atan2(x,y)/RAD,latitude_deg:(2*Math.atan(Math.hypot(x,y)/(2*LUNAR_RADIUS_M))-Math.PI/2)/RAD,elevation_m:h}),
  direction:(p:GeoPoint,az:number,el:number,distanceKm:number):Vec3=>{
   const b=lunarBasis(p.longitude_deg,p.latitude_deg),a=az*RAD,h=el*RAD;
   return vector(b.up.map((v,i)=>(b.east[i]*Math.sin(a)*Math.cos(h)+b.north[i]*Math.cos(a)*Math.cos(h)+v*Math.sin(h))*distanceKm*1000) as Vec3);
  },
 };
}
