/**
 * Per-site Tailwind CSS, compiled by the server.
 *
 * Task: src/dms/planning/tasks/current/server-compiled-site-css.md (P1–P3).
 *
 * A site's sheet is compiled from:
 *   - the app build's candidate manifest (`<client>/.dms/css-candidates.json`, written by the template's
 *     vite-plugins/dmsCssCandidates.js): the input CSS (the app's src/index.css), the core candidates (library,
 *     app patterns), and per code theme its candidates and `@theme` blocks;
 *   - the themes the site's patterns select (`theme.selectedTheme`); a `:theme` row of that name replaces the
 *     code theme, as it does at render time;
 *   - every class string in the app's content rows (pages, sections, patterns, theme rows), scanned once in the
 *     background and kept current from the change notifications (`noteChange`), persisted in
 *     var/css/<app>/content.json.
 *
 * The sheet is complete for the site (core + its themes + its content), so linked after the build sheet it wins
 * consistently wherever the two overlap. While an app's first content scan is still running a sheet is marked
 * `partial` and the page keeps the in-browser compiler as well.
 *
 * Tailwind (`@tailwindcss/node`, `@tailwindcss/oxide`, `tailwindcss`) is loaded from the app's node_modules,
 * the one the build used; without it, or without a manifest, this module is off and pages keep the CDN script.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDb } = require('../db');
const { resolveTable } = require('../db/table-resolver');

const CSS_DIR = process.env.DMS_CSS_DIR || path.resolve(__dirname, '../../var/css');
// how long the site route (a statically served page's sheet) waits for an app's first content scan
const siteWaitMs = () => { const n = Number(process.env.DMS_CSS_SITE_WAIT_MS); return Number.isFinite(n) && n >= 0 ? n : 20000; };
const SEGMENT = /^[\w.+-]+$/;
const BATCH = 1000;
// element-data keys that hold cached rows and source metadata, never class strings (P0: ~95% of a big app's bytes)
const SKIP_ELEMENT_KEYS = ['data', 'externalSource', 'sourceInfo', 'symbologies', 'lastDataRequest', 'dataRequest',
  'metaLookupByViewId', 'geoColors', 'layerProps', 'dataSources'];

const dmsDbEnv = () => process.env.DMS_DB_ENV || 'dms-sqlite';
const dmsDb = () => getDb(dmsDbEnv());
const splitModeOf = () => { try { return require('../db').loadConfig(dmsDbEnv()).splitMode; } catch { return require('../db/table-resolver').resolveSplitMode(); } };
const table = (app) => resolveTable(app, '', dmsDb().type, splitModeOf()).fullName;
const parseJson = (v) => { if (v == null) return null; if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } } return v; };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const log = (...m) => console.log('[site-css]', ...m);

// ---- Tailwind, from the app's node_modules ----
let tw;
function tailwind() {
  if (tw !== undefined) return tw;
  try {
    const node = require('@tailwindcss/node');
    const { Scanner } = require('@tailwindcss/oxide');
    const nodeMain = require.resolve('@tailwindcss/node');
    const version = JSON.parse(fs.readFileSync(path.join(path.dirname(nodeMain), '..', 'package.json'), 'utf8')).version;
    // `@import "tailwindcss"` in the input CSS resolves from `base`: the folder holding that node_modules
    const base = path.resolve(path.dirname(require.resolve('tailwindcss/package.json')), '..', '..');
    tw = { compile: node.compile, optimize: node.optimize, loadDesignSystem: node.__unstable__loadDesignSystem, Scanner, version, base };
  } catch (e) {
    console.warn('[site-css] Tailwind is not available, per-site CSS is off:', e.message);
    tw = null;
  }
  return tw;
}

const scan = (text) => new (tailwind().Scanner)({ sources: [] }).scanFiles([{ content: text, extension: 'html' }]);

// ---- manifests (one per build: the server's own, and each hosted site build's) ----
const manifests = new Map();   // file -> { mtime, m, ds }
async function manifestOf(file) {
  if (!file) return null;
  let st;
  try { st = fs.statSync(file); } catch { return null; }
  const hit = manifests.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit;
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (tailwind() && m.tailwind !== tw.version) {
    console.warn(`[site-css] ${file} was built with Tailwind ${m.tailwind}, the server has ${tw.version}`);
  }
  // to tell a content candidate from a word: valid under the input plus every theme's @theme blocks
  const blocks = [m.defaultTailwind || [], ...Object.values(m.themes || {}).map(t => t.tailwind || [])].flat();
  const ds = await tailwind().loadDesignSystem(`${m.input}\n${blocks.join('\n')}`, { base: tw.base });
  const entry = { mtime: st.mtimeMs, m, ds };
  manifests.set(file, entry);
  return entry;
}

// ---- content candidates per app ----
const contents = new Map();    // app -> { cands: Set, seen: Set, revision, ready: Promise, done: bool, saveTimer }
const contentFile = (app) => path.join(CSS_DIR, app, 'content.json');
// the saved content set's format: a file of another version is rescanned (v2: every valid class, core included)
const CONTENT_VERSION = 2;

// The text of a row worth scanning: everything but the cached rows / source metadata inside element-data.
function rowText(data) {
  const d = parseJson(data);
  if (!d || typeof d !== 'object') return typeof data === 'string' ? data : '';
  const el = d.element;
  if (el && typeof el === 'object' && typeof el['element-data'] === 'string') {
    const ed = parseJson(el['element-data']);
    if (ed && typeof ed === 'object' && !Array.isArray(ed)) {
      for (const k of SKIP_ELEMENT_KEYS) delete ed[k];
      return JSON.stringify({ ...d, element: { ...el, 'element-data': null } }) + '\n' + JSON.stringify(ed);
    }
  }
  return JSON.stringify(d);
}

// Adds the valid candidates in `text` to the app's set; returns how many were new. Every valid one is kept, core or
// not: the saved set must not depend on one build's manifest (a class core today may not be core after the next
// deploy, and the content still renders it).
function addCandidates(state, entry, text) {
  const fresh = scan(text).filter(c => !state.seen.has(c));
  if (!fresh.length) return 0;
  for (const c of fresh) state.seen.add(c);
  const css = entry.ds.candidatesToCss(fresh);
  let added = 0;
  fresh.forEach((c, i) => { if (css[i] && !state.cands.has(c)) { state.cands.add(c); added++; } });
  return added;
}

function persist(app, state) {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(contentFile(app)), { recursive: true });
      fs.writeFileSync(contentFile(app), JSON.stringify({ v: CONTENT_VERSION, revision: state.revision, scannedAt: state.scannedAt, candidates: [...state.cands].sort() }));
    } catch (e) { console.warn('[site-css] could not save', contentFile(app), e.message); }
  }, 2000);
  state.saveTimer.unref?.();
}

async function maxRevision(db, app) {
  const tbl = db.type === 'postgres' ? 'dms.change_log' : 'change_log';
  try { return Number((await db.query(`SELECT max(revision) AS r FROM ${tbl} WHERE app = $1`, [app])).rows[0]?.r) || 0; }
  catch { return 0; }
}

async function fullScan(app, state, entry) {
  const db = dmsDb();
  const t0 = Date.now();
  state.revision = await maxRevision(db, app);
  const tbl = table(app);
  const pg = db.type === 'postgres';
  // Postgres strips the cached rows inside element-data before sending a row (a big app's components are
  // gigabytes of section data caches); SQLite sends the row and rowText strips it.
  const sql = pg
    ? `SELECT id,
         (data #- '{element,element-data}')::text AS rest,
         CASE WHEN pg_input_is_valid(data->'element'->>'element-data', 'jsonb')
                   AND jsonb_typeof((data->'element'->>'element-data')::jsonb) = 'object'
              THEN ((data->'element'->>'element-data')::jsonb - $3::text[])::text
              ELSE data->'element'->>'element-data' END AS ed
       FROM ${tbl} WHERE app = $1 AND id > $2 ORDER BY id LIMIT ${BATCH}`
    : `SELECT id, data FROM ${tbl} WHERE app = $1 AND id > $2 ORDER BY id LIMIT ${BATCH}`;
  let last = 0, rows = 0;
  for (;;) {
    const params = pg ? [app, last, SKIP_ELEMENT_KEYS] : [app, last];
    let res;
    try { res = await db.query(sql, params); }
    catch (e) { if (/no such table|does not exist/i.test(e.message)) break; throw e; }
    if (!res.rows.length) break;
    const text = res.rows.map(r => pg ? `${r.rest || ''}\n${r.ed || ''}` : rowText(r.data)).join('\n');
    addCandidates(state, entry, text);
    rows += res.rows.length;
    last = res.rows[res.rows.length - 1].id;
    if (res.rows.length < BATCH) break;
  }
  state.scannedAt = new Date().toISOString();
  log(`${app}: scanned ${rows} rows in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${state.cands.size} content classes`);
}

// Changes since the saved revision (the change log keeps full rows, 30 days); null when it can't cover the gap.
async function catchUp(app, state, entry) {
  const db = dmsDb();
  const tbl = db.type === 'postgres' ? 'dms.change_log' : 'change_log';
  const oldest = Number((await db.query(`SELECT min(revision) AS r FROM ${tbl} WHERE app = $1`, [app])).rows[0]?.r) || 0;
  if (oldest && oldest > state.revision + 1) return null;
  let added = 0;
  for (;;) {
    const res = await db.query(`SELECT revision, data FROM ${tbl} WHERE app = $1 AND revision > $2 AND data IS NOT NULL ORDER BY revision LIMIT ${BATCH}`, [app, state.revision]);
    if (!res.rows.length) break;
    added += addCandidates(state, entry, res.rows.map(r => rowText(r.data)).join('\n'));
    state.revision = Number(res.rows[res.rows.length - 1].revision);
    if (res.rows.length < BATCH) break;
  }
  return added;
}

function contentOf(app, entry) {
  let state = contents.get(app);
  if (state) return state;
  state = { cands: new Set(), seen: new Set(), revision: 0, done: false };
  contents.set(app, state);
  state.ready = (async () => {
    const saved = parseJson((() => { try { return fs.readFileSync(contentFile(app), 'utf8'); } catch { return null; } })());
    if (saved && saved.v === CONTENT_VERSION && Array.isArray(saved.candidates)) {
      for (const c of saved.candidates) { state.cands.add(c); state.seen.add(c); }
      state.revision = Number(saved.revision) || 0;
      state.scannedAt = saved.scannedAt;
      const added = await catchUp(app, state, entry).catch(e => { console.warn('[site-css] catch-up failed', app, e.message); return null; });
      if (added !== null) { state.done = true; if (added) persist(app, state); return; }
      log(`${app}: saved scan is older than the change log, rescanning`);
      state.cands.clear(); state.seen.clear();
    }
    await fullScan(app, state, entry);
    state.done = true;
    persist(app, state);
    dirty(app);
  })().catch(e => {
    console.warn('[site-css] content scan failed for', app, e.message);
    state.done = true; state.failed = true;
    // try again on a later request: sheets stay partial (the page keeps the in-browser compiler) until then
    setTimeout(() => { if (contents.get(app) === state) contents.delete(app); dirty(app); }, 60 * 1000).unref?.();
  });
  return state;
}

// ---- the themes a site uses ----
const siteThemes = new Map();  // `${app}+${type}` -> { at, value: [{ name, candidates, tailwind }] }
async function themesOf(app, type, entry) {
  const key = `${app}+${type}`;
  const hit = siteThemes.get(key);
  if (hit && hit.fresh) return hit.value;
  const db = dmsDb();
  const tbl = table(app);
  const q = async (sql, params) => { try { return (await db.query(sql, params)).rows; } catch (e) { if (/no such table|does not exist/i.test(e.message)) return []; throw e; } };
  const patterns = await q(`SELECT data FROM ${tbl} WHERE app = $1 AND type LIKE $2`, [app, `${type}|%:pattern`]);
  const names = new Set();
  for (const r of patterns) {
    const d = parseJson(r.data) || {};
    const t = parseJson(d.theme) || {};
    const name = t.selectedTheme || t?.settings?.theme?.theme;
    if (name && name !== 'default') names.add(name);
  }
  const dbRows = names.size ? await q(`SELECT data FROM ${tbl} WHERE app = $1 AND type LIKE '%:theme'`, [app]) : [];
  const dbThemes = new Map();
  for (const r of dbRows) {
    const d = parseJson(r.data) || {};
    if (d.name && names.has(d.name)) dbThemes.set(d.name, parseJson(d.theme) || {});
  }
  const value = [...names].map(name => {
    if (dbThemes.has(name)) {
      const theme = dbThemes.get(name);
      const fonts = Array.isArray(theme.fonts) ? theme.fonts : [];
      // a database theme's own strings are content: the app's content scan has its classes
      return { name, candidates: [], tailwind: fonts.filter(f => f?.type === 'tailwind' && typeof f.content === 'string').map(f => f.content) };
    }
    const code = entry.m.themes?.[name];
    return code ? { name, candidates: code.candidates, tailwind: code.tailwind || [] } : null;
  }).filter(Boolean);
  siteThemes.set(key, { fresh: true, value });
  return value;
}

// ---- sheets ----
// key `${manifestFile}|${app}+${type}` -> { current: sheet | null, building: Promise | null, dirty: bool }
const sheets = new Map();
const byApp = new Map();       // app -> Set of sheet keys
function dirty(app) {
  for (const k of byApp.get(app) || []) { const r = sheets.get(k); if (r) r.dirty = true; }
  for (const [k, v] of siteThemes) if (k.startsWith(`${app}+`)) v.fresh = false;
}

async function compileSheet(entry, app, type) {
  const content = contentOf(app, entry);
  const themes = await themesOf(app, type, entry);
  const input = [entry.m.input, ...(entry.m.defaultTailwind || []), ...themes.flatMap(t => t.tailwind)].join('\n');
  // a fresh compiler per sheet: `build` is cumulative, a shared one would carry other sites' classes
  const compiler = await tailwind().compile(input, { base: tw.base, onDependency: () => {} });
  const candidates = new Set(entry.m.core);
  for (const t of themes) for (const c of t.candidates) candidates.add(c);
  for (const c of content.cands) candidates.add(c);
  // minified and with the same browser fallbacks (rgba next to color-mix, …) as the build sheet: lightningcss
  const css = tailwind().optimize(compiler.build([...candidates]), { minify: true }).code;
  const hash = sha(css).slice(0, 16);
  const dir = path.join(CSS_DIR, app, type);
  const file = path.join(dir, `${hash}.css`);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, css);
  }
  // partial: the content scan hasn't finished (or failed), so content classes may be missing
  const partial = !content.done || !!content.failed;
  return { hash, css, partial, href: `/_dms/css/${app}/${type}/${hash}.css`, themes: themes.map(t => t.name), tailwind: entry.m.tailwind };
}

/**
 * The current sheet of a site: { hash, css, partial, href, themes }, or null when off. A rebuild (after a
 * change made the sheet dirty) runs in the background while the previous sheet keeps being served.
 * @param {{ app: string, type: string, manifestFile: string }} site
 */
