import * as THREE from 'three';
import {CAP_LIFT,MOON_RADIUS_M,latLonToVec} from './globe';
import {VERTICAL_EXAGGERATION} from '../TerrainView';

const DEG=Math.PI/180;
export type Pose={position:THREE.Vector3;target:THREE.Vector3};

// Site scene: kilometres, origin on the tile centre at the tile's mean elevation, +Y local up,
// +X polar stereographic easting and +Z polar stereographic southing (the DEM's column and row directions).
export type SiteFrame={radiusKm:number;scale:number;center:THREE.Vector3;rotation:THREE.Quaternion;centerPs:[number,number];
 lat:number;lon:number;bearing:THREE.Vector3;horizontal:(azimuthDeg:number)=>THREE.Vector3;
 toScene:(p:THREE.Vector3)=>THREE.Vector3;toLanding:(p:THREE.Vector3)=>THREE.Vector3;upInLanding:THREE.Vector3};

export const LANDING_FOV=42;

type Directions={sun_azimuth_deg:number[];earth_azimuth_deg:number[];sun_visible:boolean[];earth_visible:boolean[]};
// The close-up faces what the engine has in view at instant i: both bodies when they are near each other,
// otherwise the Sun or the Earth, and the Earth's direction when neither is visible.
export function viewAzimuth(s:Directions,i:number){
 const sun=s.sun_azimuth_deg[i],earth=s.earth_azimuth_deg[i],gap=((sun-earth+540)%360)-180;
 if(s.sun_visible[i]&&s.earth_visible[i]&&Math.abs(gap)<50)return (earth+gap/2+360)%360;
 return s.sun_visible[i]?sun:earth;
}

// The globe and the site terrain share one exaggerated relief about the 1737.4 km sphere, so the tile's mean
// level sits at R + VE * mean and the landing's unit radius maps to R (the cap is lifted by CAP_LIFT).
export function siteFrame(lat:number,lon:number,meanM:number,viewAzimuthDeg:number):SiteFrame{
 const radiusKm=(MOON_RADIUS_M+VERTICAL_EXAGGERATION*meanM)/1000,scale=MOON_RADIUS_M/1000/CAP_LIFT;
 const rho=2*MOON_RADIUS_M*Math.tan(Math.PI/4+lat*DEG/2),centerPs:[number,number]=[rho*Math.sin(lon*DEG),rho*Math.cos(lon*DEG)];
 const axes=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(0,0,-1,0,0,-1,0,0,-1,0,0,0,0,0,0,1));
 const rotation=new THREE.Quaternion().setFromUnitVectors(latLonToVec(lat,lon).applyQuaternion(axes),new THREE.Vector3(0,1,0)).multiply(axes);
 const inverse=rotation.clone().invert(),center=new THREE.Vector3(0,-radiusKm,0);
 // Local horizontal direction for an azimuth measured from local north (away from the pole) toward east.
 const horizontal=(az:number)=>{const a=az*DEG,l=lon*DEG;return new THREE.Vector3(Math.sin(a)*Math.cos(l)+Math.cos(a)*Math.sin(l),0,Math.sin(a)*Math.sin(l)-Math.cos(a)*Math.cos(l));};
 return {radiusKm,scale,center,rotation,centerPs,lat,lon,horizontal,bearing:horizontal(viewAzimuthDeg+180),
  toScene:p=>p.clone().multiplyScalar(scale).applyQuaternion(rotation).add(center),
  toLanding:p=>p.clone().sub(center).applyQuaternion(inverse).divideScalar(scale),
  upInLanding:new THREE.Vector3(0,1,0).applyQuaternion(inverse)};
}

// Share of the half frame between the view centre and the horizon, so the limb stays near the top edge.
const HORIZON_AT=.74;
export const APPROACH_KM=760;

const orbit=(frame:SiteFrame,distance:number,elevation:number)=>frame.bearing.clone().multiplyScalar(distance*Math.cos(elevation)).setY(distance*Math.sin(elevation));

// Angle of the far horizon above the line of sight to the tile centre.
function horizonAbove(position:THREE.Vector3,radiusKm:number){
 const toCenter=new THREE.Vector3(0,-radiusKm,0).sub(position),d=toCenter.length();
 if(d<=radiusKm)return 0;
 return Math.asin(radiusKm/d)-toCenter.angleTo(position.clone().negate());
}

// Elevation of the view over the tile that puts the horizon at HORIZON_AT of the half frame for a vertical field of view.
export function horizonPose(distance:number,frame:SiteFrame,fovDeg:number):Pose{
 const want=Math.atan(HORIZON_AT*Math.tan(fovDeg/2*DEG));
 let lo=1*DEG,hi=85*DEG;
 for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(horizonAbove(orbit(frame,distance,mid),frame.radiusKm)<want)lo=mid;else hi=mid;}
 return {position:orbit(frame,distance,(lo+hi)/2),target:new THREE.Vector3()};
}

// The resting close-up: from `back` km behind the site at `height`, a look across it toward the view azimuth,
// pitched so the top of the frame sits `skyDeg` above the local horizontal. The target is under the site.
export function heroPose(frame:SiteFrame,fovDeg:number,back:number,height:number,skyDeg:number):Pose{
 const pitch=(fovDeg/2-skyDeg)*DEG,position=frame.bearing.clone().multiplyScalar(back).setY(height);
 const axis=frame.bearing.clone().negate().multiplyScalar(Math.cos(pitch)).setY(-Math.sin(pitch));
 return {position,target:position.clone().addScaledVector(axis,back/Math.cos(pitch))};
}
