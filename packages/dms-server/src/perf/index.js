/**
 * Performance runs from the admin: a pattern's Performance tab starts one, the server measures, the tab reads the
 * reports (src/dms/planning/tasks/current/pattern-perf-report-tab.md). The engine is ./runner.mjs (the same one
 * `dms perf run` uses from a developer's machine), loaded with import().
 *
 *   POST   /_dms/perf/run            { app, patternId, pattern: { name, base_url, preload_data }, origin,
 *                                      pages: [{ id, slug, title, parent, index, published, path }],
 *                                      label, sample, runs, visits }                          → 202 { id, … }
 *   GET    /_dms/perf/run/:id         → { id, state, done, total, current, error, … } (progress)
 *   DELETE /_dms/perf/run/:id         → cancels
 *   GET    /_dms/perf/runs?app=&patternId=                → { running, runs: [summary, newest first] }
 *   GET    /_dms/perf/runs/:id/report.html?app=&patternId= → the saved report
 *   GET    /_dms/perf/runs/:id/run.json?app=&patternId=    → the saved run's settings and environment
 *   GET    /_dms/perf/compare?app=&patternId=&a=&b=       → the comparison report (a: before, b: after)
 *
 * A job, not one request, for the PDF export's reason: nginx cuts proxied requests at 120 s. ONE run at a time
 * per server: a second is refused (409) with who is running what. Everything needs `edit-pattern` on the pattern,
 * enforced whatever DMS_AUTH_MODE says (a run costs the server minutes of CPU).
 *
 * The browser visits `origin` + each page's path as an anonymous visitor. `origin` must be the address the request
 * came from (its Origin header, when the browser sends one), https, and a host that doesn't resolve to a private or
 * loopback address, so the server can't be pointed at its own network; DMS_PERF_ALLOW_PRIVATE=1 lifts the last two
 * for development. The page list comes from the admin page, which already has it.
 *
 * Saved in DMS_PERF_DIR (default var/perf, the server's lasting volume): <app>/<pattern id>/<run id>/ with
 * run.json, visits.jsonl and report.html. The newest DMS_PERF_KEEP (default 30) runs per pattern are kept.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { requireCan } = require('../routes/auth');
const { requireUser } = require('../routes/auth/requestUser');
const { checkHost } = require('../pdf');

// the app checkout this server runs from (<root>/src/dms/packages/dms-server/src/perf, here and in the image): the
// report names its commit and the dms submodule's (none where there is no .git)
const APP_ROOT = path.resolve(__dirname, '../../../../../..');
const PERF_DIR = () => path.resolve(process.env.DMS_PERF_DIR || path.resolve(__dirname, '../../var/perf'));
const KEEP = () => Math.max(1, +process.env.DMS_PERF_KEEP || 30);
const KEEP_JOB_MS = 60 * 60 * 1000;      // a finished job's progress record; the run itself stays on disk
const VISITS = ['cold', 'warm', 'click', 'journey'];
const DEFAULT_VISITS = ['cold', 'warm', 'click'];
const MAX_PAGES = 5000;
const MAX_RUNS = 5;
const NAME = /^[\w.-]{1,120}$/;          // an app, a pattern id, a run id: one path segment

const jobs = new Map();                  // id -> job
let current = null;                      // the job running, if any

// the engine is ES modules; this server is CommonJS
const engine = () => Promise.all(['./runner.mjs', './config.mjs', './pages.mjs', './aggregate.mjs', './score.mjs', './compare.mjs', './report/index.mjs'].map((m) => import(m)))
  .then((mods) => Object.assign({}, ...mods));

const patternDir = (app, patternId) => path.join(PERF_DIR(), app, String(patternId));

function status(job) {
  const { id, app, patternId, patternName, label, by, state, done, total, current: now, error, startedAt, finishedAt } = job;
  return { id, app, patternId, patternName, label, by, state, done, total, current: now, error, startedAt, finishedAt };
}

function finish(job, state, error) {
  job.state = state;
  job.error = error || null;
  job.finishedAt = Date.now();
  if (current === job) current = null;
  setTimeout(() => jobs.delete(job.id), KEEP_JOB_MS).unref?.();
}

// visits the run will record, for the progress bar: every page per visit type and repetition, and the journey's
// landing, its clicks and its end, twice (first and return), per repetition
const expectedVisits = (cfg, pages) =>
  cfg.runs * pages * cfg.visits.filter((v) => v !== 'journey').length
  + (cfg.visits.includes('journey') ? cfg.runs * 2 * (cfg.journeySteps + 2) : 0);

/** The newest KEEP runs of a pattern stay; older folders are removed. */
function prune(app, patternId) {
  const dir = patternDir(app, patternId);
  const runs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => NAME.test(n)).sort().reverse() : [];
  for (const old of runs.slice(KEEP())) fs.rmSync(path.join(dir, old), { recursive: true, force: true });
}