async function sheetFor({ app, type, manifestFile }) {
  if (!app || !type || !SEGMENT.test(app) || !SEGMENT.test(type) || !tailwind()) return null;
  const entry = await manifestOf(manifestFile);
  if (!entry) return null;
  const key = `${manifestFile}|${app}+${type}`;
  let rec = sheets.get(key);
  if (!rec) {
    rec = { current: null, building: null, dirty: true };
    sheets.set(key, rec);
    if (!byApp.has(app)) byApp.set(app, new Set());
    byApp.get(app).add(key);
  }
  const contentDone = contentOf(app, entry).done;
  const stale = rec.dirty || !rec.current || (rec.current.partial && contentDone);
  if (stale && !rec.building) {
    rec.dirty = false;
    const before = rec.current;
    rec.building = compileSheet(entry, app, type)
      .then(next => {
        rec.current = next;
        if (!before || before.hash !== next.hash) {
          log(`${app}+${type}: ${next.hash} (${(next.css.length / 1024).toFixed(0)} KB${next.partial ? ', content scan not finished' : ''}; themes ${next.themes.join(', ') || 'none'})`);
        }
        return next;
      })
      .catch(e => { console.warn('[site-css] compile failed', app, type, e.message); rec.dirty = true; return rec.current; })
      .finally(() => { rec.building = null; });
  }
  return rec.current || rec.building;
}

