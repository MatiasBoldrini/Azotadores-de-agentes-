import {Component,createRef,useMemo,useRef,useEffect,useLayoutEffect,useState,memo,Suspense,type ComponentProps,type ComponentRef,type ReactNode,type RefObject} from 'react';
import {Canvas,ThreeEvent,addAfterEffect,useFrame,useLoader,useThree} from '@react-three/fiber';
import {Billboard,Html,OrbitControls,Line,useCursor} from '@react-three/drei';
import * as THREE from 'three';
import type {Analysis,Site,Terrain} from './lib/science';
import type {EvaluatedPosition} from './PositionPicker';
import {starfield} from './moon/stars';
import {MOON_LIGHTS,MOON_TEXTURES,POLAR_GRID,buildMoon,setMoonOpacity} from './moon/globe';
import {APPROACH_KM,LANDING_FOV,heroPose,horizonPose,type Pose,type SiteFrame} from './moon/frame';
import {SITE01_SIZE,useRegional,useSite01,useSurround,type DemLevel} from './site01';
import {TerrainRayHover,TerrainRayTooltip,type TerrainLine,type TerrainRay,type TerrainRayTip} from './TerrainRayHover';
import {createStationClickGuard} from './lib/stationClick';

export const VERTICAL_EXAGGERATION = 4;
// The mast glyph is stretched beyond the relief scale so that metre-scale heights read on a 2.5 km scene.
export const MAST_EXAGGERATION=12;
const MAST_BASE=.03,MAST_PER_M=MAST_EXAGGERATION/1000,RAY=.85;
const FOV=40,HERO_HFOV=72,MIN_FOV=46,MAX_FOV=66,DEG=Math.PI/180,MAX_KM=120,DESCENT_MS=2400;
// Frames are drawn on demand, so the first frame of an eased move sees the whole pause before it as its
// delta; it advances by one 60 Hz step instead.
const EASE_START=1/60;
const REGIONAL_WAIT_MS=1500;
// A frame the GPU has not drawn this long after it was sent means the device draws slower than it is asked to.
const SLOW_GPU_MS=100;
// Hillshade light, as azimuth from local north and altitude above the horizon.
const LIGHT_AZIMUTH=50,LIGHT_ALTITUDE=14;
// Shadow maps of the key light, finest first, as half-width and half-height (km) seen from the light, depth
// (km either side of the site along the light), map size and depth/normal bias. The first light carries the
// light; the others only cast the coarser shadows. The low sun flattens the ground to about a quarter of its
// width in light space, and casters far toward it can still reach the ground around the site.
const SHADOW_CASCADES=[{wide:12,tall:12,depth:100,map:4096,bias:-.00015,normalBias:.012},
 {wide:60,tall:30,depth:180,map:2048,bias:-.0002,normalBias:.06},{wide:330,tall:110,depth:340,map:4096,bias:-.0003,normalBias:.2}];
// The outer cascades add two shadow passes and lookups, so they only run with ?hq=1.
const shadowCascades=new URLSearchParams(location.search).get('hq')==='1'?SHADOW_CASCADES:SHADOW_CASCADES.slice(0,1);
// Every evaluated cell lies within 0.598 of the half-width, so the tile keeps its own samples well past them.
const TILE_BLEND=.92,LEVEL_BLEND=.85;
// Resting view: HERO_BACK km behind the site and HERO_RISE km above its mean level, high enough that the
// exaggerated ranges out to the horizon sink below the line of sight and the limb curves away under the sky;
// the frame reaches HERO_SKY° above the horizontal, past the highest body.
const HERO_BACK=12,HERO_RISE=6,HERO_SKY=9;
// Bodies are drawn on a sky shell around the camera at their apparent sizes (degrees).
const SKY_KM=100,SUN_DEG=.53,EARTH_DEG=1.9;
// The far plane always reaches past the polar grids' rim, which peaks can lift above the horizon.
const FAR_KM=450;
// Without the polar grids the Site01 disc ends in sight, so the landing globe fades out over this descent progress.
const GLOBE_FADE=[.6,.9];
// Camera altitudes (km) over which terrain and globe go back to the polar mosaic, so zooming out reads as the globe.
const OVERVIEW_KM=[40,160];
const fovFor=(aspect:number)=>THREE.MathUtils.clamp(2*Math.atan(Math.tan(HERO_HFOV/2*DEG)/aspect)/DEG,MIN_FOV,MAX_FOV);
const ALBEDO=new THREE.Color(.3,.295,.285);
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
 useFrame(({camera})=>{const o=g.current;if(o)o.scale.setScalar(THREE.MathUtils.clamp(camera.position.distanceTo(o.getWorldPosition(at))/MARKER_KM,.1,2.4));});
 return <group ref={g} position={position}>{children}</group>;
}

type Ground={terrain:Terrain;mean:number;frame:SiteFrame};
type Rect=[number,number,number,number];

