import {useEffect,useState} from 'react';

// Engine terrain window (data/terrain.npz) as little-endian float32, exported by scripts/export_site01_tile.py.
export const SITE01_SIZE=512;
// A square DEM grid in polar stereographic metres: x0 is its left edge and y0 its top edge.
export type DemLevel={data:Float32Array;n:number;px:number;x0:number;y0:number};
let request:Promise<Float32Array|null>|null=null;
let surroundRequest:Promise<DemLevel[]|null>|null=null;

const bytes=(url:string)=>fetch(url).then(r=>r.ok?r.arrayBuffer():Promise.reject(new Error(`${url} unavailable (${r.status})`)));

export function loadSite01(){
 request??=bytes('/site01/elevation.f32')
  .then(b=>{const e=new Float32Array(b);return e.length===SITE01_SIZE*SITE01_SIZE?e:null;})
  .catch(()=>null);
 return request;
}

type MetaLevel={file:string;shape:[number,number];pixel_size_m:number;transform:number[]};
type Meta={surround:{offset_m:number;step_m:number;levels:MetaLevel[]};regional:{scale_m:number;levels:MetaLevel[]}};
let metaRequest:Promise<Meta>|null=null;
let regionalRequest:Promise<DemLevel[]|null>|null=null;
const meta=()=>metaRequest??=fetch('/site01/meta.json').then(r=>r.ok?r.json() as Promise<Meta>:Promise.reject(new Error('Site01 meta unavailable')));

function levels(list:MetaLevel[],decode:(b:ArrayBuffer)=>Float32Array){
 return Promise.all(list.map(async l=>({data:decode(await bytes(`/site01/${l.file}`)),n:l.shape[0],px:l.pixel_size_m,x0:l.transform[2],y0:l.transform[5]})));
}

// The rest of the same Site01 GeoTIFF around the window, finest level first (see public/site01/meta.json).
export function loadSurround(){
 surroundRequest??=meta().then(({surround:s})=>levels(s.levels,b=>Float32Array.from(new Uint16Array(b),c=>s.offset_m+c*s.step_m))).catch(()=>null);
 return surroundRequest;
}

// PDS LOLA south polar grids beyond the GeoTIFF, out past the close-up's horizon, finest level first.
export function loadRegional(){
 regionalRequest??=meta().then(({regional:s})=>levels(s.levels,b=>Float32Array.from(new Int16Array(b),c=>c*s.scale_m))).catch(()=>null);
 return regionalRequest;
}

function useLoaded<T>(load:()=>Promise<T|null>){
 const [value,setValue]=useState<T|null>(null);
 useEffect(()=>{let live=true;load().then(v=>{if(live)setValue(v);});return()=>{live=false;};},[load]);
 return value;
}
export const useSite01=()=>useLoaded(loadSite01);
export const useSurround=()=>useLoaded(loadSurround);
export const useRegional=()=>useLoaded(loadRegional);
