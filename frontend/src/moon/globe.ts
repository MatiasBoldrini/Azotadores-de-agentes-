import * as THREE from 'three';
import {VERTICAL_EXAGGERATION} from '../TerrainView';

export const MOON_RADIUS_M = 1737400;
export const MOON_TEXTURES = ['/moon/lroc_wac_gray.jpg', '/moon/wac_south_summer.jpg', '/moon/ldem_4_displacement.png'];
// The landing's light rig, in landing coordinates. The site view starts its descent under the same light.
export const MOON_LIGHTS = {
 sun: {position: [.35, .04, 1] as [number, number, number], intensity: 2.35, color: '#fff3e0'},
 back: {position: [-1, -.2, -.4] as [number, number, number], intensity: .08},
 ambient: .045,
};
const DEG = Math.PI / 180;

// ldem_4_displacement.png is ldem_4_uint.tif (NASA SVS CGI Moon Kit) linearly stretched to its own range.
const ELEV_MIN = -8878.5;
const ELEV_MAX = 10504.0;

// LROC WAC South Pole Summer Mosaic (WAC_ROI_SOUTH_SUMMER_032P) polar stereographic grid.
const POLAR_SIZE = 3038;
const POLAR_SCALE = 947.60470075464;
const POLAR_XMIN = -1439293.0898587038;
const POLAR_YMAX = 1439293.0898587038;
const POLAR_EXTENT = POLAR_SCALE * POLAR_SIZE;
const CAP_OUTER = -58;
const CAP_FADE = -65;
// The base sphere stops inside the opaque part of the cap so its pinched polar triangles never show through.
const SPHERE_SOUTH = -67;
export const CAP_LIFT = 1.001;
// The 4 ppd relief carries no detail this close to the pole, and the 5 m site tile is draped on a smooth sphere here.
const FLAT_POLE = -86, FLAT_POLE_END = -82;

export function latLonToVec(lat: number, lon: number, r = 1) {
 const phi = (90 - lat) * DEG, theta = (lon + 180) * DEG;
 return new THREE.Vector3(-r * Math.cos(theta) * Math.sin(phi), r * Math.cos(phi), r * Math.sin(theta) * Math.sin(phi));
}

export function vecToLatLon(p: THREE.Vector3) {
 const r = p.length() || 1;
 const lat = Math.asin(THREE.MathUtils.clamp(p.y / r, -1, 1)) / DEG;
 let lon = Math.atan2(p.z, -p.x) / DEG - 180;
 if (lon < -180) lon += 360;
 return {lat, lon};
}

export function angularDistanceDeg(a: {lat: number; lon: number}, b: {lat: number; lon: number}) {
 return Math.acos(THREE.MathUtils.clamp(latLonToVec(a.lat, a.lon).dot(latLonToVec(b.lat, b.lon)), -1, 1)) / DEG;
}

