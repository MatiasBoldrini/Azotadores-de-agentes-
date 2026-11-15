export const CONTOUR_INTERVAL_M = 20;
export const INDEX_INTERVAL_M = 100;

export type Contour = {
 elevation: number;
 path: string;
 label: {x: number; y: number} | null;
};

type Grid = {
 rows: number;
 cols: number;
 stride: number;
 sample: (row: number, col: number) => number | null;
};

type Vertex = {x: number; y: number; z: number};
type Trace = Contour & {labelDistance: number};

export function elevationContours({rows, cols, stride, sample}: Grid): Contour[] {
 const traces = new Map<number, Trace>();
 const width = cols * stride;
 const height = rows * stride;

 function traceTriangle(a: Vertex, b: Vertex, c: Vertex) {
  const low = Math.min(a.z, b.z, c.z);
  const high = Math.max(a.z, b.z, c.z);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return;

  // Each edge owns its lower elevation, giving an exact-level vertex the same treatment
  // in adjacent triangles. Positions are interpolated directly from the unexaggerated DEM.
  for (let elevation = Math.ceil(low / CONTOUR_INTERVAL_M) * CONTOUR_INTERVAL_M;
   elevation < high; elevation += CONTOUR_INTERVAL_M) {
   const crossings = [];
   for (const [start, end] of [[a, b], [b, c], [c, a]]) {
    if ((start.z <= elevation) === (end.z <= elevation)) continue;
    const t = (elevation - start.z) / (end.z - start.z);
    crossings.push({x: start.x + t * (end.x - start.x), y: start.y + t * (end.y - start.y)});
   }
   const [start, end] = crossings;
   if (!start || !end || (start.x === end.x && start.y === end.y)) continue;
   let line = traces.get(elevation);
   if (!line) {
    line = {elevation, path: '', label: null, labelDistance: Infinity};
    traces.set(elevation, line);
   }
   line.path += `M${start.x.toFixed(2)} ${start.y.toFixed(2)}L${end.x.toFixed(2)} ${end.y.toFixed(2)}`;

   if (elevation % INDEX_INTERVAL_M === 0) {
    const x = (start.x + end.x) / 2;
    const y = (start.y + end.y) / 2;
    if (x < width * .13 || x > width * .87 || y < height * .09 || y > height * .91) continue;
    // Label opposite sides of the window alternately, leaving the candidate grid clear where possible.
    const targetX = width * (elevation % (2 * INDEX_INTERVAL_M) === 0 ? .18 : .82);
    const distance = Math.hypot(x - targetX, y - height * .45);
    if (distance < line.labelDistance) {
     line.label = {x, y};
     line.labelDistance = distance;
    }
   }
  }
 }

 function vertex(row: number, col: number): Vertex {
  return {x: col * stride, y: row * stride, z: sample(row, col) ?? NaN};
 }

 for (let row = 0; row < rows - 1; row++) {
  let topLeft = vertex(row, 0);
  let bottomLeft = vertex(row + 1, 0);
  for (let col = 1; col < cols; col++) {
   const topRight = vertex(row, col);
   const bottomRight = vertex(row + 1, col);
   // Match the 3D DEM mesh diagonal from the upper right to the lower left.
   traceTriangle(topLeft, bottomLeft, topRight);
   traceTriangle(topRight, bottomLeft, bottomRight);
   topLeft = topRight;
   bottomLeft = bottomRight;
  }
 }

 return Array.from(traces.values(), ({elevation, path, label}) => ({elevation, path, label}))
  .sort((a, b) => a.elevation - b.elevation);
}
