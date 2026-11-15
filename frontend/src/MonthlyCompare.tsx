import { type ReactNode, useEffect, useMemo, useState } from 'react';
import CompareUtcWindow from './CompareUtcWindow';
import { type MonthlyScan, type MonthlyWindow, parseMonthlyScan } from './lib/monthlyScan';
import {type Site, type Analysis, type Link, keyFor, violations} from './lib/science';
import {useObservationWindow} from './useObservationWindow';
import './MonthlyCompare.css';

const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortMonth = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
const hourLabel = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const percentLabel = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

type LoadState = { status: 'loading' | 'unavailable' } | { status: 'ready'; scan: MonthlyScan };

const labelFor = (month: MonthlyWindow) => monthLabel.format(new Date(month.start_utc));
const heightLabel = (height: number | null) => height === null ? 'None' : `${height} m`;

function Visibility({ label, color, hours, month }: { label: string; color: string; hours: number; month: MonthlyWindow }) {
  return <div className="metric-block">
    <dt className={color}>{label}</dt>
    <dd className="metric-number">{hourLabel.format(hours)}<small>h</small></dd>
    <dd className="metric-detail">
      {percentLabel.format(hours / month.duration_hours)} of {hourLabel.format(month.duration_hours)}&nbsp;h
      <CompareUtcWindow start={month.start_utc} end={month.end_utc}/>
    </dd>
  </div>;
}

export default function MonthlyCompare({ sites, analyses, links, renderTimelines }: { sites: Site[]; analyses: Analysis[]; links: Record<string,Record<string,Link>>; renderTimelines: () => ReactNode }) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [view, setView] = useState<'monthly' | 'timeline'>('monthly');
  const [monthId, setMonthId] = useState('2026-11');
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadScan() {
      try {
        const response = await fetch('/data/monthly-site-scan.json', { signal: controller.signal });
        if (!response.ok) throw new Error('The monthly dataset is unavailable.');
        const scan = parseMonthlyScan(await response.json());
        if (!controller.signal.aborted) setLoad({ status: 'ready', scan });
      } catch {
        if (!controller.signal.aborted) setLoad({ status: 'unavailable' });
      }
    }
    void loadScan();
    return () => controller.abort();
  }, []);

  const showTimelines = view === 'timeline' || load.status === 'unavailable';

  return <section className="compare-page">
    <div className="compare-mode">
      <h1>Compare landing sites</h1>
      {load.status !== 'unavailable' && <div className="compare-mode-buttons" role="group" aria-label="Comparison view">
        <button type="button" aria-pressed={!showTimelines} onClick={() => setView('monthly')}>Monthly comparison</button>
        <button type="button" aria-pressed={showTimelines} onClick={() => setView('timeline')}>Observation timelines</button>
      </div>}
    </div>
    {load.status === 'unavailable' && <p className="compare-state" role="status">
      Monthly data could not be loaded. The observation timelines are available below.
    </p>}
    {showTimelines ? renderTimelines() : load.status === 'ready' ? <MonthlyResults
      scan={load.scan}
      analyses={analyses}
      links={links}
      sites={sites}
      month={load.scan.months.find(item => item.id === monthId) ?? load.scan.months[0]}
      height={height}
      onMonth={setMonthId}
      onHeight={setHeight}
    /> : <p className="compare-state" role="status">Loading monthly data…</p>}
  </section>;
}

