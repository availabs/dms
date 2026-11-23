/**
 * Per-site CSS compiled by the server (src/css/siteCss.js).
 * Task: src/dms/planning/tasks/current/server-compiled-site-css.md
 *
 * Covers:
 *   1. A site's sheet has the core candidates, the candidates of the code theme its pattern selects (not another
 *      theme's), that theme's @theme tokens, and the classes saved in its content rows.
 *   2. Cached rows inside a section's element-data (`data`, `externalSource`, …) are not scanned.
 *   3. A sheet built before the app's first content scan finishes is rebuilt once it has (complete, not partial).
 *   4. A saved row with a new class (the controller's change notification) rebuilds the sheet with it; the hash
 *      changes and the new sheet is on disk.
 *   5. A restart (fresh module) loads the saved scan, catches up from the change log, and is complete at once.
 *   6. applyToHtml points the build's `<link data-dms-site-css>` at the sheet, with the in-browser compiler
 *      while partial; the routes serve the hashed sheet (immutable) and the site's current one (ETag, 304).
 *
 * Needs the app's Tailwind (dms-template's node_modules); skips when it isn't there.
 * Database: DMS_TEST_DB=dms-sqlite-test (default) or dms-postgres-test.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const DB_NAME = process.env.DMS_TEST_DB || 'dms-sqlite-test';
process.env.DMS_DB_ENV = DB_NAME;
const CSS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'site-css-'));
process.env.DMS_CSS_DIR = CSS_DIR;

const TEST_APP = 'sitecss' + Date.now();
const SITE_TYPE = 'prod';
const USER = { id: 1, email: 'test@test.com', groups: ['admin'] };

let passed = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// a class's selector as it appears in minified CSS
const sel = (c) => '.' + c.replace(/[^\w-]/g, ch => '\\' + ch);
const fresh = () => {
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}src${path.sep}css${path.sep}`)) delete require.cache[k];
  return require('../src/css/siteCss');
};

async function waitComplete(siteCss, site) {
  for (let i = 0; i < 100; i++) {
    const s = await siteCss.sheetFor(site);
    if (s && !s.partial) return s;
    await sleep(100);
  }
  return siteCss.sheetFor(site);
}
async function waitHashChange(siteCss, site, hash) {
  for (let i = 0; i < 100; i++) {
    const s = await siteCss.sheetFor(site);
    if (s && s.hash !== hash) return s;
    await sleep(100);
  }
  return siteCss.sheetFor(site);
}

async function main() {
  try { require.resolve('@tailwindcss/node'); require.resolve('@tailwindcss/oxide'); require.resolve('tailwindcss/package.json'); }
  catch { console.log('SKIP test-site-css: Tailwind is not installed where dms-server can load it'); process.exit(0); }

  const { createController } = require('../src/routes/dms/dms.controller');
  const { getDb, awaitReady } = require('../src/db');
  getDb(DB_NAME);
  await awaitReady();   // the change log table is made by the database's init
  const controller = createController(DB_NAME);
  const siteCss = fresh();
  controller.setNotifyChange((app, msg) => siteCss.noteChange(app, msg));

  // a small manifest, as vite-plugins/dmsCssCandidates.js writes one
  const manifestFile = path.join(CSS_DIR, 'manifest', 'css-candidates.json');
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  fs.writeFileSync(manifestFile, JSON.stringify({
    version: 1,
    tailwind: JSON.parse(fs.readFileSync(path.join(path.dirname(require.resolve('@tailwindcss/node')), '..', 'package.json'), 'utf8')).version,
    input: '@import "tailwindcss";\n@custom-variant dark (&:where(.dark, .dark *));\n',
    defaultTailwind: [],
    core: ['flex', 'p-4'],
    themes: {
      brand: { candidates: ['text-[#123456]'], tailwind: ['@theme { --color-brandink: #ff0000; }'] },
      other: { candidates: ['text-[#654321]'], tailwind: [] },
    },
  }));
  const site = { app: TEST_APP, type: SITE_TYPE, manifestFile };

  await controller.createData([TEST_APP, `${SITE_TYPE}:site`, { site_name: 'CSS test' }], USER, null);
  await controller.createData([TEST_APP, `${SITE_TYPE}|docs:pattern`, { name: 'docs', theme: { selectedTheme: 'brand' } }], USER, null);
  await controller.createData([TEST_APP, 'docs|component', {
    element: {
      'element-type': 'Card',
      'element-data': JSON.stringify({
        columns: [{ name: 'a', valueClass: 'md:grid-cols-[1fr_2fr] bg-brandink p-4' }],
        data: [{ a: 'grid-cols-[9fr_9fr]' }],                       // cached rows: never scanned
        externalSource: { columns: [{ name: 'x', note: 'w-[777px]' }] },
      }),
    },
  }], USER, null);

  console.log('\n1–3. first sheet and the content scan');
  const first = await siteCss.sheetFor(site);
  check('a sheet comes back at once', !!first && typeof first.css === 'string');
  const done = await waitComplete(siteCss, site);
  check('complete after the scan', done && !done.partial);
  check('has core candidates', done.css.includes('.flex{') && done.css.includes(sel('p-4')));
  check('has the selected theme\'s candidates', done.css.includes(sel('text-[#123456]')));
  check('not another theme\'s', !done.css.includes(sel('text-[#654321]')));
  check('has a content class', done.css.includes(sel('md:grid-cols-[1fr_2fr]')));
  check('a content class using the theme\'s @theme token', done.css.includes(sel('bg-brandink')) && /--color-brandink:\s*(#ff0000|red)/i.test(done.css));
  check('cached rows are not scanned', !done.css.includes(sel('grid-cols-[9fr_9fr]')));
  check('source metadata is not scanned', !done.css.includes(sel('w-[777px]')));
  check('the sheet is on disk', fs.existsSync(path.join(CSS_DIR, TEST_APP, SITE_TYPE, `${done.hash}.css`)));

  console.log('\n4. a saved row with a new class');
  await controller.createData([TEST_APP, 'docs|page', { title: 'New', sections: [], layout: 'lg:col-span-[7]' }], USER, null);
  const after = await waitHashChange(siteCss, site, done.hash);
  check('the sheet is rebuilt', after.hash !== done.hash);
  check('with the new class', after.css.includes(sel('lg:col-span-[7]')));
  check('the new sheet is on disk', fs.existsSync(path.join(CSS_DIR, TEST_APP, SITE_TYPE, `${after.hash}.css`)));

  console.log('\n5. a restart');
  await sleep(2500);   // the content set is saved 2 s after the last change
  const saved = JSON.parse(fs.readFileSync(path.join(CSS_DIR, TEST_APP, 'content.json'), 'utf8'));
  check('the content scan is saved with its revision', saved.candidates.includes('lg:col-span-[7]') && saved.revision > 0);
  const restarted = fresh();
  // written while the server was "down": only the change log has it
  await controller.createData([TEST_APP, 'docs|page', { title: 'Offline', sections: [], layout: 'xl:gap-[13px]' }], USER, null);
  let r = await restarted.sheetFor(site);
  for (let i = 0; i < 50 && (!r || r.partial); i++) { await sleep(100); r = await restarted.sheetFor(site); }
  r = await waitComplete(restarted, site);
  check('complete without a rescan', r && !r.partial && r.css.includes(sel('lg:col-span-[7]')));
  check('caught up from the change log', r.css.includes(sel('xl:gap-[13px]')));

  console.log('\n5b. a deploy whose manifest no longer has a class the content uses');
  check('the saved content set keeps classes that are also core (p-4)', saved.candidates.includes('p-4') && saved.v === 2);
  const manifest2 = path.join(CSS_DIR, 'manifest2', 'css-candidates.json');
  fs.mkdirSync(path.dirname(manifest2), { recursive: true });
  const m2 = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  m2.core = ['flex'];   // p-4 is no longer core
  fs.writeFileSync(manifest2, JSON.stringify(m2));
  const s2 = await waitComplete(restarted, { ...site, manifestFile: manifest2 });
  check('the content class is still in the sheet', s2.css.includes(sel('p-4')));
  // a saved scan of the old format (without v) is rescanned, not trusted
  const old = JSON.parse(fs.readFileSync(path.join(CSS_DIR, TEST_APP, 'content.json'), 'utf8'));
  fs.writeFileSync(path.join(CSS_DIR, TEST_APP, 'content.json'), JSON.stringify({ revision: old.revision, candidates: [] }));
  const rescanned = fresh();
  const s3 = await waitComplete(rescanned, site);
  check('a saved scan of an older format is rescanned', s3.css.includes(sel('md:grid-cols-[1fr_2fr]')));

  console.log('\n6. head and routes');
  const html = '<head><link rel="stylesheet" data-dms-site-css href="https://api.example/_dms/css/site/a/b.css"></head>';
  const out = siteCss.applyToHtml(html, siteCss.headInfo(after));
  check('the link points at the hashed sheet', out.includes(`href="/_dms/css/${TEST_APP}/${SITE_TYPE}/${after.hash}.css"`) && !out.includes('tailwindcss/browser'));
  const partialOut = siteCss.applyToHtml(html, siteCss.headInfo({ ...after, partial: true }));
  check('partial: the in-browser compiler comes with it', partialOut.includes('@tailwindcss/browser@') && partialOut.includes('text/tailwindcss'));
  check('no sheet: the build\'s link stays', siteCss.applyToHtml(html, siteCss.headInfo(null)) === html);

  const express = require('express');
  const app = express();
  siteCss.registerRoutes(app, { defaultManifest: () => manifestFile });
  const server = app.listen(0);
  const port = server.address().port;
  const get = (p, headers = {}) => new Promise((resolve, reject) => {
    http.get({ port, path: p, headers }, res => { let b = ''; res.on('data', d => b += d); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b })); }).on('error', reject);
  });
  const hashed = await get(`/_dms/css/${TEST_APP}/${SITE_TYPE}/${after.hash}.css`);
  check('hashed sheet: 200, immutable', hashed.status === 200 && /immutable/.test(hashed.headers['cache-control']) && hashed.body.length > 100);
  const named = await get(`/_dms/css/site/${TEST_APP}/${SITE_TYPE}.css`);
  check('site sheet: 200 with an ETag', named.status === 200 && !!named.headers.etag);
  const again = await get(`/_dms/css/site/${TEST_APP}/${SITE_TYPE}.css`, { 'If-None-Match': named.headers.etag });
  check('site sheet: 304 when unchanged', again.status === 304);
  const bad = await get(`/_dms/css/${TEST_APP}/${SITE_TYPE}/nothex.css`);
  check('a name that isn\'t a hash is not served', bad.status === 404 || bad.status === 200 && bad.body === '' || bad.status >= 400);
  server.close();

  fs.rmSync(CSS_DIR, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
