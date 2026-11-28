// Loads pages the way a visitor does and records how long each took.
//
// Visit types:
//   cold     a new browser profile for every page, straight to the URL
//   warm     a browser that has already been to the site (assets cached, sync's copy saved),
//            straight to the URL
//   click    one session walks the pattern, clicking the real link from each page to the next
//   journey  one session: a cold landing on the pattern's home page, then N in-app clicks; then the
//            same session again in the same profile (the return visit)
// Every visit is repeated `runs` times. Each repetition is one line of visits.jsonl, raw.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { collector } from './collect.mjs';
import { detectFromHtml, detectInPage } from './detect.mjs';
import { PROFILES } from './config.mjs';
import { homePage } from './pages.mjs';

const DATA_TYPES = new Set(['fetch', 'xhr']);
const BUCKET = { document: 'doc', script: 'js', stylesheet: 'css', image: 'img', font: 'font', fetch: 'data', xhr: 'data' };
const HYDRATION = /Hydration failed|did not match|didn't match|Minified React error #(418|423|425)/i;
const norm = (p) => (p || '/').replace(/\/+$/, '') || '/';

const git = (dir) => { try { return execSync('git rev-parse --short HEAD', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } };

// The browser: DMS_PERF_CHROME, else the image's Chromium (PUPPETEER_EXECUTABLE_PATH, what the server image sets for
// its own headless loaders, or /usr/bin/chromium), else the system's Chrome, else Playwright's own download.
const CHROME_PATHS = () => [process.env.DMS_PERF_CHROME, process.env.PUPPETEER_EXECUTABLE_PATH, '/usr/bin/chromium', '/usr/bin/chromium-browser']
  .filter(Boolean).filter((p) => fs.existsSync(p));

async function launch() {
  const args = ['--enable-features=SoftNavigationHeuristics', '--disable-extensions'];
  // in a container, as root: Chrome's sandbox can't start, and /dev/shm is small
  if (process.getuid?.() === 0) args.push('--no-sandbox', '--disable-dev-shm-usage');
  // extra switches, space-separated. A headless browser draws WebGL in software unless told otherwise, and a map
  // section then costs seconds of main thread it doesn't cost a visitor: see documentation/dms-server-env.md
  if (process.env.DMS_PERF_CHROME_ARGS) args.push(...process.env.DMS_PERF_CHROME_ARGS.split(/\s+/).filter(Boolean));
  const exe = CHROME_PATHS()[0];
  if (exe || process.env.DMS_PERF_CHROME) return chromium.launch({ executablePath: exe || process.env.DMS_PERF_CHROME, args });
  try { return await chromium.launch({ channel: 'chrome', args }); }
  catch {
    // Playwright's own browser, when system Chrome isn't there
    return chromium.launch({ args });
  }
}

/** Records what a page requests, from `start()` until `stop()`. */
function networkLog(page) {
  let entries = [], pending = [], errors = { console: [], page: [], failed: [] };
  const onFinished = (req) => {
    const entry = { type: req.resourceType(), key: `${req.method()} ${req.url()} ${(req.postData() || '').replace(/("(?:token|password)"\s*:\s*")[^"]*/g, '$1…')}`, url: req.url(), bytes: 0, status: null, ms: Math.max(0, Math.round(req.timing().responseEnd)) };
    entries.push(entry);
    pending.push((async () => {
      try {
        const [sizes, resp] = await within(Promise.all([req.sizes(), req.response()]), 3000, [{}, null]);
        entry.bytes = (sizes.responseBodySize || 0) + (sizes.responseHeadersSize || 0);
        entry.status = resp ? resp.status() : null;
      } catch { /* the page went away */ }
    })());
  };
  const onFailed = (req) => { if (req.failure()?.errorText !== 'net::ERR_ABORTED') errors.failed.push(`${req.url()} ${req.failure()?.errorText || ''}`.trim()); };
  const onConsole = (msg) => { if (msg.type() === 'error') errors.console.push(msg.text().slice(0, 300)); };
  const onPageError = (err) => errors.page.push(String(err.message || err).slice(0, 300));
  page.on('requestfinished', onFinished); page.on('requestfailed', onFailed);
  page.on('console', onConsole); page.on('pageerror', onPageError);
  return {
    reset() { entries = []; pending = []; errors = { console: [], page: [], failed: [] }; },
    async summary() {
      await within(Promise.all(pending), 5000, null);
      const bytes = { doc: 0, js: 0, css: 0, img: 0, font: 0, data: 0, other: 0, total: 0 };
      const seen = new Map();
      let data = 0, bad = 0;
      const kinds = Object.fromEntries(['component', 'content', 'sync', 'tracking', 'other'].map((k) => [k, { n: 0, bytes: 0, ms: 0 }]));
      for (const e of entries) {
        const b = BUCKET[e.type] || 'other';
        bytes[b] += e.bytes; bytes.total += e.bytes;
        if (e.status >= 400) bad++;
        if (DATA_TYPES.has(e.type)) {
          data++; seen.set(e.key, (seen.get(e.key) || 0) + 1);
          const k = kinds[dataKind(e)]; k.n++; k.bytes += e.bytes; k.ms += e.ms;
        }
      }
      const dups = [...seen.entries()].filter(([, n]) => n > 1);
      const hydration = errors.console.concat(errors.page).filter((t) => HYDRATION.test(t)).length;
      return {
        bytes,
        dataKinds: kinds,
        requests: { total: entries.length, data, component: kinds.component.n, duplicates: dups.reduce((a, [, n]) => a + n - 1, 0), failed: errors.failed.length + bad },
        duplicateRequests: dups.slice(0, 5).map(([k, n]) => `${n}× ${readable(k).slice(0, 220)}`),
        slowestRequests: entries.filter((e) => DATA_TYPES.has(e.type)).sort((x, y) => y.ms - x.ms).slice(0, 3).map((e) => ({ ms: e.ms, bytes: e.bytes, what: readable(e.key).slice(0, 220) })),
        errors: { console: errors.console.length, page: errors.page.length, hydration, samples: errors.page.concat(errors.console).slice(0, 3) },
      };
    },
  };
}

/** Calls into the collector; a document that reloads under us (a redirect, a forced reload) is retried. */
async function inPage(page, fn, arg) {
  for (let attempt = 0; ; attempt++) {
    try { return await page.evaluate(fn, arg); }
    catch (e) {
      if (attempt >= 4 || !/context was destroyed|navigation|Target closed|Cannot find context/i.test(String(e.message))) throw e;
      await page.waitForLoadState('domcontentloaded').catch(() => {});
    }
  }
}
const waitComplete = (page, opts) => inPage(page, (o) => window.__dmsPerf.waitComplete(o), opts);
/** `promise`, or `fallback` after `ms`: nothing the browser does may hold a run up forever. */
const within = (promise, ms, fallback) => {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((resolve, reject) => { timer = setTimeout(() => (fallback instanceof Error ? reject(fallback) : resolve(fallback)), ms); }),
  ]);
};
/** What a data request is for. Component data is dataset rows (Falcor's uda / dama routes). */
const dataKind = (e) => {
  const u = readable(e.key);
  if (/\/sync\//.test(e.url)) return 'sync';
  if (/\/track\//.test(e.url)) return 'tracking';
  if (/\[\s*"(uda|dama)"/.test(u)) return 'component';
  if (/\[\s*"dms"/.test(u)) return 'content';
  return 'other';
};
const readable = (url) => { try { return decodeURIComponent(url); } catch { return url; } };
const round = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v);
const roundAll = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, Math.round(v)]));

