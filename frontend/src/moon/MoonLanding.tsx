import {Component,Suspense,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode,type RefObject} from 'react';
import {Canvas,useFrame,useLoader,useThree,type ThreeEvent} from '@react-three/fiber';
import {OrbitControls} from '@react-three/drei';
import * as THREE from 'three';
import {ArrowRight} from 'lucide-react';
import type {Site} from '../lib/science';
import {VERTICAL_EXAGGERATION} from '../TerrainView';
import {angularDistanceDeg,buildMoon,easeInOutCubic,latLonToVec,setMoonOpacity,vecToLatLon} from './globe';
import {starfield} from './stars';

export type MoonMode='globe'|'in'|'site'|'out';

type Pose={position:THREE.Vector3;target:THREE.Vector3};
const FLIGHT_MS=3200,RETURN_MS=1800;
// Flight timeline: approach on the globe, fade the globe to stars, then the site terrain takes over.
const T_GLOBE_END=.62,T_GLOBE_HIDE=.74;
const SITE_RADIUS_DEG=4;
// The globe zoom stops before the 32 ppd polar mosaic and the equirectangular pole start to smear.
const MIN_DISTANCE=1.58,MAX_DISTANCE=8,FOV=42;
const SUN_DIR:[number,number,number]=[.35,.04,1];
const WORDS=['No','One','Two','Three','Four','Five','Six'];
const coordinate=(n:number)=>Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:5,maximumFractionDigits:5});
export const siteCoordinates=(s:Site)=>`${coordinate(s.latitude_deg)}° S · ${coordinate(s.longitude_deg)}° W`;

// Keeps the globe radius near 44% of the shorter viewport side, so portrait screens see the whole Moon.
const introDistance=(w:number,h:number)=>{const k=h/2/Math.tan(FOV/2*Math.PI/180)/(.44*Math.min(w,h));return Math.max(3.15,Math.hypot(1,k));};
const introPose=(w:number,h:number):Pose=>({position:latLonToVec(-36,-18,introDistance(w,h)),target:new THREE.Vector3()});
const approachPose=(s:Site):Pose=>({position:latLonToVec(-71.5,s.longitude_deg,1.78),target:latLonToVec(s.latitude_deg,s.longitude_deg,.92)});
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

function arcPose(t:number,a:Pose,b:Pose):Pose{
 const k=easeInOutCubic(THREE.MathUtils.clamp(t,0,1));
 const position=new THREE.Vector3().lerpVectors(a.position,b.position,k);
 const lift=a.position.clone().add(b.position).normalize().multiplyScalar(Math.max(a.position.length(),b.position.length())*.18*Math.sin(Math.PI*k));
 return {position:position.add(lift),target:new THREE.Vector3().lerpVectors(a.target,b.target,k)};
}

type SceneProps={sites:Site[];mode:MoonMode;pins:RefObject<(HTMLElement|null)[]>;tooltip:RefObject<HTMLDivElement|null>;loadingText:string|null;onLoaded:()=>void;onFly:(id:string)=>void;onTile:()=>void;onArrive:()=>void;onLeft:()=>void};

