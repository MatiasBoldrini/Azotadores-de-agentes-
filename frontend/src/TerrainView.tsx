import {Component,useMemo,useRef,useEffect,useLayoutEffect,useState,memo,Suspense,type ReactNode,type RefObject} from 'react';
import {Canvas,ThreeEvent,useFrame,useLoader,useThree} from '@react-three/fiber';
import {Billboard,Html,OrbitControls,Line,useCursor} from '@react-three/drei';
import * as THREE from 'three';
import type {Analysis,Site,Terrain} from './lib/science';
import type {EvaluatedPosition} from './PositionPicker';
import {starfield} from './moon/stars';
import {MOON_LIGHTS,MOON_TEXTURES,buildMoon,polarAlbedo} from './moon/globe';
import {APPROACH_KM,LANDING_FOV,horizonPose,type SiteFrame} from './moon/frame';
import {SITE01_SIZE,useSite01} from './site01';
import {TerrainRayHover,TerrainRayTooltip,type TerrainRay,type TerrainRayTip} from './TerrainRayHover';

export const VERTICAL_EXAGGERATION = 4;
// The mast glyph is stretched beyond the relief scale so that metre-scale heights read on a 2.5 km scene.
export const MAST_EXAGGERATION=12;
const MAST_BASE=.03,MAST_PER_M=MAST_EXAGGERATION/1000,RAY=.85;
const FOV=40,DEG=Math.PI/180,HOME_KM=3.2,MAX_KM=80,DESCENT_MS=2400;
// The tile relief eases into the sphere outside this rounded-square radius (4-norm, as a share of the
// half-width); every evaluated cell lies inside it, the farthest at 0.598.
const FULL_RELIEF=.6,SKIRT=.06;
const easeInOutCubic=(t:number)=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const C={sun:'#FFC46B',earth:'#8FD3FF',station:'#F5F5F5',lander:'#F5F5F5',candidate:'#A3A3A3',feasible:'#F5F5F5',recommended:'#8FD3FF',ok:'#F5F5F5'};
const BODY_LABELS={sun:'Sun',earth:'Earth'} as const;
const BODY_KEYS=['sun','earth'] as const;
const BLOCKED_COLOR='#ff625e';

type Approach='hold'|'descend'|null;
type Props={active:boolean;approach:Approach;focus?:RefObject<HTMLElement|null>;frame:SiteFrame;terrain:Terrain;positions:EvaluatedPosition[];previewId:string|null;selected:Analysis;lander:Site;time:number;onSelect:(id:string)=>void;wireframe:boolean;mapView:boolean;reset:number;linkVisible:boolean;feasible?:Set<string>;recommended?:string};

const LABEL_FONT='600 34px Inter, system-ui, sans-serif';
function useFontReady(){
 const [ready,setReady]=useState(()=>document.fonts?.check(LABEL_FONT)??true);
 useEffect(()=>{if(!ready)document.fonts.load(LABEL_FONT).then(()=>setReady(true),()=>setReady(true));},[ready]);
 return ready;
}

function Label({text,position,color='#F5F5F5',size=.082}:{text:string;position:[number,number,number];color?:string;size?:number}){
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
 return <sprite position={position} scale={[size*aspect,size,1]} renderOrder={100}><spriteMaterial map={texture} depthTest={false} transparent/></sprite>;
}

type Albedo=(x:number,y:number,out:THREE.Color)=>THREE.Color;
type Grid={rows:number;cols:number;row:(i:number)=>number;col:(j:number)=>number;height:(i:number,j:number)=>number};
type Ground={terrain:Terrain;mean:number;frame:SiteFrame;albedo:Albedo|null};

const taper=(r:number,c:number,n:number)=>{const u=(2*c-n+1)/(n-1),v=(2*r-n+1)/(n-1);return 1-THREE.MathUtils.smoothstep(Math.sqrt(Math.sqrt(u**4+v**4)),FULL_RELIEF,1);};
export const terrainMean=(t:Terrain)=>{const z=t.elevation_m.flat().filter((x):x is number=>x!==null);return z.reduce((a,b)=>a+b,0)/z.length;};
function surfaceAt({terrain,mean}:Ground,x:number,z:number){
 const n=terrain.original_shape[0],km=terrain.pixel_size_m/1000,r=THREE.MathUtils.clamp(Math.round(z/km+n/2),0,n-1),c=THREE.MathUtils.clamp(Math.round(x/km+n/2),0,n-1);
 const h=terrain.elevation_m[Math.min(terrain.elevation_m.length-1,Math.round(r/terrain.stride))][Math.min(terrain.elevation_m[0].length-1,Math.round(c/terrain.stride))]??mean;
 return (h-mean)*VERTICAL_EXAGGERATION/1000*taper(r,c,n);
}