/** A document load: cold or warm, depending on what the context already holds. */
// A signed-in profile's starting state: sign in once through the target's own form, as a person would, and keep
// what the browser then holds (the token in localStorage, and the session cookie where the server sets one).
async function signIn(browser, cfg, log) {
  const email = process.env.DMS_PERF_EMAIL || process.env.DMS_EMAIL;
  const password = process.env.DMS_PERF_PASSWORD || process.env.DMS_PASSWORD;
  if (!email || !password) throw new Error('The signed_in profile needs DMS_PERF_EMAIL and DMS_PERF_PASSWORD (or DMS_EMAIL and DMS_PASSWORD)');
  const ctx = await browser.newContext({ viewport: cfg.viewport });
  try {
    const page = await ctx.newPage();
    log(`signing in at ${cfg.target}${cfg.loginPath}`);
    await page.goto(cfg.target + cfg.loginPath, { waitUntil: 'load', timeout: cfg.timeoutMs });
    // The sign-in page arrives server-rendered: its inputs exist before React hydrates, and typing into them
    // then never reaches the form's state (the server answers "Email, password, and project are required").
    // So wait for the page to settle (some pages poll and never go idle: at most 8 s), and submit again if no
    // token arrives.
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    let signedIn = false;
    for (let attempt = 1; attempt <= 4 && !signedIn; attempt++) {
      // the form holding a password field; some themes' sign-in pages have no <form> or no submit button
      await page.locator('input[type=password]').first().waitFor({ timeout: 30000 });
      const forms = page.locator('form').filter({ has: page.locator('input[type=password]') });
      const box = (await forms.count()) ? forms.first() : page.locator('body');
      await box.locator('input[type=email], input[type=text]').first().fill(email);
      await box.locator('input[type=password]').first().fill(password);
      const submit = box.locator('button[type=submit]');
      await ((await submit.count()) ? submit.first() : box.getByRole('button', { name: /sign in|log in|login/i }).first()).click();
      signedIn = await page.waitForFunction(() => !!localStorage.getItem('userToken'), null, { timeout: 10000 }).then(() => true, () => false);
      if (!signedIn) { log(`sign-in attempt ${attempt}: no token yet`); await page.waitForTimeout(2000); }
    }
    if (!signedIn) throw new Error('no token after 4 attempts');
    // the session cookie is written by a request right after sign-in; let it land
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    return await ctx.storageState();
  } catch (e) {
    throw new Error(`Signing in at ${cfg.target}${cfg.loginPath} failed: ${String(e.message || e).split('\n')[0]}`);
  } finally { await ctx.close(); }
}

