import {Component,Suspense,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode,type RefObject} from 'react';
import {Canvas,useFrame,useLoader,useThree,type ThreeEvent} from '@react-three/fiber';
import {OrbitControls} from '@react-three/drei';
import * as THREE from 'three';
import {ArrowRight} from 'lucide-react';
import type {Site} from '../lib/science';
import {VERTICAL_EXAGGERATION} from '../TerrainView';
import {MOON_LIGHTS,MOON_TEXTURES,angularDistanceDeg,buildMoon,easeInOutCubic,latLonToVec,setMoonOpacity,vecToLatLon} from './globe';
import {APPROACH_KM,LANDING_FOV as FOV,horizonPose,type Pose,type SiteFrame} from './frame';
import {starfield} from './stars';
import {TAGLINE} from '../brand';

export type MoonMode='globe'|'in'|'site'|'out';

// November 2026, Ridge A, body-centre visibility over 720 h (see README, "The reproducible discovery").
const LANDING_STATS=[
 {label:'Solar exposure',tone:'sun',from:'426',to:'720',delta:'+69%',better:true},
 {label:'Earth visibility',tone:'earth',from:'199',to:'359.5',delta:'+81%',better:true},
 {label:'Longest outage',tone:'both',from:'465',to:'342.5',delta:'−26%',better:true},
];

// Flight: arc to a pose high over the pole that the site view shares exactly, hold it while the
// site canvas crossfades in on top, then the site view continues the dive on the same globe.
const ARC_MS=2000,CROSSFADE_MS=450,RETURN_MS=1800;
const SITE_RADIUS_DEG=4;
// The globe zoom stops before the 32 ppd polar mosaic and the equirectangular pole start to smear.
const MIN_DISTANCE=1.58,MAX_DISTANCE=8;
const coordinate=(n:number)=>Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:5,maximumFractionDigits:5});
export const siteCoordinates=(s:Site)=>`${coordinate(s.latitude_deg)}° S · ${coordinate(s.longitude_deg)}° W`;

// Keeps the globe radius near 44% of the shorter viewport side, so portrait screens see the whole Moon.
const introDistance=(w:number,h:number)=>{const k=h/2/Math.tan(FOV/2*Math.PI/180)/(.44*Math.min(w,h));return Math.max(3.15,Math.hypot(1,k));};
const introPose=(w:number,h:number):Pose=>({position:latLonToVec(-36,-18,introDistance(w,h)),target:new THREE.Vector3()});
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
// On wide landscape screens the globe sits right of centre so the copy never lies on it (mirrored by .moon-placeholder).
const landingShift=(w:number,h:number)=>w>=960&&w/h>=1.2?THREE.MathUtils.clamp((w/2-.44*Math.min(w,h)-8)/w,0,.16):0;
// Tall phones lower it below the copy for the same reason.
const landingDrop=(w:number,h:number)=>h/w>=1.6?.09:0;

// The approach looks at the tile with the site's local up, which is upside down from the landing's north-up view.
function approachPose(frame:SiteFrame){
 const pose={position:frame.toLanding(horizonPose(APPROACH_KM,frame,FOV).position),target:frame.toLanding(new THREE.Vector3())};
 const look=(up:THREE.Vector3)=>new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pose.position,pose.target,up));
 const d=look(new THREE.Vector3(0,1,0)).invert().multiply(look(frame.upInLanding));
 let roll=2*Math.atan2(d.z,d.w);
 if(roll>Math.PI)roll-=2*Math.PI;else if(roll<-Math.PI)roll+=2*Math.PI;
 return {...pose,roll};
}

function arcPose(t:number,a:Pose,b:Pose):Pose{
 const k=easeInOutCubic(THREE.MathUtils.clamp(t,0,1));
 const position=new THREE.Vector3().lerpVectors(a.position,b.position,k);
 const lift=a.position.clone().add(b.position).normalize().multiplyScalar(Math.max(a.position.length(),b.position.length())*.18*Math.sin(Math.PI*k));
 return {position:position.add(lift),target:new THREE.Vector3().lerpVectors(a.target,b.target,k)};
}

type SceneProps={sites:Site[];frame:SiteFrame|null;mode:MoonMode;pins:RefObject<(HTMLElement|null)[]>;tooltip:RefObject<HTMLDivElement|null>;loadingText:string|null;onLoaded:()=>void;onFly:(id:string)=>void;onTile:()=>void;onArrive:()=>void;onLeft:()=>void};