// Lays a DEM grid on the sphere through the tile's mean level: relief at the labeled exaggeration inside,
// easing to the sphere at the border. The LROC mosaic records sunlight and shadow rather than albedo, so it
// only tints the border, where the tile has to match the surrounding globe.
function groundGeometry(grid:Grid,{terrain,mean,frame,albedo}:Ground){
 const {rows,cols}=grid,n=terrain.original_shape[0],km=terrain.pixel_size_m/1000,half=n/2;
 const heights=terrain.elevation_m.flat().filter((x):x is number=>x!==null),lo=Math.min(...heights),hi=Math.max(...heights);
 const count=rows*cols,edge=2*(rows+cols),pos=new Float32Array((count+edge)*3),nor=new Float32Array((count+edge)*3),col=new Float32Array((count+edge)*3);
 const x=(j:number)=>(grid.col(j)-half)*km,z=(i:number)=>(grid.row(i)-half)*km,color=new THREE.Color(),lroc=new THREE.Color();
 for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
  const k=(i*cols+j)*3,h=grid.height(i,j),r=grid.row(i),c=grid.col(j),xx=x(j),zz=z(i),t=taper(r,c,n);
  pos[k]=xx;pos[k+1]=(h-mean)*VERTICAL_EXAGGERATION/1000*t-(xx*xx+zz*zz)/(2*frame.radiusKm);pos[k+2]=zz;
  const s=.08+Math.pow((h-lo)/(hi-lo||1),1.1)*.32;color.setRGB(s,s*.985,s*.96);
  if(albedo&&t<1)color.lerp(albedo(frame.centerPs[0]+(c-half)*terrain.pixel_size_m,frame.centerPs[1]-(r-half)*terrain.pixel_size_m,lroc),1-t);
  col[k]=color.r;col[k+1]=color.g;col[k+2]=color.b;
 }
 const y=(i:number,j:number)=>pos[(THREE.MathUtils.clamp(i,0,rows-1)*cols+THREE.MathUtils.clamp(j,0,cols-1))*3+1];
 const v=new THREE.Vector3();
 for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
  const k=(i*cols+j)*3,dx=x(Math.min(j+1,cols-1))-x(Math.max(j-1,0)),dz=z(Math.min(i+1,rows-1))-z(Math.max(i-1,0));
  v.set(-(y(i,j+1)-y(i,j-1))/dx,1,-(y(i+1,j)-y(i-1,j))/dz).normalize();nor[k]=v.x;nor[k+1]=v.y;nor[k+2]=v.z;
 }
 const index:number[]=[];
 for(let i=0;i<rows-1;i++)for(let j=0;j<cols-1;j++){const a=i*cols+j;index.push(a,a+cols,a+1,a+1,a+cols,a+cols+1);}
 // A skirt hangs from the border so no seam opens where the tile meets the faceted globe cap.
 const ring=[...Array.from({length:cols},(_,j)=>j),...Array.from({length:rows},(_,i)=>i*cols+cols-1),...Array.from({length:cols},(_,j)=>(rows-1)*cols+cols-1-j),...Array.from({length:rows},(_,i)=>(rows-1-i)*cols)];
 ring.forEach((a,s)=>{const b=count+s;for(let d=0;d<3;d++){pos[b*3+d]=pos[a*3+d];nor[b*3+d]=nor[a*3+d];col[b*3+d]=col[a*3+d];}pos[b*3+1]-=SKIRT;});
 for(let s=0;s<ring.length-1;s++)index.push(ring[s],ring[s+1],count+s,ring[s+1],count+s+1,count+s);
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('normal',new THREE.BufferAttribute(nor,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));
 g.setIndex(count+edge>65535?new THREE.Uint32BufferAttribute(index,1):new THREE.Uint16BufferAttribute(index,1));
 g.computeBoundingSphere();
 return g;
}

