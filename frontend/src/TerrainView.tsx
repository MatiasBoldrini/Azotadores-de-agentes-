import {useMemo,useRef,useEffect,Suspense} from 'react';
import {Canvas,ThreeEvent,useFrame,useThree} from '@react-three/fiber';
import {OrbitControls,Line} from '@react-three/drei';
import * as THREE from 'three';
import type {Analysis,Site,Terrain} from './lib/science';

// Terrain is drawn at 1:1. Only the mast glyph is stretched so that metre-scale heights read on a 2.5 km scene.
export const MAST_EXAGGERATION=12;
const MAST_BASE=.03,MAST_PER_M=MAST_EXAGGERATION/1000,RAY=.85;
const HOME:[number,number,number]=[1.95,1.5,2.25],TOP:[number,number,number]=[0,3.6,.001];
const C={sun:'#f4b860',earth:'#82b8ec',station:'#f4b860',lander:'#eef2ef',candidate:'#9aa6a2',feasible:'#8fd6a0',ok:'#8fd6a0',bad:'#f2836b',grid:'#2a3236'};

type Props={terrain:Terrain;analyses:Analysis[];selected:Analysis;lander:Site;time:number;onSelect:(id:string)=>void;wireframe:boolean;mapView:boolean;reset:number;linkVisible:boolean;feasible?:Set<string>;recommended?:string};

function Label({text,position,color='#dce7d8',size=.082}:{text:string;position:[number,number,number];color?:string;size?:number}){
 const [texture,aspect]=useMemo(()=>{
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!,font='600 40px "IBM Plex Mono", ui-monospace, monospace';
  ctx.font=font;const w=Math.ceil(ctx.measureText(text).width)+44,h=72;canvas.width=w;canvas.height=h;
  ctx.fillStyle='rgba(12,15,17,.88)';ctx.fillRect(0,0,w,h);ctx.strokeStyle=color;ctx.globalAlpha=.7;ctx.lineWidth=2;ctx.strokeRect(1,1,w-2,h-2);ctx.globalAlpha=1;
  ctx.font=font;ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,w/2,h/2+2);
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return [t,w/h] as const;
 },[text,color]);
 useEffect(()=>()=>texture.dispose(),[texture]);
 return <sprite position={position} scale={[size*aspect,size,1]} renderOrder={100}><spriteMaterial map={texture} depthTest={false} transparent/></sprite>;
}

