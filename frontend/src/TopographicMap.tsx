import { memo, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { ArrowUp } from 'lucide-react';
import type { EvaluatedPosition } from './PositionPicker';
import type { Point, Site, Terrain } from './lib/science';
import { CONTOUR_INTERVAL_M, INDEX_INTERVAL_M, elevationContours } from './lib/contours';
import type { SiteFrame } from './moon/frame';
import { SITE01_SIZE, useSite01 } from './site01';
import './TopographicMap.css';

type Props = {
 terrain: Terrain;
 frame: SiteFrame;
 positions: EvaluatedPosition[];
 previewId: string | null;
 selectedId: string;
 lander: Site;
 onSelect: (id: string) => void;
 feasible?: Set<string>;
 recommended?: string;
};

const ContourLayer = memo(function ContourLayer({terrain, tile}: {terrain: Terrain; tile: Float32Array | null}) {
 const [rows, cols] = terrain.original_shape;
 const contours = useMemo(() => elevationContours(tile ? {
  rows: SITE01_SIZE, cols: SITE01_SIZE, stride: 1,
  sample: (row, col) => tile[row * SITE01_SIZE + col],
 } : {
  rows: terrain.elevation_m.length, cols: terrain.elevation_m[0].length, stride: terrain.stride,
  sample: (row, col) => terrain.elevation_m[row][col],
 }), [terrain, tile]);
 return <>
  <svg className="topographic-contours" viewBox={`-.5 -.5 ${cols} ${rows}`} aria-hidden="true">
   {contours.map(line => <path key={line.elevation} d={line.path}
    className={line.elevation % INDEX_INTERVAL_M === 0 ? 'topographic-index' : undefined}
    vectorEffect="non-scaling-stroke"/>)}
  </svg>
  {contours.map(line => line.label && <span className="topographic-elevation" aria-hidden="true" key={line.elevation}
   style={{left: `${(line.label.x + .5) / cols * 100}%`, top: `${(line.label.y + .5) / rows * 100}%`}}>
   {line.elevation} m
  </span>)}
 </>;
});

export default function TopographicMap({terrain, frame, positions, previewId, selectedId, lander, onSelect, feasible, recommended}: Props) {
 const tile = useSite01();
 const [hovered, setHovered] = useState<string | null>(null);
 const [focused, setFocused] = useState<string | null>(null);
 const [rows, cols] = terrain.original_shape;
 const scaleM = 500;
 const north = frame.horizontal(0);
 const northAngle = Math.atan2(north.x, -north.z) * 180 / Math.PI;
 const location = (point: Pick<Point, 'row' | 'col'>) => ({
  left: `${(point.col + .5) / cols * 100}%`,
  top: `${(point.row + .5) / rows * 100}%`,
 });
 const select = (id: string) => {
  setHovered(null);
  if (id !== selectedId) onSelect(id);
 };

 function pickNearest(event: MouseEvent<HTMLDivElement>) {
  if (!positions.length) return;
  const bounds = event.currentTarget.getBoundingClientRect();
  const row = (event.clientY - bounds.top) / bounds.height * rows - .5;
  const col = (event.clientX - bounds.left) / bounds.width * cols - .5;
  const distance = (point: Point) => Math.hypot(point.row - row, point.col - col);
  const nearest = positions.reduce((best, item) => distance(item.position) < distance(best.position) ? item : best);
  select(nearest.id);
 }

 const samplingM = terrain.pixel_size_m * (tile ? 1 : terrain.stride);
 const preview = positions.find(item => item.id === (previewId ?? hovered ?? focused));
 return <section className="topographic-map" id="topographic-map" aria-label="Topographic map">
  <div className="topographic-plot" onClick={pickNearest} style={{aspectRatio: cols / rows, width: `min(100cqw, ${cols / rows * 100}cqh)`}}>
   <ContourLayer terrain={terrain} tile={tile}/>
   <div className="topographic-north" role="img" aria-label="Local north">
    <ArrowUp size={21} style={{transform: `rotate(${northAngle}deg)`}} aria-hidden="true"/><span>N</span>
   </div>
   <div className="topographic-scale" style={{width: `${scaleM / (cols * terrain.pixel_size_m) * 100}%`}}>{scaleM} m</div>
   {positions.map(({id, label, position}) => {
    const isLander = position.row === lander.row && position.col === lander.col;
    const selected = id === selectedId;
    return <button type="button" key={id} className="topographic-marker" style={location(position)}
     aria-label={isLander ? `Lander · ${lander.name}` : label}
     aria-pressed={selected} data-lander={isLander} data-feasible={feasible?.has(id)} data-recommended={id === recommended}
     data-preview={id === preview?.id}
     onPointerEnter={() => setHovered(id)} onPointerLeave={() => setHovered(null)}
     onFocus={event => {if (event.currentTarget.matches(':focus-visible')) setFocused(id);}}
     onBlur={() => setFocused(null)}
     onClick={event => {event.stopPropagation(); select(id);}}>
     <span className="topographic-marker-shape" aria-hidden="true"/>
    </button>;
   })}
   {preview && <span className="topographic-preview" style={location(preview.position)} aria-hidden="true">
    {preview.label} · {Math.round(preview.position.elevation_m)} m elevation
   </span>}
  </div>
  <div className="topographic-key">
   <ul aria-label="Topographic map legend">
    <li><i className="topographic-key-station"/>Station</li>
    <li><i className="topographic-key-lander"/>Lander</li>
    <li><i className="topographic-key-cell"/>Evaluated cell</li>
    {feasible && <li><i className="topographic-key-feasible"/>Feasible cell</li>}
    {recommended && <li><i className="topographic-key-recommended"/>Recommended</li>}
   </ul>
   <p title="Elevation above the 1,737.4 km lunar reference sphere"><b>{CONTOUR_INTERVAL_M} m contours</b><span>{INDEX_INTERVAL_M} m index lines</span></p>
   <p>NASA LOLA · {samplingM} m DEM</p>
  </div>
 </section>;
}