function Globe(p:SceneProps){
 const [color,polar,relief]=useLoader(THREE.TextureLoader,MOON_TEXTURES);
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
 const approach=useMemo(()=>p.frame&&approachPose(p.frame),[p.frame]);
 const placed=useRef(false);
 useEffect(()=>{p.onLoaded();},[]);
 // k=1 keeps the globe framed for the landing copy; k=0 is the centred frame the site view shares.
 const shift=useRef(-1);
 const frameFor=(k:number)=>{
  const cam=camera as THREE.PerspectiveCamera;
  const x=-size.width*landingShift(size.width,size.height)*k;
  if(size.height>size.width)cam.setViewOffset(size.width,size.height,0,-size.height*(.07+landingDrop(size.width,size.height)*k),size.width,size.height);
  else if(x)cam.setViewOffset(size.width,size.height,x,0,size.width,size.height);
  else cam.clearViewOffset();
  cam.updateProjectionMatrix();
  shift.current=k;
 };
 useLayoutEffect(()=>{
  frameFor(p.mode==='globe'?1:shift.current<0?1:shift.current);
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

 const apply=(pose:Pose,roll=0)=>{
  camera.position.copy(pose.position);
  controls.current?.target.copy(pose.target);
  camera.lookAt(pose.target);
  if(roll)camera.rotateZ(roll);
 };
 const fade=(o:number)=>{opacity.current=o;setMoonOpacity(moon,o);};

 const normal=new THREE.Vector3(),world=new THREE.Vector3(),toCamera=new THREE.Vector3();
 useFrame(()=>{
  const f=flight.current;
  if(f&&!approach){
   if(!f.done){f.done=true;flight.current=null;if(f.mode==='in'){callbacks.current.onTile();callbacks.current.onArrive();}else callbacks.current.onLeft();}
  } else if(f&&approach){
   const elapsed=reducedMotion()?Infinity:performance.now()-f.t0;
   if(f.mode==='in'){
    const t=Math.min(1,elapsed/ARC_MS);
    fade(1);frameFor(1-easeInOutCubic(t));apply(arcPose(t,f.from,approach),approach.roll*easeInOutCubic(t));
    if(t>=1&&!f.tile){f.tile=true;callbacks.current.onTile();}
    if(elapsed>=ARC_MS+CROSSFADE_MS&&!f.done){f.done=true;callbacks.current.onArrive();}
   } else {
    const t=Math.min(1,elapsed/RETURN_MS);
    fade(Math.min(1,t/.25));
    frameFor(easeInOutCubic(t));
    apply(arcPose(t,approach,intro),approach.roll*(1-easeInOutCubic(t)));
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
  <directionalLight position={MOON_LIGHTS.sun.position} intensity={MOON_LIGHTS.sun.intensity} color={MOON_LIGHTS.sun.color}/>
  <ambientLight intensity={MOON_LIGHTS.ambient}/>
  <directionalLight position={MOON_LIGHTS.back.position} intensity={MOON_LIGHTS.back.intensity}/>
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

type Props={sites:Site[];frame:SiteFrame|null;ready:boolean;progress:number|null;error:string;mode:MoonMode;onFly:(id:string)=>void;onCompare:()=>void;onTile:()=>void;onArrive:()=>void;onLeft:()=>void};

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
 return <div className={`moon-layer is-${p.mode} ${loaded?'is-loaded':''}`} inert={p.mode==='site'} aria-hidden={p.mode==='site'}>
  <GlobeBoundary onError={()=>{setLoaded(true);setFailed(true);}}>
   <Canvas className="moon-canvas" frameloop={p.mode==='site'?'never':'always'} dpr={[1,2]} camera={{fov:FOV,near:.02,far:80,position:latLonToVec(-36,-18,3.15).toArray()}}
    gl={{antialias:true,powerPreference:'high-performance'}} onCreated={({gl})=>{gl.setClearColor('#0e0d0c',1);gl.toneMappingExposure=1.05;}}>
    <Suspense fallback={null}>
     <Globe sites={p.sites} frame={p.frame} mode={p.mode} pins={pins} tooltip={tooltip} loadingText={loadingText} onLoaded={onLoaded} onFly={p.onFly} onTile={p.onTile} onArrive={p.onArrive} onLeft={p.onLeft}/>
    </Suspense>
   </Canvas>
  </GlobeBoundary>
  <div className="moon-vignette" aria-hidden="true"/>
  <div className="moon-scrim" aria-hidden="true"/>
  <div className="moon-pins">
   {p.sites.map((s,i)=><button key={s.id} ref={el=>{pins.current[i]=el;}} type="button" className={`moon-pin pin-${i===0?'a':'b'}`} onClick={()=>p.onFly(s.id)} disabled={!p.ready} aria-label={`Fly to ${s.name}, Connecting Ridge, ${siteCoordinates(s)}`}>
    <span className="pin-dot" aria-hidden="true"/>
    <span className="pin-card glass" aria-hidden="true"><b>{s.name}</b><span>Connecting Ridge · Site01</span><span>{siteCoordinates(s)}</span></span>
   </button>)}
  </div>
  <div ref={tooltip} className="moon-tooltip glass" role="tooltip" hidden/>
  <section className="moon-copy" aria-labelledby="moon-title">
   <p className="moon-tagline">{TAGLINE}</p>
   <h2 id="moon-title">A 5 m mast makes Ridge A work.</h2>
   <table className="moon-stats">
    <caption className="sr-only">Ridge A, November 2026: ground level compared with a 5 m mast</caption>
    <thead><tr><th scope="col">Ridge A · Nov 2026</th><th scope="col">0 m</th><th scope="col" aria-label="5 m mast">5 m</th><th scope="col"><span className="sr-only">Change</span></th></tr></thead>
    <tbody>
     {LANDING_STATS.map(r=><tr key={r.label} className={r.tone}>
      <th scope="row"><i aria-hidden="true"/>{r.label}</th>
      <td>{r.from}<small>h</small></td>
      <td><b>{r.to}</b><small>h</small></td>
      <td><span className={`delta ${r.better?'up':'down'}`}>{r.delta}</span></td>
     </tr>)}
    </tbody>
   </table>
   <div className="moon-actions">
    <div className="moon-action-buttons">
     <button type="button" className="cta" onClick={()=>lead&&p.onFly(lead.id)} disabled={!p.ready}>{p.ready&&lead?`Fly to ${lead.name}`:'Fly to Ridge A'}<ArrowRight size={16}/></button>
     <button type="button" className="secondary" onClick={p.onCompare}>Compare sites &amp; dates</button>
    </div>
    {loadingText&&<p className="moon-progress" role="status">{p.error?<>{loadingText}. {p.error}</>:loadingText}</p>}
   </div>
  </section>
  <p className="moon-caption">LROC WAC mosaic · NASA LOLA relief ×{VERTICAL_EXAGGERATION} · drag to rotate · scroll to zoom</p>
  <div className="moon-loading" aria-hidden="true"><div className="moon-placeholder"/><span>Loading the Moon</span></div>
 </div>;
}
