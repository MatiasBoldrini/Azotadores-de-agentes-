import {useEffect, type RefObject} from 'react';
import {useThree} from '@react-three/fiber';
import {Line3, MathUtils, Vector3} from 'three';

type Point = [number, number, number];

export type TerrainRay = {
 id: 'sun' | 'earth' | 'link';
 points: [Point, Point];
 label: string;
 visible: boolean;
 color: string;
 detail?: string;
};

export type TerrainRayTip = {ray: TerrainRay; left: number; top: number};

export const TERRAIN_LABEL_SIZE: Point = [.8, .1, 1];
const TOOLTIP_WIDTH = 192;
const TOOLTIP_HEIGHT = 54;
const HIT_RADIUS = 7;
const ENDPOINT_RADIUS = 11;

type Props = {
 rays: TerrainRay[];
 labels: Point[];
 orbiting: RefObject<boolean>;
 candidateHovered: boolean;
 onHover: (tip: TerrainRayTip | null) => void;
};

export function TerrainRayHover({rays, labels, orbiting, candidateHovered, onHover}: Props) {
 const {camera, gl, size} = useThree();

 useEffect(() => {
  onHover(null);
  if (candidateHovered) return;

  const canvas = gl.domElement;
  const {width, height} = size;
  const segment = new Line3();
  const nearest = new Vector3();
  const pointer = new Vector3();
  const label = new Vector3();
  const labelCorner = new Vector3();
  const toScreen = (point: Vector3) => {
   point.applyMatrix4(camera.projectionMatrix);
   return point.set((point.x + 1) * width / 2, (1 - point.y) * height / 2, 0);
  };
  const clear = () => onHover(null);
  const move = (event: PointerEvent) => {
   if (event.pointerType === 'touch' || event.buttons || orbiting.current) return;
   const rect = canvas.getBoundingClientRect();
   pointer.set(event.clientX - rect.left, event.clientY - rect.top, 0);

   // Hit test in CSS pixels so thin and dashed lines stay easy to hover at any zoom.
   const near = -camera.near;
   let hit: TerrainRay | undefined;
   let closest = Infinity;
   for (const ray of rays) {
    const [start, end] = ray.points;
    segment.start.fromArray(start).applyMatrix4(camera.matrixWorldInverse);
    segment.end.fromArray(end).applyMatrix4(camera.matrixWorldInverse);
    if (segment.start.z > near && segment.end.z > near) continue;
    const endpointOnScreen = segment.end.z <= near;
    if (segment.start.z > near) {
     segment.start.lerp(segment.end, (segment.start.z - near) / (segment.start.z - segment.end.z));
    } else if (!endpointOnScreen) {
     segment.end.lerp(segment.start, (segment.end.z - near) / (segment.end.z - segment.start.z));
    }
    toScreen(segment.start);
    toScreen(segment.end);
    if (segment.distanceSq() < 1e-6) nearest.copy(segment.end);
    else segment.closestPointToPoint(pointer, true, nearest);
    const distance = nearest.distanceTo(pointer);
    const endpointHit = ray.id !== 'link' && endpointOnScreen && segment.end.distanceTo(pointer) <= ENDPOINT_RADIUS;
    if ((distance <= HIT_RADIUS || endpointHit) && distance < closest) {
     hit = ray;
     closest = distance;
    }
   }
   if (!hit) return clear();

   const labelBounds = labels.flatMap(position => {
    label.fromArray(position).applyMatrix4(camera.matrixWorldInverse);
    if (label.z > near) return [];
    // The billboards' world-space sizes act along the camera's X and Y axes.
    labelCorner.copy(label);
    labelCorner.x += TERRAIN_LABEL_SIZE[0] / 2;
    labelCorner.y += TERRAIN_LABEL_SIZE[1] / 2;
    toScreen(labelCorner);
    toScreen(label);
    return [{left: 2 * label.x - labelCorner.x, right: labelCorner.x, top: labelCorner.y, bottom: 2 * label.y - labelCorner.y}];
   });
   const x = [pointer.x + 12, pointer.x - TOOLTIP_WIDTH - 12];
   const y = [pointer.y - TOOLTIP_HEIGHT - 12, pointer.y + 12, pointer.y - TOOLTIP_HEIGHT - 30, pointer.y + 30];
   const positions = y.flatMap(top => x.map(left => ({
    left: MathUtils.clamp(left, 8, width - TOOLTIP_WIDTH - 8),
    top: MathUtils.clamp(top, 8, height - TOOLTIP_HEIGHT - 8),
   })));
   positions.push(
    {left: 12, top: height - TOOLTIP_HEIGHT - 92},
    {left: width - TOOLTIP_WIDTH - 12, top: height - TOOLTIP_HEIGHT - 92},
   );
   const position = positions.find(({left, top}) => labelBounds.every(bounds =>
    left + TOOLTIP_WIDTH + 4 < bounds.left || left > bounds.right + 4 ||
    top + TOOLTIP_HEIGHT + 4 < bounds.top || top > bounds.bottom + 4
   ));
   onHover(position ? {ray: hit, ...position} : null);
  };

  canvas.addEventListener('pointermove', move, {passive: true});
  canvas.addEventListener('pointerleave', clear);
  canvas.addEventListener('pointerdown', clear);
  canvas.addEventListener('pointercancel', clear);
  canvas.addEventListener('wheel', clear, {passive: true});
  return () => {
   canvas.removeEventListener('pointermove', move);
   canvas.removeEventListener('pointerleave', clear);
   canvas.removeEventListener('pointerdown', clear);
   canvas.removeEventListener('pointercancel', clear);
   canvas.removeEventListener('wheel', clear);
  };
 }, [camera, gl, size, rays, labels, orbiting, candidateHovered, onHover]);

 return null;
}

export function TerrainRayTooltip({tip: {ray, left, top}}: {tip: TerrainRayTip}) {
 return <div role="tooltip" className="terrain-ray-tooltip" style={{left, top, width: TOOLTIP_WIDTH}}>
  <div><strong>{ray.label}</strong><span style={{color: ray.color}}>{ray.visible ? 'Visible' : 'Blocked'}</span></div>
  {ray.detail && <small>{ray.detail}</small>}
 </div>;
}