const noRaycast=()=>{};

// The 5 m tile is what is drawn; the snapshot's 20 m grid stays the click target, the wireframe and the fallback.
function Surface({ground,tile,wireframe,onPick}:{ground:Ground;tile:Float32Array|null;wireframe:boolean;onPick:(r:number,c:number)=>void}){
 const {terrain,mean}=ground,n=terrain.original_shape[0];
 const coarse=useMemo(()=>{
  const rows=terrain.elevation_m.length,cols=terrain.elevation_m[0].length,s=terrain.stride;
  // The last row and column reach the window border so the hole in the globe is covered.
  return groundGeometry({rows,cols,row:i=>i===rows-1?n-1:i*s,col:j=>j===cols-1?n-1:j*s,height:(i,j)=>terrain.elevation_m[i][j]??mean},ground);
 },[ground,terrain,mean,n]);
 const fine=useMemo(()=>tile&&groundGeometry({rows:SITE01_SIZE,cols:SITE01_SIZE,row:i=>i,col:j=>j,height:(i,j)=>tile[i*SITE01_SIZE+j]},ground),[tile,ground]);
 useEffect(()=>()=>coarse.dispose(),[coarse]);
 useEffect(()=>()=>{fine?.dispose();},[fine]);
 const pick=(e:ThreeEvent<MouseEvent>)=>{e.stopPropagation();onPick(e.point.z*1000/terrain.pixel_size_m+n/2,e.point.x*1000/terrain.pixel_size_m+n/2);};
 return <>
  {fine&&<mesh geometry={fine} raycast={noRaycast}><meshStandardMaterial vertexColors roughness={.95} metalness={0} side={THREE.DoubleSide}/></mesh>}
  <mesh geometry={coarse} onClick={pick} visible={wireframe||!fine} position-y={fine&&wireframe?.004:0}><meshStandardMaterial vertexColors roughness={.95} metalness={0} side={THREE.DoubleSide} wireframe={wireframe}/></mesh>
 </>;
}

// The real Moon around the tile, at true scale: same LROC/LOLA globe as the landing, with the tile's square cut out of the cap.
function ContextGlobe({frame,hole,textures:[color,polar,relief]}:{frame:SiteFrame;hole:number;textures:THREE.Texture[]}){
 const {gl}=useThree();
 const moon=useMemo(()=>buildMoon(color,polar,relief,gl.capabilities.getMaxAnisotropy(),hole),[color,polar,relief,gl,hole]);
 return <group position={frame.center} quaternion={frame.rotation} scale={frame.scale}><primitive object={moon.sphere}/><primitive object={moon.cap}/></group>;
}

function DrapedSite({ground,...rest}:{ground:Ground;tile:Float32Array|null;wireframe:boolean;onPick:(r:number,c:number)=>void}){
 // Same URL list as the landing globe, so both canvases share one decoded copy of each texture.
 const textures=useLoader(THREE.TextureLoader,MOON_TEXTURES);
 const {terrain,frame}=ground,half=terrain.original_shape[1]*terrain.pixel_size_m/2,[x,y]=frame.centerPs;
 const albedo=useMemo(()=>polarAlbedo(textures[1].image as HTMLImageElement,x-half,y-half,x+half,y+half),[textures,x,y,half]);
 const draped=useMemo(()=>({...ground,albedo}),[ground,albedo]);
 return <><ContextGlobe frame={frame} hole={half/1000-.01} textures={textures}/><Surface ground={draped} {...rest}/></>;
}

class GlobeFallback extends Component<{fallback:ReactNode;children:ReactNode},{error:boolean}>{
 state={error:false};
 static getDerivedStateFromError(){return {error:true};}
 render(){return this.state.error?this.props.fallback:this.props.children;}
}

