'use strict';
/**
 * Deleting a pattern or a theme with what it owns (ownerDelete.js has the work; safe-delete-removes-rows.md).
 *
 *     POST /dms/:app/patterns/:id/delete/plan          read-only: what goes, what is kept, what blocks it
 *     POST /dms/:app/patterns/:id/delete  { expect }   back up, then delete; `expect` is the plan's
 *     POST /dms/:app/themes/:id/delete/plan            read-only
 *     POST /dms/:app/themes/:id/delete                 back up, then delete
 *
 * Per dms-server's rule for destructive routes the delete takes no preview flag: the preview is its own
 * read-only route, and an older server answers it 404 instead of deleting. Both routes judge the same
 * writes through the DMS write guard (assertDataWrite), so a plan the caller can't act on is refused too:
 *   pattern   delete the pattern row; edit `patterns` on each site that lists it; and when the dmsEnv goes,
 *             delete the env row and edit `dms_envs` on each site that lists it
 *   theme     delete the theme row; edit `theme_refs` on each site that lists it
 * The rows under the pattern (pages, sections, …) are not judged one by one: the pattern's delete covers
 * what it owns.
 */
const { requireUser } = require('../auth/requestUser');
const { assertDataWrite } = require('../auth');
const { getSubdomain } = require('../../utils/subdomain');

const controller = () => require('./dms.route').controller; // the served instance: its broadcasts and caches
const parse = (v) => { if (typeof v !== 'string') return v || null; try { return JSON.parse(v); } catch { return null; } };
const fail = (res, e) => res.status(e.status || 500).json({ error: e.message, ...(e.plan ? { plan: e.plan } : {}) });

const metaOf = (req, user) => ({ ip: req.clientIp || null, userAgent: req.headers['user-agent'] || null, authState: user ? 'authenticated' : null });

/** Judge each write a delete makes; throws (with `.status`) on the first refusal. */
async function judge(req, user, app, writes) {
  const caller = { user, subdomain: getSubdomain(req) };
  for (const { op, row, patch } of writes) await assertDataWrite(caller, op, app, row, patch || null);
}

/** The writes behind a ref leaving each site row that lists it. */
async function siteEdits(app, sites, key, id) {
  const out = [];
  for (const s of sites) {
    const row = await controller().rowForDelete(app, s.id);
    if (!row) continue;
    const list = (parse(row.data) || {})[key] || [];
    out.push({ op: 'edit', row, patch: { [key]: list.filter(r => String(r && typeof r === 'object' ? r.id : r) !== String(id)) } });
  }
  return out;
}

async function patternWrites(app, plan) {
  const writes = [{ op: 'delete', row: await controller().rowForDelete(app, plan.pattern.id) }];
  writes.push(...await siteEdits(app, plan.sites, 'patterns', plan.pattern.id));
  if (plan.dmsEnv && plan.dmsEnv.action === 'delete') {
    writes.push({ op: 'delete', row: await controller().rowForDelete(app, plan.dmsEnv.id) });
    writes.push(...await siteEdits(app, plan.dmsEnv.sites || [], 'dms_envs', plan.dmsEnv.id));
  }
  return writes;
}

async function themeWrites(app, plan) {
  return [{ op: 'delete', row: await controller().rowForDelete(app, plan.theme.id) },
    ...await siteEdits(app, plan.sites, 'theme_refs', plan.theme.id)];
}

function registerOwnerDeleteRoutes(app) {
  app.post('/dms/:app/patterns/:id/delete/plan', async (req, res) => {
    try {
      const user = requireUser(req, res);
      if (!user) return;
      const plan = await controller().planPatternDelete(req.params.app, req.params.id);
      await judge(req, user, req.params.app, await patternWrites(req.params.app, plan));
      res.json(plan);
    } catch (e) { fail(res, e); }
  });

  app.post('/dms/:app/patterns/:id/delete', async (req, res) => {
    try {
      const user = requireUser(req, res);
      if (!user) return;
      const plan = await controller().planPatternDelete(req.params.app, req.params.id);
      await judge(req, user, req.params.app, await patternWrites(req.params.app, plan));
      const out = await controller().deletePattern(req.params.app, req.params.id,
        { expect: (req.body && req.body.expect) || {}, userId: user.id ?? null, reqMeta: metaOf(req, user) });
      res.json(out);
    } catch (e) { fail(res, e); }
  });

  app.post('/dms/:app/themes/:id/delete/plan', async (req, res) => {
    try {
      const user = requireUser(req, res);
      if (!user) return;
      const plan = await controller().planThemeDelete(req.params.app, req.params.id);
      await judge(req, user, req.params.app, await themeWrites(req.params.app, plan));
      res.json(plan);
    } catch (e) { fail(res, e); }
  });

  app.post('/dms/:app/themes/:id/delete', async (req, res) => {
    try {
      const user = requireUser(req, res);
      if (!user) return;
      const plan = await controller().planThemeDelete(req.params.app, req.params.id);
      await judge(req, user, req.params.app, await themeWrites(req.params.app, plan));
      const out = await controller().deleteTheme(req.params.app, req.params.id, { userId: user.id ?? null, reqMeta: metaOf(req, user) });
      res.json(out);
    } catch (e) { fail(res, e); }
  });
}

module.exports = { registerOwnerDeleteRoutes };