async function loadVisit(ctx, cfg, url) {
  const page = await ctx.newPage();
  const net = networkLog(page);
  const out = { ms: {}, status: null };
  try {
    await within(measureLoad(page, net, cfg, url, out), cfg.timeoutMs + 30000, new Error(`no result ${Math.round(cfg.timeoutMs / 1000) + 30} s after starting the load`));
  } catch (e) {
    out.error = String(e.message || e).split('\n')[0].slice(0, 300);
    Object.assign(out, await net.summary().catch(() => ({})));
  }
  return { page, net, out };
}

async function measureLoad(page, net, cfg, url, out) {
  {
    const resp = await page.goto(url, { waitUntil: 'commit', timeout: cfg.timeoutMs });
    out.status = resp ? resp.status() : null;
    const done = await waitComplete(page, { quietMs: cfg.quietMs, timeoutMs: cfg.timeoutMs });
    const m = await inPage(page, () => window.__dmsPerf.read());
    let html = '';
    try { html = resp ? await within(resp.text(), 5000, '') : ''; } catch { /* body gone after a redirect */ }
    const doc = detectFromHtml(html);
    Object.assign(out, await net.summary());
    const usable = await inPage(page, (from) => window.__dmsPerf.usable(from), m.lcp?.time ?? m.fcp ?? 0);
    out.ms = { ttfb: round(m.ttfb), fcp: round(m.fcp), lcp: round(m.lcp?.time ?? null), usable: round(usable), domContentLoaded: round(m.domContentLoaded), load: round(m.load), complete: round(done.complete), idle: round(done.idle) };
    out.phases = roundAll(await inPage(page, (u) => window.__dmsPerf.phases(0, u), done.complete));
    out.lastActivity = Object.fromEntries(Object.entries(done.last || {}).map(([k, v]) => [k, Math.round(v)]));
    out.timedOut = done.timedOut; out.stuck = done.timedOut ? { inflight: done.inflight, loading: done.loading } : undefined;
    out.cls = round(m.cls * 1000) / 1000; out.tbt = round(m.tbt); out.longestTask = round(m.longestTask);
    out.lcpElement = m.lcp ? m.lcp.tag : null;
    out.bytes.hydration = doc.hydrationBytes; out.bytes.docDecoded = m.docDecoded;
    out.serverTiming = m.serverTiming; out.marks = m.marks; out.loadingSeen = m.loadingSeen; out.loadingSections = m.loadingSections; out.heap = m.heap;
    out.finalPath = norm(new URL(page.url()).pathname);
    out.mode = { ...doc, ...(await inPage(page, detectInPage)) };
  }
}

