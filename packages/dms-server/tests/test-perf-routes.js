/**
 * Performance runs from the admin (src/perf/index.js; pattern-perf-report-tab.md, phase 2), over HTTP, with a real
 * browser measuring a tiny local site.
 *
 * Covers: signed out 401 and no edit-pattern 403 (enforced whatever DMS_AUTH_MODE says); an origin that is private
 * or loopback, not https, or not the request's own refused; a run of 2 pages × 1 repetition that finishes, with
 * its report and run.json; a second run while one is going refused (409); cancelling stops the run; the runs
 * list with its scorecard numbers; the comparison of two runs; only the newest DMS_PERF_KEEP runs kept.
 * The caller and the judge are stubbed (`x-user` header; edit-pattern per pattern), as in test-app-routes.js.
 *
 * Run: npm run test:perf-routes   (needs a Chrome or Chromium: DMS_PERF_CHROME, /usr/bin/chromium, the system's
 * Chrome, or Playwright's download)
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const assert = require('assert');

const PERF_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-perf-routes-'));
process.env.DMS_PERF_DIR = PERF_DIR;
process.env.DMS_PERF_KEEP = '2';
delete process.env.DMS_PERF_ALLOW_PRIVATE;

const APP = 'perfapp', PATTERN = '7';
const USERS = {
  1: { id: 1, email: 'editor@test', patterns: [PATTERN] },
  2: { id: 2, email: 'reader@test', patterns: [] },
};
const stub = (rel, exports) => {
  const file = require.resolve(path.join('../src/routes', rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
const userOf = (req, res) => {
  const u = USERS[req.get('x-user')];
  if (!u) { res.status(401).json({ error: 'sign in' }); return null; }
  return u;
};
const asked = [];
stub('auth/requestUser', { requireUser: userOf });
stub('auth', {
  requireCan: async (req, res, { pattern, verb, mode }) => {
    asked.push({ pattern, verb, mode });
    const u = userOf(req, res);
    if (!u) return null;
    if (verb === 'edit-pattern' && pattern?.app === APP && u.patterns.includes(String(pattern.id))) return u;
    res.status(403).json({ error: `Not authorized: needs ${verb}` });
    return null;
  },
});

let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// the site being measured: a home page linking to two others
const PAGE = (title, body) => `<!doctype html><html><head><title>${title}</title></head><body><main><h1>${title}</h1>${body}</main></body></html>`;
const site = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  const nav = '<nav><a href="/">Home</a> <a href="/one">One</a> <a href="/two">Two</a></nav>';
  if (['/', '/one', '/two'].includes(p)) { res.setHeader('content-type', 'text/html'); return res.end(PAGE(p === '/' ? 'Home' : p.slice(1), nav + '<p>' + 'text '.repeat(200) + '</p>')); }
  res.statusCode = 404; res.end();
});

async function main() {
  await new Promise((r) => site.listen(0, '127.0.0.1', r));
  const ORIGIN = `http://127.0.0.1:${site.address().port}`;
  const express = require('express');
  const app = express();
  app.use(express.json());
  require('../src/perf').registerPerfRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, { user, body, origin } = {}) => {
    const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(user ? { 'x-user': String(user) } : {}), ...(origin ? { origin } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text };
  };
  const pages = [
    { id: '1', slug: 'home', title: 'Home', parent: null, index: 0, published: true, path: '/' },
    { id: '2', slug: 'one', title: 'One', parent: null, index: 1, published: true, path: '/one' },
    { id: '3', slug: 'two', title: 'Two', parent: null, index: 2, published: true, path: '/two' },
    { id: '4', slug: 'draft', title: 'Draft', parent: null, index: 3, published: false, path: '/draft' },
  ];
  const runBody = (over = {}) => ({ app: APP, patternId: PATTERN, pattern: { name: 'perf_test', base_url: '/' }, origin: ORIGIN, pages, label: 'test', sample: 2, runs: 1, visits: ['cold', 'warm'], ...over });
  const waitDone = async (id) => {
    for (let i = 0; i < 240; i++) {
      const s = await call('GET', `/_dms/perf/run/${id}`, { user: 1 });
      if (s.json && !['running'].includes(s.json.state)) return s.json;
      await sleep(500);
    }
    throw new Error('the run did not finish in 2 minutes');
  };
  const runs = async () => (await call('GET', `/_dms/perf/runs?app=${APP}&patternId=${PATTERN}`, { user: 1 })).json;

  console.log('\nrefusals');
  await t('a private origin is refused unless DMS_PERF_ALLOW_PRIVATE=1', async () => {
    const r = await call('POST', '/_dms/perf/run', { user: 1, body: runBody() });
    assert.strictEqual(r.status, 400, r.text);
    assert.match(r.json.error, /https|private/);
    const r2 = await call('POST', '/_dms/perf/run', { user: 1, body: runBody({ origin: 'https://127.0.0.1:9' }) });
    assert.strictEqual(r2.status, 400, r2.text);
    assert.match(r2.json.error, /private address/);
  });
  process.env.DMS_PERF_ALLOW_PRIVATE = '1';
  await t('an origin with a path, or not the request\'s own, is refused', async () => {
    assert.strictEqual((await call('POST', '/_dms/perf/run', { user: 1, body: runBody({ origin: ORIGIN + '/x' }) })).status, 400);
    const r = await call('POST', '/_dms/perf/run', { user: 1, body: runBody(), origin: 'https://elsewhere.example' });
    assert.strictEqual(r.status, 400, r.text);
    assert.match(r.json.error, /comes from/);
  });
  await t('signed out 401; without edit-pattern 403; judged with edit-pattern, enforced', async () => {
    assert.strictEqual((await call('POST', '/_dms/perf/run', { body: runBody() })).status, 401);
    assert.strictEqual((await call('POST', '/_dms/perf/run', { user: 2, body: runBody() })).status, 403);
    assert.strictEqual((await call('GET', `/_dms/perf/runs?app=${APP}&patternId=${PATTERN}`, { user: 2 })).status, 403);
    assert.ok(asked.every((a) => a.verb === 'edit-pattern' && a.mode === 'enforce'), JSON.stringify(asked));
  });

  console.log('\na run');
  let first;
  await t('a run of 2 pages × 1 repetition finishes, with a report', async () => {
    const r = await call('POST', '/_dms/perf/run', { user: 1, body: runBody({ label: 'first' }), origin: ORIGIN });
    assert.strictEqual(r.status, 202, r.text);
    assert.strictEqual(r.json.total, 4);   // 2 pages × (cold + warm) × 1
    const busy = await call('POST', '/_dms/perf/run', { user: 1, body: runBody() });
    assert.strictEqual(busy.status, 409, busy.text);
    assert.match(busy.json.error, /already going.*perf_test.*editor@test/);
    const list = await runs();
    assert.strictEqual(list.running?.id, r.json.id);
    const done = await waitDone(r.json.id);
    assert.strictEqual(done.state, 'done', JSON.stringify(done));
    assert.strictEqual(done.done, 4);
    first = r.json.id;
    const dir = path.join(PERF_DIR, APP, PATTERN, first);
    for (const f of ['run.json', 'visits.jsonl', 'report.html']) assert.ok(fs.existsSync(path.join(dir, f)), f);
    const run = JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8'));
    assert.strictEqual(run.pages.length, 2);
    assert.ok(run.pages.some((p) => p.path === '/'), 'the sample keeps the home page');
    assert.ok(!run.pages.some((p) => p.path === '/draft'), 'no draft page');
    assert.strictEqual(run.measuredFrom, 'server');
    assert.strictEqual(run.requestedBy, 'editor@test');
    assert.strictEqual(run.config.parallel, 1);
  });
  await t('the runs list: the run with its scorecard numbers; its report and run.json', async () => {
    const list = await runs();
    assert.strictEqual(list.running, null);
    const r = list.runs.find((x) => x.id === first);
    assert.ok(r, JSON.stringify(list));
    assert.strictEqual(r.by, 'editor@test');
    assert.strictEqual(r.pages, 2);
    assert.deepStrictEqual(r.kinds.map((k) => k.visit), ['cold', 'warm']);
    assert.ok(r.kinds.every((k) => typeof k.complete === 'number' && typeof k.goals.complete === 'number'), JSON.stringify(r.kinds));
    const report = await call('GET', `/_dms/perf/runs/${first}/report.html?app=${APP}&patternId=${PATTERN}`, { user: 1 });
    assert.strictEqual(report.status, 200);
    assert.match(report.text, /measured from the server/);
    const json = await call('GET', `/_dms/perf/runs/${first}/run.json?app=${APP}&patternId=${PATTERN}`, { user: 1 });
    assert.strictEqual(json.json?.id, first);
    assert.strictEqual((await call('GET', `/_dms/perf/runs/..%2F..%2Fetc/report.html?app=${APP}&patternId=${PATTERN}`, { user: 1 })).status, 404);
  });

  console.log('\ncompare, cancel, keep');
  let second, cancelled;
  await t('a second run, and the two compared', async () => {
    const again = await call('POST', '/_dms/perf/run', { user: 1, body: runBody({ label: 'second' }) });
    assert.strictEqual(again.status, 202, again.text);
    second = again.json.id;
    assert.strictEqual((await waitDone(second)).state, 'done');
    const r = await call('GET', `/_dms/perf/compare?app=${APP}&patternId=${PATTERN}&a=${first}&b=${second}`, { user: 1 });
    assert.strictEqual(r.status, 200, r.text.slice(0, 200));
    assert.match(r.text, /first → second/);
  });
  await t('cancelling a run stops it, and frees the server', async () => {
    const r = await call('POST', '/_dms/perf/run', { user: 1, body: runBody({ label: 'cancelled', sample: 'all', runs: 5, visits: ['cold', 'warm', 'click'] }) });
    assert.strictEqual(r.status, 202, r.text);
    cancelled = r.json.id;
    await sleep(2500);
    const c = await call('DELETE', `/_dms/perf/run/${cancelled}`, { user: 1 });
    assert.strictEqual(c.status, 200, c.text);
    const done = await waitDone(cancelled);
    assert.strictEqual(done.state, 'cancelled', JSON.stringify(done));
    assert.ok(done.done < done.total, `${done.done} of ${done.total}`);
    assert.strictEqual((await runs()).running, null);
  });
  await t('only the newest DMS_PERF_KEEP (2) runs are kept', async () => {
    const kept = fs.readdirSync(path.join(PERF_DIR, APP, PATTERN)).sort();
    assert.deepStrictEqual(kept, [second, cancelled].sort());
  });

  server.close();
  site.close();
  fs.rmSync(PERF_DIR, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
