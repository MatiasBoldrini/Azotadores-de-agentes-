import {Component,createRef,useMemo,useRef,useEffect,useLayoutEffect,useState,memo,Suspense,type ComponentRef,type ReactNode,type RefObject} from 'react';
import {Canvas,events,ThreeEvent,useFrame,useLoader,useThree} from '@react-three/fiber';
import {Billboard,Html,OrbitControls,Line,useCursor} from '@react-three/drei';
import * as THREE from 'three';
import type {Analysis,Site,Terrain} from './lib/science';
import type {EvaluatedPosition} from './PositionPicker';
import {starfield} from './moon/stars';
import {MOON_LIGHTS,MOON_TEXTURES,buildMoon,setMoonOpacity} from './moon/globe';
import {APPROACH_KM,LANDING_FOV,heroPose,horizonPose,type Pose,type SiteFrame} from './moon/frame';
import {SITE01_SIZE,useSite01,useSurround,type DemLevel} from './site01';
import {TerrainRayHover,TerrainRayTooltip,type TerrainLabel,type TerrainLine,type TerrainRay,type TerrainRayTip} from './TerrainRayHover';
import {TerrainSightline} from './TerrainSightline';
import {createStationClickGuard} from './lib/stationClick';
import DistantTerrain,{useDistantHorizon} from './DistantTerrain';
import {profileFor} from './lib/distantHorizon';
import {DETAIL_RADIUS_KM,RELIEF_SCALE,sceneProjection} from './lib/sceneGeometry';

export const VERTICAL_EXAGGERATION = RELIEF_SCALE;
// Observer height shares the terrain transform; only the marker glyph is enlarged.
export const MAST_EXAGGERATION=RELIEF_SCALE;
const MAST_BASE=0,MAST_PER_M=MAST_EXAGGERATION/1000;
const FOV=40,HERO_HFOV=72,MIN_FOV=46,MAX_FOV=66,DEG=Math.PI/180,MAX_KM=9,DESCENT_MS=2400;
// Hillshade light, as azimuth from local north and altitude above the horizon.
const LIGHT_AZIMUTH=50,LIGHT_ALTITUDE=14;
// Every evaluated cell lies within 0.598 of the half-width, so the tile keeps its own samples well past them.
const TILE_BLEND=.92,SURROUND_BLEND=.85;
// The Site01 DEM is cut to the largest disc around the tile it covers; its rim is the close-up's skyline.
const DISC_KM=DETAIL_RADIUS_KM;
// Resting view: inside the back of the 5 m square, just above the crest, so the near field is all 5 m relief and
// the summit's fall-off is the skyline; the frame reaches 9° above the horizontal, past the highest body.
const HERO_BACK=1.2,HERO_CLEAR=.24,HERO_SKY=9;
// Schematic marker distance and size. The direction from the mast uses the computed azimuth and elevation.
const SKY_KM=400,RAY_KM=.85,STATION_TRAVEL_SECONDS=.65;
// Display diameters in degrees, enlarged for legibility.
const BODY_PHOTOS={
 sun:{diameter:2.2,url:'/sky/sun-hmi.jpg',repeat:[960/1024,960/1024],offset:[32/1024,32/1024]},
 earth:{diameter:3.2,url:'/earth/apollo-17-blue-marble.jpg',repeat:[424/640,430/640],offset:[109/640,99/640]},
};
// Descent progress over which the landing globe fades out.
const GLOBE_FADE=[.6,.9];
const fovFor=(aspect:number)=>THREE.MathUtils.clamp(2*Math.atan(Math.tan(HERO_HFOV/2*DEG)/aspect)/DEG,MIN_FOV,MAX_FOV);
const ALBEDO=new THREE.Color(.3,.295,.285);
const easeInOutCubic=(t:number)=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const C={sun:'#FFC46B',earth:'#8FD3FF',station:'#F5F5F5',lander:'#F5F5F5',candidate:'#A3A3A3',feasible:'#F5F5F5',recommended:'#8FD3FF',ok:'#F5F5F5'};
const SKY_DISC_COLOR={sun:'#ffe17a',earth:C.earth};
const BODY_LABELS={sun:'Sun',earth:'Earth'} as const;
const BODY_KEYS=['sun','earth'] as const;
const BLOCKED_COLOR='#ff625e';
const CANDIDATE_HIT_RADIUS=.023*Math.sqrt(10);

const terrainEvents:typeof events=store=>{
 const center=new THREE.Vector3();
 return {...events(store),filter:(hits,{camera,pointer,size})=>{
  let closest:THREE.Intersection|undefined;
  let minDistance=Infinity;
  for(const hit of hits){
   if(!hit.object.userData.candidateTarget)continue;
   // Overlapping targets should favor the marker that looks closest to the pointer.
   center.setFromMatrixPosition(hit.object.matrixWorld).project(camera);
   const distance=Math.hypot((center.x-pointer.x)*size.width,(center.y-pointer.y)*size.height);
   if(distance<minDistance){closest=hit;minDistance=distance;}
  }
  return hits.filter(hit=>!hit.object.userData.candidateTarget||hit===closest);
 }};
};

type Approach='hold'|'descend'|null;
type Props={active:boolean;approach:Approach;focus?:RefObject<HTMLElement|null>;frame:SiteFrame;terrain:Terrain;positions:EvaluatedPosition[];previewId:string|null;selected:Analysis;lander:Site;time:number;onSelect:(id:string)=>void;wireframe:boolean;mapView:boolean;reset:number;linkVisible:boolean;feasible?:Set<string>;recommended?:string};

const LABEL_FONT='600 34px Inter, system-ui, sans-serif';
function useFontReady(){
 const [ready,setReady]=useState(()=>document.fonts?.check(LABEL_FONT)??true);
 useEffect(()=>{if(!ready)document.fonts.load(LABEL_FONT).then(()=>setReady(true),()=>setReady(true));},[ready]);
 return ready;
}