type Rect={left:number;top:number;width:number;height:number};
const lerpRect=(a:Rect,b:Rect,k:number):Rect=>({left:a.left+(b.left-a.left)*k,top:a.top+(b.top-a.top)*k,width:a.width+(b.width-a.width)*k,height:a.height+(b.height-a.height)*k});
// The landing globe fills the viewport and is shifted down on portrait screens; the hold matches it exactly.
function landingRect():Rect{const w=document.documentElement.clientWidth,h=document.documentElement.clientHeight;return {left:0,top:h>w?h*.07:0,width:w,height:h};}
// The free stage between the glass panels; the canvas itself stays full-bleed.
function stageRect(c:DOMRect,f?:DOMRect):Rect{
 const left=Math.max(c.left,f?.left??c.left),top=Math.max(c.top,f?.top??c.top),width=Math.min(c.right,f?.right??c.right)-left,height=Math.min(c.bottom,f?.bottom??c.bottom)-top;
 return width<1||height<1?{left:c.left,top:c.top,width:c.width,height:c.height}:{left,top,width,height};
}

// The landing's light, carried into the site frame, gives way to the site rig as the camera descends.
function Lights({sun,frame,progress}:{sun:[number,number,number];frame:SiteFrame;progress:RefObject<number>}){
 const rig=useRef<THREE.Group>(null);
 const [moonSun,moonBack]=useMemo(()=>[MOON_LIGHTS.sun.position,MOON_LIGHTS.back.position].map(p=>new THREE.Vector3(...p).normalize().multiplyScalar(5).applyQuaternion(frame.rotation).toArray()),[frame]);
 useFrame(()=>{
  const k=progress.current;
  rig.current?.children.forEach(o=>{const {base,site}=o.userData as {base:number;site:boolean};(o as THREE.Light).intensity=base*(site?k:1-k);});
 });
 return <group ref={rig}>
  <hemisphereLight args={['#c9d3dc','#0b0d0e']} userData={{base:.42,site:true}}/>
  <directionalLight position={sun} color="#ffe3be" userData={{base:1.9,site:true}}/>
  <directionalLight position={[-3,1.05,1.4]} userData={{base:1.6,site:true}}/>
  <directionalLight position={[2.5,1.2,-2.5]} color="#a9bddc" userData={{base:.35,site:true}}/>
  <directionalLight position={moonSun} color={MOON_LIGHTS.sun.color} userData={{base:MOON_LIGHTS.sun.intensity,site:false}}/>
  <directionalLight position={moonBack} userData={{base:MOON_LIGHTS.back.intensity,site:false}}/>
  <ambientLight userData={{base:MOON_LIGHTS.ambient,site:false}}/>
 </group>;
}

function Camera({mapView,reset,controls,approach,focus,frame,progress}:{mapView:boolean;reset:number;controls:React.RefObject<any>;approach:Approach;focus?:RefObject<HTMLElement|null>;frame:SiteFrame;progress:RefObject<number>}){
 const {camera,gl}=useThree(),cam=camera as THREE.PerspectiveCamera;
 const aspect=useRef(16/9),goal=useRef(new THREE.Vector3()),moving=useRef(false),placed=useRef(false),descent=useRef<number|null>(null),view=useRef('');
 // A slow frame can deliver the tile hand-off and the arrival together, so leaving the hold always descends.
 const held=useRef(false);
 const homeKm=()=>Math.max(HOME_KM,1.45/(Math.tan(FOV/2*DEG)*aspect.current));
 const home=()=>horizonPose(homeKm(),frame.radiusKm,FOV).position;
 const top=()=>new THREE.Vector3(0,Math.max(3.6,1.42/(Math.tan(FOV/2*DEG)*Math.min(1,aspect.current))),.001);
 const approachPose=useMemo(()=>horizonPose(APPROACH_KM,frame.radiusKm,LANDING_FOV).position,[frame]);
 const busy=()=>held.current||descent.current!==null;
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
  goal.current.copy(mapView?top():home());
  moving.current=!busy();controls.current?.target.set(0,0,0);
 },[camera,mapView,reset,controls]);
 useFrame((_,dt)=>{
  const canvas=gl.domElement.getBoundingClientRect();
  if(!canvas.width||!canvas.height)return;
  const stage=stageRect(canvas,focus?.current?.getBoundingClientRect());
  aspect.current=stage.width/stage.height;
  // The resting pose depends on the stage shape, which is only known once the canvas is laid out.
  if(!placed.current){placed.current=true;if(!held.current){camera.position.copy(mapView?top():home());camera.lookAt(0,0,0);controls.current?.update();}}
  let k=1;
  if(held.current){k=0;camera.position.copy(approachPose);camera.lookAt(0,0,0);}
  else if(descent.current!==null){
   const t=Math.min(1,(performance.now()-descent.current)/DESCENT_MS);
   k=easeInOutCubic(t);
   const km=Math.exp(THREE.MathUtils.lerp(Math.log(APPROACH_KM),Math.log(homeKm()),k));
   camera.position.copy(horizonPose(km,frame.radiusKm,THREE.MathUtils.lerp(LANDING_FOV,FOV,k)).position);camera.lookAt(0,0,0);
   if(t>=1){descent.current=null;goal.current.copy(mapView?top():home());moving.current=mapView;const c=controls.current;if(c){c.target.set(0,0,0);c.enabled=true;c.update();}}
  }
  else if(moving.current){
   camera.position.lerp(goal.current,Math.min(1,dt*5));
   if(camera.position.distanceTo(goal.current)<.002){camera.position.copy(goal.current);moving.current=false;}
   controls.current?.update();
  }
  progress.current=k;
  const f=k<1?lerpRect(landingRect(),stage,k):stage,fov=THREE.MathUtils.lerp(LANDING_FOV,FOV,k);
  const altitude=Math.max(.001,camera.position.distanceTo(frame.center)-frame.radiusKm);
  const near=THREE.MathUtils.clamp(altitude*.004,.002,10),far=Math.sqrt(altitude*(2*frame.radiusKm+altitude))*1.25+60;
  const key=[f.left,f.top,f.width,f.height,canvas.left,canvas.top,canvas.width,canvas.height,fov,near,far].map(n=>n.toFixed(2)).join();
  if(key===view.current)return;
  view.current=key;
  cam.fov=fov;cam.near=near;cam.far=far;cam.aspect=f.width/f.height;
  cam.setViewOffset(f.width,f.height,canvas.left-f.left,canvas.top-f.top,canvas.width,canvas.height);
  cam.updateProjectionMatrix();
 });
 return null;
}