export const terrainMean=(t:Terrain)=>{const z=t.elevation_m.flat().filter((x):x is number=>x!==null);return z.reduce((a,b)=>a+b,0)/z.length;};
// Polar stereographic metres to the scene: kilometres from the tile centre, relief at the labeled exaggeration, on the sphere.
function toScene({mean,frame}:Ground,x:number,y:number,h:number,out:Float32Array,k:number){
 const sx=(x-frame.centerPs[0])/1000,sz=-(y-frame.centerPs[1])/1000;
 out[k]=sx;out[k+1]=(h-mean)*VERTICAL_EXAGGERATION/1000-(sx*sx+sz*sz)/(2*frame.radiusKm);out[k+2]=sz;
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

// The largest disc around the tile centre inside a level's vertices (km).
const rimKm=(l:DemLevel,frame:SiteFrame)=>Math.min(...extent(l,frame).map(Math.abs))-l.px/2000;
// Each level's arrays are only needed until they reach the GPU; nothing reads them back (no raycasting).
function release(this:THREE.BufferAttribute){(this as {array:unknown}).array=null;}

// One DEM level as a grid of its pixel centres. Toward its border the relief eases into the next coarser
// surface (`outer`, elevation in metres at polar stereographic metres), so neighbouring levels meet without a step.
// With `clip` (km), samples beyond that radius of the tile centre move onto the circle, giving a round rim.
// Cells lying a full cell inside `inner` (the finer level, in scene km) are left out. The level comes back as
// CHUNKS x CHUNKS tiles sharing one set of buffers, so the parts out of view (or out of a shadow map) are culled.
const CHUNKS=8;
function demGeometry(l:DemLevel,ground:Ground,outer:((x:number,y:number)=>number)|null,blend:number,inner:Rect|null,clip=0,skirt=0){
 const n=l.n,count=n*n,edge=skirt?4*(n-1):0,pos=new Float32Array((count+edge)*3),half=(n-1)/2,[cx,cy]=ground.frame.centerPs;
 for(let i=0;i<n;i++)for(let j=0;j<n;j++){
  let x=l.x0+(j+.5)*l.px,y=l.y0-(i+.5)*l.px,h=l.data[i*n+j];
  const r=Math.hypot(x-cx,y-cy)/1000;
  if(clip&&r>clip){x=cx+(x-cx)*clip/r;y=cy+(y-cy)*clip/r;h=bilinear(l,x,y);}
  if(outer){const u=Math.max(Math.abs(j-half),Math.abs(i-half))/half;if(u>blend)h+=(outer(x,y)-h)*THREE.MathUtils.smootherstep(u,blend,1);}
  toScene(ground,x,y,h,pos,(i*n+j)*3);
 }
 const cell=l.px/1000,covered=(a:number)=>!!inner&&pos[a*3]>inner[0]+cell&&pos[a*3]<inner[1]-cell&&pos[a*3+2]>inner[2]+cell&&pos[a*3+2]<inner[3]-cell;
 const index=new Uint32Array((n-1)*(n-1)*6+edge*6),size=Math.ceil((n-1)/CHUNKS),ranges:{start:number;count:number;box:THREE.Box3}[]=[];let q=0;
 const v=new THREE.Vector3();
 for(let ci=0;ci<n-1;ci+=size)for(let cj=0;cj<n-1;cj+=size){
  const start=q;
  for(let i=ci;i<Math.min(ci+size,n-1);i++)for(let j=cj;j<Math.min(cj+size,n-1);j++){const a=i*n+j;if(covered(a)&&covered(a+n+1))continue;index.set([a,a+n,a+1,a+1,a+n,a+n+1],q);q+=6;}
  if(q===start)continue;
  const box=new THREE.Box3();
  for(let i=ci;i<=Math.min(ci+size,n-1);i++)for(let j=cj;j<=Math.min(cj+size,n-1);j++)box.expandByPoint(v.fromArray(pos,(i*n+j)*3));
  ranges.push({start,count:q-start,box});
 }
 if(skirt){
  // A skirt hangs from the rim so no gap opens against the globe while it is still in view.
  const ring=[...Array.from({length:n-1},(_,j)=>j),...Array.from({length:n-1},(_,i)=>i*n+n-1),...Array.from({length:n-1},(_,j)=>(n-1)*n+n-1-j),...Array.from({length:n-1},(_,i)=>(n-1-i)*n)];
  ring.forEach((a,s)=>{const b=count+s;pos.copyWithin(b*3,a*3,a*3+3);pos[b*3+1]-=skirt;});
  const start=q,box=new THREE.Box3();
  ring.forEach((a,s)=>{const b=ring[(s+1)%ring.length],c=count+s,d=count+(s+1)%ring.length;index.set([a,b,c,b,d,c],q);q+=6;box.expandByPoint(v.fromArray(pos,a*3)).expandByPoint(v.fromArray(pos,c*3));});
  ranges.push({start,count:q-start,box});
 }
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.BufferAttribute(pos,3));
 g.setIndex(new THREE.BufferAttribute(index.slice(0,q),1));
 g.computeVertexNormals();
 const shared=[g.index,g.attributes.position,g.attributes.normal] as THREE.BufferAttribute[];
 for(const a of shared)a.onUpload(release);
 return ranges.map(({start,count,box})=>{
  const c=new THREE.BufferGeometry();
  c.setIndex(shared[0]);c.setAttribute('position',shared[1]);c.setAttribute('normal',shared[2]);
  c.setDrawRange(start,count);
  c.boundingBox=box;c.boundingSphere=box.getBoundingSphere(new THREE.Sphere());
  return c;
 });
}

// The snapshot's 20 m grid: the click target, the wireframe and the fallback before the 5 m tile arrives.
function snapshotGeometry(ground:Ground){
 const {terrain,mean}=ground,n=terrain.original_shape[0],s=terrain.stride,rows=terrain.elevation_m.length,cols=terrain.elevation_m[0].length;
 const row=(i:number)=>i===rows-1?n-1:i*s,col=(j:number)=>j===cols-1?n-1:j*s,km=terrain.pixel_size_m/1000,pos=new Float32Array(rows*cols*3);
 for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
  const x=(col(j)-n/2)*km,z=(row(i)-n/2)*km,k=(i*cols+j)*3;
  pos[k]=x;pos[k+1]=((terrain.elevation_m[i][j]??mean)-mean)*VERTICAL_EXAGGERATION/1000-(x*x+z*z)/(2*ground.frame.radiusKm);pos[k+2]=z;
 }
 const index:number[]=[];
 for(let i=0;i<rows-1;i++)for(let j=0;j<cols-1;j++){const a=i*cols+j;index.push(a,a+cols,a+1,a+1,a+cols,a+cols+1);}
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setIndex(index);g.computeVertexNormals();
 return g;
}

// Seen from orbit the terrain wears the globe's polar mosaic, yielding to the neutral albedo exactly as the
// globe does (where a texel is magnified, as `magnified` rises) and everywhere by the end of the descent.
type Mosaic={map:THREE.Texture;magnified:{value:number};centerPs:[number,number]};
const MOSAIC_GLSL=`vec2 polarTexels=fwidth(vPolarUv)*${POLAR_GRID.size.toFixed(1)};
 float neutral=max(siteMagnified*(1.0-smoothstep(.35,1.0,max(polarTexels.x,polarTexels.y))),smoothstep(.8,1.0,siteMagnified));
 diffuseColor.rgb=mix(texture2D(polarMap,vPolarUv).rgb,diffuseColor.rgb,neutral);`;

