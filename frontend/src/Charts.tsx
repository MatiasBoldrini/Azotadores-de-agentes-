import type {Analysis} from './lib/science';
export function TimelineChart({analysis,index,onIndex,body}:{analysis:Analysis;index:number;onIndex:(i:number)=>void;body:'sun'|'earth'}){
 const s=analysis.series,values=s[`${body}_elevation_deg`],horizon=s[`${body}_horizon_deg`],n=values.length;
 const min=Math.floor(Math.min(...values,...horizon)-1),max=Math.ceil(Math.max(...values,...horizon)+1),width=800,height=92;
 const x=(i:number)=>32+i/(n-1)*(width-42),y=(v:number)=>height-12-(v-min)/(max-min)*(height-23);
 const line=(v:number[])=>v.map((v,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
 return <div className="time-chart"><div className="chart-head"><span className={body}>{body==='sun'?'SOLAR ELEVATION':'EARTH ELEVATION'}</span><span>{values[index].toFixed(2)}° <i> / horizon {horizon[index].toFixed(2)}°</i></span></div><svg role="img" aria-label={`${body} elevation and terrain horizon over time`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" onPointerMove={e=>{const r=e.currentTarget.getBoundingClientRect();onIndex(Math.round(Math.max(0,Math.min(1,((e.clientX-r.left)/r.width*width-32)/(width-42)))*(n-1)));}}>
 {[min,0,max].filter((v,i,a)=>a.indexOf(v)===i).map(v=><g key={v}><line x1="32" x2={width} y1={y(v)} y2={y(v)} stroke="#313638" strokeDasharray="3 5"/><text x="0" y={y(v)+3}>{v}°</text></g>)}
 <path d={line(horizon)} fill="none" stroke="#737b7b" strokeWidth="1.2" strokeDasharray="4 3"/><path d={line(values)} fill="none" stroke={body==='sun'?'#f1bc68':'#8db8e4'} strokeWidth="1.8"/><line x1={x(index)} x2={x(index)} y1="0" y2={height} stroke="#e3e8e3" opacity=".6"/><circle cx={x(index)} cy={y(values[index])} r="3" fill={body==='sun'?'#f1bc68':'#8db8e4'}/>
 </svg><div className="visibility-track">{analysis.metrics[body].intervals.map((w,i)=><span key={i} style={{left:`${(Date.parse(w.start_utc)-Date.parse(s.timestamp_utc[0]))/(Date.parse(s.timestamp_utc[n-1])-Date.parse(s.timestamp_utc[0]))*100}%`,width:`${w.duration_hours/analysis.metrics[body].duration_hours*100}%`,background:body==='sun'?'#e6b45f':'#85afd5'}} title={`${w.start_utc} → ${w.end_utc}: ${w.duration_hours} h`}/>)}</div></div>;
}
export function HorizonChart({analysis,index}:{analysis:Analysis;index:number}){
 const h=analysis.horizon.elevation_deg;const vals=[...h,analysis.series.sun_elevation_deg[index],analysis.series.earth_elevation_deg[index]];
 const min=Math.floor(Math.min(...vals)-1),max=Math.ceil(Math.max(...vals)+1),y=(v:number)=>95-(v-min)/(max-min)*80;
 return <svg className="horizon-chart" role="img" aria-label="360 degree terrain horizon and current Sun and Earth" viewBox="0 0 360 115"><path d={`M0 98 ${h.map((v,i)=>`L${i} ${y(v)}`).join(' ')} L359 98Z`} fill="#333b3b"/><path d={h.map((v,i)=>`${i?'L':'M'}${i} ${y(v)}`).join(' ')} stroke="#9baba5" fill="none"/>{[0,90,180,270].map((v,i)=><text key={v} x={v+2} y="111">{['N','E','S','W'][i]}</text>)}{(['sun','earth'] as const).map(b=><g key={b}><circle cx={analysis.series[`${b}_azimuth_deg`][index]} cy={y(analysis.series[`${b}_elevation_deg`][index])} r="4" fill={b==='sun'?'#f1bc68':'#8db8e4'}/></g>)}</svg>;
}
