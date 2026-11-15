import * as THREE from 'three';

function mulberry32(seed: number) {
 return () => {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
 };
}

export function starfield(count = 4000, seed = 7) {
 const random = mulberry32(seed), positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
 for (let i = 0; i < count; i++) {
  const r = 12 + random() * 28, theta = random() * Math.PI * 2, phi = Math.acos(2 * random() - 1), c = .7 + random() * .3;
  positions.set([r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)], i * 3);
  colors.set([c, c, c], i * 3);
 }
 const geometry = new THREE.BufferGeometry();
 geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
 geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
 return new THREE.Points(geometry, new THREE.PointsMaterial({size: .035, vertexColors: true, sizeAttenuation: true, depthWrite: false}));
}