/** Marks the link to `targetPath` on the current page, if there is one. Runs in the page. */
function findLink(targetPaths) {
  const norm = (p) => (p || '/').replace(/\/+$/, '') || '/';
  document.querySelectorAll('[data-dms-perf-link]').forEach((el) => el.removeAttribute('data-dms-perf-link'));
  const links = [...document.querySelectorAll('a[href]')].filter((a) => {
    try { const u = new URL(a.href, location.href); return u.origin === location.origin && targetPaths.includes(norm(u.pathname)) && !a.target; }
    catch { return false; }
  });
  if (!links.length) return null;
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const link = links.find(visible) || links[0];
  link.setAttribute('data-dms-perf-link', '1');
  return { visible: visible(link) };
}

/** The pattern's pages the current page links to. Runs in the page. */
function linkedPaths(paths) {
  const norm = (p) => (p || '/').replace(/\/+$/, '') || '/';
  const want = new Set(paths);
  const out = new Set();
  for (const a of document.querySelectorAll('a[href]')) {
    try { const u = new URL(a.href, location.href); const p = norm(u.pathname); if (u.origin === location.origin && want.has(p) && !a.target) out.add(p); }
    catch { /* not a URL */ }
  }
  return [...out].sort();
}

const pageText = () => (document.querySelector('main') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 20000);

/** An in-app navigation: click the link to `targetPath` on a page that is already complete. */
async function clickVisit(page, net, cfg, targetPaths) {
  try {
    return await within(measureClick(page, net, cfg, targetPaths), cfg.timeoutMs + 45000, new Error(`no result ${Math.round(cfg.timeoutMs / 1000) + 45} s after the click`));
  } catch (e) {
    return { ms: {}, error: String(e.message || e).split('\n')[0].slice(0, 300) };
  }
}

