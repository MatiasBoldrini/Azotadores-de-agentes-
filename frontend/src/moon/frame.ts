import * as THREE from 'three';
import {CAP_LIFT,MOON_RADIUS_M,latLonToVec} from './globe';

const DEG=Math.PI/180;
export type Pose={position:THREE.Vector3;target:THREE.Vector3};

// Site scene: kilometres, origin on the tile centre at the tile's mean elevation, +Y local up,
// +X polar stereographic easting and +Z polar stereographic southing (the DEM's column and row directions).
export type SiteFrame={radiusKm:number;scale:number;center:THREE.Vector3;rotation:THREE.Quaternion;centerPs:[number,number];
 toScene:(p:THREE.Vector3)=>THREE.Vector3;toLanding:(p:THREE.Vector3)=>THREE.Vector3;upInLanding:THREE.Vector3};

export const LANDING_FOV=42;

export function siteFrame(lat:number,lon:number,meanM:number):SiteFrame{
 // The landing cap surface (radius CAP_LIFT, flat at the pole) maps onto the sphere through the tile's mean level.
 const radiusKm=(MOON_RADIUS_M+meanM)/1000,scale=radiusKm/CAP_LIFT;
 const rho=2*MOON_RADIUS_M*Math.tan(Math.PI/4+lat*DEG/2),centerPs:[number,number]=[rho*Math.sin(lon*DEG),rho*Math.cos(lon*DEG)];
 const axes=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(0,0,-1,0,0,-1,0,0,-1,0,0,0,0,0,0,1));
 const rotation=new THREE.Quaternion().setFromUnitVectors(latLonToVec(lat,lon).applyQuaternion(axes),new THREE.Vector3(0,1,0)).multiply(axes);
 const inverse=rotation.clone().invert(),center=new THREE.Vector3(0,-radiusKm,0);
 return {radiusKm,scale,center,rotation,centerPs,
  toScene:p=>p.clone().multiplyScalar(scale).applyQuaternion(rotation).add(center),
  toLanding:p=>p.clone().sub(center).applyQuaternion(inverse).divideScalar(scale),
  upInLanding:new THREE.Vector3(0,1,0).applyQuaternion(inverse)};
}

// Every pose of the arrival looks at the tile along this horizontal bearing.
const BEARING=new THREE.Vector3(1.95,0,2.25).normalize();
// Share of the half frame between the view centre and the horizon, so the limb stays near the top edge.
const HORIZON_AT=.74;
export const APPROACH_KM=760;

const orbit=(distance:number,elevation:number)=>BEARING.clone().multiplyScalar(distance*Math.cos(elevation)).setY(distance*Math.sin(elevation));

// Angle of the far horizon above the line of sight to the tile centre.
function horizonAbove(position:THREE.Vector3,radiusKm:number){
 const toCenter=new THREE.Vector3(0,-radiusKm,0).sub(position),d=toCenter.length();
 if(d<=radiusKm)return 0;
 return Math.asin(radiusKm/d)-toCenter.angleTo(position.clone().negate());
}

// Elevation of the view over the tile that puts the horizon at HORIZON_AT of the half frame for a vertical field of view.
export function horizonPose(distance:number,radiusKm:number,fovDeg:number):Pose{
 const want=Math.atan(HORIZON_AT*Math.tan(fovDeg/2*DEG));
 let lo=1*DEG,hi=85*DEG;
 for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(horizonAbove(orbit(distance,mid),radiusKm)<want)lo=mid;else hi=mid;}
 return {position:orbit(distance,(lo+hi)/2),target:new THREE.Vector3()};
}
