import {useMemo,useRef,useEffect,useState,Suspense} from 'react';
import {Canvas,ThreeEvent,useThree,useFrame} from '@react-three/fiber';
import {Billboard,Html,OrbitControls,Line,Stars,useCursor} from '@react-three/drei';
import * as THREE from 'three';
import type {Analysis,Site,Terrain} from './lib/science';
import type {EvaluatedPosition} from './PositionPicker';

export const VERTICAL_EXAGGERATION = 4;

const BODIES = {
 sun: { label: 'Sun', color: '#f2bd68' },
 earth: { label: 'Earth', color: '#8cb4de' },
} as const;
const BODY_KEYS = ['sun', 'earth'] as const;
const BLOCKED_COLOR = '#ff625e';

type Props={terrain:Terrain;positions:EvaluatedPosition[];previewId:string|null;selected:Analysis;lander:Site;time:number;onSelect:(id:string)=>void;wireframe:boolean;mapView:boolean;reset:number;linkVisible:boolean};

export function CelestialRayLegend({selected, time}: Pick<Props, 'selected' | 'time'>) {
 return <ul className="celestial-ray-legend" aria-label="Celestial sightlines">
  {BODY_KEYS.map(body => {
   const visible = selected.series[`${body}_visible`][time];
   return <li key={body}>
    <span className={`ray-marker ray-marker-${body}`} style={{color: visible ? BODIES[body].color : BLOCKED_COLOR}} aria-hidden="true"/>
    {BODIES[body].label} · {visible ? 'Visible' : 'Blocked'}
   </li>;
  })}
 </ul>;
}

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
   pos.push((c*terrain.stride-terrain.original_shape[1]/2)*terrain.pixel_size_m/1000,(h-mean)*VERTICAL_EXAGGERATION/1000,(r*terrain.stride-terrain.original_shape[0]/2)*terrain.pixel_size_m/1000);
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
function Mast({base,height}:{base:[number,number,number];height:number}){
 const shaft=useRef<THREE.Mesh>(null);
 useFrame((_, delta) => {
  if (!shaft.current) return;
  const target = height * VERTICAL_EXAGGERATION / 1000;
  const length = THREE.MathUtils.damp(shaft.current.scale.y, target, 13, delta);
  shaft.current.scale.y = length;
  shaft.current.position.y = length / 2;
  shaft.current.visible = length > .0001;
 });
 return <group position={base}><mesh ref={shaft} scale={[1,0,1]} visible={false}>
  <cylinderGeometry args={[.003,.004,1,10]}/>
  <meshStandardMaterial color="#efbd75" emissive="#5c3a12"/>
 </mesh></group>;
}

function bodyDirection(body:'sun'|'earth', analysis:Analysis, time:number){
 const az = THREE.MathUtils.degToRad(analysis.series[`${body}_azimuth_deg`][time]);
 const el = THREE.MathUtils.degToRad(analysis.series[`${body}_elevation_deg`][time]);
 const lon = THREE.MathUtils.degToRad(analysis.position.longitude_deg);
 // The scene uses projected X eastward and negative projected Y as Z.
 return new THREE.Vector3(
  Math.sin(az + lon) * Math.cos(el),
  Math.sin(el),
  -Math.cos(az + lon) * Math.cos(el),
 );
}

function PositionHighlight({label, position}: {label: string; position: [number, number, number]}) {
 return <group position={position}>
  <Billboard>
   <mesh renderOrder={90}>
    <ringGeometry args={[.024, .035, 32]}/>
    <meshBasicMaterial color="#b9e9d7" transparent opacity={.95} toneMapped={false} depthTest={false} depthWrite={false}/>
   </mesh>
  </Billboard>
  <Html position={[0, .27, 0]} zIndexRange={[1, 0]} style={{pointerEvents: 'none'}}>
   <div className="map-label position-preview-label" aria-hidden="true">{label}</div>
  </Html>
 </group>;
}