async function measureClick(page, net, cfg, targetPaths) {
  const out = { ms: {} };
  const link = await inPage(page, findLink, targetPaths);
  if (!link) { out.noLink = true; return out; }
  const before = await inPage(page, () => ({ origin: performance.timeOrigin, cls: window.__dmsPerf.cls, softNavs: window.__dmsPerf.softNavs.length }));
  const textBefore = await inPage(page, pageText);
  net.reset();
  const wall = Date.now();
  const target = page.locator('[data-dms-perf-link]').first();
  try {
    if (link.visible) await target.click({ timeout: 5000, noWaitAfter: true });
    else throw new Error('hidden');
  } catch (e) {
    // a link inside a collapsed menu: clicked from script, which the router handles the same way.
    // Chrome doesn't count it as a user action, so there is no soft-navigation entry for it.
    out.scriptedClick = true;
    // why the real click did not land, when the link was visible (Playwright's own account of the wait)
    if (link.visible) out.clickError = String(e.message || e).split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 14).join(' | ').slice(0, 900);
    await inPage(page, () => document.querySelector('[data-dms-perf-link]')?.click());
  }
  try {
    await page.waitForFunction((ps) => ps.includes((location.pathname || '/').replace(/\/+$/, '') || '/'), targetPaths, { timeout: 15000, polling: 50 });
  } catch { out.urlNeverChanged = true; }
  const after = await inPage(page, () => {
    let clickAt = null;
    try { clickAt = Number(sessionStorage.getItem('__dmsPerfClick')) || null; } catch { /* storage off */ }
    return { origin: performance.timeOrigin, lastClick: window.__dmsPerf.lastClick, clickAt };
  });
  out.fullLoad = after.origin !== before.origin;   // the click loaded a new document
  const since = out.fullLoad ? 0 : (after.lastClick ?? 0);
  const done = await waitComplete(page, { quietMs: cfg.quietMs, timeoutMs: cfg.timeoutMs, since });
  const m = await inPage(page, (s) => window.__dmsPerf.read(s), since);
  // a new document's clock starts at its own navigation; put it back on the click's clock
  // The runner can wait seconds before its click lands: Playwright waits for an animation frame, and a page
  // that isn't the browser's front page gets none (several pages measure at once). That wait is the
  // runner's, not the site's, so a click that loads a document is timed from the click event itself.
  const clickWall = out.fullLoad && after.clickAt >= wall ? after.clickAt : wall;
  out.clickWaitMs = Math.round(clickWall - wall);
  const shift = out.fullLoad ? (after.origin - clickWall) : -since;
  const rel = (t) => (t == null ? null : round(t + shift));
  const soft = out.fullLoad ? null : m.softNavs.slice(before.softNavs).find((s) => s.start >= since - 5);
  const urlChange = out.fullLoad ? null : (m.urlChanges.find(([t]) => t >= since - 5) || [])[0];
  Object.assign(out, await net.summary());
  const painted = out.fullLoad ? (m.lcp?.time ?? m.fcp ?? 0) : (soft?.lcp ?? soft?.fcp ?? since);
  const usable = await inPage(page, (from) => window.__dmsPerf.usable(from), painted);
  out.phases = roundAll(await inPage(page, ([a, b]) => window.__dmsPerf.phases(a, b), [since, done.complete]));
  out.ms = {
    usable: rel(usable),
    urlChange: rel(urlChange ?? null),
    fcp: out.fullLoad ? rel(m.fcp) : (soft?.fcp != null ? rel(soft.fcp) : null),
    lcp: out.fullLoad ? rel(m.lcp?.time ?? null) : (soft?.lcp != null ? rel(soft.lcp) : null),
    complete: rel(done.complete), idle: rel(done.idle),
  };
  for (const k of ['complete', 'idle', 'usable']) if (out.ms[k] < 0) out.ms[k] = 0;
  out.lastActivity = Object.fromEntries(Object.entries(done.last || {}).map(([k, v]) => [k, Math.round(v + shift)]).filter(([, v]) => v >= 0));
  out.timedOut = done.timedOut;
  out.cls = round(((out.fullLoad ? m.cls : m.cls - before.cls)) * 1000) / 1000;
  out.tbt = round(m.tbt); out.longestTask = round(m.longestTask);
  out.networkFree = out.requests.data === 0;       // the page came from the browser alone
  const textAfter = await inPage(page, pageText);
  out.staleContent = !out.urlNeverChanged && textAfter === textBefore;   // URL changed, page didn't
  out.finalPath = norm(new URL(page.url()).pathname);
  return out;
}

/**
 * Runs one measurement and saves it in a folder (`cfg.out`, else scratchpad/<app>-<type>/perf/<date>-<label>).
 * `site`: { pattern, pages, allPages, connection, repoRoot } and, for the server's job (./index.js), optionally
 * `signal` (an AbortSignal: aborting closes the browser and ends the run), `onRecord(run)` (after every visit, for
 * progress) and `meta` (kept on run.json: who asked, measured from the server).
 */