// `size` is the label height in radians: labels keep their size on screen at any distance.
function Label({text,position,color='#F5F5F5',size=.022,depthTest=false}:{text:string;position:[number,number,number];color?:string;size?:number;depthTest?:boolean}){
 const fontReady=useFontReady();
 const [texture,aspect]=useMemo(()=>{
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!;
  const prepare=()=>{ctx.font=LABEL_FONT;ctx.letterSpacing='3px';};
  prepare();const w=Math.ceil(ctx.measureText(text).width)+52,h=72;canvas.width=w;canvas.height=h;
  ctx.fillStyle='rgba(5,5,5,.78)';ctx.beginPath();ctx.roundRect(2,2,w-4,h-4,22);ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.22)';ctx.lineWidth=2;ctx.stroke();
  prepare();ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,w/2+1.5,h/2+1);
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return [t,w/h] as const;
 },[text,color,fontReady]);
 useEffect(()=>()=>texture.dispose(),[texture]);
 return <sprite position={position} scale={[size*aspect,size,1]} renderOrder={100}><spriteMaterial map={texture} depthTest={depthTest} depthWrite={false} sizeAttenuation={false} transparent/></sprite>;
}

// Markers keep the size they have from MARKER_KM away, however close the camera comes.
const MARKER_KM=4.5;
function ScreenScale({position,children}:{position:[number,number,number];children:ReactNode}){
 const g=useRef<THREE.Group>(null),at=useMemo(()=>new THREE.Vector3(),[]);
 useFrame(({camera})=>{const o=g.current;if(o)o.scale.setScalar(THREE.MathUtils.clamp(camera.position.distanceTo(o.getWorldPosition(at))/MARKER_KM,.1,1.6));});
 return <group ref={g} position={position}>{children}</group>;
}

type Ground={terrain:Terrain;mean:number;frame:SiteFrame;projection:ReturnType<typeof sceneProjection>};
type Rect=[number,number,number,number];

export const terrainMean=(t:Terrain)=>{const z=t.elevation_m.flat().filter((x):x is number=>x!==null);return z.reduce((a,b)=>a+b,0)/z.length;};
// Polar stereographic metres to the scene: kilometres from the tile centre, relief at the labeled exaggeration, on the sphere.
function toScene({projection}:Ground,x:number,y:number,h:number,out:Float32Array,k:number){
 out.set(projection.gridPoint(x,y,h),k);
}
function bilinear(l:DemLevel,x:number,y:number){
 const fi=THREE.MathUtils.clamp((x-l.x0)/l.px-.5,0,l.n-1),fj=THREE.MathUtils.clamp((l.y0-y)/l.px-.5,0,l.n-1);
 const i=Math.min(Math.floor(fi),l.n-2),j=Math.min(Math.floor(fj),l.n-2),tx=fi-i,ty=fj-j,d=l.data,n=l.n;
 return (d[j*n+i]*(1-tx)+d[j*n+i+1]*tx)*(1-ty)+(d[(j+1)*n+i]*(1-tx)+d[(j+1)*n+i+1]*tx)*ty;
}
// The scene rectangle (x0, x1, z0, z1) a level's vertices cover, shrunk by `inset` kilometres.
function extent(l:DemLevel,frame:SiteFrame,inset=0):Rect{
 const [cx,cy]=frame.centerPs,a=l.px/2,b=(l.n-.5)*l.px;
 return [(l.x0+a-cx)/1000+inset,(l.x0+b-cx)/1000-inset,-(l.y0-a-cy)/1000+inset,-(l.y0-b-cy)/1000-inset];
}

// One DEM level as a grid of its pixel centres. Toward its border the relief eases into the next coarser
// surface (`outer`, elevation in metres at polar stereographic metres), so neighbouring levels meet without a step.
// With `clip` (km), samples beyond that radius of the tile centre move onto the circle, giving a round rim.
function demGeometry(l:DemLevel,ground:Ground,outer:((x:number,y:number)=>number)|null,blend:number,clip=0,skirt=0){
 const n=l.n,count=n*n,edge=skirt?4*(n-1):0,pos=new Float32Array((count+edge)*3),half=(n-1)/2,[cx,cy]=ground.frame.centerPs;
 for(let i=0;i<n;i++)for(let j=0;j<n;j++){
  let x=l.x0+(j+.5)*l.px,y=l.y0-(i+.5)*l.px,h=l.data[i*n+j];
  const r=Math.hypot(x-cx,y-cy)/1000;
  if(clip&&r>clip){x=cx+(x-cx)*clip/r;y=cy+(y-cy)*clip/r;h=bilinear(l,x,y);}
  if(outer){const u=Math.max(Math.abs(j-half),Math.abs(i-half))/half;if(u>blend)h+=(outer(x,y)-h)*THREE.MathUtils.smootherstep(u,blend,1);}
  toScene(ground,x,y,h,pos,(i*n+j)*3);
 }
 const quads=(n-1)*(n-1),index=new Uint32Array(quads*6+edge*6);let q=0;
 for(let i=0;i<n-1;i++)for(let j=0;j<n-1;j++){const a=i*n+j;index.set([a,a+n,a+1,a+1,a+n,a+n+1],q);q+=6;}
 if(skirt){
  // A skirt hangs from the rim so no gap opens against the globe while it is still in view.
  const ring=[...Array.from({length:n-1},(_,j)=>j),...Array.from({length:n-1},(_,i)=>i*n+n-1),...Array.from({length:n-1},(_,j)=>(n-1)*n+n-1-j),...Array.from({length:n-1},(_,i)=>(n-1-i)*n)];
  ring.forEach((a,s)=>{const b=count+s;pos.copyWithin(b*3,a*3,a*3+3);pos[b*3+1]-=skirt;});
  ring.forEach((a,s)=>{const b=ring[(s+1)%ring.length],c=count+s,d=count+(s+1)%ring.length;index.set([a,b,c,b,d,c],q);q+=6;});
 }
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.BufferAttribute(pos,3));
 g.setIndex(new THREE.BufferAttribute(index,1));
 g.computeVertexNormals();
 g.computeBoundingSphere();
 return g;
}

