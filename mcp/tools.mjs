// SELENARC tools for MCP clients. Pure functions over the same precomputed NASA-derived data and
// the same TypeScript engine modules the web app uses, so an assistant gets exactly the numbers
// a person sees in the app. Nothing here calls a language model or estimates a value.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {advise,utcLabel} from '../frontend/src/lib/advisor.ts';
import {localBriefing} from '../frontend/src/lib/agentClient.ts';
import {nowAlerts} from '../frontend/src/lib/alerts.ts';
import {parseOperation} from '../frontend/src/lib/intent.ts';
import {monthlyAdvice} from '../frontend/src/lib/monthlyAdvisor.ts';
import {fallbackPlan,planInsights,planOperation,slackHours} from '../frontend/src/lib/planner.ts';
import {keyFor,optimize,percent,violations} from '../frontend/src/lib/science.ts';

const SNAPSHOT_URL = new URL('../public/data/snapshot.json', import.meta.url);
const raw = readFileSync(SNAPSHOT_URL);
const bundle = JSON.parse(raw);
const scan = JSON.parse(readFileSync(new URL('../public/data/monthly-site-scan.json', import.meta.url)));

export const DATASET_SHA256 = createHash('sha256').update(raw).digest('hex');
// Same defaults as the app's Designer (frontend/src/App.tsx DEFAULT_CONSTRAINTS); a test keeps them in step.
export const DEFAULT_CONSTRAINTS = {minSun: 70, minEarth: 40, maxOutage: 360, maxDistance: 1000, maxSlope: 20, requireLink: true};
export const HEIGHTS = bundle.heights_m;
export const SITES = bundle.sites.map(s => ({id: s.id, name: s.name, station: `r${s.row}c${s.col}`}));
const STATIONS = [...new Set(bundle.analyses.map(a => a.candidate_id))].sort();
const H = 3_600_000;

const first = bundle.analyses[0].series.timestamp_utc;
const WINDOW = {start_utc: first[0], end_utc: first[first.length - 1], hours: bundle.analyses[0].metrics.sun.duration_hours};
const WINDOW_LABEL = `${WINDOW.start_utc.slice(0, 10)} to ${WINDOW.end_utc.slice(0, 10)} UTC (${WINDOW.hours} h)`;

export const PROVENANCE = 'Computed by SELENARC from NASA LOLA polar DEMs (PGDA 78 Site01 at 5 m, PGDA 90 regional at 80 m) '
  + 'and JPL Horizons ephemerides, sampled every 30 minutes. Geometric line of sight to the Sun and Earth centres only: '
  + 'not electrical output, not a radio link budget, not mission certification. Report only figures returned by these tools.';

const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');

/** Errors carry the valid choices so the assistant can correct itself instead of guessing. */
export class ToolInputError extends Error {}

function site(siteId = 'ridge-a') {
  const s = SITES.find(x => x.id === siteId);
  if (!s) throw new ToolInputError(`Unknown site "${siteId}". Valid sites: ${SITES.map(x => x.id).join(', ')}.`);
  return s;
}

function analysisFor(siteId, height, station) {
  const s = site(siteId);
  const cell = station ?? s.station;
  if (!STATIONS.includes(cell)) throw new ToolInputError(`Unknown station "${cell}". Valid stations: ${STATIONS.join(', ')}.`);
  if (!HEIGHTS.includes(height)) throw new ToolInputError(`Untested mast height ${height} m. Tested heights: ${HEIGHTS.join(', ')} m.`);
  return {s, a: bundle.analyses.find(x => x.candidate_id === cell && x.height_m === height), links: bundle.links[s.id]};
}

const constraintsOf = c => ({...DEFAULT_CONSTRAINTS, ...(c ?? {})});

