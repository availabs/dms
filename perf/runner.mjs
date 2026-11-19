// Loads pages the way a visitor does and records how long each took.
//
// Visit types:
//   cold     a new browser profile, straight to the URL
//   warm     the same profile, the same URL again (HTTP cache, localStorage, IndexedDB kept)
//   click    from another page of the pattern, by clicking the real link
//   journey  one session: a cold landing on the pattern's home page, then N in-app clicks; then the
//            same session again in the same profile (the return visit)
// Every visit is repeated `runs` times. Each repetition is one line of visits.jsonl, raw.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';
import { collector } from './collect.js';
import { detectFromHtml, detectInPage } from './detect.js';
import { PROFILES } from './config.js';
import { homePage } from './pages.js';

const DATA_TYPES = new Set(['fetch', 'xhr']);
const BUCKET = { document: 'doc', script: 'js', stylesheet: 'css', image: 'img', font: 'font', fetch: 'data', xhr: 'data' };
const HYDRATION = /Hydration failed|did not match|didn't match|Minified React error #(418|423|425)/i;
const norm = (p) => (p || '/').replace(/\/+$/, '') || '/';

const git = (dir) => { try { return execSync('git rev-parse --short HEAD', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } };

async function launch() {
  const args = ['--enable-features=SoftNavigationHeuristics', '--disable-extensions'];
  const exe = process.env.DMS_PERF_CHROME;
  try { return await chromium.launch(exe ? { executablePath: exe, args } : { channel: 'chrome', args }); }
  catch (e) {
    if (exe) throw e;
    // Playwright's own browser, when system Chrome isn't there
    return chromium.launch({ args });
  }
}

/** Records what a page requests, from `start()` until `stop()`. */
function networkLog(page) {
  let entries = [], pending = [], errors = { console: [], page: [], failed: [] };
  const onFinished = (req) => {
    const entry = { type: req.resourceType(), key: `${req.method()} ${req.url()} ${req.postData() || ''}`, url: req.url(), bytes: 0, status: null };
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
      for (const e of entries) {
        const b = BUCKET[e.type] || 'other';
        bytes[b] += e.bytes; bytes.total += e.bytes;
        if (e.status >= 400) bad++;
        if (DATA_TYPES.has(e.type)) { data++; seen.set(e.key, (seen.get(e.key) || 0) + 1); }
      }
      const dups = [...seen.entries()].filter(([, n]) => n > 1);
      const hydration = errors.console.concat(errors.page).filter((t) => HYDRATION.test(t)).length;
      return {
        bytes,
        requests: { total: entries.length, data, duplicates: dups.reduce((a, [, n]) => a + n - 1, 0), failed: errors.failed.length + bad },
        duplicateRequests: dups.slice(0, 5).map(([k, n]) => `${n}× ${readable(k).slice(0, 220)}`),
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
const readable = (url) => { try { return decodeURIComponent(url); } catch { return url; } };
const round = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v);

/** A document load: cold or warm, depending on what the context already holds. */
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
    out.ms = { ttfb: round(m.ttfb), fcp: round(m.fcp), lcp: round(m.lcp?.time ?? null), domContentLoaded: round(m.domContentLoaded), load: round(m.load), complete: round(done.complete), idle: round(done.idle) };
    out.lastActivity = Object.fromEntries(Object.entries(done.last || {}).map(([k, v]) => [k, Math.round(v)]));
    out.timedOut = done.timedOut; out.stuck = done.timedOut ? { inflight: done.inflight, loading: done.loading } : undefined;
    out.cls = round(m.cls * 1000) / 1000; out.tbt = round(m.tbt); out.longestTask = round(m.longestTask);
    out.lcpElement = m.lcp ? m.lcp.tag : null;
    out.bytes.hydration = doc.hydrationBytes; out.bytes.docDecoded = m.docDecoded;
    out.serverTiming = m.serverTiming; out.marks = m.marks; out.loadingSeen = m.loadingSeen; out.heap = m.heap;
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
  } catch {
    // a link inside a collapsed menu: clicked from script, which the router handles the same way.
    // Chrome doesn't count it as a user action, so there is no soft-navigation entry for it.
    out.scriptedClick = true;
    await inPage(page, () => document.querySelector('[data-dms-perf-link]')?.click());
  }
  try {
    await page.waitForFunction((ps) => ps.includes((location.pathname || '/').replace(/\/+$/, '') || '/'), targetPaths, { timeout: 15000, polling: 50 });
  } catch { out.urlNeverChanged = true; }
  const after = await inPage(page, () => ({ origin: performance.timeOrigin, lastClick: window.__dmsPerf.lastClick }));
  out.fullLoad = after.origin !== before.origin;   // the click loaded a new document
  const since = out.fullLoad ? 0 : (after.lastClick ?? 0);
  const done = await waitComplete(page, { quietMs: cfg.quietMs, timeoutMs: cfg.timeoutMs, since });
  const m = await inPage(page, (s) => window.__dmsPerf.read(s), since);
  // a new document's clock starts at its own navigation; put it back on the click's clock
  const shift = out.fullLoad ? (after.origin - wall) : -since;
  const rel = (t) => (t == null ? null : round(t + shift));
  const soft = out.fullLoad ? null : m.softNavs.slice(before.softNavs).find((s) => s.start >= since - 5);
  const urlChange = out.fullLoad ? null : (m.urlChanges.find(([t]) => t >= since - 5) || [])[0];
  Object.assign(out, await net.summary());
  out.ms = {
    urlChange: rel(urlChange ?? null),
    fcp: out.fullLoad ? rel(m.fcp) : (soft?.fcp != null ? rel(soft.fcp) : null),
    lcp: out.fullLoad ? rel(m.lcp?.time ?? null) : (soft?.lcp != null ? rel(soft.lcp) : null),
    complete: rel(done.complete), idle: rel(done.idle),
  };
  for (const k of ['complete', 'idle']) if (out.ms[k] < 0) out.ms[k] = 0;
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

export async function runPerf(cfg, site, log = () => {}) {
  const { pattern, pages, allPages, connection, repoRoot } = site;
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
  const run = {
    version: 1, label: cfg.label, started: new Date().toISOString(), finished: null,
    config: { ...cfg, out: undefined }, connection, pattern,
    pages: pages.map((p) => ({ id: p.id, slug: p.slug, path: p.path, title: p.title })),
    home: home.path, journey: null, mode: null,
    environment: {
      chrome: browser.version(), platform: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model, cores: os.cpus().length,
      memoryGB: Math.round(os.totalmem() / 2 ** 30), node: process.version, host: os.hostname(),
      commits: { app: git(repoRoot), dms: git(path.join(repoRoot, 'src/dms')) },
    },
    counts: { visits: 0, errors: 0 },
  };
  const saveRun = () => fs.writeFileSync(path.join(outDir, 'run.json'), JSON.stringify(run, null, 1));
  // a target that stops answering (restarted, or down) must end the run, not fill it with failures
  let failedInARow = 0;
  const record = (v) => {
    run.counts.visits++; if (v.error) run.counts.errors++;
    fs.appendFileSync(visitsFile, JSON.stringify(v) + '\n');
    if (v.visit === 'cold' || v.visit === 'warm') failedInARow = v.error ? failedInARow + 1 : 0;
    if (failedInARow >= 6) {
      run.aborted = `stopped after ${failedInARow} page loads in a row failed: ${v.error}`;
      throw new Error(`${cfg.target} stopped answering (${failedInARow} page loads in a row failed: ${v.error}). The run is incomplete; its folder is ${outDir}`);
    }
  };
  const newContext = () => browser.newContext({ viewport: cfg.viewport }).then(async (ctx) => { await ctx.addInitScript(collector); return ctx; });

  try {
    // the server's first request after a restart isn't the page's doing: one discarded request
    log(`warming up ${urlOf(home)}`);
    await fetch(urlOf(home), { signal: AbortSignal.timeout(cfg.timeoutMs) }).then((r) => r.text()).catch(() => {});

    // which page links to which: the click visits' starting points, found once
    const linkSource = new Map();
    const reuse = cfg.pagesFrom ? JSON.parse(fs.readFileSync(path.join(path.resolve(cfg.pagesFrom), 'run.json'), 'utf8')) : null;
    if (reuse?.journey) run.journey = reuse.journey;

    for (const profile of cfg.profiles) {
      void PROFILES[profile];
      const total = cfg.runs * pages.length;
      let n = 0; const t0 = Date.now();
      for (let rep = 1; rep <= cfg.runs; rep++) {
        for (const p of pages) {
          n++;
          const base = { profile, rep, page: p.slug, path: p.path };
          const eta = n > 1 ? Math.round((Date.now() - t0) / (n - 1) * (total - n + 1) / 60000) : null;
          log(`[${profile}] run ${rep}/${cfg.runs} · ${n}/${total} ${p.path}${eta != null ? ` · ~${eta} min left` : ''}`);

          if (cfg.visits.includes('cold') || cfg.visits.includes('warm')) {
            const ctx = await newContext();
            try {
              const cold = await loadVisit(ctx, cfg, urlOf(p));
              if (!run.mode && cold.out.mode) { run.mode = { ...cold.out.mode, preload: pattern.preload_data }; saveRun(); }
              if (cfg.visits.includes('cold')) record({ ...base, visit: 'cold', ...cold.out, mode: undefined });
              await within(cold.page.close(), 5000, null);
              if (cfg.visits.includes('warm')) {
                const warm = await loadVisit(ctx, cfg, urlOf(p));
                record({ ...base, visit: 'warm', ...warm.out, mode: undefined });
                await within(warm.page.close(), 5000, null);
              }
            } finally { await within(ctx.close(), 10000, null); }
          }

          if (cfg.visits.includes('click')) {
            // start from the parent page, else the home page, else the page before it in the list
            const parent = p.parent && allPages.find((x) => x.id === p.parent && x.published);
            const prev = pages[(pages.indexOf(p) + pages.length - 1) % pages.length];
            const candidates = linkSource.has(p.path) ? [linkSource.get(p.path)].filter(Boolean)
              : [parent, home, prev].filter((x, i, a) => x && x.path !== p.path && a.indexOf(x) === i);
            let done = false;
            for (const from of candidates) {
              const ctx = await newContext();
              try {
                const src = await loadVisit(ctx, cfg, urlOf(from));
                if (src.out.error) { await within(src.page.close(), 5000, null); continue; }
                const out = await clickVisit(src.page, src.net, cfg, pathsOf(p));
                await within(src.page.close(), 5000, null);
                if (out.noLink) continue;
                linkSource.set(p.path, from);
                record({ ...base, visit: 'click', from: from.path, ...out });
                done = true; break;
              } catch (e) {
                record({ ...base, visit: 'click', from: from.path, error: String(e.message || e).split('\n')[0].slice(0, 300) });
                done = true; break;
              } finally { await within(ctx.close(), 10000, null); }
            }
            if (!done) { linkSource.set(p.path, null); if (rep === 1) record({ ...base, visit: 'click', noLink: true }); }
          }
        }
        saveRun();
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