function Surface({terrain,wireframe,onPick}:{terrain:Terrain;wireframe:boolean;onPick:(r:number,c:number)=>void}){
 const geometry=useMemo(()=>{
  const rows=terrain.elevation_m.length,cols=terrain.elevation_m[0].length;
  const valid=terrain.elevation_m.flat().filter((x):x is number=>x!==null);
  const mean=valid.reduce((a,b)=>a+b,0)/valid.length,lo=Math.min(...valid),hi=Math.max(...valid);
  const pos:number[]=[],indices:number[]=[],colors:number[]=[];
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
   const h=terrain.elevation_m[r][c]??mean;
   pos.push((c*terrain.stride-terrain.original_shape[1]/2)*terrain.pixel_size_m/1000,(h-mean)/1000,(r*terrain.stride-terrain.original_shape[0]/2)*terrain.pixel_size_m/1000);
   const t=Math.pow((h-lo)/(hi-lo||1),1.1),shade=.03+t*.4;colors.push(shade*.98,shade*.98,shade);
   if(r<rows-1&&c<cols-1){const i=r*cols+c;indices.push(i,i+cols,i+1,i+1,i+cols,i+cols+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
 },[terrain]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 const pick=(e:ThreeEvent<MouseEvent>)=>{e.stopPropagation();onPick(e.point.z*1000/terrain.pixel_size_m+terrain.original_shape[0]/2,e.point.x*1000/terrain.pixel_size_m+terrain.original_shape[1]/2);};
 return <mesh geometry={geometry} onClick={pick}><meshStandardMaterial vertexColors roughness={.94} metalness={.04} side={THREE.DoubleSide} wireframe={wireframe}/></mesh>;
}

function Camera({mapView,reset,controls}:{mapView:boolean;reset:number;controls:React.RefObject<any>}){
 const {camera}=useThree(),goal=useRef(new THREE.Vector3(...HOME)),moving=useRef(false),first=useRef(true);
 useEffect(()=>{
  goal.current.set(...(mapView?TOP:HOME));
  if(first.current){first.current=false;camera.position.copy(goal.current);camera.lookAt(0,0,0);return;}
  moving.current=true;controls.current?.target.set(0,0,0);
 },[camera,mapView,reset,controls]);
 useFrame((_,dt)=>{
  if(!moving.current)return;
  camera.position.lerp(goal.current,Math.min(1,dt*5));
  if(camera.position.distanceTo(goal.current)<.002){camera.position.copy(goal.current);moving.current=false;}
  controls.current?.update();
 });
 return null;
}

function Station({ground,height,label,rays,linkTo,linkVisible}:{ground:[number,number,number];height:number;label:string;rays:{body:'sun'|'earth';dir:[number,number,number];visible:boolean}[];linkTo:[number,number,number]|null;linkVisible:boolean}){
 const mast=useRef<THREE.Mesh>(null),head=useRef<THREE.Group>(null),level=useRef(MAST_BASE+height*MAST_PER_M);
 const target=MAST_BASE+height*MAST_PER_M;
 useFrame((_,dt)=>{
  level.current+= (target-level.current)*Math.min(1,dt*6);
  if(Math.abs(target-level.current)<1e-4) level.current=target;
  if(mast.current){mast.current.scale.y=level.current;mast.current.position.y=level.current/2;}
  if(head.current) head.current.position.y=level.current;
 });
 return <group position={ground}>
  <mesh position={[0,.002,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.03,.042,40]}/><meshBasicMaterial color={C.station} transparent opacity={.75} side={THREE.DoubleSide}/></mesh>
  <mesh ref={mast}><cylinderGeometry args={[.0045,.0045,1,10]}/><meshBasicMaterial color={C.station}/></mesh>
  <group ref={head}>
   <mesh><octahedronGeometry args={[.024]}/><meshBasicMaterial color={C.station}/></mesh>
   {rays.map(({body,dir,visible})=><group key={body}>
    <Line points={[[0,0,0],dir]} color={C[body]} lineWidth={visible?2.2:1.2} dashed={!visible} dashSize={.025} gapSize={.02} transparent opacity={visible?1:.55}/>
    <mesh position={dir}><sphereGeometry args={[.016,16,16]}/><meshBasicMaterial color={visible?C[body]:'#1a1f22'}/></mesh>
    <Label position={[dir[0],dir[1]+.06,dir[2]]} color={visible?C[body]:'#c9b2a6'} size={.068} text={`${body==='sun'?'SUN':'EARTH'} · ${visible?'IN VIEW':'BLOCKED'}`}/>
   </group>)}
   <Label position={[0,.09,0]} color={C.station} text={label}/>
  </group>
  {linkTo&&<Line points={[[0,MAST_BASE,0],[linkTo[0]-ground[0],linkTo[1]-ground[1],linkTo[2]-ground[2]]]} color={linkVisible?C.ok:C.bad} lineWidth={1.4} dashed={!linkVisible} dashSize={.03} gapSize={.02}/>}
 </group>;
}

function Scene(p:Props){
 const controls=useRef<any>(null);
 const {mean,floor}=useMemo(()=>{const z=p.terrain.elevation_m.flat().filter((x):x is number=>x!==null);return {mean:z.reduce((a,b)=>a+b,0)/z.length,floor:Math.min(...z)};},[p.terrain]);
 const extent=p.terrain.original_shape[1]*p.terrain.pixel_size_m/1000;
 const point=(pos:Site|Analysis['position'],height=0):[number,number,number]=>[(pos.col-p.terrain.original_shape[1]/2)*p.terrain.pixel_size_m/1000,(pos.elevation_m-mean+height)/1000,(pos.row-p.terrain.original_shape[0]/2)*p.terrain.pixel_size_m/1000];
 const ground=point(p.selected.position),lander=point(p.lander,2);
 const atLander=p.selected.position.row===p.lander.row&&p.selected.position.col===p.lander.col;
 const candidates=useMemo(()=>p.analyses.filter(a=>a.height_m===0),[p.analyses]);
 const pick=(r:number,c:number)=>{const nearest=candidates.reduce((best,a)=>Math.hypot(a.position.row-r,a.position.col-c)<Math.hypot(best.position.row-r,best.position.col-c)?a:best);p.onSelect(nearest.candidate_id);};
 const horizontal=(az:number,lon:number)=>[Math.sin(az)*Math.cos(lon)+Math.cos(az)*Math.sin(lon),Math.sin(az)*Math.sin(lon)-Math.cos(az)*Math.cos(lon)];
 const rays=(['sun','earth'] as const).map(body=>{
  const az=p.selected.series[`${body}_azimuth_deg`][p.time]*Math.PI/180,el=p.selected.series[`${body}_elevation_deg`][p.time]*Math.PI/180,lon=p.selected.position.longitude_deg*Math.PI/180;
  const [x,z]=horizontal(az,lon);
  return {body,visible:p.selected.series[`${body}_visible`][p.time],dir:[x*RAY*Math.cos(el),Math.sin(el)*RAY,z*RAY*Math.cos(el)] as [number,number,number]};
 });
 const [nx,nz]=horizontal(0,p.lander.longitude_deg*Math.PI/180);
 const compass:[number,number,number]=[-extent*.42,(floor-mean)/1000+.004,extent*.42];
 return <><Camera mapView={p.mapView} reset={p.reset} controls={controls}/>
  <hemisphereLight args={['#c9d3dc','#0b0d0e',.3]}/><directionalLight position={[-3,1.05,1.4]} intensity={3.1}/><directionalLight position={[2.5,1.2,-2.5]} intensity={.45} color="#a9bddc"/>
  <Surface terrain={p.terrain} wireframe={p.wireframe} onPick={pick}/>
  <gridHelper args={[extent,10,C.grid,C.grid]} position={[0,(floor-mean)/1000-.03,0]}/>
  <Line points={[[-extent/2,0,-extent/2],[extent/2,0,-extent/2],[extent/2,0,extent/2],[-extent/2,0,extent/2],[-extent/2,0,-extent/2]].map(([x,_,z])=>[x,(floor-mean)/1000-.03,z] as [number,number,number])} color="#3a454b" lineWidth={1}/>
  {candidates.map(a=>{const feasible=p.feasible?.has(a.candidate_id),rec=a.candidate_id===p.recommended;return a.candidate_id===p.selected.candidate_id?null:<group key={a.candidate_id} position={point(a.position,2)}>
   <mesh onClick={e=>{e.stopPropagation();p.onSelect(a.candidate_id);}}><sphereGeometry args={[feasible?.017:.012,14,14]}/><meshBasicMaterial color={feasible?C.feasible:C.candidate} transparent opacity={feasible?1:.75}/></mesh>
   {rec&&<mesh rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.03,.038,32]}/><meshBasicMaterial color={C.feasible} side={THREE.DoubleSide}/></mesh>}
  </group>;})}
  <group position={lander}><mesh position={[0,.02,0]}><boxGeometry args={[.036,.04,.036]}/><meshStandardMaterial color={C.lander} emissive="#5c6763"/></mesh>{!atLander&&<Label position={[0,.1,0]} text={`LANDER · ${p.lander.name.toUpperCase()}`}/>}</group>
  <Station ground={ground} height={p.selected.height_m} rays={rays} label={`${atLander?'LANDER + STATION':'STATION'} · ${p.selected.height_m} M MAST`} linkTo={atLander?null:[lander[0],lander[1]+.02,lander[2]]} linkVisible={p.linkVisible}/>
  <group position={compass}>
   <Line points={[[0,0,0],[nx*.16,0,nz*.16]]} color="#cfd8d4" lineWidth={1.6}/>
   <mesh position={[nx*.16,0,nz*.16]} rotation={[0,Math.atan2(nx,nz),0]}><coneGeometry args={[.016,.04,12]} /><meshBasicMaterial color="#cfd8d4"/></mesh>
   <Label position={[nx*.24,.03,nz*.24]} text="N · LOCAL" size={.06} color="#cfd8d4"/>
  </group>
  <OrbitControls ref={controls} makeDefault minDistance={.6} maxDistance={7} maxPolarAngle={Math.PI*.49} enableDamping dampingFactor={.1}/>
 </>;
}
export default function TerrainView(props:Props){return <Canvas camera={{position:HOME,fov:40,near:.01,far:100}} dpr={[1,1.75]} gl={{antialias:true,alpha:true}}><Suspense fallback={null}><Scene {...props}/></Suspense></Canvas>;}