/**
 * The sheet for a page the server doesn't serve (the `/_dms/css/site/…` route: a Netlify-served SPA links it, and
 * no in-browser compiler can be added to that page's head). While the app's content scan is still running the
 * sheet is partial, so this waits for the scan and the rebuild after it, up to `waitMs` in all, and answers with
 * whatever sheet it has then (still partial only when the scan took longer, or failed).
 */
async function settledSheetFor(site, { waitMs = 20000 } = {}) {
  const deadline = Date.now() + waitMs;
  const until = (p) => {
    let timer;
    const ms = Math.max(0, deadline - Date.now());
    return Promise.race([p, new Promise(r => { timer = setTimeout(r, ms); timer.unref?.(); })]).finally(() => clearTimeout(timer));
  };
  let sheet = await sheetFor(site);
  if (!sheet || !sheet.partial) return sheet;
  const entry = await manifestOf(site.manifestFile);
  const state = entry && contentOf(site.app, entry);
  if (!state) return sheet;
  await until(state.ready);
  if (!state.done || state.failed) return sheet;
  sheet = await sheetFor(site);   // starts the rebuild the finished scan asked for
  const rec = sheets.get(`${site.manifestFile}|${site.app}+${site.type}`);
  if (rec && rec.building) await until(rec.building);
  return (rec && rec.current) || sheet;
}

