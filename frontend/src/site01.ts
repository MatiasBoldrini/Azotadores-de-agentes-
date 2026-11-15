import {useEffect,useState} from 'react';

// Engine terrain window (data/terrain.npz) as little-endian float32, exported by scripts/export_site01_tile.py.
export const SITE01_SIZE=512;
let request:Promise<Float32Array|null>|null=null;

export function loadSite01(){
 request??=fetch('/site01/elevation.f32')
  .then(r=>r.ok?r.arrayBuffer():Promise.reject(new Error(`Site01 tile unavailable (${r.status})`)))
  .then(b=>{const e=new Float32Array(b);return e.length===SITE01_SIZE*SITE01_SIZE?e:null;})
  .catch(()=>null);
 return request;
}

export function useSite01(){
 const [tile,setTile]=useState<Float32Array|null>(null);
 useEffect(()=>{let live=true;loadSite01().then(t=>{if(live)setTile(t);});return()=>{live=false;};},[]);
 return tile;
}