function Globe(p:SceneProps){
 const [color,polar,relief]=useLoader(THREE.TextureLoader,['/moon/lroc_wac_gray.jpg','/moon/wac_south_summer.jpg','/moon/ldem_4_displacement.png']);
 const {gl,camera,size}=useThree();
 const moon=useMemo(()=>buildMoon(color,polar,relief,gl.capabilities.getMaxAnisotropy()),[color,polar,relief,gl]);
 const stars=useMemo(()=>starfield(),[]);
 const controls=useRef<any>(null);
 const flight=useRef<{mode:'in'|'out';t0:number;from:Pose;tile:boolean;done:boolean}|null>(null);
 const opacity=useRef(1);
 const callbacks=useRef(p);
 callbacks.current=p;
 const lead=p.sites[0];
 const intro=useMemo(()=>introPose(size.width,size.height),[size.width,size.height]);
 const placed=useRef(false);
 useEffect(()=>{p.onLoaded();},[]);
 useLayoutEffect(()=>{
  const cam=camera as THREE.PerspectiveCamera;
  if(size.height>size.width)cam.setViewOffset(size.width,size.height,0,-size.height*.07,size.width,size.height);else cam.clearViewOffset();
  cam.updateProjectionMatrix();
  if(!placed.current&&p.mode==='globe'){placed.current=true;camera.position.copy(intro.position);camera.lookAt(intro.target);controls.current?.update();}
 },[camera,size.width,size.height,intro]);
 useEffect(()=>{
  if(p.mode==='in'||p.mode==='out'){
   flight.current={mode:p.mode,t0:performance.now(),from:{position:camera.position.clone(),target:controls.current?.target.clone()??new THREE.Vector3()},tile:false,done:false};
  } else {
   flight.current=null;
   opacity.current=1;
   setMoonOpacity(moon,1);
  }
  if(p.tooltip.current)p.tooltip.current.hidden=true;
 },[p.mode,camera,moon]);

 const apply=(pose:Pose)=>{
  camera.position.copy(pose.position);
  controls.current?.target.copy(pose.target);
  camera.lookAt(pose.target);
 };
 const fade=(o:number)=>{opacity.current=o;setMoonOpacity(moon,o);};

 const normal=new THREE.Vector3(),world=new THREE.Vector3(),toCamera=new THREE.Vector3();
 useFrame(()=>{
  const f=flight.current;
  if(f&&lead){
   const t=reducedMotion()?1:Math.min(1,(performance.now()-f.t0)/(f.mode==='in'?FLIGHT_MS:RETURN_MS));
   const approach=approachPose(lead);
   if(f.mode==='in'){
    if(t<=T_GLOBE_END){fade(1);apply(arcPose(t/T_GLOBE_END,f.from,approach));}
    else {apply(approach);fade(1-(t-T_GLOBE_END)/(T_GLOBE_HIDE-T_GLOBE_END));}
    if(t>=T_GLOBE_HIDE&&!f.tile){f.tile=true;callbacks.current.onTile();}
    if(t>=1&&!f.done){f.done=true;callbacks.current.onArrive();}
   } else {
    fade(Math.min(1,t/.25));
    apply(arcPose(t,approach,intro));
    if(t>=1&&!f.done){f.done=true;flight.current=null;callbacks.current.onLeft();}
   }
  }
  p.sites.forEach((s,i)=>{
   const el=p.pins.current?.[i];
   if(!el)return;
   world.copy(latLonToVec(s.latitude_deg,s.longitude_deg,1.012));
   normal.copy(world).normalize();
   toCamera.copy(camera.position).sub(world);
   const shown=opacity.current>.28&&normal.dot(toCamera)>0;
   const ndc=world.project(camera);
   el.style.visibility=shown?'visible':'hidden';
   el.style.transform=`translate(${((ndc.x+1)/2*size.width).toFixed(1)}px,${((1-ndc.y)/2*size.height).toFixed(1)}px)`;
  });
 });

 const nearest=(point:THREE.Vector3)=>{
  const at=vecToLatLon(point);
  return p.sites.map(s=>({s,d:angularDistanceDeg(at,{lat:s.latitude_deg,lon:s.longitude_deg})})).sort((a,b)=>a.d-b.d)[0];
 };
 const hover=(e:ThreeEvent<PointerEvent>)=>{
  const tip=p.tooltip.current;
  if(!tip)return;
  if(p.mode!=='globe'||e.buttons){tip.hidden=true;return;}
  gl.domElement.style.cursor='pointer';
  const near=nearest(e.point);
  if(near&&near.d<SITE_RADIUS_DEG&&!p.loadingText){tip.hidden=true;return;}
  tip.textContent=p.loadingText??'No analysis for this region yet';
  tip.style.transform=`translate(${e.nativeEvent.offsetX+14}px,${e.nativeEvent.offsetY+14}px)`;
  tip.hidden=false;
 };
 const leave=()=>{gl.domElement.style.cursor='';if(p.tooltip.current)p.tooltip.current.hidden=true;};
 const click=(e:ThreeEvent<MouseEvent>)=>{
  if(p.mode!=='globe'||e.delta>4||!lead||p.loadingText)return;
  const near=nearest(e.point);
  p.onFly(near&&near.d<SITE_RADIUS_DEG?near.s.id:lead.id);
 };

 return <>
  <primitive object={stars}/>
  <directionalLight position={SUN_DIR} intensity={2.35} color="#fff3e0"/>
  <ambientLight intensity={.045}/>
  <directionalLight position={[-1,-.2,-.4]} intensity={.08}/>
  <primitive object={moon.sphere}/>
  <primitive object={moon.cap}/>
  <mesh visible={false} onPointerMove={hover} onPointerOut={leave} onClick={click}><sphereGeometry args={[1.004,64,32]}/><meshBasicMaterial/></mesh>
  <OrbitControls ref={controls} makeDefault enabled={p.mode==='globe'} enablePan={false} enableDamping dampingFactor={.06}
   minDistance={p.mode==='globe'?MIN_DISTANCE:0} maxDistance={p.mode==='globe'?MAX_DISTANCE:Infinity}
   onStart={()=>{if(p.tooltip.current)p.tooltip.current.hidden=true;}}/>
 </>;
}