// The key light's shadow comes from the nested maps of SHADOW_CASCADES around the site, finest first, each easing
// into the next toward its edge; past the last one the terrain keeps only its hillshade, never a straight cut.
const CASCADE_GLSL=`#if defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS == 1 || NUM_DIR_LIGHT_SHADOWS == 3 )
#define TERRAIN_CASCADES
float cascadeEdge(vec4 c,float fade){vec3 p=c.xyz/c.w;return p.z>1.0?0.0:smoothstep(0.0,fade,min(min(p.x,1.0-p.x),min(p.y,1.0-p.y)));}
#define CASCADE(k) getShadow(directionalShadowMap[k],directionalLightShadows[k].shadowMapSize,directionalLightShadows[k].shadowIntensity,directionalLightShadows[k].shadowBias,directionalLightShadows[k].shadowRadius,vDirectionalShadowCoord[k])
float cascadeShadow(){
 #if NUM_DIR_LIGHT_SHADOWS == 3
 float fine=cascadeEdge(vDirectionalShadowCoord[0],.06);
 if(fine>=1.0)return CASCADE(0);
 float mid=cascadeEdge(vDirectionalShadowCoord[1],.06);
 float coarse=mid>=1.0?CASCADE(1):mid<=0.0?CASCADE(2):mix(CASCADE(2),CASCADE(1),mid);
 #else
 float fine=cascadeEdge(vDirectionalShadowCoord[0],.2);
 if(fine>=1.0)return CASCADE(0);
 float coarse=1.0;
 #endif
 return fine<=0.0?coarse:mix(coarse,CASCADE(0),fine);
}
#endif`;
const DIRECT_SHADOW='directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
const CASCADE_LIGHTS=THREE.ShaderChunk.lights_fragment_begin.replace(DIRECT_SHADOW,`#ifdef TERRAIN_CASCADES
		directLight.color *= ( directLight.visible && receiveShadow && UNROLLED_LOOP_INDEX == 0 ) ? cascadeShadow() : 1.0;
		#else
		${DIRECT_SHADOW}
		#endif`);

// Every terrain level shares one material, so the same albedo and light run unbroken across all of them;
// each coarser level is cut away where a finer one takes over.
function terrainMaterial(hole:Rect|null,offset:number,mosaic?:Mosaic){
 const m=new THREE.MeshStandardMaterial({color:ALBEDO,roughness:1,metalness:0,polygonOffset:offset>0,polygonOffsetFactor:offset,polygonOffsetUnits:offset});
 if(!hole&&!mosaic)return m;
 m.onBeforeCompile=shader=>{
  let vertex='',fragment='',main='';
  if(hole){
   shader.uniforms.hole={value:new THREE.Vector4(...hole)};
   fragment+='uniform vec4 hole;\n';
   main+=' if(vTerrainWorld.x>hole.x&&vTerrainWorld.x<hole.y&&vTerrainWorld.z>hole.z&&vTerrainWorld.z<hole.w)discard;\n';
  }
  if(mosaic){
   const {xmin,ymax,extent:e}=POLAR_GRID,[cx,cy]=mosaic.centerPs;
   shader.uniforms.polarMap={value:mosaic.map};
   shader.uniforms.siteMagnified=mosaic.magnified;
   shader.uniforms.polarFromScene={value:new THREE.Vector4((cx-xmin)/e,1000/e,1-(ymax-cy)/e,-1000/e)};
   vertex+='uniform vec4 polarFromScene;\nvarying vec2 vPolarUv;\n';
   fragment+='uniform sampler2D polarMap;\nuniform float siteMagnified;\nvarying vec2 vPolarUv;\n';
  }
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\nvarying vec3 vTerrainWorld;\n${vertex}`)
   .replace('#include <project_vertex>',`#include <project_vertex>\nvTerrainWorld=(modelMatrix*vec4(transformed,1.0)).xyz;${mosaic?'\nvPolarUv=vec2(polarFromScene.x+polarFromScene.y*vTerrainWorld.x,polarFromScene.z+polarFromScene.w*vTerrainWorld.z);':''}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 vTerrainWorld;\n${fragment}`)
   .replace('#include <shadowmap_pars_fragment>',`#include <shadowmap_pars_fragment>\n${CASCADE_GLSL}`)
   .replace('#include <lights_fragment_begin>',CASCADE_LIGHTS)
   .replace('void main() {',`void main() {\n${main}`)
   .replace('#include <map_fragment>',mosaic?`#include <map_fragment>\n ${MOSAIC_GLSL}`:'#include <map_fragment>');
 };
 m.customProgramCacheKey=()=>`terrain-${hole?'hole':''}-${mosaic?'mosaic':''}`;
 return m;
}

const noRaycast=()=>{};

// Compiles the programs of everything under `root`, hidden objects included, and uses each once. First use reads
// a program back from the GPU, so left to the first draw it would wait behind the terrain's draws.
function warmPrograms(gl:THREE.WebGLRenderer,root:THREE.Object3D,camera:THREE.Camera,scene:THREE.Scene){
 for(const m of gl.compile(root,camera,scene))for(const program of (gl.properties.get(m) as {programs?:Map<string,{getUniforms:()=>unknown}>}).programs?.values()??[])program.getUniforms();
}

// Clicks land on the drawn relief anywhere out to the rim: the ray is marched over the DEM levels the terrain is
// built from, finest first, since the GPU meshes keep no vertices to test.
function levelRaycast(ground:Ground,list:DemLevel[]){
 const {frame,mean}=ground,[cx,cy]=frame.centerPs,boxes=list.map(l=>extent(l,frame)),rim=rimKm(list[list.length-1],frame);
 const ray=new THREE.Ray(),inverse=new THREE.Matrix4(),p=new THREE.Vector3();
 const above=(t:number)=>{
  ray.at(t,p);
  const i=Math.hypot(p.x,p.z)>rim?-1:boxes.findIndex(([x0,x1,z0,z1])=>p.x>=x0&&p.x<=x1&&p.z>=z0&&p.z<=z1);
  return i<0?null:p.y-((bilinear(list[i],cx+p.x*1000,cy-p.z*1000)-mean)*VERTICAL_EXAGGERATION/1000-(p.x*p.x+p.z*p.z)/(2*frame.radiusKm));
 };
 return function(this:THREE.Mesh,raycaster:THREE.Raycaster,hits:THREE.Intersection[]){
  ray.copy(raycaster.ray).applyMatrix4(inverse.copy(this.matrixWorld).invert());
  const far=Math.min(raycaster.far,FAR_KM);
  for(let t=Math.max(raycaster.near,.001),before=above(t);t<far;){
   const next=t+Math.max(.004,t*.002),after=above(next);
   if(before!==null&&after!==null&&before>0&&after<=0){
    let a=t,b=next;
    for(let k=0;k<24;k++){const m=(a+b)/2,d=above(m);if(d!==null&&d>0)a=m;else b=m;}
    const point=ray.at(b,new THREE.Vector3()).applyMatrix4(this.matrixWorld);
    hits.push({distance:raycaster.ray.origin.distanceTo(point),point,object:this});
    return;
   }
   t=next;before=after;
  }
 };
}

