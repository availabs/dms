'use strict';
/**
 * The admin Storage pages: what a site's rows take up, and cleaning up the rows nothing can reach
 * (orphanSweep.js has the rules; planning/tasks/current/orphan-sweeper.md, Phase 2).
 *
 *     POST /dms/:app/storage/plan    { parents?, kinds?, only?, quick? }  read-only: usage + the plan's numbers
 *     POST /dms/:app/storage/clean   { parents?, kinds?, only, expect }   back up, then delete what the plan lists
 *     GET  /dms/:app/storage/jobs/:job                              a running plan or clean, or its result
 *
 * `parents` narrows to rows under those containers (a pattern's instance name), `kinds` to rows of those
 * kinds, `only` picks categories. `quick` (plan only) skips the database-wide search for page and pattern
 * rows: it answers in seconds with them all taken as kept (`unchecked`), for the page to show while the
 * full plan runs. A plan that names only what it deletes searches only those (orphanSweep.js).
 * (default: the three page-content ones; `other_kinds` only when named). A plan or a clean can take
 * minutes on a big site, longer than a proxy waits, so both run as a job: the POST answers with the
 * result when it is done within WAIT_MS, otherwise with `{ job }` for the client to poll.
 * `clean` takes no preview flag (dms-server's rule for destructive routes); it re-plans and refuses with
 * 409 when the counts differ from `expect`. Both need the site-level `manage-storage` (or `*`).
 * No change_log entries (owner, 2026-11-18): the rows were unreachable, so no open page shows them.
 */
const crypto = require('crypto');
const { requireUser } = require('../auth/requestUser');
const { siteCan } = require('../auth');
const { getSubdomain } = require('../../utils/subdomain');
const { CATEGORIES, DEFAULT_CATEGORIES } = require('./orphanSweep');

const controller = () => require('./dms.route').controller; // the served instance and its database
const WAIT_MS = 20000;
const KEEP_MS = 15 * 60 * 1000;
const PERMS = ['manage-storage'];
const jobs = new Map();                   // id -> { id, app, kind, key, promise, done, result, error, at }

function sweep(req, res) {
  const body = req.body || {};
  const strings = (v) => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x) : [];
  const parents = strings(body.parents);
  const kinds = strings(body.kinds);
  const only = Array.isArray(body.only) && body.only.length ? body.only : DEFAULT_CATEGORIES;
  if (only.some(c => !CATEGORIES.includes(c))) { res.status(400).json({ error: `only takes: ${CATEGORIES.join(', ')}` }); return null; }
  return { parents, kinds, only, ...(body.quick === true ? { quick: true } : {}) };
}

async function allowed(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (await siteCan(req.params.app, user, PERMS, getSubdomain(req))) return user;
  res.status(403).json({ error: `Not authorized: needs ${PERMS.join(' or ')} on this site` });
  return null;
}

function start(app, kind, key, run) {
  for (const [id, j] of jobs) if (j.done && Date.now() - j.at > KEEP_MS) jobs.delete(id);
  const same = [...jobs.values()].find(j => j.key === key && !j.done);
  if (same) return same;
  const job = { id: crypto.randomUUID(), app, kind, key, done: false, at: Date.now() };
  job.promise = run().then(r => { job.result = r; }, e => { job.error = { message: e.message, status: e.status || 500 }; })
    .finally(() => { job.done = true; job.at = Date.now(); });
  jobs.set(job.id, job);
  return job;
}

function answer(res, job) {
  if (!job.done) return res.status(202).json({ job: job.id, done: false, kind: job.kind });
  if (job.error) return res.status(job.error.status).json({ job: job.id, done: true, error: job.error.message });
  return res.json({ job: job.id, done: true, kind: job.kind, result: job.result });
}

async function waitThenAnswer(res, job) {
  await Promise.race([job.promise, new Promise(r => setTimeout(r, WAIT_MS))]);
  answer(res, job);
}

function registerStorageRoutes(app) {
  app.post('/dms/:app/storage/plan', async (req, res) => {
    try {
      if (!await allowed(req, res)) return;
      const opts = sweep(req, res);
      if (!opts) return;
      const key = `${req.params.app}\tplan\t${JSON.stringify(opts)}`;
      await waitThenAnswer(res, start(req.params.app, 'plan', key, () => controller().planStorage(req.params.app, opts)));
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });

  app.post('/dms/:app/storage/clean', async (req, res) => {
    try {
      const user = await allowed(req, res);
      if (!user) return;
      const opts = sweep(req, res);
      if (!opts) return;
      delete opts.quick;                  // a clean up always searches
      const expect = req.body && req.body.expect;
      if (!expect || typeof expect !== 'object') return res.status(400).json({ error: 'expect (the plan\'s counts) is required' });
      if ([...jobs.values()].some(j => j.app === req.params.app && j.kind === 'clean' && !j.done)) {
        return res.status(409).json({ error: 'a clean up of this site is already running' });
      }
      const key = `${req.params.app}\tclean\t${crypto.randomUUID()}`;
      await waitThenAnswer(res, start(req.params.app, 'clean', key, () => controller().cleanStorage(req.params.app, { ...opts, expect })));
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });

  app.get('/dms/:app/storage/jobs/:job', async (req, res) => {
    if (!await allowed(req, res)) return;
    const job = jobs.get(req.params.job);
    if (!job || job.app !== req.params.app) return res.status(404).json({ error: 'no such job (it may have expired)' });
    answer(res, job);
  });
}

module.exports = { registerStorageRoutes };