// The snapshot's 20 m grid: the click target, the wireframe and the fallback before the 5 m tile arrives.
function snapshotGeometry(ground:Ground){
 const {terrain,mean}=ground,n=terrain.original_shape[0],s=terrain.stride,rows=terrain.elevation_m.length,cols=terrain.elevation_m[0].length;
 const row=(i:number)=>i===rows-1?n-1:i*s,col=(j:number)=>j===cols-1?n-1:j*s,km=terrain.pixel_size_m/1000,pos=new Float32Array(rows*cols*3);
 for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
  const x=(col(j)-n/2)*km,z=(row(i)-n/2)*km,k=(i*cols+j)*3;
  toScene(ground,ground.frame.centerPs[0]+x*1000,ground.frame.centerPs[1]-z*1000,terrain.elevation_m[i][j]??mean,pos,k);
 }
 const index:number[]=[];
 for(let i=0;i<rows-1;i++)for(let j=0;j<cols-1;j++){const a=i*cols+j;index.push(a,a+cols,a+1,a+1,a+cols,a+cols+1);}
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setIndex(index);g.computeVertexNormals();
 return g;
}

// Every terrain level shares one material, so the same albedo and light run unbroken across all of them;
// each coarser level is cut away where a finer one takes over.
function terrainMaterial(hole:Rect|null,offset:number){
 const m=new THREE.MeshStandardMaterial({color:ALBEDO,roughness:1,metalness:0,polygonOffset:offset>0,polygonOffsetFactor:offset,polygonOffsetUnits:offset});
 if(!hole)return m;
 m.onBeforeCompile=shader=>{
  shader.uniforms.hole={value:new THREE.Vector4(...hole)};
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTerrainWorld;')
   .replace('#include <project_vertex>','#include <project_vertex>\nvTerrainWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec4 hole;\nvarying vec3 vTerrainWorld;')
   .replace('void main() {','void main() {\n if(vTerrainWorld.x>hole.x&&vTerrainWorld.x<hole.y&&vTerrainWorld.z>hole.z&&vTerrainWorld.z<hole.w)discard;');
 };
 m.customProgramCacheKey=()=>'terrain-hole';
 return m;
}

const noRaycast=()=>{};

type Levels={tile:DemLevel|null;surround:DemLevel[]|null};
function useLevelGeometry(ground:Ground,{tile,surround}:Levels){
 return useMemo(()=>{
  if(!tile||!surround)return null;
  const [near,far]=surround;
  return [
   {geometry:demGeometry(tile,ground,(x,y)=>bilinear(near,x,y),TILE_BLEND),hole:null,offset:0},
   {geometry:demGeometry(near,ground,(x,y)=>bilinear(far,x,y),SURROUND_BLEND),hole:extent(tile,ground.frame,.006),offset:1},
   {geometry:demGeometry(far,ground,null,1,DISC_KM,1.5),hole:extent(near,ground.frame,.012),offset:2},
  ];
 },[ground,tile,surround]);
}

type TerrainPick=(r:number,c:number,event:MouseEvent)=>void;
function Surface({ground,levels,wireframe,onPick,occluder}:{ground:Ground;levels:Levels;wireframe:boolean;onPick:TerrainPick;occluder:RefObject<THREE.Mesh|null>}){
 const {terrain}=ground,n=terrain.original_shape[0],gl=useThree(s=>s.gl);
 const coarse=useMemo(()=>snapshotGeometry(ground),[ground]);
 const meshes=useLevelGeometry(ground,levels);
 const materials=useMemo(()=>meshes?.map(m=>terrainMaterial(m.hole,m.offset))??[],[meshes]);
 const solid=useMemo(()=>terrainMaterial(null,0),[]);
 useEffect(()=>()=>coarse.dispose(),[coarse]);
 useEffect(()=>()=>{meshes?.forEach(m=>m.geometry.dispose());materials.forEach(m=>m.dispose());},[meshes,materials]);
 // The light never moves, so the shadow map is drawn once per terrain.
 useEffect(()=>{gl.shadowMap.autoUpdate=false;gl.shadowMap.needsUpdate=true;},[gl,meshes,coarse]);
 const pick=(e:ThreeEvent<MouseEvent>)=>{e.stopPropagation();onPick(e.point.z*1000/terrain.pixel_size_m+n/2,e.point.x*1000/terrain.pixel_size_m+n/2,e.nativeEvent);};
 return <>
  {meshes?.map((m,i)=><mesh key={i} geometry={m.geometry} material={materials[i]} raycast={noRaycast} castShadow receiveShadow/>)}
  <mesh ref={occluder} geometry={coarse} material={wireframe?undefined:solid} onClick={pick} visible={wireframe||!meshes} castShadow receiveShadow position-y={meshes&&wireframe?.004:0}>
   {wireframe&&<meshBasicMaterial color="#d4d4d4" wireframe transparent opacity={.35}/>}
  </mesh>
 </>;
}

// The real Moon around the site, at true scale: the landing's LROC/LOLA globe, with the site disc cut out and
// its imagery yielding to the terrain albedo wherever it would be magnified. It carries the descent and is gone
// by the time the camera settles, leaving only the Site01 DEM under the sky.
function ContextGlobe({frame,hole,textures:[color,polar,relief],progress}:{frame:SiteFrame;hole:number;textures:THREE.Texture[];progress:RefObject<number>}){
 const {gl}=useThree();
 const magnified=useMemo(()=>({value:0}),[]);
 const moon=useMemo(()=>buildMoon(color,polar,relief,gl.capabilities.getMaxAnisotropy(),{hole,neutral:ALBEDO.clone(),magnified}),[color,polar,relief,gl,hole,magnified]);
 useFrame(()=>{const k=progress.current;magnified.value=k;setMoonOpacity(moon,1-THREE.MathUtils.smoothstep(k,GLOBE_FADE[0],GLOBE_FADE[1]));});
 return <group position={frame.center} quaternion={frame.rotation} scale={frame.scale}><primitive object={moon.sphere}/><primitive object={moon.cap}/></group>;
}

