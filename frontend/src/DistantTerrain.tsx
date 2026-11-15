import {useEffect,useMemo,useRef,useState,type RefObject} from 'react';
import {Html,Line} from '@react-three/drei';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import type {Analysis} from './lib/science';
import {distantCrest,geographicPoint,profileFor,type DistantHorizon} from './lib/distantHorizon';
import {sceneProjection,type Vec3} from './lib/sceneGeometry';
import type {SiteFrame} from './moon/frame';

let request:Promise<DistantHorizon|null>|undefined;
function loadHorizon(){
 return request??=fetch('/site01/distant-horizon.json').then(async r=>{
  if(!r.ok)return null;
  const data:DistantHorizon=await r.json();
  return data.schema_version===1&&data.detail_radius_km===7.95?data:null;
 }).catch(()=>null);
}
type Props={analysis:Analysis;time:number;frame:SiteFrame;mean:number;progress:RefObject<number>;occluder:RefObject<THREE.Mesh|null>;hidden:boolean};

export default function DistantTerrain(props:Props){
 const [data,setData]=useState<DistantHorizon|null>(null);
 useEffect(()=>{let live=true;loadHorizon().then(d=>{if(live)setData(d);});return()=>{live=false;};},[]);
 return data&&!props.hidden?<Skyline key={`${props.analysis.candidate_id}-${props.analysis.height_m}`} {...props} data={data}/>:null;
}

function Skyline({analysis,time,frame,mean,progress,occluder,hidden,data}:Props&{data:DistantHorizon}){
 const group=useRef<THREE.Group>(null);
 const projection=useMemo(()=>sceneProjection(frame.lat,frame.lon,mean),[frame,mean]);
 const profile=profileFor(data,analysis);
 const peaks=useMemo(()=>profile?.points.map(id=>projection.point(geographicPoint(data.points[id])))??[],[profile,data,projection]);
 const geometry=useMemo(()=>{
  const positions=new Float32Array(peaks.length*6),indices:number[]=[];
  peaks.forEach((p,i)=>{
   positions.set(p,i*6);positions.set([p[0],-80,p[2]],i*6+3);
   const a=i*2,b=((i+1)%peaks.length)*2;indices.push(a,a+1,b,b,a+1,b+1);
  });
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setIndex(indices);g.computeBoundingSphere();return g;
 },[peaks]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 const [selected,setSelected]=useState<string|null>(null);
 const crests=(['sun','earth'] as const).flatMap(body=>{
  const crest=distantCrest(data,analysis,body,time);
  return crest?[{...crest,body,key:`${body}-${crest.id}`,position:projection.point(crest.point)}]:[];
 });
 const activeKeys=crests.map(c=>c.key).join(',');
 useEffect(()=>{setSelected(null);},[activeKeys,hidden]);
 useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setSelected(null);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[]);
 useFrame(()=>{if(group.current)group.current.visible=!hidden&&progress.current>.95;});
 if(!peaks.length)return null;
 return <group ref={group} name="regional-horizon">
  <mesh geometry={geometry} raycast={()=>{}}>
   <meshBasicMaterial color="#202428" side={THREE.DoubleSide} toneMapped={false}/>
  </mesh>
  <Line points={[...peaks,peaks[0]]} raycast={()=>{}} color="#747b80" lineWidth={.8} transparent opacity={.55} depthWrite={false} toneMapped={false}/>
  {crests.map(crest=>{
   const chosen=selected===crest.key,label=crest.body==='earth'?'Earth':'Sun';
   // A short highlight on the real ridge, not a tall billboard or permanent label.
   const previous=peaks[(crest.bin+359)%360],next=peaks[(crest.bin+1)%360],at=crest.position;
   const toward=(p:Vec3):Vec3=>at.map((v,i)=>v+(p[i]-v)*.2) as Vec3;
   return <group key={crest.key}>
    <Line points={[toward(previous),at,toward(next)]} raycast={()=>{}} color="#ff7770" lineWidth={chosen?2:1.5} depthWrite={false} toneMapped={false}/>
    <Html position={[at[0],at[1]+.025,at[2]]} center zIndexRange={[4,1]} occlude={[occluder as RefObject<THREE.Object3D>]}>
     <button type="button" className={`distant-crest${chosen?' is-open':''}`} aria-label={`Show ${label} horizon ridge distance`} aria-expanded={chosen}
      onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()}
      onClick={e=>{e.stopPropagation();setSelected(chosen?null:crest.key);}}>
      <span className="distant-crest-dot" aria-hidden="true"/>
      {chosen&&<span className="distant-crest-label">{label} horizon · {Math.round(crest.distanceKm)} km</span>}
     </button>
    </Html>
   </group>;
  })}
 </group>;
}
