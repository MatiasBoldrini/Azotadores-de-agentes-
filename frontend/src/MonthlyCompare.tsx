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

type Lead = 'lead' | undefined;

function Visibility({ label, color, hours, month, lead }: { label: string; color: string; hours: number; month: MonthlyWindow; lead: Lead }) {
  return <div className={`metric-block ${lead ?? ''}`}>
    <dt className={color}>{label}{lead && <span className="lead-badge">Best</span>}</dt>
    <dd className="metric-number">{hourLabel.format(hours)}<small>h</small></dd>
    <dd className="metric-detail">{percentLabel.format(hours / month.duration_hours)} of {hourLabel.format(month.duration_hours)}&nbsp;h</dd>
  </div>;
}

// Lower is better for mast height; a missing height (no tested height qualifies) loses to any number.
const mastRank = (height: number | null) => height === null ? Infinity : height;
const heightTone = (height: number | null) => height === null ? 'none' : height <= 2 ? 'h-low' : height <= 5 ? 'h-mid' : height <= 10 ? 'h-high' : 'h-top';

function verdictFor(month: MonthlyWindow, sites: Site[]) {
  const [a, b] = sites;
  const name = monthLabel.format(new Date(month.start_utc));
  if (!a || !b) return { title: name, tone: 'neutral' as const };
  const ha = month.sites[a.id].minimum_height_m, hb = month.sites[b.id].minimum_height_m;
  if (ha === null && hb === null) return { title: `Neither ridge meets the limits at any tested height in ${name}.`, tone: 'bad' as const };
  if (ha === hb) return { title: `Both ridges meet the limits with a ${ha} m mast in ${name}.`, tone: 'good' as const };
  const [win, lose, hw, hl] = mastRank(ha) < mastRank(hb) ? [a, b, ha!, hb] : [b, a, hb!, ha];
  return {
    title: hl === null ? `Only ${win.name} meets the limits in ${name}, with a ${hw} m mast.` : `${win.name} meets the limits with a ${hw} m mast in ${name}. ${lose.name} needs ${hl} m.`,
    tone: 'good' as const,
  };
}