async function run(job) {
  const E = await engine();
  try {
    const { run: result } = await E.runPerf(job.cfg, {
      pattern: job.pattern, pages: job.pages, allPages: job.allPages, repoRoot: APP_ROOT,
      connection: { host: job.origin, app: job.app, type: job.patternName },
      signal: job.abort.signal,
      onRecord: (r) => { job.done = Math.min(r.counts.visits, job.total); },
      meta: { id: job.id, measuredFrom: 'server', requestedBy: job.by },
    }, (line) => { job.current = line; });
    job.current = 'Writing the report';
    E.writeReport([E.loadRun(job.dir)], path.join(job.dir, 'report.html'));
    job.done = job.total;
    job.current = null;
    finish(job, result.aborted ? 'failed' : 'done', result.aborted || null);
  } catch (e) {
    const cancelled = job.abort.signal.aborted;
    // what was measured before it stopped is still a run: give it its report
    try { if (fs.existsSync(path.join(job.dir, 'visits.jsonl'))) E.writeReport([E.loadRun(job.dir)], path.join(job.dir, 'report.html')); } catch { /* nothing measured */ }
    finish(job, cancelled ? 'cancelled' : 'failed', cancelled ? null : String(e.message || e).split('\n')[0]);
  } finally {
    prune(job.app, job.patternId);
  }
}

const pathOk = (p) => typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') && !/[\s\\]/.test(p) && p.length < 2000;

/** The request's problems, or null. `origin`: the request's Origin header. */
async function validate(body, originHeader) {
  const { app, patternId, origin, pages } = body || {};
  if (!NAME.test(app || '')) return 'app is required';
  if (!NAME.test(String(patternId ?? ''))) return 'patternId is required';
  let target;
  try { target = new URL(origin); } catch { return 'origin must be a URL, the address the site is open on'; }
  if (target.origin !== origin.replace(/\/+$/, '')) return 'origin must be an origin (scheme, host and port), with no path';
  const allowPrivate = process.env.DMS_PERF_ALLOW_PRIVATE === '1';
  if (target.protocol !== 'https:' && !(allowPrivate && target.protocol === 'http:')) return 'origin must be https';
  if (originHeader && originHeader !== 'null' && originHeader !== target.origin) return 'origin must be the site the request comes from';
  if (!Array.isArray(pages) || !pages.length) return 'pages is required';
  if (pages.length > MAX_PAGES) return `at most ${MAX_PAGES} pages`;
  if (!pages.every((p) => p && pathOk(p.path))) return 'every page needs a path starting with /';
  if (!pages.some((p) => p.published !== false)) return 'the pattern has no published pages';
  const visits = body.visits == null ? DEFAULT_VISITS : [].concat(body.visits);
  if (!visits.length || !visits.every((v) => VISITS.includes(v))) return `visits: any of ${VISITS.join(', ')}`;
  return checkHost(target.hostname, { allowVar: 'DMS_PERF_ALLOW_PRIVATE', does: 'measures' });
}

/** What the runs table shows of one saved run. */
async function summarize(E, dir) {
  const { run, visits } = E.loadRun(dir);
  const agg = E.aggregate(visits);
  const profile = run.config?.profiles?.[0] || 'public';
  const kinds = E.scores(agg.pages, profile).map((k) => ({
    visit: k.visit, name: k.name, pages: k.pages,
    goals: Object.fromEntries(k.goals.map((g) => [g.key, g.score])),
    complete: agg.overall[`${profile}|${k.visit}`]?.metrics?.complete?.p50 ?? null,
  }));
  return {
    id: path.basename(dir), label: run.label, started: run.started, finished: run.finished, by: run.requestedBy || null,
    measuredFrom: run.measuredFrom || 'cli', pages: run.pages?.length || 0, runs: run.config?.runs, visits: run.config?.visits,
    mode: run.mode || null, counts: run.counts, aborted: run.aborted || null, cancelled: Boolean(run.cancelled), kinds,
  };
}

// the pattern a reading route names, judged: { app, patternId, dir } or null (answered)
async function readable(req, res) {
  const { app, patternId } = req.query;
  if (!NAME.test(app || '') || !NAME.test(String(patternId || ''))) { res.status(400).json({ error: 'app and patternId are required' }); return null; }
  const user = await requireCan(req, res, { pattern: { app, id: patternId }, verb: 'edit-pattern', app, mode: 'enforce' });
  if (!user) return null;
  return { app, patternId, dir: patternDir(app, patternId), user };
}
const runDir = (where, id) => (NAME.test(id || '') && fs.existsSync(path.join(where.dir, id, 'run.json')) ? path.join(where.dir, id) : null);