export async function runPerf(cfg, site, log = () => {}) {
  const { pattern, pages, allPages, connection, repoRoot, signal = null, onRecord = null, meta = null } = site;
  const d = new Date(), two = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`;
  const outDir = path.resolve(cfg.out || path.join(repoRoot, 'scratchpad', `${connection.app}-${connection.type}`.replace(/[^\w.-]+/g, '_'), 'perf', `${stamp}-${cfg.label}`.replace(/[^\w.-]+/g, '_')));
  fs.mkdirSync(outDir, { recursive: true });
  const visitsFile = path.join(outDir, 'visits.jsonl');
  fs.writeFileSync(visitsFile, '');
  const home = homePage(allPages.filter((p) => p.published)) || pages[0];
  const urlOf = (p) => cfg.target + p.path;
  const byPath = new Map(allPages.map((p) => [norm(p.path), p]));
  // the pattern's base URL shows its home page, so a link to either is a link to home
  const basePath = norm('/' + String(pattern.base_url || '').replace(/^\/+|\/+$/g, ''));
  const pathsOf = (p) => (p.path === home.path ? [...new Set([norm(p.path), basePath])] : [norm(p.path)]);

  const browser = await launch();
  // cancelling closes the browser: whatever it was doing fails, and record() refuses the rest
  const onAbort = () => { run.cancelled = true; browser.close().catch(() => {}); };
  signal?.addEventListener('abort', onAbort, { once: true });
  const run = {
    version: 1, label: cfg.label, started: new Date().toISOString(), finished: null,
    config: { ...cfg, out: undefined }, connection, pattern,
    pages: pages.map((p) => ({ id: p.id, slug: p.slug, path: p.path, title: p.title })),
    home: home.path, journey: null, mode: null, links: {},
    environment: {
      chrome: browser.version(), platform: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model, cores: os.cpus().length,
      memoryGB: Math.round(os.totalmem() / 2 ** 30), node: process.version, host: os.hostname(),
      commits: { app: git(repoRoot), dms: git(path.join(repoRoot, 'src/dms')) },
    },
    counts: { visits: 0, errors: 0 },
    ...(meta || {}),
  };
  const saveRun = () => fs.writeFileSync(path.join(outDir, 'run.json'), JSON.stringify(run, null, 1));
  // a target that stops answering (restarted, or down) must end the run, not fill it with failures
  let failedInARow = 0;
  const record = (v) => {
    if (signal?.aborted) throw new Error('cancelled');
    run.counts.visits++; if (v.error) run.counts.errors++;
    fs.appendFileSync(visitsFile, JSON.stringify(v) + '\n');
    onRecord?.(run);
    if (v.visit === 'cold' || v.visit === 'warm') failedInARow = v.error ? failedInARow + 1 : 0;
    if (failedInARow >= 6) {
      run.aborted = `stopped after ${failedInARow} page loads in a row failed: ${v.error}`;
      throw new Error(`${cfg.target} stopped answering (${failedInARow} page loads in a row failed: ${v.error}). The run is incomplete; its folder is ${outDir}`);
    }
  };
  // the current profile's starting browser state: null (a new visitor), or a signed-in one (signIn)
  let storageState = null;
  const newContext = () => browser.newContext({ viewport: cfg.viewport, ...(storageState ? { storageState } : {}) })
    .then(async (ctx) => { await ctx.addInitScript(collector); return ctx; });

  try {
    // the server's first request after a restart isn't the page's doing: one discarded request
    log(`warming up ${urlOf(home)}`);
    await fetch(urlOf(home), { signal: AbortSignal.timeout(cfg.timeoutMs) }).then((r) => r.text()).catch(() => {});

    const reuse = cfg.pagesFrom ? JSON.parse(fs.readFileSync(path.join(path.resolve(cfg.pagesFrom), 'run.json'), 'utf8')) : null;
    if (reuse?.journey) run.journey = reuse.journey;
    if (reuse?.links) run.links = { ...reuse.links };
    const linkable = [...new Set([...allPages.filter((x) => x.published).map((x) => norm(x.path)), basePath])];

    for (const profile of cfg.profiles) {
      storageState = PROFILES[profile].signedIn ? await signIn(browser, cfg, log) : null;
      const setMode = (out) => { if (!run.mode && out.mode) { run.mode = { ...out.mode, preload: pattern.preload_data }; saveRun(); } };
      const t0 = Date.now();
      const mins = () => Math.round((Date.now() - t0) / 60000);
      // `cfg.parallel` browsers work through `items` at once; `work(take, w)` runs in each
      const together = async (items, work) => {
        let next = 0, stop = null;
        const take = () => (stop || next >= items.length ? null : { item: items[next], i: next++ });
        await Promise.all(Array.from({ length: Math.max(1, Math.min(cfg.parallel, items.length)) }, (_, w) =>
          work(take, w).catch((e) => { stop = stop || e; })));
        if (stop) throw stop;
      };
      const linksOf = async (page) => (await within(inPage(page, linkedPaths, linkable), 5000, [])).map((x) => (x === basePath ? norm(home.path) : x));
      for (let rep = 1; rep <= cfg.runs; rep++) {
        const tag = `[${profile}] run ${rep}/${cfg.runs}`;
        // cold: a new browser profile for every page
        if (cfg.visits.includes('cold')) {
          await together(pages, async (take) => {
            for (let job; (job = take());) {
              const p = job.item;
              log(`${tag} · cold ${job.i + 1}/${pages.length} ${p.path} · ${mins()} min in`);
              const ctx = await newContext();
              try {
                const cold = await loadVisit(ctx, cfg, urlOf(p));
                setMode(cold.out);
                if (!cold.out.error) run.links[norm(p.path)] = await linksOf(cold.page).catch(() => []);
                record({ profile, rep, page: p.slug, path: p.path, visit: 'cold', ...cold.out, mode: undefined });
                await within(cold.page.close(), 5000, null);
              } finally { await within(ctx.close(), 10000, null); }
            }
          });
          saveRun();
        }

        // warm: a browser that has already been to the site (assets cached, sync's copy saved)
        // opens every page's URL directly. The visit that primes it isn't recorded.
        if (cfg.visits.includes('warm')) {
          await together(pages, async (take) => {
            const ctx = await newContext();
            try {
              const prime = await loadVisit(ctx, cfg, urlOf(home));
              if (prime.out.error) throw new Error(`${urlOf(home)} did not load: ${prime.out.error}`);
              setMode(prime.out);
              await within(prime.page.close(), 5000, null);
              for (let job; (job = take());) {
                const p = job.item;
                log(`${tag} · warm ${job.i + 1}/${pages.length} ${p.path} · ${mins()} min in`);
                const warm = await loadVisit(ctx, cfg, urlOf(p));
                if (!warm.out.error) run.links[norm(p.path)] = await linksOf(warm.page).catch(() => []);
                record({ profile, rep, page: p.slug, path: p.path, visit: 'warm', ...warm.out, mode: undefined });
                await within(warm.page.close(), 5000, null);
              }
            } finally { await within(ctx.close(), 10000, null); }
          });
          saveRun();
        }

        // click: a session walks the pattern, clicking from each page to the next. A page the session
        // isn't on a link to is reached from a page known to link to it (the loads above, or the run
        // named in --pages-from, recorded who links to whom); a page nothing links to is skipped.
        if (cfg.visits.includes('click')) {
          const inbound = new Map();
          for (const [src, targets] of Object.entries(run.links)) for (const t of targets) { if (!inbound.has(t)) inbound.set(t, []); inbound.get(t).push(src); }
          const known = Object.keys(run.links).length > 0;
          const size = Math.ceil(pages.length / Math.max(1, Math.min(cfg.parallel, pages.length)));
          const slices = []; for (let i = 0; i < pages.length; i += size) slices.push(pages.slice(i, i + size));
          let done = 0;
          await together(slices, async (take) => {
            for (let job; (job = take());) {
              const ctx = await newContext();
              let cur = null;
              const open = async (pathOrPage) => {
                if (cur) await within(cur.page.close(), 5000, null);
                cur = await loadVisit(ctx, cfg, cfg.target + (pathOrPage.path || pathOrPage));
                cur.fresh = true;   // a document load, not an in-app navigation
                return !cur.out.error;
              };
              const herePath = () => norm(new URL(cur.page.url()).pathname);
              try {
                if (!(await open(home))) throw new Error(`${urlOf(home)} did not load: ${cur.out.error}`);
                setMode(cur.out);
                for (const p of job.item) {
                  log(`${tag} · click ${++done}/${pages.length} ${p.path} · ${mins()} min in`);
                  const base = { profile, rep, page: p.slug, path: p.path, visit: 'click' };
                  const targets = pathsOf(p), me = norm(p.path);
                  const parent = p.parent && allPages.find((x) => x.id === p.parent && x.published);
                  // pages that link to this one, best first: its parent, the home page, then any other
                  const linkers = (inbound.get(me) || []).filter((s) => s !== me);
                  const rank = (s) => (parent && s === norm(parent.path) ? 0 : s === norm(home.path) ? 1 : 2);
                  const sources = known ? [...linkers].sort((a, b) => rank(a) - rank(b)) : [parent, home].filter(Boolean).map((x) => norm(x.path)).filter((s) => s !== me);
                  if (known && !sources.length) { record({ ...base, noLink: true, orphan: true }); continue; }
                  // already on the page: click to it from a page that links to it
                  if (targets.includes(herePath()) && !(sources[0] && await open(sources[0]))) { record({ ...base, noLink: true }); if (!(await open(home))) throw new Error(`${urlOf(home)} did not load`); continue; }
                  let from = herePath();
                  let out = await clickVisit(cur.page, cur.net, cfg, targets);
                  // the page links to it when loaded directly, but not after the session navigated to it
                  const navStale = out.noLink && linkers.includes(from) && !cur.fresh;
                  if (out.noLink) {
                    for (const src of [...(navStale ? [from] : []), ...sources.filter((s) => s !== from)].slice(0, 2)) {
                      if (!(await open(src))) continue;
                      from = herePath();
                      out = await clickVisit(cur.page, cur.net, cfg, targets);
                      if (!out.noLink) break;
                    }
                  }
                  cur.fresh = false;
                  record({ ...base, from, ...out, ...(navStale ? { navStale: true } : {}) });
                  // a click that failed leaves the session somewhere unknown: start it again
                  if (out.error || out.timedOut || out.urlNeverChanged) {
                    if (!(await open(home))) throw new Error(`${urlOf(home)} did not load: ${cur.out.error}`);
                  }
                }
              } finally { await within(ctx.close(), 10000, null); }
            }
          });
          saveRun();
        }
      }

      if (cfg.visits.includes('journey')) {
        for (let rep = 1; rep <= cfg.runs; rep++) {
          log(`[${profile}] journey ${rep}/${cfg.runs}`);
          const ctx = await newContext();
          try {
            for (const pass of ['first', 'return']) {
              const land = await loadVisit(ctx, cfg, urlOf(home));
              let cumulative = land.out.ms.complete ?? 0, cumulativeIdle = land.out.ms.idle ?? 0;
              record({ profile, rep, visit: 'journey', pass, step: 0, page: home.slug, path: home.path, ...land.out, mode: undefined, cumulative: round(cumulative), cumulativeIdle: round(cumulativeIdle) });
              if (land.out.error) { await within(land.page.close(), 5000, null); break; }
              // the route: fixed after the first journey, so every repetition and every later run walks it
              const building = !run.journey;
              const route = building ? [] : run.journey;
              const visited = new Set([norm(home.path)]);
              for (let step = 1; step <= (building ? cfg.journeySteps : route.length); step++) {
                let next = route[step - 1];
                if (building) {
                  const linked = (await inPage(land.page, linkedPaths, [...byPath.keys()].filter((k) => byPath.get(k).published))).filter((x) => !visited.has(x));
                  if (!linked.length) break;
                  next = linked[(step * 7) % linked.length];   // spread across the nav, the same way each time
                  route.push(next);
                }
                visited.add(next);
                const out = await clickVisit(land.page, land.net, cfg, pathsOf(byPath.get(next) || { path: next }));
                cumulative += out.ms?.complete ?? 0; cumulativeIdle += out.ms?.idle ?? 0;
                record({ profile, rep, visit: 'journey', pass, step, page: byPath.get(next)?.slug ?? next, path: next, ...out, cumulative: round(cumulative), cumulativeIdle: round(cumulativeIdle) });
                if (out.noLink) break;
              }
              if (building) { run.journey = route; saveRun(); }
              const storage = await inPage(land.page, () => navigator.storage?.estimate?.().then((e) => e.usage ?? null).catch(() => null)).catch(() => null);
              record({ profile, rep, visit: 'journey-end', pass, storageBytes: storage });
              await within(land.page.close(), 5000, null);
            }
          } catch (e) {
            record({ profile, rep, visit: 'journey', error: String(e.message || e).split('\n')[0].slice(0, 300) });
          } finally { await within(ctx.close(), 10000, null); }
        }
      }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    run.finished = new Date().toISOString();
    saveRun();
    await within(browser.close(), 15000, null);
  }
  return { outDir, run };
}

export function loadRun(dir) {
  const d = path.resolve(dir);
  const run = JSON.parse(fs.readFileSync(path.join(d, 'run.json'), 'utf8'));
  const visits = fs.readFileSync(path.join(d, 'visits.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { dir: d, run, visits };
}
