import {useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ComponentRef, type RefObject} from 'react';
import {useFrame, useThree} from '@react-three/fiber';
import {Line} from '@react-three/drei';
import {GreaterDepth, type Material} from 'three';
import type {TerrainLine} from './TerrainRayHover';

type Point = [number, number, number];
type Props = {
 line: TerrainLine;
 start: Point;
 end: Point;
 color: string;
 width: number;
 blocked: boolean;
 behind?: RefObject<boolean>;
};

const DASH_PX = 9;
const GAP_PX = 6;
const FLOW_PX_PER_SECOND = 32;

// drei's Line rebuilds its geometry and disposes its material whenever `points` is a new array, so every
// re-render recompiled the line shaders. This one keeps its first array and moves the vertices in place.
export function SteadyLine({points, line, ...rest}: Omit<ComponentProps<typeof Line>, 'points' | 'ref'> & {points: Point[]; line?: TerrainLine}) {
 const own = useRef<ComponentRef<typeof Line> | null>(null), [first] = useState(points), flat = points.flat(), key = flat.join();
 useLayoutEffect(() => {
  const l = own.current;
  if (!l) return;
  l.geometry.setPositions(flat);
  l.computeLineDistances();
 }, [key]);
 return <Line ref={l => {own.current = l; if (line) line.current = l;}} points={first} {...rest}/>;
}

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

// Hidden rather than unmounted while the sightline is clear, so its shader stays compiled. The close-up is
// drawn on demand, so the flow asks for its next frame itself, except on a GPU already behind the frames.
function OccludedSightline({points, color, width, shown, behind}: {points: [Point, Point]; color: string; width: number; shown: boolean; behind?: RefObject<boolean>}) {
 const line = useRef<NonNullable<TerrainLine['current']>>(null);
 const reducedMotion = useRef(false);
 const invalidate = useThree(state => state.invalidate);
 useEffect(() => {
  const query = matchMedia('(prefers-reduced-motion: reduce)');
  const update = () => {
   reducedMotion.current = query.matches;
   if (query.matches && line.current) line.current.material.dashOffset = 0;
   invalidate();
  };
  update();
  query.addEventListener('change', update);
  document.addEventListener('visibilitychange', update);
  return () => {
   query.removeEventListener('change', update);
   document.removeEventListener('visibilitychange', update);
  };
 }, [invalidate]);
 useFrame((state, delta) => {
  if (!shown || reducedMotion.current || document.hidden || !line.current) return;
  const material = line.current.material;
  const phase = material.dashOffset - Math.min(delta, .1) * FLOW_PX_PER_SECOND;
  material.dashOffset = phase % (DASH_PX + GAP_PX);
  if (!behind?.current) state.invalidate();
 });

 return <SteadyLine line={line} visible={shown} points={points} color={color} lineWidth={width} renderOrder={51}
  depthFunc={GreaterDepth} depthWrite={false} transparent opacity={.85} toneMapped={false}
  dashed dashSize={DASH_PX} gapSize={GAP_PX} onBeforeCompile={screenDashes}/>;
}

export function TerrainSightline({line, start, end, color, width, blocked, behind}: Props) {
 const points = useMemo<[Point, Point]>(() => [start, end], [start, end]);
 return <>
  <SteadyLine line={line} points={points} color={color} lineWidth={width} renderOrder={50}
   depthWrite={false} transparent opacity={.9} toneMapped={false}/>
  <OccludedSightline points={points} color={color} width={width} shown={blocked} behind={behind}/>
 </>;
}