function registerPerfRoutes(app) {
  app.post('/_dms/perf/run', async (req, res) => {
    const body = req.body || {};
    const problem = await validate(body, req.headers.origin);
    if (problem) return res.status(400).json({ error: problem });
    const user = await requireCan(req, res, { pattern: { app: body.app, id: body.patternId }, verb: 'edit-pattern', app: body.app, mode: 'enforce' });
    if (!user) return;
    if (current) {
      return res.status(409).json({ error: `A performance run is already going on this server: ${current.patternName} (${current.app}), started by ${current.by || 'someone'}. One runs at a time.`, running: status(current) });
    }
    const E = await engine();
    const allPages = body.pages.map((p) => ({
      id: String(p.id ?? p.path), slug: String(p.slug ?? ''), title: String(p.title ?? ''), parent: p.parent != null && p.parent !== '' ? String(p.parent) : null,
      index: +p.index || 0, published: p.published !== false, path: p.path,
    }));
    const sample = body.sample == null || body.sample === 'all' ? null : Math.max(1, Math.round(+body.sample) || 10);
    const pages = E.choosePages(allPages, { sample });
    const id = `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
    const dir = path.join(patternDir(body.app, body.patternId), id);
    let cfg;
    try {
      cfg = E.resolveRunConfig({
        target: new URL(body.origin).origin, pattern: String(body.pattern?.name || body.patternId),
        label: String(body.label || 'admin').replace(/[^\w .-]+/g, '').trim().slice(0, 60) || 'admin',
        visits: body.visits == null ? DEFAULT_VISITS : [].concat(body.visits),
        runs: Math.max(1, Math.min(MAX_RUNS, Math.round(+body.runs) || 3)),
        parallel: 1, profiles: 'public', out: dir,
      });
    } catch (e) { return res.status(400).json({ error: e.message }); }
    fs.mkdirSync(dir, { recursive: true });
    const job = {
      id, app: body.app, patternId: String(body.patternId), patternName: cfg.pattern, label: cfg.label, by: user.email || null,
      origin: cfg.target, dir, cfg, allPages, pages,
      pattern: { id: String(body.patternId), name: cfg.pattern, base_url: String(body.pattern?.base_url || '/'), subdomain: '*', preload_data: body.pattern?.preload_data === true },
      abort: new AbortController(), state: 'running', done: 0, total: expectedVisits(cfg, pages.length), current: 'Starting the browser',
      error: null, startedAt: Date.now(), finishedAt: null,
    };
    jobs.set(id, job);
    current = job;
    console.log(`[perf] ${job.app} ${job.patternName}: ${pages.length} pages × ${cfg.runs} (${cfg.visits.join(', ')}) on ${cfg.target}, started by ${job.by}`);
    run(job).catch((e) => { console.error('[perf] run failed', e); if (job.state === 'running') finish(job, 'failed', e.message); });
    res.status(202).json(status(job));
  });

  app.get('/_dms/perf/run/:id', (req, res) => {
    if (!requireUser(req, res)) return;
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'no such run' });
    res.json(status(job));
  });

  app.delete('/_dms/perf/run/:id', async (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'no such run' });
    const user = await requireCan(req, res, { pattern: { app: job.app, id: job.patternId }, verb: 'edit-pattern', app: job.app, mode: 'enforce' });
    if (!user) return;
    if (job.state === 'running') { job.current = 'Cancelling'; job.abort.abort(); }
    res.json(status(job));
  });

  app.get('/_dms/perf/runs', async (req, res) => {
    const where = await readable(req, res);
    if (!where) return;
    const E = await engine();
    const names = fs.existsSync(where.dir) ? fs.readdirSync(where.dir).filter((n) => NAME.test(n)).sort().reverse() : [];
    const runs = [];
    for (const n of names) {
      // the run going now is listed by `running`, not here
      if (current && current.id === n) continue;
      try { runs.push(await summarize(E, path.join(where.dir, n))); } catch { /* a run with nothing saved yet */ }
    }
    const going = current && current.app === where.app && current.patternId === String(where.patternId) ? status(current) : null;
    res.json({ running: going, busy: Boolean(current) && !going, runs });
  });

  app.get('/_dms/perf/runs/:id/report.html', async (req, res) => {
    const where = await readable(req, res);
    if (!where) return;
    const dir = runDir(where, req.params.id);
    if (!dir || !fs.existsSync(path.join(dir, 'report.html'))) return res.status(404).json({ error: 'no such report' });
    res.type('html').send(fs.readFileSync(path.join(dir, 'report.html'), 'utf8'));
  });

  app.get('/_dms/perf/runs/:id/run.json', async (req, res) => {
    const where = await readable(req, res);
    if (!where) return;
    const dir = runDir(where, req.params.id);
    if (!dir) return res.status(404).json({ error: 'no such run' });
    res.type('json').send(fs.readFileSync(path.join(dir, 'run.json'), 'utf8'));
  });

  app.get('/_dms/perf/compare', async (req, res) => {
    const where = await readable(req, res);
    if (!where) return;
    const a = runDir(where, req.query.a), b = runDir(where, req.query.b);
    if (!a || !b) return res.status(404).json({ error: 'no such run' });
    const E = await engine();
    const base = E.loadRun(a), cand = E.loadRun(b);
    res.type('html').send(E.renderReport([base, cand], E.compareRuns(base, cand)));
  });
}

module.exports = { registerPerfRoutes, validate, expectedVisits };