function SiteGround({ground,tile,surround,progress,...rest}:{ground:Ground;tile:DemLevel|null;surround:DemLevel[]|null;progress:RefObject<number>;wireframe:boolean;onPick:TerrainPick;occluder:RefObject<THREE.Mesh|null>}){
 // Same URL list as the landing globe, so both canvases share one decoded copy of each texture.
 const textures=useLoader(THREE.TextureLoader,MOON_TEXTURES);
 const hole=surround?DISC_KM-.03:tile?1.27:0;
 return <><ContextGlobe frame={ground.frame} hole={hole} textures={textures} progress={progress}/><Surface ground={ground} levels={{tile,surround}} {...rest}/></>;
}

class GlobeFallback extends Component<{fallback:ReactNode;children:ReactNode},{error:boolean}>{
 state={error:false};
 static getDerivedStateFromError(){return {error:true};}
 render(){return this.state.error?this.props.fallback:this.props.children;}
}

type ViewRect={left:number;top:number;width:number;height:number};
const lerpRect=(a:ViewRect,b:ViewRect,k:number):ViewRect=>({left:a.left+(b.left-a.left)*k,top:a.top+(b.top-a.top)*k,width:a.width+(b.width-a.width)*k,height:a.height+(b.height-a.height)*k});
// The landing globe fills the viewport and is shifted down on portrait screens; the hold matches it exactly.
function landingRect():ViewRect{const w=document.documentElement.clientWidth,h=document.documentElement.clientHeight;return {left:0,top:h>w?h*.07:0,width:w,height:h};}
// The free stage between the glass panels; the canvas itself stays full-bleed.
function stageRect(c:DOMRect,f?:DOMRect):ViewRect{
 const left=Math.max(c.left,f?.left??c.left),top=Math.max(c.top,f?.top??c.top),width=Math.min(c.right,f?.right??c.right)-left,height=Math.min(c.bottom,f?.bottom??c.bottom)-top;
 return width<1||height<1?{left:c.left,top:c.top,width:c.width,height:c.height}:{left,top,width,height};
}

// The landing's light, carried into the site frame, gives way to the low hillshade light as the camera descends.
function Lights({frame,progress}:{frame:SiteFrame;progress:RefObject<number>}){
 const rig=useRef<THREE.Group>(null);
 const [moonSun,moonBack]=useMemo(()=>[MOON_LIGHTS.sun.position,MOON_LIGHTS.back.position].map(p=>new THREE.Vector3(...p).normalize().multiplyScalar(5).applyQuaternion(frame.rotation).toArray()),[frame]);
 const key=useMemo(()=>frame.horizontal(LIGHT_AZIMUTH).multiplyScalar(Math.cos(LIGHT_ALTITUDE*DEG)).setY(Math.sin(LIGHT_ALTITUDE*DEG)).multiplyScalar(40).toArray(),[frame]);
 const small=Math.min(window.innerWidth,window.innerHeight)<700;
 useFrame(()=>{
  const k=progress.current;
  rig.current?.children.forEach(o=>{const {base,site}=o.userData as {base:number;site:boolean};if(base!==undefined)(o as THREE.Light).intensity=base*(site?k:1-k);});
 });
 return <group ref={rig}>
  <hemisphereLight args={['#c3cbd4','#2a2826']} userData={{base:1.1,site:true}}/>
  <directionalLight position={key} color="#fff4e6" userData={{base:3.2,site:true}} castShadow shadow-mapSize={small?[2048,2048]:[4096,4096]}
   shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} shadow-camera-near={10} shadow-camera-far={75} shadow-bias={-.0004} shadow-normalBias={.012}/>
  <directionalLight position={moonSun} color={MOON_LIGHTS.sun.color} userData={{base:MOON_LIGHTS.sun.intensity,site:false}}/>
  <directionalLight position={moonBack} userData={{base:MOON_LIGHTS.back.intensity,site:false}}/>
  <ambientLight userData={{base:MOON_LIGHTS.ambient,site:false}}/>
 </group>;
}