type Ray={body:'sun'|'earth';dir:[number,number,number];visible:boolean};

function Station({ground,height,label,rays,linkTo,linkVisible}:{ground:[number,number,number];height:number;label:string;rays:Ray[];linkTo:[number,number,number]|null;linkVisible:boolean}){
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
   {rays.map(({body,dir,visible})=>{
    const color=visible?C[body]:BLOCKED_COLOR,order=visible?0:20;
    // Visibility includes the regional horizon beyond the mesh, so blocked rays are drawn over the terrain.
    return <group key={body}>
     <Line points={[[0,0,0],dir]} color={color} lineWidth={visible?2.2:2.5} depthTest={visible} depthWrite={visible} transparent={!visible} renderOrder={order}/>
     <mesh position={dir} renderOrder={order+1}><sphereGeometry args={[.016,16,16]}/><meshBasicMaterial color={color} depthTest={visible} transparent={!visible}/></mesh>
     <Label position={[dir[0],dir[1]+.06,dir[2]]} color={color} size={.068} text={`${body==='sun'?'SUN':'EARTH'} · ${visible?'IN VIEW':'BLOCKED'}`}/>
    </group>;
   })}
   <Label position={[0,.09,0]} color={C.station} text={label}/>
  </group>
  {linkTo&&<Line points={[[0,MAST_BASE,0],[linkTo[0]-ground[0],linkTo[1]-ground[1],linkTo[2]-ground[2]]]} color={linkVisible?C.ok:BLOCKED_COLOR} lineWidth={1.4} dashed={!linkVisible} dashSize={.03} gapSize={.02}/>}
 </group>;
}

function PositionHighlight({label,position}:{label:string;position:[number,number,number]}){
 return <group position={position}>
  <Billboard>
   <mesh renderOrder={90}>
    <ringGeometry args={[.024,.035,32]}/>
    <meshBasicMaterial color="#F5F5F5" transparent opacity={.95} toneMapped={false} depthTest={false} depthWrite={false}/>
   </mesh>
  </Billboard>
  <Html position={[0,.27,0]} zIndexRange={[1,0]} style={{pointerEvents:'none'}}>
   <div className="map-label position-preview-label" aria-hidden="true">{label}</div>
  </Html>
 </group>;
}

type SceneProps=Props&{onRayHover:(tip:TerrainRayTip|null)=>void};

