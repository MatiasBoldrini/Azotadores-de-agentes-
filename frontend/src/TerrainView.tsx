import {useMemo,useRef,useEffect,Suspense} from 'react';
import {Canvas,ThreeEvent,useThree} from '@react-three/fiber';
import {OrbitControls,Line} from '@react-three/drei';
import * as THREE from 'three';
import type {Analysis,Site,Terrain} from './lib/science';

type Props={terrain:Terrain;analyses:Analysis[];selected:Analysis;lander:Site;time:number;onSelect:(id:string)=>void;wireframe:boolean;mapView:boolean;reset:number;linkVisible:boolean};
function Label({text,position,color='#dce7d8'}:{text:string;position:[number,number,number];color?:string}){
 const texture=useMemo(()=>{const canvas=document.createElement('canvas');canvas.width=768;canvas.height=96;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#151d18';ctx.fillRect(0,0,768,96);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.strokeRect(2,2,764,92);ctx.fillStyle=color;ctx.font='42px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,384,48);return new THREE.CanvasTexture(canvas);},[text,color]);
 useEffect(()=>()=>texture.dispose(),[texture]);
 return <sprite position={position} scale={[.8,.1,1]} renderOrder={100}><spriteMaterial map={texture} depthTest={false} transparent/></sprite>;
}
function Surface({terrain,wireframe,onPick}:{terrain:Terrain;wireframe:boolean;onPick:(r:number,c:number)=>void}){
 const geometry=useMemo(()=>{
  const rows=terrain.elevation_m.length,cols=terrain.elevation_m[0].length;
  const valid=terrain.elevation_m.flat().filter((x):x is number=>x!==null);
  const mean=valid.reduce((a,b)=>a+b,0)/valid.length;
  const pos:number[]=[],indices:number[]=[],colors:number[]=[];
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
   const h=terrain.elevation_m[r][c]??mean;
   pos.push((c*terrain.stride-terrain.original_shape[1]/2)*terrain.pixel_size_m/1000,(h-mean)/1000,(r*terrain.stride-terrain.original_shape[0]/2)*terrain.pixel_size_m/1000);
   const shade=.22+Math.max(-.07,Math.min(.1,(h-mean)/1600)); colors.push(shade*.93,shade*.97,shade);
   if(r<rows-1&&c<cols-1){const i=r*cols+c;indices.push(i,i+cols,i+1,i+1,i+cols,i+cols+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
 },[terrain]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 const pick=(e:ThreeEvent<MouseEvent>)=>{e.stopPropagation();onPick(e.point.z*1000/terrain.pixel_size_m+terrain.original_shape[0]/2,e.point.x*1000/terrain.pixel_size_m+terrain.original_shape[1]/2);};
 return <mesh geometry={geometry} onClick={pick}><meshStandardMaterial vertexColors roughness={.96} metalness={.08} side={THREE.DoubleSide} wireframe={wireframe}/></mesh>;
}
function Camera({mapView,reset}:{mapView:boolean;reset:number}){
 const {camera}=useThree();useEffect(()=>{camera.position.set(...(mapView?[0,4.2,.001]:[2.5,1.9,2.65]) as [number,number,number]);camera.lookAt(0,0,0);},[camera,mapView,reset]);return null;
}
function Scene(p:Props){
 const controls=useRef<any>(null);
 const mean=useMemo(()=>{const z=p.terrain.elevation_m.flat().filter((x):x is number=>x!==null);return z.reduce((a,b)=>a+b,0)/z.length;},[p.terrain]);
 const point=(pos:Site|Analysis['position'],height=0):[number,number,number]=>[(pos.col-p.terrain.original_shape[1]/2)*p.terrain.pixel_size_m/1000,(pos.elevation_m-mean+height)/1000,(pos.row-p.terrain.original_shape[0]/2)*p.terrain.pixel_size_m/1000];
 const station=point(p.selected.position,p.selected.height_m),lander=point(p.lander,2);
 const candidates=useMemo(()=>p.analyses.filter(a=>a.height_m===0),[p.analyses]);
 const pick=(r:number,c:number)=>{const nearest=candidates.reduce((best,a)=>Math.hypot(a.position.row-r,a.position.col-c)<Math.hypot(best.position.row-r,best.position.col-c)?a:best);p.onSelect(nearest.candidate_id);};
 const direction=(body:'sun'|'earth')=>{const az=p.selected.series[`${body}_azimuth_deg`][p.time]*Math.PI/180,el=p.selected.series[`${body}_elevation_deg`][p.time]*Math.PI/180,lon=p.selected.position.longitude_deg*Math.PI/180;const x=Math.sin(az)*Math.cos(lon)+Math.cos(az)*Math.sin(lon),z=Math.sin(az)*Math.sin(lon)-Math.cos(az)*Math.cos(lon);return [station[0]+x*.75*Math.cos(el),station[1]+Math.sin(el)*.75,station[2]+z*.75*Math.cos(el)] as [number,number,number];};
 useEffect(()=>{controls.current?.target.set(0,0,0);controls.current?.update();},[p.reset,p.mapView]);
 return <><Camera mapView={p.mapView} reset={p.reset}/><ambientLight intensity={.4}/><directionalLight position={[-3,4,1]} intensity={2.1}/><directionalLight position={[3,1,-3]} intensity={.45} color="#b3c2dc"/>
 <Surface terrain={p.terrain} wireframe={p.wireframe} onPick={pick}/>
 {candidates.map(a=><mesh key={a.candidate_id} position={point(a.position,2)} onClick={e=>{e.stopPropagation();p.onSelect(a.candidate_id);}}><sphereGeometry args={[a.candidate_id===p.selected.candidate_id?.035:.012,12,12]}/><meshBasicMaterial color={a.candidate_id===p.selected.candidate_id?'#f4bd68':'#a6b5ac'} transparent opacity={.9}/></mesh>)}
 <group position={lander}><mesh position={[0,.024,0]}><boxGeometry args={[.04,.045,.04]}/><meshStandardMaterial color="#e7ece7"/></mesh>{(p.selected.position.row!==p.lander.row||p.selected.position.col!==p.lander.col)&&<Label position={[0,.12,0]} text={`LANDER / ${p.lander.name}`}/>}</group>
 <group position={station}><mesh position={[0,.035,0]}><octahedronGeometry args={[.045]}/><meshBasicMaterial color="#f4bd68"/></mesh><Label position={[0,.17,0]} color='#efbd75' text={`${p.selected.position.row===p.lander.row&&p.selected.position.col===p.lander.col?'LANDER + STATION':'STATION'} / ${p.selected.height_m} M`}/></group>
 <Line points={[lander,station]} color={p.linkVisible?'#a7d8b9':'#e68d7c'} lineWidth={1.5} dashed={!p.linkVisible} dashSize={.03} gapSize={.02}/>
 {(['sun','earth'] as const).map(body=><group key={body}><Line points={[station,direction(body)]} color={body==='sun'?'#f2bd68':'#8cb4de'} lineWidth={1} dashed dashSize={.03} gapSize={.025}/><mesh position={direction(body)}><sphereGeometry args={[.018,16,16]}/><meshBasicMaterial color={body==='sun'?'#f2bd68':'#8cb4de'}/></mesh></group>)}
 <OrbitControls ref={controls} makeDefault minDistance={.6} maxDistance={7} maxPolarAngle={Math.PI*.49} enableDamping dampingFactor={.1}/>
 </>;
}
export default function TerrainView(props:Props){return <Canvas camera={{position:[2.5,1.9,2.65],fov:44,near:.01,far:100}} dpr={[1,1.75]} gl={{antialias:true}}><color attach="background" args={['#141719']}/><Suspense fallback={null}><Scene {...props}/></Suspense></Canvas>;}