function MonthlyResults({ scan, sites, month, height, onMonth, onHeight, analyses, links }: {
  scan: MonthlyScan;
  analyses: Analysis[];
  links: Record<string,Record<string,Link>>;
  sites: Site[];
  month: MonthlyWindow;
  height: number;
  onMonth: (id: string) => void;
  onHeight: (height: number) => void;
}) {
  const ridgeSites = sites.filter(site => site.id in month.sites);
  const limits = scan.defaults;
  const fixed = useMemo(()=>analyses.filter(a=>sites.some(site=>site.row===a.position.row&&site.col===a.position.col)),[analyses,sites]);
  const observations = useObservationWindow(fixed,month.start_utc,month.end_utc);
  const current=Date.parse(observations.window.start)===Date.parse(month.start_utc)&&Date.parse(observations.window.end)===Date.parse(month.end_utc);
  const available=current&&observations.status===null;

  return <div className="monthly-compare">
    <p className="monthly-context">Fixed landing points on Connecting Ridge. Each height is measured above the terrain at the same point.</p>
    <div className="monthly-controls">
      <label>Month (UTC)
        <select value={month.id} onChange={event => onMonth(event.target.value)}>
          {scan.months.map(item => <option value={item.id} key={item.id}>{labelFor(item)}</option>)}
        </select>
      </label>
      <label>Mast height at each point
        <select value={height} onChange={event => onHeight(Number(event.target.value))}>
          {scan.heights_m.map(item => <option value={item} key={item}>{item === 0 ? '0 m · ground level' : `${item} m`}</option>)}
        </select>
      </label>
    </div>

    {(observations.status==='error'||(available&&observations.source==='cache'))&&<p className="science-mode cache" role="status">{observations.status==='error'?'Scientific data unavailable. Choose another month to retry.':'Using backup NASA data'}</p>}
    {!available&&observations.status!=='error'&&<p className="micro">Loading observations…</p>}
    {available&&<div className="compare-grid">
      {ridgeSites.map(site => {
        const sweep=observations.window.analyses.filter(a=>a.position.row===site.row&&a.position.col===site.col);
        const selectedAnalysis=sweep.find(a=>a.height_m===height)!;
        const selected={sun_hours:selectedAnalysis.metrics.sun.total_hours,earth_hours:selectedAnalysis.metrics.earth.total_hours,both_longest_outage_hours:selectedAnalysis.metrics.both.longest_outage_hours};
        const qualifying=sweep.filter(a=>violations(a,links[site.id][keyFor(a)],limits).length===0).sort((a,b)=>a.height_m-b.height_m);
        const result={minimum_height_m:qualifying[0]?.height_m??null};
        return <article className="comparison monthly-result" key={site.id}>
          <div className="comparison-title">
            <div>
              <h2>{site.name}</h2>
              <small>{Math.abs(site.latitude_deg).toFixed(5)}°&nbsp;S / {Math.abs(site.longitude_deg).toFixed(5)}°&nbsp;W</small>
            </div>
            <span className="monthly-height">{height} m above terrain</span>
          </div>
          <dl className="monthly-metrics">
            <Visibility label="Sun visible" color="sun" hours={selected.sun_hours} month={month}/>
            <Visibility label="Earth visible" color="earth" hours={selected.earth_hours} month={month}/>
            <div className="metric-block">
              <dt className="both">Longest gap without both</dt>
              <dd className="metric-number">{hourLabel.format(selected.both_longest_outage_hours)}<small>h</small></dd>
              <dd className="metric-detail">Sun or Earth blocked</dd>
            </div>
          </dl>
          <div className="monthly-lowest">
            <h3>Lowest height that meets the limits</h3>
            <strong className={result.minimum_height_m === null ? 'warn' : 'good'}>
              {result.minimum_height_m === null ? 'None at tested heights' : heightLabel(result.minimum_height_m)}
            </strong>
          </div>
        </article>;
      })}
    </div>}

    <div className="monthly-history">
      <h2>Lowest qualifying height by month</h2>
      <table aria-describedby="monthly-limits">
        <thead><tr><th scope="col">Site</th>{scan.months.map(item => <th
          key={item.id} scope="col" className={item.id === month.id ? 'current-month' : undefined}
          aria-label={labelFor(item)}
        >{shortMonth.format(new Date(item.start_utc))} <span>{item.id.slice(2, 4)}</span></th>)}</tr></thead>
        <tbody>{ridgeSites.map(site => <tr key={site.id}>
          <th scope="row">{site.name}</th>
          {scan.months.map(item => <td className={item.id === month.id ? 'current-month' : undefined} key={item.id}>
            {heightLabel(item.sites[site.id].minimum_height_m)}
          </td>)}
        </tr>)}</tbody>
      </table>
      <p id="monthly-limits">
        In each calendar month (UTC), qualifying heights need at least {limits.minSun}% Sun and {limits.minEarth}% Earth visibility. The longest Sun outage and the longest Earth outage must each be at most {limits.maxOutage} h. The point also needs at most {limits.maxSlope}° slope and {hourLabel.format(limits.maxDistance)} m installation distance{limits.requireLink && ', with local line of sight'}.
      </p>
    </div>
  </div>;
}
