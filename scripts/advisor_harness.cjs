#!/usr/bin/env node
// Visual and accessibility harness for the Designer "What to do next" panel.
// Serves the built app (dist/), simulates every agent state by intercepting /api/agent/*,
// drives each state on desktop and on a 360 px phone, screenshots it and checks:
// horizontal overflow, target sizes, single-line labels, WCAG AA text contrast,
// console errors and the state's own content. Exit code 1 when any check fails.
//
//   npm run build --prefix frontend && node scripts/advisor_harness.cjs [outDir]
// Requires Playwright with a Chromium build (preinstalled in the cloud dev container).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const ROOT = path.resolve(__dirname, '..', 'dist');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'harness-output'));
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain', '.gz': 'application/gzip', '.bin': 'application/octet-stream'};

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(ROOT, url);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');
    res.writeHead(200, {'content-type': TYPES[path.extname(file)] || 'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const json = body => ({status: 200, contentType: 'application/json', body: JSON.stringify(body)});
const briefingFrom = request => {
  const facts = JSON.parse(request.postData()).facts;
  const lead = facts.find(f => f.tone === 'risk') || facts[0];
  return {headline: lead.title, picks: facts.filter(f => f !== lead).slice(0, 2).reduce((a, f) => [...a, {id: f.id, reason: ''}], [{id: lead.id, reason: 'This blocks the operation as planned.'}]), source: 'openai', model: 'stub'};
};

// Each scenario: how /api/agent/* answers, what to do, and what must be on screen.
const SCENARIOS = [
  {name: 'offline', agent: () => ({status: 404, body: ''}), expect: {source: /Automatic/}},
  {name: 'openai-briefing', agent: (route, kind) => kind === 'briefing' ? json(briefingFrom(route.request())) : {status: 404, body: ''}, expect: {source: /OpenAI, checked against the findings/}},
  {name: 'briefing-loading', agent: (route, kind) => kind === 'briefing' ? null : {status: 404, body: ''}, expect: {source: /OpenAI is reviewing/}},
  {name: 'ask-understood', agent: (route, kind) => kind === 'operation'
      ? json({understood: true, note: 'Assumed 1 h of transmission.', model: 'stub', source: 'openai', operation: {name: 'Charge then transmit', steps: [{need: 'sun', hours: 24, label: 'Charge batteries'}, {need: 'earth', hours: 1, label: 'Transmit to Earth'}]}})
      : {status: 404, body: ''},
    ask: 'cargar un día y después transmitir 1 h', expect: {reply: /Read by OpenAI[\s\S]*Understood: Sun 24 h → Earth 1 h/, chip: 'Yours'}},
  {name: 'ask-unclear', agent: (route, kind) => kind === 'operation' ? json({understood: false, operation: null, note: 'This needs temperature data, which the planner does not model.', model: 'stub', source: 'openai'}) : {status: 404, body: ''},
    ask: 'mantener la batería sobre 0 °C', expect: {reply: /temperature data/, invalid: true}},
  {name: 'ask-busy', agent: (route, kind) => kind === 'operation' ? null : {status: 404, body: ''}, ask: 'transmitir 2 h', expect: {busy: true}},
  {name: 'all-findings', agent: () => ({status: 404, body: ''}), openFindings: true, expect: {findings: true}},
];
const VIEWPORTS = [{name: 'desktop', width: 1440, height: 1000}, {name: 'phone-360', width: 360, height: 780}];

// Runs inside the page: measures the advisor without relying on Playwright actionability waits.
function audit() {
  const root = document.querySelector('.advisor');
  const issues = [];
  if (!root) return {issues: ['advisor not rendered']};
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 0]; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const over = (top, under) => { const a = top[3]; return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1]; };
  const background = el => { const chain = []; for (let n = el; n; n = n.parentElement) chain.push(parse(getComputedStyle(n).backgroundColor)); let c = [10, 10, 10, 1]; for (const layer of chain.reverse()) if (layer[3] > 0) c = over(layer, c); return c; };
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('details:not([open]) > :not(summary)'); };
  const doc = document.documentElement;
  if (doc.scrollWidth > window.innerWidth + 1) issues.push(`page overflows horizontally by ${doc.scrollWidth - window.innerWidth}px`);
  for (const el of root.querySelectorAll('*')) if (visible(el) && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible' && el.clientWidth > 0 && !['SELECT', 'svg', 'path'].includes(el.tagName)) issues.push(`overflow: ${el.className || el.tagName} (${el.scrollWidth} > ${el.clientWidth})`);
  const sel = (q, min) => { for (const el of root.querySelectorAll(q)) if (visible(el)) { const r = el.getBoundingClientRect(); if (r.height < min - 0.5) issues.push(`target ${q} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" is ${Math.round(r.height)}px tall (< ${min})`); } };
  sel('.adv-btn, .adv-chip, .adv-ask input, .adv-hours select, .adv-all > summary', 40);
  sel('.adv-link', 24);
  for (const el of root.querySelectorAll('.adv-chip, .adv-btn, .adv-badge, .adv-need, .adv-facts dd')) if (visible(el)) {
    const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.3;
    const pad = parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom);
    if (el.getBoundingClientRect().height - pad > lh * 1.7 && el.getBoundingClientRect().height > 44) issues.push(`label wraps: "${el.textContent.trim().slice(0, 30)}"`);
  }
  let minContrast = 21;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const el = t.parentElement;
    if (!t.textContent.trim() || !visible(el) || el.closest('.sr-only, option')) continue;
    const cs = getComputedStyle(el);
    const fg = over(parse(cs.color), background(el));
    const bg = background(el);
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    const large = parseFloat(cs.fontSize) >= 18.66 || (parseFloat(cs.fontSize) >= 14 && Number(cs.fontWeight) >= 700);
    minContrast = Math.min(minContrast, ratio);
    if (ratio < (large ? 3 : 4.5) && Number(cs.opacity) === 1 && !el.closest(':disabled')) issues.push(`contrast ${ratio.toFixed(2)} for "${t.textContent.trim().slice(0, 30)}"`);
  }
  return {issues, minContrast: Number(minContrast.toFixed(2)),
    source: root.querySelector('.adv-source')?.textContent || '', reply: root.querySelector('.adv-reply')?.innerText || '',
    invalid: root.querySelector('.adv-ask input')?.getAttribute('aria-invalid') === 'true',
    busy: root.querySelector('.adv-ask .adv-btn')?.getAttribute('aria-busy') === 'true',
    chip: root.querySelector('.adv-chip.is-selected')?.textContent || '',
    findings: root.querySelectorAll('.adv-all[open] .adv-finding').length};
}

