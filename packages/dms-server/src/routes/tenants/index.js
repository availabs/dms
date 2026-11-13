'use strict';

/**
 * Delete a tenant of the hub (tenant-subdomain-uniqueness.md; the work itself is ./delete.js).
 *
 *     POST /tenants/:tenant/delete/plan              read-only: what a delete would remove
 *     POST /tenants/:tenant/delete  { confirm }      back up, then delete; `confirm` must be the subdomain
 *
 * The pgEnvs a tenant is attached to (pgenv-config-on-the-site-row.md; the work itself is ./pgEnvs.js):
 *
 *     GET  /tenants/:tenant/pgenvs                   attached pgEnvs; for hub staff also the ones this server
 *                                                    can attach. Open to the tenant's own admins too
 *                                                    (`manage-domains` on the TENANT's site row), read-only
 *     POST /tenants/:tenant/pgenvs/attach { pgEnv }  create (or adopt) the tenant's env row for the pgEnv
 *     POST /tenants/:tenant/pgenvs/detach/plan { pgEnv }   read-only: what a detach would delete
 *     POST /tenants/:tenant/pgenvs/detach { pgEnv }  delete the tenant's env row for the pgEnv
 *
 * The same four under `/hub/pgenvs` are the hub's own site (it has pages and patterns of its own).
 *
 * `:tenant` is the tenant's subdomain. Who may: hub staff (`manage-tenants` on the hub's site row),
 * judged here whatever DMS_AUTH_MODE says. Per dms-server's rule for destructive routes, the delete takes
 * no preview flag: the preview is its own read-only route. One delete runs at a time. Attaching a pgEnv
 * shows the tenant another database's catalog, so it is hub staff's too.
 *
 * Mounted on a multi-tenant server only.
 */
const { requireUser } = require('../auth/requestUser');
const { siteCan } = require('../auth');
const domains = require('../domains/store');
const fs = require('fs');
const { deleteTenant, planTenantDelete, authRows, backupRoot } = require('./delete');
const { getDb } = require('../../db');
const pgEnvs = require('./pgEnvs');

const hubApp = () => process.env.DMS_APP || process.env.VITE_DMS_APP || '';
const hubType = () => process.env.DMS_TYPE || process.env.VITE_DMS_TYPE || '';
const multiTenant = () => (process.env.DMS_MULTI_TENANT || process.env.VITE_DMS_MULTI_TENANT) === '1';

async function staff(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (!(await siteCan(hubApp(), user, ['manage-tenants']))) {
    res.status(403).json({ error: 'Not authorized: needs manage-tenants on the hub' });
    return null;
  }
  return user;
}

const fail = (res, e) => res.status(e.status || 500).json({ error: e.message });

let running = null;

/** The app the request is about: the tenant's (`:tenant`), or the hub's own when the route names none. Null after answering 404. */
async function siteAppOf(req, res) {
  if (req.params.tenant === undefined) return hubApp();
  const row = await domains.tenantBySubdomain(req.params.tenant, { fresh: true });
  if (!row || !row.data.app) { res.status(404).json({ error: `no tenant "${req.params.tenant}"` }); return null; }
  return row.data.app;
}