export const easeInOutCubic = (t: number) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function pixels(img: HTMLImageElement | ImageBitmap) {
 const canvas = document.createElement('canvas');
 canvas.width = img.width;
 canvas.height = img.height;
 const ctx = canvas.getContext('2d', {willReadFrequently: true})!;
 ctx.drawImage(img, 0, 0);
 return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

const samplers = new WeakMap<object, (lat: number, lon: number) => number>();
function elevationSampler(img: HTMLImageElement | ImageBitmap) {
 const cached = samplers.get(img);
 if (cached) return cached;
 const {data, width: w, height: h} = pixels(img);
 const at = (x: number, y: number) => data[(y * w + x) * 4] / 255;
 const sample = (u: number, v: number) => {
  u = ((u % 1) + 1) % 1;
  v = THREE.MathUtils.clamp(v, 0, 1);
  const x = u * (w - 1), y = v * (h - 1), x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1), tx = x - x0, ty = y - y0;
  return (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) + (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty;
 };
 const elevation = (lat: number, lon: number) => {
  const v = (90 - lat) / 180;
  // Average a ring of longitudes near the poles so the relief does not fan out.
  const s = Math.abs(lat) >= 88 ? Array.from({length: 16}, (_, k) => sample(k / 16, v)).reduce((a, b) => a + b) / 16 : sample((lon + 180) / 360, v);
  return ELEV_MIN + s * (ELEV_MAX - ELEV_MIN);
 };
 samplers.set(img, elevation);
 return elevation;
}

function displace(geometry: THREE.BufferGeometry, elevation: (lat: number, lon: number) => number) {
 const pos = geometry.attributes.position, p = new THREE.Vector3();
 for (let i = 0; i < pos.count; i++) {
  p.fromBufferAttribute(pos, i);
  const {lat, lon} = vecToLatLon(p);
  const flat = THREE.MathUtils.smoothstep(lat, FLAT_POLE, FLAT_POLE_END);
  p.normalize().multiplyScalar(1 + flat * elevation(lat, lon) / MOON_RADIUS_M * VERTICAL_EXAGGERATION);
  pos.setXYZ(i, p.x, p.y, p.z);
 }
 pos.needsUpdate = true;
 geometry.computeVertexNormals();
}

const capFade = (lat: number) => {
 if (lat <= CAP_FADE) return 1;
 if (lat >= CAP_OUTER) return 0;
 const t = (lat - CAP_FADE) / (CAP_OUTER - CAP_FADE);
 return 1 - t * t * (3 - 2 * t);
};

// South polar stereographic, as in the LROC mosaic and the LOLA site DEMs: x = ρ sin λ, y = ρ cos λ.
function polarUv(lat: number, lon: number): [number, number] {
 const rho = 2 * MOON_RADIUS_M * Math.tan(Math.PI / 4 + lat * DEG / 2);
 const x = rho * Math.sin(lon * DEG), y = rho * Math.cos(lon * DEG);
 return [(x - POLAR_XMIN) / POLAR_EXTENT, 1 - (POLAR_YMAX - y) / POLAR_EXTENT];
}

// Bilinear LROC mosaic albedo (linear RGB) at polar stereographic metres, read from a small crop around a site.
export function polarAlbedo(img: HTMLImageElement | ImageBitmap, x0: number, y0: number, x1: number, y1: number) {
 const pad = 2, left = Math.max(0, Math.floor((Math.min(x0, x1) - POLAR_XMIN) / POLAR_SCALE) - pad), top = Math.max(0, Math.floor((POLAR_YMAX - Math.max(y0, y1)) / POLAR_SCALE) - pad);
 const w = Math.min(POLAR_SIZE - left, Math.ceil(Math.abs(x1 - x0) / POLAR_SCALE) + 2 * pad + 1), h = Math.min(POLAR_SIZE - top, Math.ceil(Math.abs(y1 - y0) / POLAR_SCALE) + 2 * pad + 1);
 const canvas = document.createElement('canvas');
 canvas.width = w;
 canvas.height = h;
 const ctx = canvas.getContext('2d', {willReadFrequently: true})!;
 ctx.drawImage(img, left, top, w, h, 0, 0, w, h);
 const {data} = ctx.getImageData(0, 0, w, h);
 const at = (i: number, j: number, k: number) => data[(THREE.MathUtils.clamp(j, 0, h - 1) * w + THREE.MathUtils.clamp(i, 0, w - 1)) * 4 + k] / 255;
 return (x: number, y: number, out: THREE.Color) => {
  const fi = (x - POLAR_XMIN) / POLAR_SCALE - .5 - left, fj = (POLAR_YMAX - y) / POLAR_SCALE - .5 - top;
  const i = Math.floor(fi), j = Math.floor(fj), tx = fi - i, ty = fj - j;
  const c = [0, 1, 2].map(k => (at(i, j, k) * (1 - tx) + at(i + 1, j, k) * tx) * (1 - ty) + (at(i, j + 1, k) * (1 - tx) + at(i + 1, j + 1, k) * tx) * ty);
  return out.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
 };
}

function southCapGeometry() {
 const rings = 96, segments = 256, pos: number[] = [], uv: number[] = [], index: number[] = [];
 for (let r = 0; r <= rings; r++) {
  const lat = -90 + (CAP_OUTER + 90) * r / rings;
  for (let k = 0; k <= segments; k++) {
   const lon = -180 + 360 * k / segments, p = latLonToVec(lat, lon);
   pos.push(p.x, p.y, p.z);
   uv.push(...polarUv(lat, lon));
  }
 }
 const stride = segments + 1;
 for (let r = 0; r < rings; r++) for (let k = 0; k < segments; k++) {
  const a = r * stride + k, c = a + stride;
  index.push(a, a + 1, c, a + 1, c + 1, c);
 }
 const g = new THREE.BufferGeometry();
 g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
 g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
 g.setIndex(index);
 return g;
}

let capAlpha: THREE.CanvasTexture | null = null;
function capAlphaTexture(size = 1024) {
 if (capAlpha) return capAlpha;
 const canvas = document.createElement('canvas');
 canvas.width = canvas.height = size;
 const ctx = canvas.getContext('2d')!, img = ctx.createImageData(size, size);
 for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
  const x = POLAR_XMIN + (i + .5) / size * POLAR_EXTENT, y = POLAR_YMAX - (j + .5) / size * POLAR_EXTENT;
  const lat = (2 * Math.atan(Math.hypot(x, y) / (2 * MOON_RADIUS_M)) - Math.PI / 2) / DEG;
  const o = (j * size + i) * 4;
  img.data[o] = img.data[o + 1] = img.data[o + 2] = img.data[o + 3] = Math.round(capFade(lat) * 255);
 }
 ctx.putImageData(img, 0, 0);
 capAlpha = new THREE.CanvasTexture(canvas);
 return capAlpha;
}

