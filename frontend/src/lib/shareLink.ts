export type ShareView = 'globe' | 'site' | 'designer' | 'compare' | 'science';
export type ShareState = {site: string; cell?: string; mast: number; start?: string; end?: string; at?: string; view: ShareView};

const VIEWS: readonly ShareView[] = ['globe', 'site', 'designer', 'compare', 'science'];
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function encodeShareState(state: ShareState): string {
 const params = new URLSearchParams();
 params.set('site', state.site);
 if (state.cell) params.set('cell', state.cell);
 params.set('mast', String(state.mast));
 if (state.start && state.end) {
  params.set('start', state.start);
  params.set('end', state.end);
 }
 if (state.at) params.set('at', state.at);
 params.set('view', state.view);
 return params.toString();
}

export type ShareLimits = {sites: string[]; heights: number[]; validWindow?: (start: string, end: string) => boolean};

// Returns only values that match the cached dataset; anything else is ignored rather than guessed.
export function decodeShareState(search: string, limits: ShareLimits): Partial<ShareState> | null {
 const params = new URLSearchParams(search);
 if (!params.has('site') && !params.has('mast') && !params.has('view')) return null;
 const state: Partial<ShareState> = {};
 const site = params.get('site');
 if (site && limits.sites.includes(site)) state.site = site;
 const cell = params.get('cell');
 if (cell && /^r\d+c\d+$/.test(cell)) state.cell = cell;
 const mastText = params.get('mast');
 const mast = mastText === null || mastText === '' ? NaN : Number(mastText);
 if (limits.heights.includes(mast)) state.mast = mast;
 const start = params.get('start'), end = params.get('end');
 if (start && end && INSTANT.test(start) && INSTANT.test(end) && Date.parse(end) > Date.parse(start)) {
  let valid = true;
  try { valid = limits.validWindow ? limits.validWindow(start, end) : true; } catch { valid = false; }
  if (valid) { state.start = start; state.end = end; }
 }
 const at = params.get('at');
 if (at && INSTANT.test(at) && Number.isFinite(Date.parse(at))) state.at = at;
 const view = params.get('view') as ShareView | null;
 if (view && VIEWS.includes(view)) state.view = view;
 return state;
}