// The in-browser compiler, for a page whose sheet is partial (and the editor): the version the build used, and the
// app's `dark` variant (src/index.css).
const fallbackHtml = (version) =>
  `<script defer src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@${version || 4}"></script>` +
  '<style type="text/tailwindcss">@custom-variant dark (&:where(.dark, .dark *, [data-theme="dark"], [data-theme="dark"] *));</style>';

/** What a page head needs from a sheet: its URL, and the in-browser compiler too while the sheet is partial. */
const headInfo = (sheet) => sheet ? { href: sheet.href, partial: !!sheet.partial, fallbackHtml: sheet.partial ? fallbackHtml(sheet.tailwind) : '' } : null;

/** Points the build's `<link data-dms-site-css>` (vite-plugins/dmsCssCandidates.js) at the site's sheet. */
function applyToHtml(html, info) {
  if (!info) return html;
  return html.replace(/<link\b[^>]*\bdata-dms-site-css\b[^>]*>/, () => `<link rel="stylesheet" data-dms-site-css href="${info.href}">${info.fallbackHtml}`);
}

/** A change notification (dms.controller appendChangeLog / sync push): keep the app's content classes current. */
function noteChange(app, msg) {
  const state = contents.get(app);
  const item = msg && msg.item;
  if (!item) return;
  const kind = String(item.type || '').split('|').pop();
  if (/:(pattern|theme|site)$/.test(kind) || /^(pattern|theme|site)$/.test(kind)) dirty(app);   // theme choice may change
  if (!state || !state.done || item.data == null) return;
  if (msg.revision) state.revision = Math.max(state.revision, Number(msg.revision) || 0);
  let added = 0;
  for (const e of manifests.values()) added = Math.max(added, addCandidates(state, e, rowText(item.data)));
  if (added) { log(`${app}: ${added} new content class(es) from ${item.type} ${item.id}`); dirty(app); }
  persist(app, state);
}

