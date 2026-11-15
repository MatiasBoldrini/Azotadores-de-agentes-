import { useId, type PointerEvent } from 'react';
import type { Analysis } from './lib/science';
import './charts.css';

const PLOT_WIDTH = 800;
const PLOT_HEIGHT = 92;
const COLORS = { sun: '#f1bc68', earth: '#8db8e4' };

export function TimelineChart({ analysis, index, onIndex, body }: {
  analysis: Analysis;
  index: number;
  onIndex: (index: number) => void;
  body: 'sun' | 'earth';
}) {
  const readoutId = useId();
  const series = analysis.series;
  const values = series[`${body}_elevation_deg`];
  const horizon = series[`${body}_horizon_deg`];
  const lastIndex = values.length - 1;
  const min = Math.floor(Math.min(...values, ...horizon) - 1);
  const max = Math.ceil(Math.max(...values, ...horizon) + 1);
  const ticks = min < 0 && max > 0 ? [min, 0, max] : [min, max];
  const x = (sample: number) => sample / (lastIndex || 1) * PLOT_WIDTH;
  const y = (value: number) => PLOT_HEIGHT - 12 - (value - min) / (max - min) * (PLOT_HEIGHT - 23);
  const line = (samples: number[]) => samples.map((value, sample) =>
    `${sample ? 'L' : 'M'}${x(sample).toFixed(2)},${y(value).toFixed(2)}`
  ).join(' ');
  const plotTop = (value: number) => `${y(value) / PLOT_HEIGHT * 100}%`;
  const cursorX = x(index);
  const markerLeft = `${cursorX / PLOT_WIDTH * 100}%`;
  const start = Date.parse(series.timestamp_utc[0]);
  const duration = Date.parse(series.timestamp_utc[lastIndex]) - start;

  function selectSample(event: PointerEvent<HTMLDivElement>) {
    const { left, width } = event.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (event.clientX - left) / width));
    onIndex(Math.round(fraction * lastIndex));
  }

  return (
    <div className="time-chart">
      <div className="chart-head">
        <span className={body}>{body === 'sun' ? 'SOLAR ELEVATION' : 'EARTH ELEVATION'}</span>
        <span id={readoutId} className="chart-readout">
          <span>{values[index].toFixed(2)}°</span>
          <span className="chart-horizon-readout"> / horizon <span>{horizon[index].toFixed(2)}°</span></span>
        </span>
      </div>
      <div
        className="chart-plot"
        role="img"
        aria-label={`${body} elevation and terrain horizon over time`}
        aria-describedby={readoutId}
        onPointerMove={selectSample}
        onPointerDown={selectSample}
      >
        <svg aria-hidden="true" viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`} preserveAspectRatio="none">
          {ticks.map(value => (
            <line key={value} x1="0" x2={PLOT_WIDTH} y1={y(value)} y2={y(value)}
              stroke="#313638" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
          ))}
          <line x1={cursorX} x2={cursorX} y1="0" y2={PLOT_HEIGHT}
            stroke="#8c9694" opacity=".55" vectorEffect="non-scaling-stroke" />
          <path d={line(horizon)} fill="none" stroke="#8c9694"
            strokeWidth="1.25" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          <path d={line(values)} fill="none" stroke={COLORS[body]}
            strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
        </svg>
        {ticks.map(value => (
          <span key={value} aria-hidden="true" className="chart-tick" style={{ top: plotTop(value) }}>{value}°</span>
        ))}
        <span aria-hidden="true" className="chart-marker chart-marker-horizon"
          style={{ left: markerLeft, top: plotTop(horizon[index]) }} />
        <span aria-hidden="true" className="chart-marker chart-marker-elevation"
          style={{ left: markerLeft, top: plotTop(values[index]), background: COLORS[body] }} />
      </div>
      <div className="visibility-track">
        {analysis.metrics[body].intervals.map((interval, sample) => (
          <span key={sample} style={{
            left: `${(Date.parse(interval.start_utc) - start) / duration * 100}%`,
            width: `${interval.duration_hours / analysis.metrics[body].duration_hours * 100}%`,
            background: body === 'sun' ? '#e6b45f' : '#85afd5',
          }} title={`${interval.start_utc} → ${interval.end_utc}: ${interval.duration_hours} h`} />
        ))}
      </div>
    </div>
  );
}

export function HorizonChart({analysis,index}:{analysis:Analysis;index:number}){
 const h=analysis.horizon.elevation_deg;const vals=[...h,analysis.series.sun_elevation_deg[index],analysis.series.earth_elevation_deg[index]];
 const min=Math.floor(Math.min(...vals)-1),max=Math.ceil(Math.max(...vals)+1),y=(v:number)=>95-(v-min)/(max-min)*80;
 return <svg className="horizon-chart" role="img" aria-label="360 degree terrain horizon and current Sun and Earth" viewBox="0 0 360 115"><path d={`M0 98 ${h.map((v,i)=>`L${i} ${y(v)}`).join(' ')} L359 98Z`} fill="#333b3b"/><path d={h.map((v,i)=>`${i?'L':'M'}${i} ${y(v)}`).join(' ')} stroke="#9baba5" fill="none"/>{[0,90,180,270].map((v,i)=><text key={v} x={v+2} y="111">{['N','E','S','W'][i]}</text>)}{(['sun','earth'] as const).map(b=><g key={b}><circle cx={analysis.series[`${b}_azimuth_deg`][index]} cy={y(analysis.series[`${b}_elevation_deg`][index])} r="4" fill={b==='sun'?'#f1bc68':'#8db8e4'}/></g>)}</svg>;
}
