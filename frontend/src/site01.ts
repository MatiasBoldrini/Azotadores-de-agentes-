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

type Meta={surround:{offset_m:number;step_m:number;levels:{file:string;shape:[number,number];pixel_size_m:number;transform:number[]}[]}};

// The rest of the same Site01 GeoTIFF around the window, finest level first (see public/site01/meta.json).
export function loadSurround(){
 surroundRequest??=fetch('/site01/meta.json').then(r=>r.ok?r.json() as Promise<Meta>:Promise.reject(new Error('Site01 meta unavailable')))
  .then(({surround:s})=>Promise.all(s.levels.map(async l=>{
   const code=new Uint16Array(await bytes(`/site01/${l.file}`)),data=new Float32Array(code.length);
   for(let i=0;i<code.length;i++)data[i]=s.offset_m+code[i]*s.step_m;
   return {data,n:l.shape[0],px:l.pixel_size_m,x0:l.transform[2],y0:l.transform[5]};
  })))
  .catch(()=>null);
 return surroundRequest;
}

function useLoaded<T>(load:()=>Promise<T|null>){
 const [value,setValue]=useState<T|null>(null);
 useEffect(()=>{let live=true;load().then(v=>{if(live)setValue(v);});return()=>{live=false;};},[load]);
 return value;
}
export const useSite01=()=>useLoaded(loadSite01);
export const useSurround=()=>useLoaded(loadSurround);