function registerTenantRoutes(app) {
  if (!multiTenant()) return;
  // A delete writes its backup first and stops when it can't: say at start where, and whether that works.
  const dir = backupRoot();
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    console.log(`[tenants] delete backups → ${dir}${process.env.DMS_TENANT_BACKUP_DIR ? '' : ' (default; set DMS_TENANT_BACKUP_DIR to a mounted folder)'}`);
  } catch (e) {
    console.warn(`[tenants] cannot write delete backups to ${dir} (${e.code || e.message}): tenant deletes will refuse until it can`);
  }

  // The same four routes for a tenant (`/tenants/:tenant/pgenvs`) and for the hub's own site (`/hub/pgenvs`).
  for (const base of ['/tenants/:tenant/pgenvs', '/hub/pgenvs']) {
    app.get(base, async (req, res) => {
      try {
        const user = requireUser(req, res);
        if (!user) return;
        const site = await siteAppOf(req, res);
        if (!site) return;
        const isStaff = await siteCan(hubApp(), user, ['manage-tenants']);
        if (!isStaff && !(await siteCan(site, user, ['manage-domains']))) {
          return res.status(403).json({ error: 'Not authorized: needs manage-domains on this site' });
        }
        const { attached, available } = await pgEnvs.describe(site);
        // The list of what could be attached names the server's databases: hub staff's only.
        res.json({ attached, available: isStaff ? available : [], canAttach: isStaff });
      } catch (e) { fail(res, e); }
    });

    app.post(`${base}/attach`, async (req, res) => {
      try {
        const user = await staff(req, res);
        if (!user) return;
        const site = await siteAppOf(req, res);
        if (!site) return;
        const pgEnv = req.body && req.body.pgEnv;
        const result = await pgEnvs.attach({ app: site, pgEnv, user });
        console.log(`[tenants] pgEnv ${pgEnv} ${result.already ? 'already attached to' : 'attached to'} ${site} by ${user.email}`);
        res.json({ ...(await pgEnvs.describe(site)), canAttach: true, result });
      } catch (e) {
        console.warn(`[tenants] attach pgEnv to ${req.params.tenant || 'the hub'} failed: ${e.message}`);
        fail(res, e);
      }
    });

    app.post(`${base}/detach/plan`, async (req, res) => {
      try {
        if (!(await staff(req, res))) return;
        const site = await siteAppOf(req, res);
        if (!site) return;
        const { sites, ...plan } = await pgEnvs.planDetach({ app: site, pgEnv: req.body && req.body.pgEnv });
        res.json(plan);
      } catch (e) { fail(res, e); }
    });

    app.post(`${base}/detach`, async (req, res) => {
      try {
        const user = await staff(req, res);
        if (!user) return;
        const site = await siteAppOf(req, res);
        if (!site) return;
        const plan = await pgEnvs.detach({ app: site, pgEnv: req.body && req.body.pgEnv, user });
        console.log(`[tenants] pgEnv ${plan.pgEnv} detached from ${site} (env row #${plan.row.id}) by ${user.email}`);
        res.json({ ...(await pgEnvs.describe(site)), canAttach: true, result: plan });
      } catch (e) {
        console.warn(`[tenants] detach pgEnv from ${req.params.tenant || 'the hub'} failed: ${e.message}`);
        fail(res, e);
      }
    });
  }

  app.post('/tenants/:tenant/delete/plan', async (req, res) => {
    try {
      if (!(await staff(req, res))) return;
      const plan = await planTenantDelete({ hubApp: hubApp(), hubType: hubType(), subdomain: req.params.tenant });
      const auth = await authRows(getDb(process.env.DMS_AUTH_DB_ENV || 'auth-sqlite'), plan.app);
      res.json({
        tenant: { subdomain: plan.sub, app: plan.app, linked: plan.hub.linked, rows: plan.hub.tenantRows.map(r => r.id) },
        schema: plan.schemaExists ? plan.schema : null,
        tables: plan.tables.length,
        auth: {
          project: !!auth.project,
          groups: auth.doomedGroups,
          keptGroups: auth.groups.filter(g => g.exists && g.sharedWithOtherProjects).map(g => g.name),
          memberships: auth.users_in_groups.length,
        },
      });
    } catch (e) { fail(res, e); }
  });

  app.post('/tenants/:tenant/delete', async (req, res) => {
    try {
      const user = await staff(req, res);
      if (!user) return;
      const sub = `${req.params.tenant || ''}`.toLowerCase();
      if (`${(req.body && req.body.confirm) || ''}`.trim().toLowerCase() !== sub) {
        return res.status(400).json({ error: `Type the subdomain (${sub}) to confirm` });
      }
      if (running) return res.status(409).json({ error: 'Another tenant delete is running; try again when it finishes' });
      running = deleteTenant({ hubApp: hubApp(), hubType: hubType(), subdomain: sub, user });
      try {
        const out = await running;
        console.log(`[tenants] deleted ${sub} (app ${out.tenant.app}) by ${user.email}; backup ${out.backup}`);
        await domains.refresh().catch(() => {}); // the alias map, and through it the SSR route cache
        res.json(out);
      } finally {
        running = null;
      }
    } catch (e) {
      console.warn(`[tenants] delete ${req.params.tenant} failed: ${e.message}`);
      fail(res, e);
    }
  });
}

module.exports = { registerTenantRoutes };