function seasonFor(scan: MonthlyScan, sites: Site[]) {
  const [a, b] = sites;
  if (!a || !b) return null;
  let aWins = 0, bWins = 0, ties = 0;
  for (const month of scan.months) {
    const ra = mastRank(month.sites[a.id].minimum_height_m), rb = mastRank(month.sites[b.id].minimum_height_m);
    if (ra < rb) aWins++; else if (rb < ra) bWins++; else ties++;
  }
  return `Across all ${scan.months.length} cached months: ${a.name} needs the shorter mast in ${aWins}, ${b.name} in ${bWins}, equal in ${ties}.`;
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

  const cards = available ? ridgeSites.map(site => {
    const sweep = observations.window.analyses.filter(a => a.position.row === site.row && a.position.col === site.col);
    const chosen = sweep.find(a => a.height_m === height)!;
    const qualifying = sweep.filter(a => violations(a, links[site.id][keyFor(a)], limits).length === 0).sort((a, b) => a.height_m - b.height_m);
    return {
      site,
      sun: chosen.metrics.sun.total_hours,
      earth: chosen.metrics.earth.total_hours,
      gap: chosen.metrics.both.longest_outage_hours,
      minimum: qualifying[0]?.height_m ?? null,
    };
  }) : [];
  // Marks the better of two values; equal values mark neither.
  const lead = (key: 'sun' | 'earth' | 'gap', index: number): Lead => {
    if (cards.length !== 2) return undefined;
    const [x, y] = [cards[index][key], cards[1 - index][key]];
    if (x === y) return undefined;
    return (key === 'gap' ? x < y : x > y) ? 'lead' : undefined;
  };
  const leadMast = (index: number): Lead => cards.length === 2 && mastRank(cards[index].minimum) < mastRank(cards[1 - index].minimum) ? 'lead' : undefined;
  const verdict = verdictFor(month, ridgeSites);
  const season = seasonFor(scan, ridgeSites);

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
      <p className="monthly-window"><CompareUtcWindow start={month.start_utc} end={month.end_utc}/></p>
    </div>

    <div className={`monthly-verdict tone-${verdict.tone}`} role="status" aria-live="polite">
      <h2 key={verdict.title}>{verdict.title}</h2>
      {season && <p>{season}</p>}
    </div>

    {(observations.status==='error'||(available&&observations.source==='cache'))&&<p className="science-mode cache" role="status">{observations.status==='error'?'Scientific data unavailable. Choose another month to retry.':'Using backup NASA data'}</p>}
    {!available&&observations.status!=='error'&&<p className="micro">Loading observations…</p>}
    {available&&<div className="compare-grid">
      {cards.map(({ site, sun, earth, gap, minimum }, index) => <article className={`comparison monthly-result ${leadMast(index) ?? ''}`} key={site.id}>
        <div className="comparison-title">
          <div>
            <h2>{site.name}</h2>
            <small>{Math.abs(site.latitude_deg).toFixed(5)}°&nbsp;S / {Math.abs(site.longitude_deg).toFixed(5)}°&nbsp;W</small>
          </div>
          <span className="monthly-height">{height === 0 ? 'Ground level' : `${height} m mast`}</span>
        </div>
        <dl className="monthly-metrics">
          <Visibility label="Sun visible" color="sun" hours={sun} month={month} lead={lead('sun', index)}/>
          <Visibility label="Earth visible" color="earth" hours={earth} month={month} lead={lead('earth', index)}/>
          <div className={`metric-block ${lead('gap', index) ?? ''}`}>
            <dt className="both">Longest gap{lead('gap', index) && <span className="lead-badge">Best</span>}</dt>
            <dd className="metric-number">{hourLabel.format(gap)}<small>h</small></dd>
            <dd className="metric-detail">Sun or Earth blocked</dd>
          </div>
        </dl>
        <div className="monthly-lowest">
          <h3>Lowest height that meets the limits</h3>
          <strong className={`mast-pill ${heightTone(minimum)}`}>
            {minimum === null ? 'None at tested heights' : heightLabel(minimum)}
          </strong>
        </div>
      </article>)}
    </div>}

    <div className="monthly-history">
      <div className="monthly-history-head">
        <h2>Lowest qualifying height by month</h2>
        <ul className="mast-legend" aria-label="Legend">
          <li><i className="h-low"/>0–2 m</li>
          <li><i className="h-mid"/>5 m</li>
          <li><i className="h-high"/>10 m</li>
          <li><i className="h-top"/>20 m</li>
          <li><i className="none"/>None</li>
        </ul>
      </div>
      <table aria-describedby="monthly-limits">
        <thead><tr><th scope="col">Site</th>{scan.months.map(item => <th
          key={item.id} scope="col" className={item.id === month.id ? 'current-month' : undefined}
          aria-label={labelFor(item)}
        >{shortMonth.format(new Date(item.start_utc))} <span>{item.id.slice(2, 4)}</span></th>)}</tr></thead>
        <tbody>{ridgeSites.map(site => <tr key={site.id}>
          <th scope="row">{site.name}</th>
          {scan.months.map(item => {
            const value = item.sites[site.id].minimum_height_m;
            return <td className={item.id === month.id ? 'current-month' : undefined} key={item.id}>
              <button type="button" className={`mast-cell ${heightTone(value)}`} aria-pressed={item.id === month.id}
                aria-label={`${site.name}, ${labelFor(item)}: ${value === null ? 'no tested height qualifies' : `${value} m`}. Show this month.`}
                onClick={() => onMonth(item.id)}>{heightLabel(value)}</button>
            </td>;
          })}
        </tr>)}</tbody>
      </table>
      <p id="monthly-limits">
        Select a cell to load that month. In each calendar month (UTC), qualifying heights need at least {limits.minSun}% Sun and {limits.minEarth}% Earth visibility. The longest Sun outage and the longest Earth outage must each be at most {limits.maxOutage} h. The point also needs at most {limits.maxSlope}° slope and {hourLabel.format(limits.maxDistance)} m installation distance{limits.requireLink && ', with local line of sight'}.
      </p>
    </div>
  </div>;
}