function Camera({mapView,reset,controls,approach,focus,frame,progress,heroHeight}:{mapView:boolean;reset:number;controls:React.RefObject<any>;approach:Approach;focus?:RefObject<HTMLElement|null>;frame:SiteFrame;progress:RefObject<number>;heroHeight:number}){
 const {camera,gl}=useThree(),cam=camera as THREE.PerspectiveCamera;
 const aspect=useRef(16/9),goal=useRef<Pose>({position:new THREE.Vector3(),target:new THREE.Vector3()}),moving=useRef(false),placed=useRef(false),descent=useRef<number|null>(null),view=useRef('');
 // A slow frame can deliver the tile hand-off and the arrival together, so leaving the hold always descends.
 const held=useRef(false);
 const home=():Pose=>heroPose(frame,fovFor(aspect.current),HERO_BACK,heroHeight,HERO_SKY);
 const top=():Pose=>({position:new THREE.Vector3(0,Math.max(3.6,1.42/(Math.tan(fovFor(aspect.current)/2*DEG)*Math.min(1,aspect.current))),.001),target:new THREE.Vector3()});
 const rest=()=>mapView?top():home();
 const approachPose=useMemo(()=>horizonPose(APPROACH_KM,frame,LANDING_FOV).position,[frame]);
 const busy=()=>held.current||descent.current!==null;
 const place=(p:Pose)=>{camera.position.copy(p.position);camera.lookAt(p.target);controls.current?.target.copy(p.target);};
 useLayoutEffect(()=>{camera.manual=true;return()=>{camera.manual=false;cam.clearViewOffset();};},[camera,cam]);
 useEffect(()=>{
  const c=controls.current;
  if(approach==='hold'){descent.current=null;moving.current=false;c?.target.set(0,0,0);camera.position.copy(approachPose);camera.lookAt(0,0,0);}
  else if(held.current)descent.current=performance.now();
  held.current=approach==='hold';
  if(c)c.enabled=!busy();
 },[approach,camera,controls,approachPose]);
 useEffect(()=>{
  if(!placed.current)return;
  const p=rest();goal.current.position.copy(p.position);goal.current.target.copy(p.target);
  moving.current=!busy();
 },[camera,mapView,reset,controls]);
 useFrame((_,dt)=>{
  const canvas=gl.domElement.getBoundingClientRect();
  if(!canvas.width||!canvas.height)return;
  const stage=stageRect(canvas,focus?.current?.getBoundingClientRect());
  aspect.current=stage.width/stage.height;
  // The resting pose depends on the stage shape, which is only known once the canvas is laid out.
  if(!placed.current){placed.current=true;if(!held.current){place(rest());controls.current?.update();}}
  let k=1;
  if(held.current){k=0;camera.position.copy(approachPose);camera.lookAt(0,0,0);}
  else if(descent.current!==null){
   const t=Math.min(1,(performance.now()-descent.current)/DESCENT_MS),end=rest();
   k=easeInOutCubic(t);
   const km=Math.exp(THREE.MathUtils.lerp(Math.log(APPROACH_KM),Math.log(end.position.length()),k));
   const w=THREE.MathUtils.smootherstep(k,.55,1);
   camera.position.copy(horizonPose(km,frame,THREE.MathUtils.lerp(LANDING_FOV,fovFor(aspect.current),k)).position).lerp(end.position,w);
   camera.lookAt(new THREE.Vector3().lerp(end.target,w));
   if(t>=1){descent.current=null;goal.current=end;moving.current=false;place(end);const c=controls.current;if(c){c.enabled=true;c.update();}}
  }
  else if(moving.current){
   camera.position.lerp(goal.current.position,Math.min(1,dt*5));
   controls.current?.target.lerp(goal.current.target,Math.min(1,dt*5));
   if(camera.position.distanceTo(goal.current.position)<.002){place(goal.current);moving.current=false;}
   controls.current?.update();
  }
  progress.current=k;
  const f=k<1?lerpRect(landingRect(),stage,k):stage,fov=THREE.MathUtils.lerp(LANDING_FOV,fovFor(aspect.current),k);
  const altitude=Math.max(.001,camera.position.distanceTo(frame.center)-frame.radiusKm);
  const near=THREE.MathUtils.clamp(altitude*.004,.002,10),far=Math.sqrt(altitude*(2*frame.radiusKm+altitude))*1.25+SKY_KM*1.5;
  const key=[f.left,f.top,f.width,f.height,canvas.left,canvas.top,canvas.width,canvas.height,fov,near,far].map(n=>n.toFixed(2)).join();
  if(key===view.current)return;
  view.current=key;
  cam.fov=fov;cam.near=near;cam.far=far;cam.aspect=f.width/f.height;
  cam.setViewOffset(f.width,f.height,canvas.left-f.left,canvas.top-f.top,canvas.width,canvas.height);
  cam.updateProjectionMatrix();
 });
 return null;
}

type Point=[number,number,number];
type Ray={body:'sun'|'earth';end:Point;sky:Point;visible:boolean};
const RAY_START:Point=[0,0,0];
const RAY_DOT_RADIUS=.016;
const STATION_LABEL:Point=[0,.13,0];
const bodyRadius=(body:Ray['body'])=>SKY_KM*Math.tan(BODY_PHOTOS[body].diameter*DEG/2);
const rayLabel=({end:[x,y,z]}:Ray):Point=>[x,y+.06,z];

