'use strict';

/**
 * The pgEnvs a tenant of the hub is attached to (pgenv-config-on-the-site-row.md).
 *
 *     describe(app)                    { attached: [{ pgEnv, id, type, name }], available: [name] }
 *     attach({ app, pgEnv, user })     make sure the app has its one `:dmsenv` row for the pgEnv
 *     planDetach({ app, pgEnv })       read-only: the env row a detach would delete, the grants on it,
 *                                      and what blocks it
 *     detach({ app, pgEnv, user })     delete that env row (and its ref on the site row, if any)
 *
 * A site uses a pgEnv when it has a `{site}|{name}:dmsenv` row with `data.pgEnv` (dama/pgEnv.js). Without
 * that row the auth layer refuses the pgEnv's sources for the site, and every such read is a miss.
 * `available` is what this server can attach: its db configs with the `dama` role. Attaching is the same
 * operation as scripts/attach-pgenv.js, and a repeat is a no-op.
 *
 * Detaching deletes the env row, so the site's env-level grants for that pgEnv go with it; the pgEnv's
 * own sources, views and their grants are in the pgEnv and are not touched. It is refused while the row
 * has internal sources under it (a row adopted by name can) or a pattern points at it.
 *
 * Not here yet: attach writing the site row's `dms_envs` ref.
 */
const { findConfigsByRole } = require('../../db/config');
const { envRowOf, envRowsOf, envRowUsage, ensureEnvRow } = require('../../dama/pgEnv');

const refuse = (status, message) => Object.assign(new Error(message), { status });

/** The pgEnvs this server has a database config for. */
const availablePgEnvs = () => findConfigsByRole('dama').sort();

async function describe(app) {
  const rows = await envRowsOf(app);
  return {
    attached: rows.map(r => ({ pgEnv: r.data.pgEnv, id: +r.id, type: r.type, name: r.data.name || '' })),
    available: availablePgEnvs(),
  };
}

async function attach({ app, pgEnv, user = null }) {
  const name = `${pgEnv || ''}`.trim();
  if (!name) throw refuse(400, 'Name the pgEnv to attach');
  if (!availablePgEnvs().includes(name)) throw refuse(400, `This server has no database config for pgEnv "${name}"`);
  let result;
  try { result = await ensureEnvRow({ app, pgEnv: name, apply: true, user }); }
  catch (e) { throw e.status ? e : refuse(409, e.message); }   // e.g. the app has no single :site row
  // The app's snapshot predates the row: without this, reads keep missing until it ages out.
  require('../auth/owners').clearSnapshots();
  return { created: !!result.create, adopted: !!result.adopt, already: !!result.id };
}

const parse = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } };

/** Who holds something on the row: group and user keys with a non-empty list. */
function granteesOf(data) {
  const g = parse(data.authPermissions) || parse(data.auth_permissions) || {};
  const named = (o) => Object.keys(o && typeof o === 'object' ? o : {}).filter(k => Array.isArray(o[k]) && o[k].length);
  return { groups: named(g.groups), users: named(g.users).length };
}

async function planDetach({ app, pgEnv }) {
  const name = `${pgEnv || ''}`.trim();
  const row = name ? await envRowOf(app, name) : null;
  if (!row) throw refuse(404, `pgEnv "${name}" is not attached`);
  const usage = await envRowUsage(app, row);
  const blocked = usage.sources ? `${usage.sources} internal source${usage.sources === 1 ? '' : 's'} under it`
    : usage.patterns.length ? `Used by ${usage.patterns.map(p => p.name || p.id).join(', ')}`
    : '';
  return { pgEnv: name, row: { id: +row.id, type: row.type }, grants: granteesOf(row.data), patterns: usage.patterns, sources: usage.sources, blocked, sites: usage.sites };
}

async function detach({ app, pgEnv, user = null }) {
  const { sites, ...plan } = await planDetach({ app, pgEnv });
  if (plan.blocked) throw refuse(409, plan.blocked);
  const ctl = require('../dms/dms.controller').createController(process.env.DMS_DB_ENV || 'dms-sqlite');
  await ctl.deleteData(app, plan.row.type, [plan.row.id], user);
  for (const site of sites) {   // the delete does not sweep the site row's list
    await ctl.setDataById(site.id, { dms_envs: site.data.dms_envs.filter(e => `${e && e.id}` !== `${plan.row.id}`) }, user, app);
  }
  require('../auth/owners').clearSnapshots();
  return plan;
}

module.exports = { describe, attach, planDetach, detach, availablePgEnvs };
