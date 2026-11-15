import {useEffect, useMemo, useRef, type RefObject} from 'react';
import {useFrame} from '@react-three/fiber';
import {Line} from '@react-three/drei';
import {GreaterDepth, Vector3, type Group, type Material} from 'three';
import type {TerrainLine} from './TerrainRayHover';

type Point = [number, number, number];
type Props = {
 line: TerrainLine;
 start: Point;
 end: Point;
 color: string;
 width: number;
 blocked: boolean;
 worldEndFrom?: RefObject<Group | null>;
};

const DASH_PX = 9;
const GAP_PX = 6;
const FLOW_PX_PER_SECOND = 32;

// Three's wide lines dash in world units. Measure along the projected line instead so that the
// pattern stays legible all the way out to the distant body, including with perspective zoom.
const screenDashes: Material['onBeforeCompile'] = shader => {
 shader.vertexShader = shader.vertexShader.replace('gl_Position = clip;', `
  float screenLength = length((ndcEnd.xy - ndcStart.xy) * resolution) * 0.5;
  vLineDistance = (position.y < 0.5 ? 0.0 : screenLength) * clip.w;
  gl_Position = clip;
 `);
 // Undo perspective-correct interpolation of the screen-space distance.
 shader.fragmentShader = shader.fragmentShader.replace(
  'vLineDistance + dashOffset',
  'vLineDistance * gl_FragCoord.w + dashOffset',
 );
};

function OccludedSightline({line, points, color, width}: {line: TerrainLine; points: [Point, Point]; color: string; width: number}) {
 const reducedMotion = useRef(false);
 useEffect(() => {
  const query = matchMedia('(prefers-reduced-motion: reduce)');
  const update = () => {
   reducedMotion.current = query.matches;
   if (query.matches && line.current) line.current.material.dashOffset = 0;
  };
  update();
  query.addEventListener('change', update);
  return () => query.removeEventListener('change', update);
 }, []);
 useFrame((_, delta) => {
  if (reducedMotion.current || document.hidden || !line.current) return;
  const material = line.current.material;
  const phase = material.dashOffset - Math.min(delta, .1) * FLOW_PX_PER_SECOND;
  material.dashOffset = phase % (DASH_PX + GAP_PX);
 });

 return <Line ref={line} points={points} color={color} lineWidth={width} renderOrder={51}
  depthFunc={GreaterDepth} depthWrite={false} transparent opacity={.85} toneMapped={false}
  dashed dashSize={DASH_PX} gapSize={GAP_PX} onBeforeCompile={screenDashes}/>;
}

export function TerrainSightline({line, start, end, color, width, blocked, worldEndFrom}: Props) {
 const occluded = useRef<NonNullable<TerrainLine['current']>>(null);
 const points = useMemo<[Point, Point]>(() => [start, end], [start, end]);
 const origin = useMemo(() => new Vector3(), []);
 useFrame(() => {
  const source = worldEndFrom?.current;
  if (!source || !line.current) return;
  source.updateWorldMatrix(true, false);
  source.getWorldPosition(origin);
  const x = end[0] - origin.x, y = end[1] - origin.y, z = end[2] - origin.z;
  // Both render passes must use the same world endpoint while the station moves.
  for (const part of [line.current, occluded.current]) {
   if (!part) continue;
   const endpoint = part.geometry.getAttribute('instanceEnd');
   if (endpoint.getX(0) === Math.fround(x) && endpoint.getY(0) === Math.fround(y) && endpoint.getZ(0) === Math.fround(z)) continue;
   part.geometry.setPositions([...start, x, y, z]);
   part.computeLineDistances();
  }
 });
 return <>
  <Line ref={line} points={points} color={color} lineWidth={width} renderOrder={50}
   depthWrite={false} transparent opacity={.9} toneMapped={false}/>
  {blocked && <OccludedSightline line={occluded} points={points} color={color} width={width}/>}
 </>;
}