const renderSolarContinuum:THREE.MeshBasicMaterial['onBeforeCompile']=shader=>{
 // The HMI JPEG is colorized. The green channel retains contrast where red clips across the disc.
 shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
  float intensity = min(1.0, 1.38 * sqrt(diffuseColor.g));
  diffuseColor.rgb = intensity * vec3(1.0, 0.75, 0.19);
 `);
};

function BodyDisc({body,radius,visible}:{body:Ray['body'];radius:number;visible:boolean}){
 const [map,setMap]=useState<THREE.Texture|null>(null);
 useEffect(()=>{
  let mounted=true;
  const photo=BODY_PHOTOS[body];
  const texture=new THREE.TextureLoader().load(photo.url,loaded=>{if(mounted)setMap(loaded);});
  // Crop the black border from each NASA image to match its photographed limb.
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.repeat.set(photo.repeat[0],photo.repeat[1]);
  texture.offset.set(photo.offset[0],photo.offset[1]);
  return()=>{mounted=false;texture.dispose();};
 },[body]);
 return <mesh renderOrder={60} raycast={noRaycast}>
  <circleGeometry args={[radius,64]}/>
  <meshBasicMaterial key={map?'photo':'placeholder'} map={map} color={map?'#ffffff':SKY_DISC_COLOR[body]}
   onBeforeCompile={map&&body==='sun'?renderSolarContinuum:undefined}
   depthWrite={false} transparent opacity={visible?1:.22} toneMapped={false}/>
 </mesh>;
}

function SkyBody({body,sky,visible}:Ray){
 const color=SKY_DISC_COLOR[body],radius=bodyRadius(body);
 return <Billboard position={sky}>
  <BodyDisc body={body} radius={radius} visible={visible}/>
  {!visible&&<mesh renderOrder={61} raycast={noRaycast}>
   <ringGeometry args={[radius*.94,radius,64]}/>
   <meshBasicMaterial color={color} depthWrite={false} transparent opacity={.5} toneMapped={false}/>
  </mesh>}
 </Billboard>;
}

function Station({ground,surfaceHeight,height,label,rays,lines,linkTo,linkVisible}:{ground:Point;surfaceHeight:(x:number,z:number)=>number;height:number;label:string;rays:Ray[];lines:Record<TerrainRay['id'],TerrainLine>;linkTo:Point|null;linkVisible:boolean}){
 const mast=useRef<THREE.Mesh>(null),head=useRef<THREE.Group>(null),level=useRef(MAST_BASE+height*MAST_PER_M);
 const target=MAST_BASE+height*MAST_PER_M;
 const root=useRef<THREE.Group>(null),initial=useRef(ground);
 const travel=useRef<{from:THREE.Vector3;to:THREE.Vector3;elapsed:number}|null>(null);
 const [x,y,z]=ground;
 useLayoutEffect(()=>{
  const group=root.current;
  if(!group)return;
  const to=new THREE.Vector3(x,y,z);
  if(group.position.distanceToSquared(to)<1e-12||matchMedia('(prefers-reduced-motion: reduce)').matches){
   group.position.copy(to);
   travel.current=null;
   return;
  }
  travel.current={from:group.position.clone(),to,elapsed:0};
 },[x,y,z]);
 useFrame((_,dt)=>{
  const group=root.current,motion=travel.current;
  if(!group||!motion)return;
  motion.elapsed+=dt;
  if(motion.elapsed>=STATION_TRAVEL_SECONDS){group.position.copy(motion.to);travel.current=null;return;}
  const t=easeInOutCubic(motion.elapsed/STATION_TRAVEL_SECONDS);
  group.position.lerpVectors(motion.from,motion.to,t);
  // Follow the DEM while preserving the existing station elevations at both endpoints.
  const fromOffset=motion.from.y-surfaceHeight(motion.from.x,motion.from.z);
  const toOffset=motion.to.y-surfaceHeight(motion.to.x,motion.to.z);
  group.position.y=surfaceHeight(group.position.x,group.position.z)+THREE.MathUtils.lerp(fromOffset,toOffset,t);
 },-1);
 useFrame((_,dt)=>{
  level.current+= (target-level.current)*Math.min(1,dt*6);
  if(Math.abs(target-level.current)<1e-4) level.current=target;
  if(mast.current){mast.current.scale.y=level.current;mast.current.position.y=level.current/2;}
  if(head.current) head.current.position.y=level.current;
 });
 return <group ref={root} position={initial.current}>
  <ScreenScale position={[0,.002,0]}><mesh rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.03,.042,40]}/><meshBasicMaterial color={C.station} transparent opacity={.75} side={THREE.DoubleSide}/></mesh></ScreenScale>
  <mesh ref={mast}><cylinderGeometry args={[.0045,.0045,1,10]}/><meshBasicMaterial color={C.station}/></mesh>
  <group ref={head}>
   <mesh><octahedronGeometry args={[.024]}/><meshBasicMaterial color={C.station}/></mesh>
   {rays.map(ray=>{
    const color=ray.visible?C[ray.body]:BLOCKED_COLOR;
    return <group key={ray.body}>
     <TerrainSightline line={lines[ray.body]} start={RAY_START} end={ray.end}
      color={color} width={ray.visible?2.2:2.5} blocked={!ray.visible}/>
     <mesh position={ray.end} renderOrder={52} raycast={noRaycast}>
      <sphereGeometry args={[RAY_DOT_RADIUS,16,16]}/>
      <meshBasicMaterial color={color} depthTest={ray.visible} depthWrite={false} transparent toneMapped={false}/>
     </mesh>
     <Label position={rayLabel(ray)} color={color} size={.018} depthTest={ray.visible} text={`${BODY_LABELS[ray.body].toUpperCase()} · ${ray.visible?'IN VIEW':'BLOCKED'}`}/>
     <SkyBody {...ray}/>
    </group>;
   })}
   <Label position={STATION_LABEL} color={C.station} text={label}/>
   {linkTo&&<TerrainSightline line={lines.link} start={RAY_START} end={linkTo} worldEndFrom={head} color={linkVisible?C.ok:BLOCKED_COLOR} width={1.4} blocked={!linkVisible}/>}
  </group>
 </group>;
}

function PositionHighlight({label,position}:{label:string;position:[number,number,number]}){
 return <group position={position}>
  <ScreenScale position={[0,0,0]}><Billboard>
   <mesh renderOrder={90}>
    <ringGeometry args={[.024,.035,32]}/>
    <meshBasicMaterial color="#F5F5F5" transparent opacity={.95} toneMapped={false} depthTest={false} depthWrite={false}/>
   </mesh>
  </Billboard></ScreenScale>
  <Html position={[0,.06,0]} zIndexRange={[1,0]} style={{pointerEvents:'none'}}>
   <div className="map-label position-preview-label" aria-hidden="true">{label}</div>
  </Html>
 </group>;
}

type SceneProps=Props&{onRayHover:(tip:TerrainRayTip|null)=>void;canSelect:(event:MouseEvent)=>boolean};

function Scene(p:SceneProps){
 const controls=useRef<any>(null);
 const occluder=useRef<THREE.Mesh>(null);
 const lines=useMemo(()=>({sun:createRef<ComponentRef<typeof Line>>(),earth:createRef<ComponentRef<typeof Line>>(),link:createRef<ComponentRef<typeof Line>>()}),[]);
 const [hovered,setHovered]=useState<string|null>(null);
 const orbiting=useRef(false);
 useCursor(hovered!==null);
 const mean=useMemo(()=>terrainMean(p.terrain),[p.terrain]);
 const projection=useMemo(()=>sceneProjection(p.frame.lat,p.frame.lon,mean),[p.frame,mean]);
 const land=useMemo<Ground>(()=>({terrain:p.terrain,mean,frame:p.frame,projection}),[p.terrain,mean,p.frame,projection]);
 const tileData=useSite01(),surround=useSurround();
 const n=p.terrain.original_shape[0],px=p.terrain.pixel_size_m;
 const tile=useMemo<DemLevel|null>(()=>tileData&&{data:tileData,n:SITE01_SIZE,px,x0:p.frame.centerPs[0]-(n/2+.5)*px,y0:p.frame.centerPs[1]+(n/2+.5)*px},[tileData,n,px,p.frame]);
 const extentKm=p.terrain.original_shape[1]*px/1000;
 const point=(pos:Site|Analysis['position'],height=0):[number,number,number]=>projection.gridPoint(
  p.frame.centerPs[0]+(pos.col-p.terrain.original_shape[1]/2)*px,
  p.frame.centerPs[1]-(pos.row-p.terrain.original_shape[0]/2)*px,pos.elevation_m+height);
 // The resting camera clears both the ground around it and the crest at the middle of the square.
 const heroHeight=useMemo(()=>{
  const t=p.terrain,km=px*t.stride/1000,cam=p.frame.bearing.clone().multiplyScalar(HERO_BACK);let ground=-Infinity,crest=-Infinity;
  t.elevation_m.forEach((row,i)=>row.forEach((z,j)=>{
   if(z===null)return;const x=j*km-extentKm/2,y=(z-mean)*VERTICAL_EXAGGERATION/1000;
   if(Math.hypot(x-cam.x,i*km-extentKm/2-cam.z)<.35)ground=Math.max(ground,y);
   if(Math.hypot(x,i*km-extentKm/2)<.45)crest=Math.max(crest,y);
  }));
  return Math.max(ground,crest)+HERO_CLEAR;
 },[p.terrain,p.frame,mean,px,extentKm]);
 const ground=point(p.selected.position),lander=point(p.lander,2);
 const surfaceHeight=(x:number,z:number)=>{
  let elevation:number;
  if(tile&&surround)elevation=bilinear(tile,p.frame.centerPs[0]+x*1000,p.frame.centerPs[1]-z*1000);
  else{
   const grid=p.terrain.elevation_m,step=px*p.terrain.stride/1000;
   const col=THREE.MathUtils.clamp((x+extentKm/2)/step,0,grid[0].length-1);
   const row=THREE.MathUtils.clamp((z+n*px/2000)/step,0,grid.length-1);
   const i=Math.min(Math.floor(row),grid.length-2),j=Math.min(Math.floor(col),grid[0].length-2);
   elevation=THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(grid[i][j]??mean,grid[i][j+1]??mean,col-j),
    THREE.MathUtils.lerp(grid[i+1][j]??mean,grid[i+1][j+1]??mean,col-j),row-i);
  }
  return projection.gridPoint(p.frame.centerPs[0]+x*1000,p.frame.centerPs[1]-z*1000,elevation)[1];
 };
 const atLander=p.selected.position.row===p.lander.row&&p.selected.position.col===p.lander.col;
 const preview=p.positions.find(o=>o.id===(p.previewId??hovered));
 const select=(id:string,event:MouseEvent)=>{if(p.canSelect(event)){setHovered(null);p.onSelect(id);}};
 const pick:TerrainPick=(r,c,event)=>{const nearest=p.positions.reduce((best,o)=>Math.hypot(o.position.row-r,o.position.col-c)<Math.hypot(best.position.row-r,best.position.col-c)?o:best);select(nearest.id,event);};
 const rays=useMemo<Ray[]>(()=>BODY_KEYS.map(body=>{
  const az=p.selected.series[`${body}_azimuth_deg`][p.time],el=p.selected.series[`${body}_elevation_deg`][p.time];
  return {body,visible:p.selected.series[`${body}_visible`][p.time],end:projection.direction(p.selected.position,az,el,RAY_KM),sky:projection.direction(p.selected.position,az,el,SKY_KM)};
 }),[p.selected,projection,p.time]);
 const hoverRays:TerrainRay[]=rays.map(r=>({id:r.body,line:lines[r.body],label:`${BODY_LABELS[r.body]} sightline`,visible:r.visible,color:r.visible?C[r.body]:BLOCKED_COLOR,markerRadius:RAY_DOT_RADIUS,skyMarker:{position:r.sky,radius:bodyRadius(r.body)},detail:`Elevation ${p.selected.series[`${r.body}_elevation_deg`][p.time].toFixed(2)}° · Horizon ${p.selected.series[`${r.body}_horizon_deg`][p.time].toFixed(2)}°`}));
 if(!atLander) hoverRays.push({id:'link',line:lines.link,label:'Lander ↔ station',visible:p.linkVisible,color:p.linkVisible?C.ok:BLOCKED_COLOR});
 const labelPositions:TerrainLabel[]=[{position:STATION_LABEL,relativeTo:lines.sun},...rays.map(r=>({position:rayLabel(r),relativeTo:lines[r.body]}))];
 if(!atLander) labelPositions.push({position:[lander[0],lander[1]+.1,lander[2]]});
 const north=p.frame.horizontal(0),[nx,nz]=[north.x,north.z];
 const compass:[number,number,number]=[-extentKm*.42,point({row:n*.92,col:n*.08,elevation_m:p.terrain.elevation_m[Math.round(n*.92/p.terrain.stride)]?.[Math.round(n*.08/p.terrain.stride)]??mean} as Site)[1]+.03,extentKm*.42];
 // Stars travel with the camera, oriented as on the landing, and draw first so the globe and terrain occlude them.
 const stars=useMemo(()=>{const s=starfield();s.renderOrder=-1;(s.material as THREE.PointsMaterial).depthTest=false;return s;},[]);
 useEffect(()=>{stars.quaternion.copy(p.frame.rotation);},[stars,p.frame]);
 useFrame(({camera})=>{stars.position.copy(camera.position);});
 const progress=useRef(1);
 const surface=<Surface ground={land} levels={{tile:null,surround:null}} wireframe={p.wireframe} onPick={pick} occluder={occluder}/>;
 return <><Camera mapView={p.mapView} reset={p.reset} controls={controls} approach={p.approach} focus={p.focus} frame={p.frame} progress={progress} heroHeight={heroHeight}/>
  <primitive object={stars}/>
  <Lights frame={p.frame} progress={progress}/>
  <GlobeFallback fallback={surface}><Suspense fallback={null}><SiteGround ground={land} tile={tile} surround={surround} progress={progress} wireframe={p.wireframe} onPick={pick} occluder={occluder}/></Suspense></GlobeFallback>
  <DistantTerrain analysis={p.selected} time={p.time} frame={p.frame} mean={mean} progress={progress} occluder={occluder} hidden={p.mapView||!p.active||p.approach!==null}/>
  {p.positions.map(o=>{const feasible=p.feasible?.has(o.id),rec=o.id===p.recommended,radius=feasible?.017:.012;return o.id===p.selected.candidate_id?null:<ScreenScale key={o.id} position={point(o.position,2)}>
   <mesh><sphereGeometry args={[radius,14,14]}/><meshBasicMaterial color={feasible?C.feasible:C.candidate} transparent opacity={feasible?1:.75}/></mesh>
   <mesh visible={false} userData={{candidateTarget:true}}
    onPointerMove={e=>{if(orbiting.current||e.pointerType==='touch')return;e.stopPropagation();if(hovered!==o.id)setHovered(o.id);}}
    onPointerOut={()=>setHovered(h=>h===o.id?null:h)}
    onClick={e=>{e.stopPropagation();select(o.id,e.nativeEvent);}}>
    <sphereGeometry args={[CANDIDATE_HIT_RADIUS,12,12]}/><meshBasicMaterial/>
   </mesh>
   {rec&&<mesh rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.03,.038,32]}/><meshBasicMaterial color={C.recommended} side={THREE.DoubleSide}/></mesh>}
  </ScreenScale>;})}
  {preview&&<PositionHighlight label={preview.label} position={point(preview.position,2)}/>}
  <group position={lander}><ScreenScale position={[0,0,0]}><mesh position={[0,.02,0]}><boxGeometry args={[.036,.04,.036]}/><meshStandardMaterial color={C.lander} emissive="#5a5a5a"/></mesh></ScreenScale>{!atLander&&<Label position={[0,.1,0]} text={`LANDER · ${p.lander.name.toUpperCase()}`}/>}</group>
  <Station ground={ground} surfaceHeight={surfaceHeight} height={p.selected.height_m} rays={rays} lines={lines} label={`${atLander?'LANDER + STATION':'STATION'} · ${p.selected.height_m} M MAST`} linkTo={atLander?null:lander} linkVisible={p.linkVisible}/>
  <group position={compass}>
   <Line points={[[0,0,0],[nx*.16,0,nz*.16]]} color="#D4D4D4" lineWidth={1.6}/>
   <mesh position={[nx*.16,0,nz*.16]} rotation={[0,Math.atan2(nx,nz),0]}><coneGeometry args={[.016,.04,12]} /><meshBasicMaterial color="#D4D4D4"/></mesh>
   <Label position={[nx*.24,.03,nz*.24]} text="N · LOCAL" size={.016} color="#D4D4D4"/>
  </group>
  <TerrainRayHover rays={hoverRays} labels={labelPositions} orbiting={orbiting} candidateHovered={Boolean(preview)} onHover={p.onRayHover}/>
  <OrbitControls ref={controls} makeDefault minDistance={.6} maxDistance={MAX_KM} maxPolarAngle={Math.PI*.49} enableDamping dampingFactor={.1}
   onStart={()=>{orbiting.current=true;setHovered(null);p.onRayHover(null);}} onChange={()=>p.onRayHover(null)} onEnd={()=>{orbiting.current=false;}}/>
 </>;
}
const TerrainCanvas=memo(function TerrainCanvas(props:SceneProps){
 return <Canvas shadows events={terrainEvents} frameloop={props.active?'always':'never'} camera={{fov:FOV,near:.01,far:100}} dpr={[1,1.75]} gl={{antialias:true}} onCreated={({gl})=>{gl.toneMappingExposure=1.05;gl.setClearColor('#050505',1);}}><Suspense fallback={null}><Scene {...props}/></Suspense></Canvas>;
});

export function TerrainScope({terrain,analysis,regionalRadiusM}:{terrain:Terrain;analysis:Analysis;regionalRadiusM?:number}){
 const tile=useSite01(),surround=useSurround();
 const horizon=useDistantHorizon();
 const closeupKm=terrain.original_shape[1]*terrain.pixel_size_m/1000;
 const footprint=tile&&surround?`~${Math.round(DISC_KM)} km radius`:`${closeupKm.toFixed(2)} km across`;
 return <p className="terrain-scope">
  <span><strong>3D display</strong> · {VERTICAL_EXAGGERATION}× vertical relief · {footprint}{horizon&&profileFor(horizon,analysis)&&' + regional ridge silhouettes'}</span>
  <span><strong>Sun/Earth visibility</strong> · {regionalRadiusM?`LOLA terrain to ${regionalRadiusM/1000} km`:'LOLA elevations'}</span>
 </p>;
}

export default function TerrainView(props:Props){
 const [tip,setTip]=useState<TerrainRayTip|null>(null);
 const click=useMemo(createStationClickGuard,[]);
 return <div className="terrain-view"
  onPointerDownCapture={event=>click.start(event.nativeEvent)}
  onPointerMoveCapture={event=>click.move(event.nativeEvent)}
  onPointerUpCapture={event=>click.release(event.nativeEvent)}
  onPointerCancelCapture={click.cancel}
  onPointerLeave={click.leave}
  onContextMenuCapture={click.cancel}
  onWheelCapture={click.cancel}>
  <TerrainCanvas {...props} onRayHover={setTip} canSelect={click.consume}/>
  {tip&&<TerrainRayTooltip tip={tip}/>}
 </div>;
}