class GlobeBoundary extends Component<{children:ReactNode;onError:()=>void},{error:boolean}>{
 state={error:false};
 static getDerivedStateFromError(){return {error:true};}
 componentDidCatch(){this.props.onError();}
 render(){return this.state.error?<p className="moon-unavailable">The 3D Moon could not be rendered on this device. Use “Fly to Ridge A” to open the analysis.</p>:this.props.children;}
}

type Props={sites:Site[];ready:boolean;progress:number|null;error:string;mode:MoonMode;onFly:(id:string)=>void;onTile:()=>void;onArrive:()=>void;onLeft:()=>void};

export default function MoonLanding(p:Props){
 const pins=useRef<(HTMLElement|null)[]>([]);
 const tooltip=useRef<HTMLDivElement>(null);
 const lead=p.sites[0];
 const loadingText=p.ready?null:p.error?'Scientific data unavailable':`Loading cached NASA data${p.progress===null?'':` · ${Math.round(p.progress*100)}%`}`;
 const [loaded,setLoaded]=useState(false),[failed,setFailed]=useState(false);
 const onLoaded=()=>setLoaded(true);
 useEffect(()=>{
  if(!failed)return;
  if(p.mode==='in'){p.onTile();p.onArrive();}
  else if(p.mode==='out')p.onLeft();
 },[failed,p.mode]);
 const count=WORDS[p.sites.length]??String(p.sites.length);
 return <div className={`moon-layer is-${p.mode} ${loaded?'is-loaded':''}`} inert={p.mode==='site'} aria-hidden={p.mode==='site'}>
  <GlobeBoundary onError={()=>{setLoaded(true);setFailed(true);}}>
   <Canvas className="moon-canvas" frameloop={p.mode==='site'?'never':'always'} dpr={[1,2]} camera={{fov:FOV,near:.02,far:80,position:latLonToVec(-36,-18,3.15).toArray()}}
    gl={{antialias:true,powerPreference:'high-performance'}} onCreated={({gl})=>{gl.setClearColor('#050505',1);gl.toneMappingExposure=1.05;}}>
    <Suspense fallback={null}>
     <Globe sites={p.sites} mode={p.mode} pins={pins} tooltip={tooltip} loadingText={loadingText} onLoaded={onLoaded} onFly={p.onFly} onTile={p.onTile} onArrive={p.onArrive} onLeft={p.onLeft}/>
    </Suspense>
   </Canvas>
  </GlobeBoundary>
  <div className="moon-vignette" aria-hidden="true"/>
  <div className="moon-pins">
   {p.sites.map((s,i)=><button key={s.id} ref={el=>{pins.current[i]=el;}} type="button" className={`moon-pin pin-${i===0?'a':'b'}`} onClick={()=>p.onFly(s.id)} disabled={!p.ready} aria-label={`Fly to ${s.name}, Connecting Ridge, ${siteCoordinates(s)}`}>
    <span className="pin-dot" aria-hidden="true"/>
    <span className="pin-card glass" aria-hidden="true"><b>{s.name}</b><span>Connecting Ridge · Site01</span><span>{siteCoordinates(s)}</span></span>
   </button>)}
  </div>
  <div ref={tooltip} className="moon-tooltip glass" role="tooltip" hidden/>
  <section className="moon-copy" aria-labelledby="moon-title">
   <h2 id="moon-title">{p.sites.length?`${count} analyzed sites on Connecting Ridge.`:'Analyzed sites on Connecting Ridge.'}</h2>
   <p className="lede">Drag to rotate the whole Moon and scroll to zoom. Click anywhere on the globe to fly to {lead?.name??'Ridge A'}, the working site on Connecting Ridge. Pins mark the sites with cached analysis.</p>
   <div className="moon-actions">
    <button type="button" className="cta" onClick={()=>lead&&p.onFly(lead.id)} disabled={!p.ready}>{p.ready&&lead?`Fly to ${lead.name}`:'Fly to Ridge A'}<ArrowRight size={16}/></button>
    {loadingText&&<p className="moon-progress" role="status">{p.error?<>{loadingText}. {p.error}</>:loadingText}</p>}
   </div>
  </section>
  <p className="moon-caption">LROC WAC mosaic · NASA LOLA relief ×{VERTICAL_EXAGGERATION} · drag to rotate · scroll to zoom</p>
  <div className="moon-loading" aria-hidden="true"><span>Loading the Moon</span></div>
 </div>;
}