function Scene(p:Props){
 const controls=useRef<any>(null);
 const [hovered, setHovered] = useState<string | null>(null);
 const orbiting = useRef(false);
 useCursor(hovered !== null);
 const mean=useMemo(()=>{const z=p.terrain.elevation_m.flat().filter((x):x is number=>x!==null);return z.reduce((a,b)=>a+b,0)/z.length;},[p.terrain]);
 const point=(pos:Site|Analysis['position'],height=0):[number,number,number]=>[(pos.col-p.terrain.original_shape[1]/2)*p.terrain.pixel_size_m/1000,(pos.elevation_m-mean+height)*VERTICAL_EXAGGERATION/1000,(pos.row-p.terrain.original_shape[0]/2)*p.terrain.pixel_size_m/1000];
 const station=point(p.selected.position,p.selected.height_m),lander=point(p.lander,2);
 const preview = p.positions.find(option => option.id === (p.previewId ?? hovered));
 const selectPoint = (id: string) => {
  setHovered(null);
  p.onSelect(id);
 };
 const pick = (row: number, col: number) => {
  const nearest = p.positions.reduce((best, option) =>
   Math.hypot(option.position.row - row, option.position.col - col) <
   Math.hypot(best.position.row - row, best.position.col - col) ? option : best);
  selectPoint(nearest.id);
 };
 const sunDirection = bodyDirection('sun',p.selected,p.time);
 useEffect(()=>{controls.current?.target.set(0,0,0);controls.current?.update();},[p.reset,p.mapView]);
 return <><Camera mapView={p.mapView} reset={p.reset}/><Stars radius={25} depth={10} count={450} factor={1.1} saturation={0} fade speed={0}/>
 <ambientLight intensity={.48}/>
 <directionalLight position={sunDirection.clone().multiplyScalar(4)} intensity={1.9} color="#ffe3be"/>
 <directionalLight position={[3,4,-3]} intensity={.25} color="#b3c2dc"/>
 <Surface terrain={p.terrain} wireframe={p.wireframe} onPick={pick}/>
 {p.positions.map(option => {
  const selected = option.id === p.selected.candidate_id;
  const radius = selected ? .035 : .012;
  return <group key={option.id} position={point(option.position, 2)}>
   <mesh>
    <sphereGeometry args={[radius,12,12]}/>
    <meshBasicMaterial color={selected ? '#f4bd68' : '#a6b5ac'} transparent opacity={.9}/>
   </mesh>
   <mesh visible={false}
    onPointerMove={event => {
     if (orbiting.current || event.pointerType === 'touch') return;
     event.stopPropagation();
     if (hovered !== option.id) setHovered(option.id);
    }}
    onPointerOut={() => setHovered(current => current === option.id ? null : current)}
    onClick={event => {
     event.stopPropagation();
     selectPoint(option.id);
    }}>
    <sphereGeometry args={[Math.max(radius, .023), 8, 8]}/>
    <meshBasicMaterial/>
   </mesh>
  </group>;
 })}
 {preview && <PositionHighlight label={preview.label} position={point(preview.position, 2)}/>}
 <group position={lander}><mesh position={[0,.024,0]}><boxGeometry args={[.04,.045,.04]}/><meshStandardMaterial color="#e7ece7"/></mesh>{(p.selected.position.row!==p.lander.row||p.selected.position.col!==p.lander.col)&&<Label position={[0,.12,0]} text={`LANDER / ${p.lander.name}`}/>}</group>
 <Mast base={point(p.selected.position)} height={p.selected.height_m}/>
 <group position={station}><mesh position={[0,.035,0]}><octahedronGeometry args={[.045]}/><meshBasicMaterial color="#f4bd68"/></mesh><Label position={[0,.17,0]} color='#efbd75' text={`${p.selected.position.row===p.lander.row&&p.selected.position.col===p.lander.col?'LANDER + STATION':'STATION'} / ${p.selected.height_m} M`}/></group>
 <Line points={[lander,station]} color={p.linkVisible?'#a7d8b9':'#e68d7c'} lineWidth={1.5} dashed={!p.linkVisible} dashSize={.03} gapSize={.02}/>
 {BODY_KEYS.map(body => {
  const visible = p.selected.series[`${body}_visible`][p.time];
  const color = visible ? BODIES[body].color : BLOCKED_COLOR;
  const direction = body === 'sun' ? sunDirection.clone() : bodyDirection(body, p.selected, p.time);
  const end = direction.multiplyScalar(.75).add(new THREE.Vector3(...station)).toArray();
  // Visibility accounts for the regional horizon beyond the rendered mesh.
  // Draw blocked rays over the terrain so it cannot hide the visual indicator.
  const renderOrder = visible ? 0 : 20;
  return <group key={body}>
   <Line points={[station, end]} color={color} lineWidth={visible ? 1 : 2.5}
    dashed={visible} dashSize={.03} gapSize={.025} depthTest={visible} depthWrite={visible}
    transparent={!visible} renderOrder={renderOrder} toneMapped={visible}/>
   <mesh position={end} renderOrder={renderOrder + 1}>
    {body === 'sun' ? <sphereGeometry args={[.018,16,16]}/> : <octahedronGeometry args={[.024]}/>}
    <meshBasicMaterial color={color} depthTest={visible} depthWrite={visible} transparent={!visible} toneMapped={visible}/>
   </mesh>
  </group>;
 })}
 <OrbitControls ref={controls} makeDefault minDistance={.6} maxDistance={7} maxPolarAngle={Math.PI*.49} enableDamping dampingFactor={.1}
  onStart={() => {
   orbiting.current = true;
   setHovered(null);
  }}
  onEnd={() => { orbiting.current = false; }}/>
 </>;
}
export default function TerrainView(props:Props){return <Canvas camera={{position:[2.5,1.9,2.65],fov:44,near:.01,far:100}} dpr={[1,1.75]} gl={{antialias:true}}><color attach="background" args={['#141719']}/><Suspense fallback={null}><Scene {...props}/></Suspense></Canvas>;}