function Scene(p:SceneProps){
 const controls=useRef<any>(null);
 const [hovered,setHovered]=useState<string|null>(null);
 const orbiting=useRef(false);
 useCursor(hovered!==null);
 const mean=useMemo(()=>terrainMean(p.terrain),[p.terrain]);
 const land=useMemo<Ground>(()=>({terrain:p.terrain,mean,frame:p.frame,albedo:null}),[p.terrain,mean,p.frame]);
 const tile=useSite01();
 const extent=p.terrain.original_shape[1]*p.terrain.pixel_size_m/1000;
 const point=(pos:Site|Analysis['position'],height=0):[number,number,number]=>[(pos.col-p.terrain.original_shape[1]/2)*p.terrain.pixel_size_m/1000,(pos.elevation_m-mean)*VERTICAL_EXAGGERATION/1000+height/1000,(pos.row-p.terrain.original_shape[0]/2)*p.terrain.pixel_size_m/1000];
 const ground=point(p.selected.position),lander=point(p.lander,2);
 const atLander=p.selected.position.row===p.lander.row&&p.selected.position.col===p.lander.col;
 const preview=p.positions.find(o=>o.id===(p.previewId??hovered));
 const select=(id:string)=>{setHovered(null);p.onSelect(id);};
 const pick=(r:number,c:number)=>{const nearest=p.positions.reduce((best,o)=>Math.hypot(o.position.row-r,o.position.col-c)<Math.hypot(best.position.row-r,best.position.col-c)?o:best);select(nearest.id);};
 const horizontal=(az:number,lon:number)=>[Math.sin(az)*Math.cos(lon)+Math.cos(az)*Math.sin(lon),Math.sin(az)*Math.sin(lon)-Math.cos(az)*Math.cos(lon)];
 const rays:Ray[]=BODY_KEYS.map(body=>{
  const az=p.selected.series[`${body}_azimuth_deg`][p.time]*Math.PI/180,el=p.selected.series[`${body}_elevation_deg`][p.time]*Math.PI/180,lon=p.selected.position.longitude_deg*Math.PI/180;
  const [x,z]=horizontal(az,lon);
  return {body,visible:p.selected.series[`${body}_visible`][p.time],dir:[x*RAY*Math.cos(el),Math.sin(el)*RAY,z*RAY*Math.cos(el)]};
 });
 const add=(a:[number,number,number],b:[number,number,number]):[number,number,number]=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
 const head=add(ground,[0,MAST_BASE+p.selected.height_m*MAST_PER_M,0]);
 const hoverRays:TerrainRay[]=rays.map(r=>({id:r.body,points:[head,add(head,r.dir)],label:`${BODY_LABELS[r.body]} sightline`,visible:r.visible,color:r.visible?C[r.body]:BLOCKED_COLOR,detail:`Elevation ${p.selected.series[`${r.body}_elevation_deg`][p.time].toFixed(2)}° · Horizon ${p.selected.series[`${r.body}_horizon_deg`][p.time].toFixed(2)}°`}));
 if(!atLander) hoverRays.push({id:'link',points:[add(lander,[0,.02,0]),add(ground,[0,MAST_BASE,0])],label:'Lander ↔ station',visible:p.linkVisible,color:p.linkVisible?C.ok:BLOCKED_COLOR});
 const labelPositions:[number,number,number][]=[add(head,[0,.09,0]),...rays.map(r=>add(head,[r.dir[0],r.dir[1]+.06,r.dir[2]]))];
 if(!atLander) labelPositions.push(add(lander,[0,.1,0]));
 const sunLight=rays[0].dir.map(v=>v*5) as [number,number,number];
 const [nx,nz]=horizontal(0,p.lander.longitude_deg*Math.PI/180);
 const compass:[number,number,number]=[-extent*.42,surfaceAt(land,-extent*.42,extent*.42)+.03,extent*.42];
 // Stars travel with the camera, oriented as on the landing, and draw first so the true-scale globe occludes them.
 const stars=useMemo(()=>{const s=starfield();s.renderOrder=-1;(s.material as THREE.PointsMaterial).depthTest=false;return s;},[]);
 useEffect(()=>{stars.quaternion.copy(p.frame.rotation);},[stars,p.frame]);
 useFrame(({camera})=>{stars.position.copy(camera.position);});
 const progress=useRef(1);
 const surface=<Surface ground={land} tile={tile} wireframe={p.wireframe} onPick={pick}/>;
 return <><Camera mapView={p.mapView} reset={p.reset} controls={controls} approach={p.approach} focus={p.focus} frame={p.frame} progress={progress}/>
  <primitive object={stars}/>
  <Lights sun={sunLight} frame={p.frame} progress={progress}/>
  <GlobeFallback fallback={surface}><Suspense fallback={null}><DrapedSite ground={land} tile={tile} wireframe={p.wireframe} onPick={pick}/></Suspense></GlobeFallback>
  {p.positions.map(o=>{const feasible=p.feasible?.has(o.id),rec=o.id===p.recommended,radius=feasible?.017:.012;return o.id===p.selected.candidate_id?null:<group key={o.id} position={point(o.position,2)}>
   <mesh><sphereGeometry args={[radius,14,14]}/><meshBasicMaterial color={feasible?C.feasible:C.candidate} transparent opacity={feasible?1:.75}/></mesh>
   <mesh visible={false}
    onPointerMove={e=>{if(orbiting.current||e.pointerType==='touch')return;e.stopPropagation();if(hovered!==o.id)setHovered(o.id);}}
    onPointerOut={()=>setHovered(h=>h===o.id?null:h)}
    onClick={e=>{e.stopPropagation();select(o.id);}}>
    <sphereGeometry args={[Math.max(radius,.023),8,8]}/><meshBasicMaterial/>
   </mesh>
   {rec&&<mesh rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.03,.038,32]}/><meshBasicMaterial color={C.recommended} side={THREE.DoubleSide}/></mesh>}
  </group>;})}
  {preview&&<PositionHighlight label={preview.label} position={point(preview.position,2)}/>}
  <group position={lander}><mesh position={[0,.02,0]}><boxGeometry args={[.036,.04,.036]}/><meshStandardMaterial color={C.lander} emissive="#5a5a5a"/></mesh>{!atLander&&<Label position={[0,.1,0]} text={`LANDER · ${p.lander.name.toUpperCase()}`}/>}</group>
  <Station ground={ground} height={p.selected.height_m} rays={rays} label={`${atLander?'LANDER + STATION':'STATION'} · ${p.selected.height_m} M MAST`} linkTo={atLander?null:[lander[0],lander[1]+.02,lander[2]]} linkVisible={p.linkVisible}/>
  <group position={compass}>
   <Line points={[[0,0,0],[nx*.16,0,nz*.16]]} color="#D4D4D4" lineWidth={1.6}/>
   <mesh position={[nx*.16,0,nz*.16]} rotation={[0,Math.atan2(nx,nz),0]}><coneGeometry args={[.016,.04,12]} /><meshBasicMaterial color="#D4D4D4"/></mesh>
   <Label position={[nx*.24,.03,nz*.24]} text="N · LOCAL" size={.06} color="#D4D4D4"/>
  </group>
  <TerrainRayHover rays={hoverRays} labels={labelPositions} orbiting={orbiting} candidateHovered={Boolean(preview)} onHover={p.onRayHover}/>
  <OrbitControls ref={controls} makeDefault minDistance={.6} maxDistance={MAX_KM} maxPolarAngle={Math.PI*.49} enableDamping dampingFactor={.1}
   onStart={()=>{orbiting.current=true;setHovered(null);p.onRayHover(null);}} onChange={()=>p.onRayHover(null)} onEnd={()=>{orbiting.current=false;}}/>
 </>;
}
const TerrainCanvas=memo(function TerrainCanvas(props:SceneProps){
 return <Canvas frameloop={props.active?'always':'never'} camera={{fov:FOV,near:.01,far:100}} dpr={[1,1.75]} gl={{antialias:true}} onCreated={({gl})=>{gl.toneMappingExposure=1.05;gl.setClearColor('#050505',1);}}><Suspense fallback={null}><Scene {...props}/></Suspense></Canvas>;
});

export default function TerrainView(props:Props){
 const [tip,setTip]=useState<TerrainRayTip|null>(null);
 return <div className="terrain-view">
  <TerrainCanvas {...props} onRayHover={setTip}/>
  {tip&&<TerrainRayTooltip tip={tip}/>}
 </div>;
}
