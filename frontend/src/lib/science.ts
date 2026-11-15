export type Interval = {start_utc:string;end_utc:string;duration_hours:number};
export type Metric = {total_hours:number;duration_hours:number;longest_outage_hours:number;longest_visible_hours:number;interval_count:number;max_step_hours:number;intervals:Interval[];outages:Interval[]};
export type Point = {row:number;col:number;longitude_deg:number;latitude_deg:number;elevation_m:number;slope_deg:number|null};
export type Site = Point & {id:string;name:string};
export type Series = {timestamp_utc:string[];sun_azimuth_deg:number[];earth_azimuth_deg:number[];sun_elevation_deg:number[];earth_elevation_deg:number[];sun_horizon_deg:number[];earth_horizon_deg:number[];sun_visible:boolean[];earth_visible:boolean[];both_visible:boolean[]};
export type Horizon = {azimuth_deg:number[];elevation_deg:number[];coverage:string;method:string;angular_bin_width_deg:number};
export type Analysis = {candidate_id:string;position:Point;height_m:number;horizon:Horizon;series:Series;metrics:Record<'sun'|'earth'|'both',Metric>;limitations:string[];algorithm:string;provenance?:Record<string,unknown>};
export type Link = {visible:boolean;distance_m:number;elevation_difference_m:number;min_clearance_m:number;profile:{distance_m:number;terrain_elevation_m:number;line_elevation_m:number}[]};
export type Terrain = {elevation_m:(number|null)[][];longitude_deg:number[][];latitude_deg:number[][];pixel_size_m:number;stride:number;original_shape:number[];coverage:string};
export type Bundle = {terrain:Terrain;sites:Site[];analyses:Analysis[];links:Record<string,Record<string,Link>>;methodology:{sources:{name:string;url:string}[];limitations:string[];provenance:Record<string,unknown>};generated_utc?:string};
export type Constraints = {minSun:number;minEarth:number;maxOutage:number;maxDistance:number;maxSlope:number;requireLink:boolean};

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3}0*)?)?(?:Z|[+-]\d{2}:\d{2})$/i;

export function parseInstant(timestamp: string): number {
 const instant = Date.parse(timestamp);
 if (!ISO_INSTANT.test(timestamp) || !Number.isFinite(instant)) {
  throw new Error('Use an ISO timestamp with a UTC offset and at most millisecond precision.');
 }
 const calendarDate = timestamp.slice(0, 10);
 if (Number(calendarDate.slice(8)) > 28 && !new Date(`${calendarDate}T00:00:00Z`).toISOString().startsWith(calendarDate)) {
  throw new Error('Invalid calendar date.');
 }
 return instant;
}

function formatUtc(instant: number): string {
 const [whole, milliseconds] = new Date(instant).toISOString().slice(0, -1).split('.');
 const fraction = milliseconds === '000' ? '' : `.${milliseconds}000`;
 return `${whole}${fraction}+00:00`;
}

// Integration mirrors Python engine.windows: each sample owns [t_i,t_i+1).
// The endpoint is not counted as an extra half hour.
export function windowIntegrator(times:string[]):(states:boolean[])=>Metric {
 if(times.length<2) throw new Error('At least two matching samples are required.');
 const instants = times.map(parseInstant);
 const hours = instants.slice(1).map((t,i)=>(t-instants[i])/3600000);
 if(hours.some(h=>h<=0)) throw new Error('Timestamps must increase strictly.');
 const duration_hours=hours.reduce((a,b)=>a+b,0),max_step_hours=Math.max(...hours);
 return states=>{
  if(states.length!==times.length) throw new Error('At least two matching samples are required.');
  const intervals:Interval[]=[],outages:Interval[]=[]; let start=0;
  for(let stop=1;stop<=hours.length;stop++) if(stop===hours.length||states[stop]!==states[start]) {
   const item={start_utc:formatUtc(instants[start]),end_utc:formatUtc(instants[stop]),duration_hours:(instants[stop]-instants[start])/3600000};
   (states[start]?intervals:outages).push(item); start=stop;
  }
  return {total_hours:intervals.reduce((a,b)=>a+b.duration_hours,0),duration_hours,longest_outage_hours:Math.max(0,...outages.map(x=>x.duration_hours)),longest_visible_hours:Math.max(0,...intervals.map(x=>x.duration_hours)),intervals,outages,interval_count:intervals.length,max_step_hours};
 };
}
export function windows(times:string[],states:boolean[]):Metric {
 return windowIntegrator(times)(states);
}
export function sliceAnalysis(a:Analysis,start:string,end:string):Analysis {
 const timestamps = a.series.timestamp_utc;
 const findSample = (value: string) => {
  const instant = parseInstant(value);
  const exact = timestamps.indexOf(value);
  return exact >= 0 ? exact : timestamps.findIndex(t => parseInstant(t) === instant);
 };
 const firstSample = findSample(start), lastSample = findSample(end);
 if(firstSample<0||lastSample<=firstSample) throw new Error('Choose a time window aligned with the cached NASA observations.');
 const series=Object.fromEntries(Object.entries(a.series).map(([key,values])=>[key,values.slice(firstSample,lastSample+1)])) as Series;
 const integrate=windowIntegrator(series.timestamp_utc);
 const metrics={sun:integrate(series.sun_visible),earth:integrate(series.earth_visible),both:integrate(series.both_visible)};
 return {...a,series,metrics};
}
export function percent(metric:Metric){return metric.total_hours/metric.duration_hours*100;}
export function keyFor(a:Analysis){return `${a.candidate_id}-${a.height_m}`;}
export function violations(a:Analysis,link:Link|undefined,c:Constraints):string[]{
 const failures:string[]=[];
 const {sun, earth} = a.metrics;
 if(sun.total_hours < sun.duration_hours * c.minSun / 100) failures.push('Solar exposure');
 if(earth.total_hours < earth.duration_hours * c.minEarth / 100) failures.push('Earth visibility');
 if(Math.max(a.metrics.sun.longest_outage_hours,a.metrics.earth.longest_outage_hours)>c.maxOutage) failures.push('Maximum outage');
 if(!link||link.distance_m>c.maxDistance) failures.push('Installation distance');
 if(a.position.slope_deg===null||a.position.slope_deg>c.maxSlope) failures.push('Terrain slope');
 if(c.requireLink&&!link?.visible) failures.push('Local line of sight');
 return failures;
}
export function optimize(analyses:Analysis[],links:Record<string,Link>,constraints:Constraints){
 const feasible=analyses.filter(a=>violations(a,links[keyFor(a)],constraints).length===0);
 // Dimensionless engineering heuristic; no monetary or mass claim.
 const cost=(a:Analysis)=>a.height_m/20 + links[keyFor(a)].distance_m/1000 + (a.position.slope_deg??90)/90;
 feasible.sort((a,b)=>cost(a)-cost(b)||a.height_m-b.height_m||a.position.row-b.position.row||a.position.col-b.position.col);
 return {evaluated:analyses.length,feasible:feasible.length,recommended:feasible[0]??null,alternatives:feasible.slice(0,5),cost};
}