async function run() {
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) throw new Error('Build the app first: npm run build --prefix frontend');
  fs.mkdirSync(OUT, {recursive: true});
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const results = [];
  for (const vp of VIEWPORTS) for (const sc of SCENARIOS) {
    const page = await browser.newPage({viewport: {width: vp.width, height: vp.height}});
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|api\/(agent|science)/.test(m.text())) errors.push(m.text()); });
    await page.route('**/api/agent/**', async route => {
      const kind = route.request().url().includes('/briefing') ? 'briefing' : 'operation';
      const answer = sc.agent(route, kind);
      if (answer === null) return; // never answers: the loading / busy state stays on screen
      await route.fulfill(answer);
    });
    await page.route('**/api/science/**', route => route.fulfill({status: 404, body: ''}));
    const entry = {viewport: vp.name, scenario: sc.name};
    try {
      await page.goto(base, {waitUntil: 'networkidle'});
      await page.getByText('Fly to Ridge A', {exact: true}).first().evaluate(el => el.click());
      await page.waitForSelector('.advisor', {state: 'attached'});
      await page.evaluate(() => { const s = document.querySelector('.advisor .adv-next') ? null : document.querySelector('.advisor summary'); s?.click(); });
      await page.waitForSelector('.adv-next', {state: 'attached'});
      if (sc.ask) {
        await page.locator('#advisor-ask-input').fill(sc.ask);
        await page.locator('.adv-ask').evaluate(f => f.requestSubmit());
      }
      if (sc.openFindings) await page.evaluate(() => { document.querySelector('.adv-all').open = true; });
      const settle = sc.expect.source ? `document.querySelector('.adv-source') && ${sc.expect.source}.test(document.querySelector('.adv-source').textContent)`
        : sc.expect.reply ? `document.querySelector('.adv-reply') && ${sc.expect.reply}.test(document.querySelector('.adv-reply').innerText)` : 'true';
      await page.waitForFunction(settle, null, {timeout: 20000}).catch(() => {});
      await page.waitForTimeout(sc.expect.busy ? 300 : 1600);
      const target = sc.openFindings ? '.adv-all' : sc.ask ? '.adv-ask' : '.adv-next';
      await page.evaluate(q => document.querySelector(q)?.scrollIntoView({block: 'start'}), target);
      await page.waitForTimeout(300);
      const shot = path.join(OUT, `${vp.name}-${sc.name}.png`);
      await page.screenshot({path: shot});
      const a = await page.evaluate(audit);
      const failed = [...a.issues, ...errors.map(e => `console: ${e}`)];
      const ex = sc.expect;
      if (ex.source && !ex.source.test(a.source)) failed.push(`expected source ${ex.source}, got "${a.source}"`);
      if (ex.reply && !ex.reply.test(a.reply)) failed.push(`expected reply ${ex.reply}, got "${a.reply}"`);
      if (ex.invalid && !a.invalid) failed.push('input should be aria-invalid');
      if (ex.busy && !a.busy) failed.push('submit button should be aria-busy');
      if (ex.chip && a.chip !== ex.chip) failed.push(`expected selected chip ${ex.chip}, got "${a.chip}"`);
      if (ex.findings && !a.findings) failed.push('findings list should be open and populated');
      Object.assign(entry, {ok: failed.length === 0, failed, minContrast: a.minContrast, screenshot: path.relative(process.cwd(), shot)});
    } catch (error) {
      Object.assign(entry, {ok: false, failed: [`harness: ${error.message.split('\n')[0]}`]});
    }
    results.push(entry);
    console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${vp.name.padEnd(9)} ${sc.name.padEnd(16)} contrast≥${entry.minContrast ?? '-'} ${entry.failed.join(' | ')}`);
    await page.close();
  }
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok).length;
  console.log(`${results.length - failed}/${results.length} passed · report ${path.relative(process.cwd(), path.join(OUT, 'report.json'))}`);
  process.exit(failed ? 1 : 0);
}

run().catch(error => { console.error(error); process.exit(1); });