// Cuts a square of half-width `half` around the world origin out of the cap, where a site tile replaces it.
function cutHole(material: THREE.Material, half: number) {
 material.onBeforeCompile = shader => {
  shader.uniforms.holeHalf = {value: half};
  shader.vertexShader = shader.vertexShader
   .replace('#include <common>', '#include <common>\nvarying vec3 vHoleWorld;')
   .replace('#include <project_vertex>', '#include <project_vertex>\nvHoleWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  shader.fragmentShader = shader.fragmentShader
   .replace('#include <common>', '#include <common>\nuniform float holeHalf;\nvarying vec3 vHoleWorld;')
   .replace('void main() {', 'void main() {\n if (abs(vHoleWorld.x) < holeHalf && abs(vHoleWorld.z) < holeHalf && vHoleWorld.y > -holeHalf) discard;');
 };
 material.customProgramCacheKey = () => `hole-${half}`;
}

export type MoonMeshes = {sphere: THREE.Mesh; cap: THREE.Mesh; materials: THREE.MeshStandardMaterial[]};

export function buildMoon(color: THREE.Texture, polar: THREE.Texture, relief: THREE.Texture, maxAnisotropy: number, hole?: number): MoonMeshes {
 for (const t of [color, polar]) {
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAnisotropy;
 }
 color.wrapS = relief.wrapS = THREE.RepeatWrapping;
 polar.wrapS = polar.wrapT = THREE.ClampToEdgeWrapping;
 const elevation = elevationSampler(relief.image as HTMLImageElement);

 const sphereGeometry = new THREE.SphereGeometry(1, 256, 120, 0, Math.PI * 2, 0, (90 - SPHERE_SOUTH) * DEG);
 const suv = sphereGeometry.attributes.uv, spos = sphereGeometry.attributes.position;
 for (let i = 0; i < suv.count; i++) suv.setY(i, 1 - Math.acos(THREE.MathUtils.clamp(spos.getY(i), -1, 1)) / Math.PI);
 displace(sphereGeometry, elevation);
 const sphereMaterial = new THREE.MeshStandardMaterial({map: color, bumpMap: relief, bumpScale: .035, roughness: .95, metalness: 0});
 const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);

 // The polar mosaic replaces the equirectangular pinch around the south pole and fades out by 58° S.
 // Its UVs are polar stereographic, so the equirectangular relief cannot double as its bump map.
 const capGeometry = southCapGeometry();
 displace(capGeometry, elevation);
 const capMaterial = new THREE.MeshStandardMaterial({
  map: polar, alphaMap: capAlphaTexture(), transparent: true, alphaTest: .04,
  roughness: .95, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
 });
 if (hole) cutHole(capMaterial, hole);
 const cap = new THREE.Mesh(capGeometry, capMaterial);
 cap.scale.setScalar(CAP_LIFT);
 return {sphere, cap, materials: [sphereMaterial, capMaterial]};
}

export function setMoonOpacity({sphere, cap, materials}: MoonMeshes, opacity: number) {
 const o = THREE.MathUtils.clamp(opacity, 0, 1);
 const [sphereMaterial, capMaterial] = materials;
 const fading = o < .999;
 if (sphereMaterial.transparent !== fading) {
  sphereMaterial.transparent = fading;
  sphereMaterial.needsUpdate = true;
 }
 sphereMaterial.opacity = capMaterial.opacity = o;
 sphereMaterial.depthWrite = capMaterial.depthWrite = o > .2;
 sphere.visible = cap.visible = o > .01;
}