type Levels={tile:DemLevel|null;surround:DemLevel[]|null;regional:DemLevel[]|null};
// Finest first: the 5 m tile, the rest of the Site01 GeoTIFF, then the PDS polar grids. Each level eases into
// the next toward its border and is cut where the finer one takes over; the coarsest ends in a round rim.
function useLevelGeometry(ground:Ground,{tile,surround,regional}:Levels){
 return useMemo(()=>{
  if(!tile||!surround)return null;
  const list=[tile,...surround,...regional??[]],last=list.length-1,rim=rimKm(list[last],ground.frame);
  return list.map((l,i)=>{
   const inner=i?extent(list[i-1],ground.frame,1.2*list[i-1].px/1000):null;
   const outer=i<last?(x:number,y:number)=>bilinear(list[i+1],x,y):null;
   return {chunks:demGeometry(l,ground,outer,i?LEVEL_BLEND:TILE_BLEND,inner,i===last?rim:0,i===last?Math.max(1.5,rim*.02):0),hole:inner,offset:i};
  });
 },[ground,tile,surround,regional]);
}

// Sends the levels' buffers to the GPU in one go, with empty draws into a 1 px target. Left to the levels' first
// frame, each upload would wait for the shadow pass to draw the level before it, holding the page that long.
function uploadLevels(gl:THREE.WebGLRenderer,camera:THREE.Camera,chunks:THREE.BufferGeometry[]){
 const scene=new THREE.Scene(),material=new THREE.MeshBasicMaterial(),target=new THREE.WebGLRenderTarget(1,1),ranges=chunks.map(c=>({...c.drawRange}));
 for(const c of chunks){c.setDrawRange(0,0);scene.add(Object.assign(new THREE.Mesh(c,material),{frustumCulled:false}));}
 const before=gl.getRenderTarget();
 gl.setRenderTarget(target);gl.render(scene,camera);gl.setRenderTarget(before);
 chunks.forEach((c,i)=>c.setDrawRange(ranges[i].start,ranges[i].count));
 material.dispose();target.dispose();
}

type TerrainPick=(r:number,c:number,event:MouseEvent)=>void;
function Surface({ground,levels,wireframe,onPick,mosaic}:{ground:Ground;levels:Levels;wireframe:boolean;onPick:TerrainPick;mosaic?:Mosaic}){
 const {terrain}=ground,n=terrain.original_shape[0],{gl,camera,scene}=useThree();
 // The levels' two programs are ready as soon as the imagery is, so the levels' first draw only uploads their
 // meshes. These materials hold the programs until then; released, the same programs would compile again.
 const warm=useMemo(()=>mosaic?[terrainMaterial(null,0,mosaic),terrainMaterial([0,0,0,0],1,mosaic)]:[],[mosaic]);
 useLayoutEffect(()=>{
  if(!warm.length)return;
  const g=new THREE.BufferGeometry(),root=new THREE.Group();
  for(const m of warm)root.add(new THREE.Mesh(g,m));
  warmPrograms(gl,root,camera,scene);
  return()=>{g.dispose();warm.forEach(m=>m.dispose());};
 },[warm,gl,camera,scene]);
 const coarse=useMemo(()=>snapshotGeometry(ground),[ground]);
 const meshes=useLevelGeometry(ground,levels);
 const materials=useMemo(()=>meshes?.map(m=>terrainMaterial(m.hole,m.offset,mosaic))??[],[meshes,mosaic]);
 const solid=useMemo(()=>terrainMaterial(null,0),[]);
 const {tile,surround,regional}=levels;
 const raycast=useMemo(()=>tile&&surround?levelRaycast(ground,[tile,...surround,...regional??[]]):THREE.Mesh.prototype.raycast,[ground,tile,surround,regional]);
 useEffect(()=>()=>coarse.dispose(),[coarse]);
 useEffect(()=>()=>{meshes?.forEach(m=>m.chunks.forEach(c=>c.dispose()));materials.forEach(m=>m.dispose());},[meshes,materials]);
 useLayoutEffect(()=>{if(meshes)uploadLevels(gl,camera,meshes.map(m=>m.chunks[0]));},[meshes,gl,camera]);
 // The light never moves, so the shadow map is drawn once per terrain.
 useEffect(()=>{gl.shadowMap.autoUpdate=false;gl.shadowMap.needsUpdate=true;},[gl,meshes,coarse]);
 const pick=(e:ThreeEvent<MouseEvent>)=>{e.stopPropagation();onPick(e.point.z*1000/terrain.pixel_size_m+n/2,e.point.x*1000/terrain.pixel_size_m+n/2,e.nativeEvent);};
 return <>
  {meshes?.flatMap((m,i)=>m.chunks.map((c,k)=><mesh key={`${i}-${k}`} geometry={c} material={materials[i]} raycast={noRaycast} castShadow receiveShadow/>))}
  <mesh geometry={coarse} material={wireframe?undefined:solid} onClick={pick} raycast={raycast} visible={wireframe||!meshes} castShadow receiveShadow position-y={meshes&&wireframe?.004:0}>
   {wireframe&&<meshBasicMaterial color="#d4d4d4" wireframe transparent opacity={.35}/>}
  </mesh>
 </>;
}