/** Express routes: the hashed sheet (immutable) and a site's current sheet by name (for statically served pages). */
function registerRoutes(app, { defaultManifest }) {
  app.get('/_dms/css/:app/:type/:file', (req, res, next) => {
    const { app: a, type, file } = req.params;
    const m = /^([0-9a-f]{16})\.css$/.exec(file);
    if (!m || !SEGMENT.test(a) || !SEGMENT.test(type)) return next();
    const p = path.join(CSS_DIR, a, type, file);
    if (!fs.existsSync(p)) return res.status(404).set('Cache-Control', 'no-store').send('');
    res.set({ 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin': '*' });
    res.sendFile(p);
  });
  // `/_dms/css/site/<app>/<type>.css`: always the current sheet, revalidated by ETag (Netlify-served sites link it).
  // Such a page has no in-browser compiler to fall back on, so a first request during the content scan waits for it.
  app.get('/_dms/css/site/:app/:file', async (req, res, next) => {
    const m = /^([\w.+-]+)\.css$/.exec(req.params.file);
    if (!m) return next();
    try {
      const s = await settledSheetFor({ app: req.params.app, type: m[1], manifestFile: defaultManifest() }, { waitMs: siteWaitMs() });
      if (!s) return res.status(404).set('Cache-Control', 'no-store').send('');
      const etag = `"${s.hash}${s.partial ? '-p' : ''}"`;
      res.set({ 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': `public, max-age=${s.partial ? 10 : 60}`, ETag: etag, 'Access-Control-Allow-Origin': '*' });
      if (req.headers['if-none-match'] === etag) return res.status(304).end();
      res.send(s.css);
    } catch (e) {
      console.warn('[site-css] site route failed:', e.message);
      res.status(500).set('Cache-Control', 'no-store').send('');
    }
  });
}

module.exports = { sheetFor, settledSheetFor, headInfo, applyToHtml, noteChange, registerRoutes, rowText, CSS_DIR };