function cursorIndex(a, cursorUtc) {
  const times = a.series.timestamp_utc;
  if (!cursorUtc) return 0;
  const t = Date.parse(cursorUtc);
  if (!Number.isFinite(t)) throw new ToolInputError(`"${cursorUtc}" is not an ISO 8601 UTC time.`);
  if (t < Date.parse(times[0]) || t > Date.parse(times[times.length - 1])) throw new ToolInputError(`Time ${cursorUtc} is outside the analysed window ${WINDOW_LABEL}.`);
  const i = times.findIndex(x => Date.parse(x) >= t);
  return i < 0 ? times.length - 1 : i;
}

function metricsOf(a, link, constraints) {
  const m = a.metrics, failing = violations(a, link, constraints);
  const share = metric => ({hours: round(metric.total_hours), percent_of_window: round(percent(metric)), window: WINDOW_LABEL});
  return {
    station: a.candidate_id, mast_height_m: a.height_m,
    solar_exposure: share(m.sun),
    earth_visibility: share(m.earth),
    sun_and_earth_together: share(m.both),
    longest_simultaneous_visibility_window_hours: round(m.both.longest_visible_hours),
    longest_gap_with_sun_or_earth_blocked_hours: round(m.both.longest_outage_hours),
    max_single_resource_outage_hours: round(Math.max(m.sun.longest_outage_hours, m.earth.longest_outage_hours)),
    lander_link: link ? {line_of_sight: link.visible, distance_m: round(link.distance_m, 0)} : null,
    slope_deg: round(a.position.slope_deg ?? 0),
    constraints, passes_all_constraints: failing.length === 0, failing_constraints: failing,
  };
}

/** Turns an advisor finding into plain data; time actions become UTC instants, config actions become station + height. */
function finding(item, a) {
  const action = !item.action ? null : item.action.kind === 'time'
    ? {type: 'go_to_time', utc: a.series.timestamp_utc[item.action.index], label: item.action.label}
    : {type: 'use_configuration', station: item.action.candidate, mast_height_m: item.action.height, label: item.action.label};
  return {id: item.id, tone: item.tone, title: item.title, detail: item.detail, suggested_action: action};
}

function operationFrom({steps, request}) {
  if (steps?.length) return {op: {id: 'custom', name: 'Requested operation', steps: steps.map(s => ({need: s.need, hours: s.hours, label: s.label ?? `${s.need} ${s.hours} h`}))}, read: 'given', assumed: []};
  if (request) {
    const parsed = parseOperation(request);
    if (!parsed.ok) throw new ToolInputError(parsed.reason);
    return {op: parsed.op, read: 'offline parser', assumed: parsed.assumed};
  }
  throw new ToolInputError('Give either "steps" (need sun|earth|both and hours) or a plain-language "request".');
}

// ---- Tools -------------------------------------------------------------------------------

export function listSites() {
  return {
    window: WINDOW, mast_heights_m: HEIGHTS, stations: STATIONS.length,
    sites: SITES.map(s => ({...s, note: 'Landing site; the lander sits at this station. Other stations are candidate mast positions nearby.'})),
    default_constraints: DEFAULT_CONSTRAINTS,
    monthly_scan_months: scan.months.map(m => m.id),
    dataset: {generated_utc: bundle.generated_utc, sha256: DATASET_SHA256},
    provenance: PROVENANCE,
  };
}

export function evaluateConfiguration({site_id, mast_height_m, station, constraints}) {
  const {s, a, links} = analysisFor(site_id, mast_height_m, station);
  return {site: s.name, ...metricsOf(a, links[keyFor(a)], constraintsOf(constraints)), provenance: PROVENANCE};
}