// The real Moon around the site, at true scale: the landing's LROC/LOLA globe, with the terrain's disc cut out
// and its imagery yielding to the terrain albedo wherever it would be magnified. It carries the descent; at rest
// it lies beyond the polar grids' horizon, or fades out if only the Site01 disc is there.
function ContextGlobe({frame,hole,fade,textures:[color,polar,relief],magnified,progress}:{frame:SiteFrame;hole:number;fade:boolean;textures:THREE.Texture[];magnified:{value:number};progress:RefObject<number>}){
 const {gl,camera,scene}=useThree(),group=useRef<THREE.Group>(null);
 const moon=useMemo(()=>buildMoon(color,polar,relief,gl.capabilities.getMaxAnisotropy(),{hole,neutral:ALBEDO.clone(),magnified}),[color,polar,relief,gl,hole,magnified]);
 // A view already at rest starts with the globe faded out; it turns opaque when the polar grids arrive. Its opaque
 // programs are compiled now, while the scene is light, rather than then.
 useLayoutEffect(()=>{
  if(!group.current)return;
  setMoonOpacity(moon,1);
  warmPrograms(gl,group.current,camera,scene);
 },[moon,gl,camera,scene]);
 useFrame(({camera})=>{
  const k=progress.current,altitude=camera.position.distanceTo(frame.center)-frame.radiusKm;
  magnified.value=k*(1-THREE.MathUtils.smoothstep(altitude,OVERVIEW_KM[0],OVERVIEW_KM[1]));
  setMoonOpacity(moon,fade?1-THREE.MathUtils.smoothstep(k,GLOBE_FADE[0],GLOBE_FADE[1]):1);
 });
 return <group ref={group} position={frame.center} quaternion={frame.rotation} scale={frame.scale}><primitive object={moon.sphere}/><primitive object={moon.cap}/></group>;
}

function SiteGround({ground,levels,progress,...rest}:{ground:Ground;levels:Levels;progress:RefObject<number>;wireframe:boolean;onPick:TerrainPick}){
 // Same URL list as the landing globe, so both canvases share one decoded copy of each texture.
 const textures=useLoader(THREE.TextureLoader,MOON_TEXTURES);
 const magnified=useMemo(()=>({value:0}),[]);
 const mosaic=useMemo<Mosaic>(()=>({map:textures[1],magnified,centerPs:ground.frame.centerPs}),[textures,magnified,ground.frame]);
 const {tile,surround,regional}=levels,outer=regional?.at(-1)??surround?.at(-1);
 const hole=tile&&outer?rimKm(outer,ground.frame)-2*outer.px/1000:tile?1.27:0;
 return <>
  <ContextGlobe frame={ground.frame} hole={hole} fade={!regional} textures={textures} magnified={magnified} progress={progress}/>
  <Surface ground={ground} levels={levels} mosaic={mosaic} {...rest}/>
 </>;
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
 const toward=useMemo(()=>frame.horizontal(LIGHT_AZIMUTH).multiplyScalar(Math.cos(LIGHT_ALTITUDE*DEG)).setY(Math.sin(LIGHT_ALTITUDE*DEG)),[frame]);
 const small=Math.min(window.innerWidth,window.innerHeight)<700;
 useFrame(()=>{
  const k=progress.current;
  rig.current?.children.forEach(o=>{const {base,site}=o.userData as {base:number;site:boolean};if(base!==undefined)(o as THREE.Light).intensity=base*(site?k:1-k);});
 });
 return <group ref={rig}>
  <hemisphereLight args={['#c3cbd4','#2a2826']} userData={{base:1.1,site:true}}/>
  {shadowCascades.map(({wide,tall,depth,map,bias,normalBias},i)=>{const size=small?map/2:map;return <directionalLight key={i} position={toward.clone().multiplyScalar(depth+10).toArray()} color="#fff4e6"
   userData={{base:i?0:3.2,site:true}} castShadow shadow-mapSize={[size,size]} shadow-camera-left={-wide} shadow-camera-right={wide} shadow-camera-top={tall} shadow-camera-bottom={-tall}
   shadow-camera-near={10} shadow-camera-far={2*depth+10} shadow-bias={bias} shadow-normalBias={normalBias*map/size}/>;})}
  <directionalLight position={moonSun} color={MOON_LIGHTS.sun.color} userData={{base:MOON_LIGHTS.sun.intensity,site:false}}/>
  <directionalLight position={moonBack} userData={{base:MOON_LIGHTS.back.intensity,site:false}}/>
  <ambientLight userData={{base:MOON_LIGHTS.ambient,site:false}}/>
 </group>;
}

// On demand, each change asks for a frame. On a GPU that falls behind, frames asked for while the last is still
// being drawn would queue up behind it; there they wait and go out as one once it is drawn, and eased moves
// cover the real time in one step instead of queuing small ones.
function usePacedFrames(){
 const {gl,get,set}=useThree(),slow=useRef(false);
 useEffect(()=>{
  const ctx=gl.getContext(),own=get().invalidate;
  if(!(ctx instanceof WebGL2RenderingContext))return;
  let fence:WebGLSync|null=null,sent=0,held=false,timer=0;
  const drawn=(f:WebGLSync)=>ctx.isContextLost()||ctx.getSyncParameter(f,ctx.SYNC_STATUS)===ctx.SIGNALED;
  const poll=()=>{
   timer=0;
   if(fence&&!drawn(fence)){timer=window.setTimeout(poll,10);return;}
   // The fence stays until the frame asked for here replaces it, so that frame's own requests wait for it too.
   if(fence)slow.current=performance.now()-sent>SLOW_GPU_MS;
   if(held){held=false;own();}
  };
  // A held frame is asked for from a timer, never from inside the loop, which drops requests while it winds down.
  set({invalidate:(frames?:number)=>{if(slow.current&&fence){held=true;if(!timer)timer=window.setTimeout(poll,10);return;}own(frames);}});
  // Only a fence still pending, or drawn soon after it was sent, tells the GPU's pace: frames on demand can be far apart.
  const off=addAfterEffect(()=>{
   const now=performance.now();
   if(fence){
    if(drawn(fence)){if(now-sent<SLOW_GPU_MS)slow.current=false;ctx.deleteSync(fence);fence=null;}
    else if(now-sent>SLOW_GPU_MS)slow.current=true;
   }
   if(!fence){fence=ctx.fenceSync(ctx.SYNC_GPU_COMMANDS_COMPLETE,0);sent=now;ctx.flush();}
  });
  return()=>{off();clearTimeout(timer);if(fence)ctx.deleteSync(fence);set({invalidate:own});if(held)own();};
 },[gl,get,set]);
 return slow;
}

