'use strict';

/**
 * Delete a tenant of the hub (tenant-subdomain-uniqueness.md; the work itself is ./delete.js).
 *
 *     POST /tenants/:tenant/delete/plan              read-only: what a delete would remove
 *     POST /tenants/:tenant/delete  { confirm }      back up, then delete; `confirm` must be the subdomain
 *
 * `:tenant` is the tenant's subdomain. Who may: hub staff (`manage-tenants` on the hub's site row),
 * judged here whatever DMS_AUTH_MODE says. Per dms-server's rule for destructive routes, the delete takes
 * no preview flag: the preview is its own read-only route. One delete runs at a time.
 *
 * Mounted on a multi-tenant server only.
 */
const { requireUser } = require('../auth/requestUser');
const { siteCan } = require('../auth');
const domains = require('../domains/store');
const fs = require('fs');
const { deleteTenant, planTenantDelete, authRows, backupRoot } = require('./delete');
const { getDb } = require('../../db');

const hubApp = () => process.env.DMS_APP || process.env.VITE_DMS_APP || '';
const hubType = () => process.env.DMS_TYPE || process.env.VITE_DMS_TYPE || '';
const multiTenant = () => (process.env.DMS_MULTI_TENANT || process.env.VITE_DMS_MULTI_TENANT) === '1';

async function staff(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (!(await siteCan(hubApp(), user, ['manage-tenants']))) {
    res.status(403).json({ error: 'Not authorized: deleting a tenant needs manage-tenants on the hub' });
    return null;
  }
  return user;
}

const fail = (res, e) => res.status(e.status || 500).json({ error: e.message });

let running = null;

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