export function planOperationTool({site_id, mast_height_m, station, steps, request, start_utc, constraints}) {
  const {s, a, links} = analysisFor(site_id, mast_height_m, station);
  const {op, read, assumed} = operationFrom({steps, request});
  const c = constraintsOf(constraints);
  const index = cursorIndex(a, start_utc);
  const from = Date.parse(a.series.timestamp_utc[index]);
  const plan = planOperation(a, op, from);
  const slack = plan ? slackHours(a, op, plan) : null;
  const fb = plan ? fallbackPlan(a, op, plan) : null;
  const insights = planInsights({selected: a, all: bundle.analyses, links, constraints: c, index, op});
  const better = insights.find(i => i.id === 'plan-better');
  return {
    site: s.name, station: a.candidate_id, mast_height_m: a.height_m, from_utc: iso(from),
    operation: {steps: op.steps, read_by: read, assumptions: assumed},
    fits: Boolean(plan),
    plan: plan ? {
      start_utc: iso(plan.start), finish_utc: iso(plan.finish),
      wait_hours: round((plan.start - from) / H), total_hours: round((plan.finish - plan.start) / H),
      slots: plan.slots.map(x => ({label: x.step.label, need: x.step.need, hours: x.step.hours, start_utc: iso(x.start), end_utc: iso(x.end)})),
      slack_hours: slack, fallback_start_utc: fb ? iso(fb.start) : null,
    } : null,
    better_configuration: better ? finding(better, a).suggested_action : null,
    findings: insights.map(i => finding(i, a)),
    provenance: PROVENANCE,
  };
}

export function missionBriefing({site_id, mast_height_m, station, cursor_utc, steps, request, constraints}) {
  const {s, a, links} = analysisFor(site_id, mast_height_m, station);
  const c = constraintsOf(constraints);
  const index = cursorIndex(a, cursor_utc);
  const input = {selected: a, all: bundle.analyses, links, constraints: c, index};
  const op = steps?.length || request ? operationFrom({steps, request}).op : null;
  const items = [...nowAlerts(a, index), ...(op ? planInsights({...input, op}) : []), ...advise(input, 4)];
  const brief = localBriefing(items);
  return {
    site: s.name, station: a.candidate_id, mast_height_m: a.height_m, cursor_utc: a.series.timestamp_utc[index],
    headline: brief?.headline ?? null,
    priorities: brief ? brief.picks.map(p => p.id) : [],
    findings: items.map(i => finding(i, a)),
    provenance: PROVENANCE,
  };
}

export function findBestConfiguration({site_id, constraints}) {
  const s = site(site_id);
  const links = bundle.links[s.id], c = constraintsOf(constraints);
  const result = optimize(bundle.analyses, links, c);
  const describe = a => metricsOf(a, links[keyFor(a)], c);
  return {
    site: s.name, constraints: c, evaluated: result.evaluated, feasible: result.feasible,
    recommended: result.recommended ? describe(result.recommended) : null,
    alternatives: result.alternatives.slice(1).map(describe),
    note: result.recommended ? 'Lowest-cost configuration that meets every constraint, as ranked by the app optimizer.'
      : 'No evaluated configuration meets every constraint. No result has been substituted; relax a constraint and ask again.',
    provenance: PROVENANCE,
  };
}

export function monthlyOutlook({month, mast_height_m = 0}) {
  const monthId = month ?? scan.months[0].id;
  if (!scan.months.some(m => m.id === monthId)) throw new ToolInputError(`Unknown month "${monthId}". Scanned months: ${scan.months.map(m => m.id).join(', ')}.`);
  if (!scan.heights_m.includes(mast_height_m)) throw new ToolInputError(`Untested mast height ${mast_height_m} m. Tested heights: ${scan.heights_m.join(', ')} m.`);
  const sites = SITES.map(s => ({id: s.id, name: s.name}));
  return {
    month: monthId, mast_height_m,
    minimum_mast_height_m_by_month: scan.months.map(m => ({month: m.id, ...Object.fromEntries(sites.map(s => [s.id, m.sites[s.id].minimum_height_m]))})),
    note: 'null means no tested mast height meets the monthly limits at that site.',
    advice: monthlyAdvice(scan, sites, monthId, mast_height_m).map(i => ({id: i.id, tone: i.tone, title: i.title, detail: i.detail})),
    provenance: PROVENANCE,
  };
}

export const WINDOW_INFO = {...WINDOW, label: WINDOW_LABEL, utcLabel};