function Camera({mapView,reset,controls,approach,focus,frame,progress,behind}:{mapView:boolean;reset:number;controls:React.RefObject<any>;approach:Approach;focus?:RefObject<HTMLElement|null>;frame:SiteFrame;progress:RefObject<number>;behind:RefObject<boolean>}){
 const {camera,gl,invalidate,frameloop}=useThree(),cam=camera as THREE.PerspectiveCamera;
 const aspect=useRef(16/9),goal=useRef<Pose>({position:new THREE.Vector3(),target:new THREE.Vector3()}),moving=useRef(false),easing=useRef(false),placed=useRef(false),descent=useRef<number|null>(null),view=useRef('');
 // A slow frame can deliver the tile hand-off and the arrival together, so leaving the hold always descends.
 const held=useRef(false);
 const home=():Pose=>heroPose(frame,fovFor(aspect.current),HERO_BACK,HERO_RISE,HERO_SKY);
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
  invalidate();
 },[approach,camera,controls,approachPose]);
 useEffect(()=>{
  if(!placed.current)return;
  const p=rest();goal.current.position.copy(p.position);goal.current.target.copy(p.target);
  moving.current=!busy();
  invalidate();
 },[camera,mapView,reset,controls]);
 // The view follows the stage between the panels, which can move without any prop or canvas size changing.
 useEffect(()=>{
  if(frameloop!=='demand')return;
  let id=0,last='';
  const watch=()=>{
   const c=gl.domElement.getBoundingClientRect(),f=focus?.current?.getBoundingClientRect();
   const key=[c.left,c.top,c.width,c.height,f?.left,f?.top,f?.width,f?.height].join();
   if(key!==last){last=key;invalidate();}
   id=requestAnimationFrame(watch);
  };
  id=requestAnimationFrame(watch);
  return()=>cancelAnimationFrame(id);
 },[frameloop,gl,focus,invalidate]);
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
   const step=Math.min(1,(easing.current||behind.current?dt:EASE_START)*5);
   camera.position.lerp(goal.current.position,step);
   controls.current?.target.lerp(goal.current.target,step);
   if(camera.position.distanceTo(goal.current.position)<.002){place(goal.current);moving.current=false;}
   controls.current?.update();
  }
  easing.current=moving.current;
  if(descent.current!==null||moving.current)invalidate();
  progress.current=k;
  const f=k<1?lerpRect(landingRect(),stage,k):stage,fov=THREE.MathUtils.lerp(LANDING_FOV,fovFor(aspect.current),k);
  const altitude=Math.max(.001,camera.position.distanceTo(frame.center)-frame.radiusKm);
  const near=THREE.MathUtils.clamp(altitude*.004,.002,10),far=Math.max(Math.sqrt(altitude*(2*frame.radiusKm+altitude))*1.25,FAR_KM);
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

function glowTexture(core:string,glow:string,disc:number){
 const size=128,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d')!,g=ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
 g.addColorStop(0,core);g.addColorStop(disc*.92,core);g.addColorStop(disc,glow);g.addColorStop(1,'rgba(0,0,0,0)');
 ctx.fillStyle=g;ctx.fillRect(0,0,size,size);
 const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;return t;
}

// The Sun and the Earth on the sky at their computed directions, shown only while the engine has them in view.
function SkyBodies({rays}:{rays:Ray[]}){
 const shell=useRef<THREE.Group>(null),{gl,camera,scene}=useThree();
 const looks=useMemo(()=>({
  sun:{texture:glowTexture('#fffaf0','rgba(255,196,107,.35)',.12),size:SUN_DEG/.12},
  earth:{texture:glowTexture('#9fdcff','rgba(143,211,255,.18)',.62),size:EARTH_DEG/.62},
 }),[]);
 useEffect(()=>()=>{looks.sun.texture.dispose();looks.earth.texture.dispose();},[looks]);
 // A body out of view is first drawn only when it comes into view, by then behind the terrain on the GPU.
 useLayoutEffect(()=>{if(shell.current)warmPrograms(gl,shell.current,camera,scene);},[gl,camera,scene]);
 useFrame(({camera})=>{shell.current?.position.copy(camera.position);});
 return <group ref={shell}>
  {rays.map(r=>{
   const d=new THREE.Vector3(...r.dir).normalize(),{texture,size}=looks[r.body],scale=2*SKY_KM*Math.tan(size/2*DEG);
   const p=d.clone().multiplyScalar(SKY_KM);
   // Hidden rather than unmounted while out of view, like the rays, so their shaders stay compiled.
   return <group key={r.body} visible={r.visible}>
    <sprite position={p} scale={[scale,scale,1]} renderOrder={60}><spriteMaterial map={texture} depthTest={false} depthWrite={false} transparent blending={THREE.AdditiveBlending}/></sprite>
    <Label position={[p.x,p.y+SKY_KM*(r.body==='earth'?.034:.03),p.z]} color={C[r.body]} size={.02} text={`${r.body==='sun'?'SUN':'EARTH'} · IN VIEW`}/>
   </group>;
  })}
 </group>;
}

type Point3=[number,number,number];
// drei's Line rebuilds its geometry and disposes its material whenever `points` is a new array, so every
// re-render recompiled the line shaders. This one keeps its first array and moves the vertices in place.
function SteadyLine({points,line,self,...rest}:Omit<ComponentProps<typeof Line>,'points'|'ref'>&{points:Point3[];line?:TerrainLine;self?:TerrainLine}){
 const own=useRef<ComponentRef<typeof Line>|null>(null),[first]=useState(points),flat=points.flat(),key=flat.join();
 useLayoutEffect(()=>{const l=own.current;if(!l)return;l.geometry.setPositions(flat);l.computeLineDistances();},[key]);
 return <Line ref={l=>{own.current=l;if(self)self.current=l;if(line)line.current=l;}} points={first} {...rest}/>;
}

// A thin ray from the mast head to where the body's disc sits on the sky shell around the camera. A body well
// away from the view direction keeps a short ray pointing at it instead.
function SkyRay({dir,color,line,shown}:{dir:[number,number,number];color:string;line:TerrainLine;shown:boolean}){
 const from=useMemo(()=>new THREE.Vector3(),[]),to=useMemo(()=>new THREE.Vector3(),[]),ahead=useMemo(()=>new THREE.Vector3(),[]),d=useMemo(()=>new THREE.Vector3(...dir).normalize(),[dir]);
 const self=useRef<ComponentRef<typeof Line>|null>(null);
 useFrame(({camera})=>{
  const l=self.current;if(!l?.parent)return;
  if(camera.getWorldDirection(ahead).dot(d)<.5)to.copy(d).multiplyScalar(RAY);
  else{l.parent.getWorldPosition(from);to.copy(camera.position).addScaledVector(d,SKY_KM).sub(from);}
  l.geometry.setPositions([0,0,0,to.x,to.y,to.z]);
 });
 return <SteadyLine self={self} line={shown?line:undefined} visible={shown} points={[[0,0,0],d.clone().multiplyScalar(RAY).toArray()]} color={color} lineWidth={1.6} depthTest={false} depthWrite={false} transparent opacity={.9} renderOrder={50} frustumCulled={false}/>;
}

