'use strict';
/**
 * WHO A ROW'S OWN GRANTS NAME, for someone who may read the row.
 *
 *     GET /dms/:app/rows/:id/grantees   → { users: [{ id, email }] }
 *
 * The users named on the row's own grants (`authPermissions` / `auth_permissions`, the entry for the
 * request's subdomain), by id or as members of a group granted any verb there. `public` is not
 * expanded (it is everyone, signed out included), nor are grants inherited from rows above: only
 * what the row itself says. Each user is their id and email (the auth table holds no other name).
 *
 * Why: the auth API's user and group lists are for people who manage users (`auth-users`), but a
 * reader sometimes needs to know who else a row lets in, e.g. a chat's people picker over the users
 * the chat pattern is granted to. Anyone who may READ the row may ask; the answer is no more than the
 * row's grants plus the members of the groups they name.
 *
 * Judged by `authorize(read)` on the row, as any DMS read is (and enforced, as DMS reads are). Names
 * no kind, pattern or app. Task: dms-template planning/tessera/tasks/current/chat-direct-messages.md.
 */
const { getDb } = require('../../db');
const { requireUser } = require('./requestUser');
const { authorize, applyMode } = require('./index');
const { parseJson, resolveAuthPermissions } = require('./grants');
const { getSubdomain } = require('../../utils/subdomain');

const APP = /^[A-Za-z0-9_.-]{1,200}$/;
const MAX_USERS = 5000;

/** The row's own grants for this subdomain, as `{ groups: [names], users: [ids] }` (scoped grants: both buckets). */
function namedIn(raw, subdomain = '') {
  const g = resolveAuthPermissions(raw, subdomain);
  const buckets = (g.self !== undefined || g.descendants !== undefined) ? [g.self, g.descendants].map(parseJson) : [g];
  const groups = new Set(), users = new Set();
  const some = (v) => [].concat(v == null ? [] : v).length > 0;
  for (const b of buckets) {
    if (!b || typeof b !== 'object') continue;
    for (const [name, verbs] of Object.entries(b.groups || {})) if (name !== 'public' && some(verbs)) groups.add(name);
    for (const [id, verbs] of Object.entries(b.users || {})) if (some(verbs)) users.add(String(id));
  }
  return { groups: [...groups], users: [...users] };
}

/** `{ id, email }` for the members of `groups` and the users `ids`, by email. */
async function usersFor(authDb, { groups, users }) {
  const out = new Map();
  const add = (rows) => { for (const r of rows) if (r.email && !out.has(r.email)) out.set(r.email, { id: r.id == null ? null : +r.id, email: r.email }); };
  if (groups.length) {
    const ps = groups.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await authDb.query(
      `SELECT DISTINCT u.id, u.email FROM users_in_groups AS uig
         INNER JOIN users AS u ON u.email = uig.user_email
        WHERE uig.group_name IN (${ps})`, groups);
    add(rows || []);
  }
  const ids = users.filter(id => /^\d+$/.test(id)).map(Number);
  if (ids.length) {
    const ps = ids.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await authDb.query(`SELECT id, email FROM users WHERE id IN (${ps})`, ids);
    add(rows || []);
  }
  return [...out.values()].sort((a, b) => a.email.localeCompare(b.email)).slice(0, MAX_USERS);
}

/**
 * Mount the route. `controller` / `authDb` are for tests; the server passes neither (the DMS
 * controller of DMS_DB_ENV, the auth database of `authDbEnv`).
 */
function registerGranteeRoutes(app, { authDbEnv = process.env.DMS_AUTH_DB_ENV || 'auth-sqlite', authDb = null, controller = null } = {}) {
  let ctl = controller;
  const dms = () => (ctl || (ctl = require('../dms/dms.controller').createController(process.env.DMS_DB_ENV || 'dms-sqlite')));
  app.get('/dms/:app/rows/:id/grantees', async (req, res) => {
    try {
      const user = requireUser(req, res);
      if (!user) return;
      const { app: site, id } = req.params;
      if (!APP.test(site) || !/^\d+$/.test(id)) return res.status(400).json({ error: 'app and a numeric row id' });
      const [row] = await dms().getDataById([+id], ['id', 'app', 'type', 'data'], site);
      if (!row || !row.type) return res.status(404).json({ error: `no row ${id}` });
      const data = parseJson(row.data) || {};
      const subdomain = getSubdomain(req);
      const d = await authorize({ row: { id: row.id, app: site, type: row.type, data }, verb: 'read', user, subdomain, app: site });
      // DMS reads are enforced whatever the mode, and so is this one (it answers about a row's grants)
      if (!applyMode(d, { guard: 'read', kind: 'read grantees', target: `${id} ${row.type}`, user, app: site, mode: 'enforce' })) {
        return res.status(403).json({ error: 'Not authorized to read this row' });
      }
      const raw = data.authPermissions !== undefined ? data.authPermissions : data.auth_permissions;
      const users = await usersFor(authDb || getDb(authDbEnv), namedIn(raw, subdomain));
      res.json({ users });
    } catch (e) {
      console.error('[grantees]', e.message);
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { registerGranteeRoutes, namedIn, usersFor };
