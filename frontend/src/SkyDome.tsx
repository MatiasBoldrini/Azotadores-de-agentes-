import {useEffect,useMemo,useRef,type RefObject} from 'react';
import {Line} from '@react-three/drei';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import type {Analysis} from './lib/science';
import type {Vec3} from './lib/sceneGeometry';
import {horizonRing,skyGained,skyPaths,skySteps} from './lib/skyDome';

export const SKY_DOME_CAPTION='Geometric line of sight from LOLA terrain';
const COLORS={sun:'#E2B06A',earth:'#93B9D6'} as const;
export const GAINED_COLOR='#9DC4A4';
const BLOCKED='#D9665B';
const noRaycast=()=>{};
type Direction=(az:number,el:number)=>Vec3;

/** Lighter geometry on small or low-core devices: half the horizon resolution and thinner lines. */
export function lowPower(){
 if(typeof window==='undefined')return false;
 return Math.min(window.innerWidth,window.innerHeight)<700||(navigator.hardwareConcurrency??8)<=4;
}

/**
 * The sky seen from the mast top, drawn on a dome around the station: the engine's horizon at the selected
 * height, the Sun and Earth tracks over the window (coloured in view, red dashed when blocked (hidden where the drawn terrain covers them), green where the
 * mast gains them over ground level), and the band of sky the mast clears. Directions use the same scene
 * transform as the terrain and the Sun/Earth markers, so the vertical exaggeration applies to the dome too.
 */
export default function SkyDome({analysis,reference,direction,progress,label}:{
 analysis:Analysis;reference?:Analysis;direction:Direction;progress:RefObject<number>;label:(text:string,position:Vec3,color:string)=>React.ReactNode;
}){
 const group=useRef<THREE.Group>(null);
 const light=useMemo(lowPower,[]);
 useFrame(()=>{if(group.current)group.current.visible=progress.current>.95;});
 const profile=analysis.horizon.elevation_deg;
 const ring=useMemo(()=>horizonRing(profile,light?1:2).map(([a,e])=>direction(a,e)),[profile,direction,light]);
 const referenceRing=useMemo(()=>reference?horizonRing(reference.horizon.elevation_deg,1).map(([a,e])=>direction(a,e)):null,[reference,direction]);
 const band=useMemo(()=>{
  if(!reference)return null;
  const cells=skyGained(reference.horizon.elevation_deg,profile);
  if(!cells.length)return null;
  const step=360/profile.length,pos:number[]=[];
  // One quad per cleared 1° bin, between the lower mast's horizon and the current one.
  for(const [az,top,bottom] of cells){
   const next=(i:number)=>i*step;
   const bin=Math.round(az/step),a0=next(bin),a1=next(bin+1);
   const t1=reference.horizon.elevation_deg[(bin+1)%profile.length],b1=profile[(bin+1)%profile.length];
   const p=[direction(a0,top),direction(a0,bottom),direction(a1,t1),direction(a1,b1)];
   pos.push(...p[0],...p[1],...p[2],...p[2],...p[1],...p[3]);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeBoundingSphere();return g;
 },[reference,profile,direction]);
 useEffect(()=>()=>band?.dispose(),[band]);
 const tracks=useMemo(()=>(['sun','earth'] as const).map(body=>{
  const paths=skyPaths(skySteps(analysis,body,reference));
  const map=(pts:[number,number][])=>pts.map(([a,e])=>direction(a,e));
  return {body,visible:map(paths.visible),gained:map(paths.gained),blocked:map(paths.blocked)};
 }),[analysis,reference,direction]);
 const width=light?1.4:2;
 const cardinal=[0,90,180,270].map(az=>({az,text:['N','E','S','W'][az/90],at:direction(az,profile[Math.round(az/(360/profile.length))%profile.length]+.6)}));
 return <group ref={group} name="sky-dome">
  {band&&<mesh geometry={band} renderOrder={54} raycast={noRaycast}><meshBasicMaterial color={GAINED_COLOR} transparent opacity={.16} side={THREE.DoubleSide} depthTest={false} depthWrite={false} toneMapped={false}/></mesh>}
  {referenceRing&&<Line points={referenceRing} raycast={noRaycast} color="#9a9a9a" lineWidth={1} dashed dashSize={3} gapSize={3} transparent opacity={.7} depthTest={false} depthWrite={false} renderOrder={55} toneMapped={false}/>}
  <Line points={ring} raycast={noRaycast} color="#f2f2f2" lineWidth={light?1.2:1.6} transparent opacity={.85} depthTest={false} depthWrite={false} renderOrder={56} toneMapped={false}/>
  {tracks.map(t=><group key={t.body}>
   {t.blocked.length>0&&<Line segments points={t.blocked} raycast={noRaycast} color={BLOCKED} lineWidth={width*.7} dashed dashSize={1.4} gapSize={1.6} transparent opacity={.6} depthTest depthWrite={false} renderOrder={57} toneMapped={false}/>}
   {t.visible.length>0&&<Line segments points={t.visible} raycast={noRaycast} color={COLORS[t.body]} lineWidth={width} transparent opacity={.95} depthTest={false} depthWrite={false} renderOrder={58} toneMapped={false}/>}
   {t.gained.length>0&&<>
    <Line segments points={t.gained} raycast={noRaycast} color={GAINED_COLOR} lineWidth={width*3} transparent opacity={.4} depthTest={false} depthWrite={false} renderOrder={58} toneMapped={false}/>
    <Line segments points={t.gained} raycast={noRaycast} color={COLORS[t.body]} lineWidth={width} transparent opacity={.95} depthTest={false} depthWrite={false} renderOrder={59} toneMapped={false}/>
   </>}
  </group>)}
  {cardinal.map(c=><group key={c.az}>{label(c.text,c.at,'#D4D4D4')}</group>)}
 </group>;
}