function Station({ground,height,label,rays,lines,linkTo,linkVisible,behind}:{ground:[number,number,number];height:number;label:string;rays:Ray[];lines:Record<TerrainRay['id'],TerrainLine>;linkTo:[number,number,number]|null;linkVisible:boolean;behind:RefObject<boolean>}){
 const mast=useRef<THREE.Mesh>(null),head=useRef<THREE.Group>(null),level=useRef(MAST_BASE+height*MAST_PER_M),easing=useRef(false);
 const target=MAST_BASE+height*MAST_PER_M,invalidate=useThree(s=>s.invalidate);
 useFrame((_,dt)=>{
  const moving=level.current!==target;
  if(moving){
   level.current+= (target-level.current)*Math.min(1,(easing.current||behind.current?dt:EASE_START)*6);
   if(Math.abs(target-level.current)<1e-4) level.current=target;
   invalidate();
  }
  easing.current=moving;
  if(mast.current){mast.current.scale.y=level.current;mast.current.position.y=level.current/2;}
  if(head.current) head.current.position.y=level.current;
 });
 return <group position={ground}>
  <ScreenScale position={[0,.002,0]}><mesh rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.03,.042,40]}/><meshBasicMaterial color={C.station} transparent opacity={.75} side={THREE.DoubleSide}/></mesh></ScreenScale>
  <mesh ref={mast}><cylinderGeometry args={[.0045,.0045,1,10]}/><meshBasicMaterial color={C.station}/></mesh>
  <group ref={head}>
   <mesh><octahedronGeometry args={[.024]}/><meshBasicMaterial color={C.station}/></mesh>
   {/* In-view rays run out to the body's disc on the sky; blocked rays stay short and draw over the terrain.
       Both forms stay mounted, so a body coming into or out of view never releases and recompiles their shaders. */}
   {rays.map(({body,dir,visible})=><group key={body}>
    <SkyRay dir={dir} color={C[body]} line={lines[body]} shown={visible}/>
    <group visible={!visible}>
     <SteadyLine line={visible?undefined:lines[body]} points={[[0,0,0],dir]} color={BLOCKED_COLOR} lineWidth={2.5} depthTest={false} depthWrite={false} transparent renderOrder={70}/>
     <mesh position={dir} renderOrder={71}><sphereGeometry args={[.016,16,16]}/><meshBasicMaterial color={BLOCKED_COLOR} depthTest={false} transparent/></mesh>
     <Label position={[dir[0],dir[1]+.06,dir[2]]} color={BLOCKED_COLOR} size={.018} text={`${body==='sun'?'SUN':'EARTH'} · BLOCKED`}/>
    </group>
   </group>)}
   <Label position={[0,.09,0]} color={C.station} text={label}/>
  </group>
  {linkTo&&<SteadyLine line={lines.link} points={[[0,MAST_BASE,0],[linkTo[0]-ground[0],linkTo[1]-ground[1],linkTo[2]-ground[2]]]} color={linkVisible?C.ok:BLOCKED_COLOR} lineWidth={1.4} dashed={!linkVisible} dashSize={.03} gapSize={.02}/>}
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
 const lines=useMemo(()=>({sun:createRef<ComponentRef<typeof Line>>(),earth:createRef<ComponentRef<typeof Line>>(),link:createRef<ComponentRef<typeof Line>>()}),[]);
 const [hovered,setHovered]=useState<string|null>(null);
 const orbiting=useRef(false);
 useCursor(hovered!==null);
 const mean=useMemo(()=>terrainMean(p.terrain),[p.terrain]);
 const land=useMemo<Ground>(()=>({terrain:p.terrain,mean,frame:p.frame}),[p.terrain,mean,p.frame]);
 const tileData=useSite01(),loadedSurround=useSurround(),regional=useRegional();
 // The Site01 levels wait briefly for the polar grids, so on a normal connection the terrain is built and
 // uploaded once with every level instead of twice.
 const [waiting,setWaiting]=useState(true);
 useEffect(()=>{if(regional||!tileData||!loadedSurround)return;const t=setTimeout(()=>setWaiting(false),REGIONAL_WAIT_MS);return()=>clearTimeout(t);},[regional,tileData,loadedSurround]);
 const surround=regional||!waiting?loadedSurround:null;
 const n=p.terrain.original_shape[0],px=p.terrain.pixel_size_m;
 const tile=useMemo<DemLevel|null>(()=>tileData&&{data:tileData,n:SITE01_SIZE,px,x0:p.frame.centerPs[0]-(n/2+.5)*px,y0:p.frame.centerPs[1]+(n/2+.5)*px},[tileData,n,px,p.frame]);
 const extentKm=p.terrain.original_shape[1]*px/1000;
 const point=(pos:Site|Analysis['position'],height=0):[number,number,number]=>[(pos.col-p.terrain.original_shape[1]/2)*px/1000,(pos.elevation_m-mean)*VERTICAL_EXAGGERATION/1000+height/1000,(pos.row-p.terrain.original_shape[0]/2)*px/1000];
 const ground=point(p.selected.position),lander=point(p.lander,2);
 const atLander=p.selected.position.row===p.lander.row&&p.selected.position.col===p.lander.col;
 const preview=p.positions.find(o=>o.id===(p.previewId??hovered));
 const select=(id:string,event:MouseEvent)=>{if(p.canSelect(event)){setHovered(null);p.onSelect(id);}};
 const pick:TerrainPick=(r,c,event)=>{const nearest=p.positions.reduce((best,o)=>Math.hypot(o.position.row-r,o.position.col-c)<Math.hypot(best.position.row-r,best.position.col-c)?o:best);select(nearest.id,event);};
 const rays:Ray[]=BODY_KEYS.map(body=>{
  const el=p.selected.series[`${body}_elevation_deg`][p.time]*DEG,d=p.frame.horizontal(p.selected.series[`${body}_azimuth_deg`][p.time]);
  return {body,visible:p.selected.series[`${body}_visible`][p.time],dir:[d.x*RAY*Math.cos(el),Math.sin(el)*RAY,d.z*RAY*Math.cos(el)]};
 });
 const add=(a:[number,number,number],b:[number,number,number]):[number,number,number]=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
 const head=add(ground,[0,MAST_BASE+p.selected.height_m*MAST_PER_M,0]);
 const hoverRays:TerrainRay[]=rays.map(r=>({id:r.body,line:lines[r.body],label:`${BODY_LABELS[r.body]} sightline`,visible:r.visible,color:r.visible?C[r.body]:BLOCKED_COLOR,detail:`Elevation ${p.selected.series[`${r.body}_elevation_deg`][p.time].toFixed(2)}° · Horizon ${p.selected.series[`${r.body}_horizon_deg`][p.time].toFixed(2)}°`}));
 if(!atLander) hoverRays.push({id:'link',line:lines.link,label:'Lander ↔ station',visible:p.linkVisible,color:p.linkVisible?C.ok:BLOCKED_COLOR});
 const labelPositions:[number,number,number][]=[add(head,[0,.09,0]),...rays.filter(r=>!r.visible).map(r=>add(head,[r.dir[0],r.dir[1]+.06,r.dir[2]]))];
 if(!atLander) labelPositions.push(add(lander,[0,.1,0]));
 const north=p.frame.horizontal(0),[nx,nz]=[north.x,north.z];
 const compass:[number,number,number]=[-extentKm*.42,point({row:n*.92,col:n*.08,elevation_m:p.terrain.elevation_m[Math.round(n*.92/p.terrain.stride)]?.[Math.round(n*.08/p.terrain.stride)]??mean} as Site)[1]+.03,extentKm*.42];
 // Stars travel with the camera, oriented as on the landing, and draw first so the globe and terrain occlude them.
 const stars=useMemo(()=>{const s=starfield();s.renderOrder=-1;(s.material as THREE.PointsMaterial).depthTest=false;return s;},[]);
 useEffect(()=>{stars.quaternion.copy(p.frame.rotation);},[stars,p.frame]);
 useFrame(({camera})=>{stars.position.copy(camera.position);});
 const progress=useRef(1),behind=usePacedFrames();
 const invalidate=useThree(s=>s.invalidate);
 useEffect(()=>{invalidate();});
 const surface=<Surface ground={land} levels={{tile:null,surround:null,regional:null}} wireframe={p.wireframe} onPick={pick}/>;
 return <><Camera mapView={p.mapView} reset={p.reset} controls={controls} approach={p.approach} focus={p.focus} frame={p.frame} progress={progress} behind={behind}/>
  <primitive object={stars}/>
  <Lights frame={p.frame} progress={progress}/>
  <GlobeFallback fallback={surface}><Suspense fallback={null}><SiteGround ground={land} levels={{tile,surround,regional}} progress={progress} wireframe={p.wireframe} onPick={pick}/></Suspense></GlobeFallback>
  <SkyBodies rays={rays}/>
  {p.positions.map(o=>{const feasible=p.feasible?.has(o.id),rec=o.id===p.recommended,radius=feasible?.017:.012;return o.id===p.selected.candidate_id?null:<ScreenScale key={o.id} position={point(o.position,2)}>
   <mesh><sphereGeometry args={[radius,14,14]}/><meshBasicMaterial color={feasible?C.feasible:C.candidate} transparent opacity={feasible?1:.75}/></mesh>
   <mesh visible={false}
    onPointerMove={e=>{if(orbiting.current||e.pointerType==='touch')return;e.stopPropagation();if(hovered!==o.id)setHovered(o.id);}}
    onPointerOut={()=>setHovered(h=>h===o.id?null:h)}
    onClick={e=>{e.stopPropagation();select(o.id,e.nativeEvent);}}>
    <sphereGeometry args={[Math.max(radius,.023),8,8]}/><meshBasicMaterial/>
   </mesh>
   {rec&&<mesh rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.03,.038,32]}/><meshBasicMaterial color={C.recommended} side={THREE.DoubleSide}/></mesh>}
  </ScreenScale>;})}
  {preview&&<PositionHighlight label={preview.label} position={point(preview.position,2)}/>}
  <group position={lander}><ScreenScale position={[0,0,0]}><mesh position={[0,.02,0]}><boxGeometry args={[.036,.04,.036]}/><meshStandardMaterial color={C.lander} emissive="#5a5a5a"/></mesh></ScreenScale>{!atLander&&<Label position={[0,.1,0]} text={`LANDER · ${p.lander.name.toUpperCase()}`}/>}</group>
  <Station ground={ground} height={p.selected.height_m} rays={rays} lines={lines} label={`${atLander?'LANDER + STATION':'STATION'} · ${p.selected.height_m} M MAST`} linkTo={atLander?null:[lander[0],lander[1]+.02,lander[2]]} linkVisible={p.linkVisible} behind={behind}/>
  <group position={compass}>
   <SteadyLine points={[[0,0,0],[nx*.16,0,nz*.16]]} color="#D4D4D4" lineWidth={1.6}/>
   <mesh position={[nx*.16,0,nz*.16]} rotation={[0,Math.atan2(nx,nz),0]}><coneGeometry args={[.016,.04,12]} /><meshBasicMaterial color="#D4D4D4"/></mesh>
   <Label position={[nx*.24,.03,nz*.24]} text="N · LOCAL" size={.016} color="#D4D4D4"/>
  </group>
  <TerrainRayHover rays={hoverRays} labels={labelPositions} orbiting={orbiting} candidateHovered={Boolean(preview)} onHover={p.onRayHover}/>
  <OrbitControls ref={controls} makeDefault minDistance={.6} maxDistance={MAX_KM} maxPolarAngle={Math.PI*.49} enableDamping dampingFactor={.1}
   onStart={()=>{orbiting.current=true;setHovered(null);p.onRayHover(null);}} onChange={()=>p.onRayHover(null)} onEnd={()=>{orbiting.current=false;}}/>
 </>;
}
// The close-up is drawn on demand: on any change of the scene's props, and while the camera, its controls'
// damping or the mast are moving. A view at rest costs no GPU time, which keeps weak devices responsive.
const TerrainCanvas=memo(function TerrainCanvas(props:SceneProps){
 return <Canvas shadows frameloop={props.active?'demand':'never'} camera={{fov:FOV,near:.01,far:100}} dpr={[1,1.75]} gl={{antialias:true}} onCreated={({gl})=>{gl.toneMappingExposure=1.05;gl.setClearColor('#050505',1);}}><Suspense fallback={null}><Scene {...props}/></Suspense></Canvas>;
});

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
