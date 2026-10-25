/**
 * A user's own grants on a site (`authPermissions.users[<userId>]` / an internal source's
 * `auth_permissions.users[<userId>]`), for "Remove from site" (/user/project/remove, task
 * permissions-auth-users-and-signup, owner 2026-10-25).
 *
 * - Site rows (patterns, pages, internal sources: every row of the app in the DMS db) are stripped
 *   through the DMS controller, so each write lands in change_log and reaches sync clients like any
 *   other edit. Each write is checked against the row as read (`expect`) and re-read on a clash.
 * - External sources (DAMA pgEnvs) are only listed, never written (owner): nothing in the db links a
 *   site to its pgEnvs (a client build setting), so the client names them, and other sites may use
 *   the same sources.
 */

const GRANT_KEYS = ['authPermissions', 'auth_permissions'];

const parseJson = (v) => {
  if (v == null) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return v;
};

/**
 * The grant value without `userId`'s own entry, in the shape it was stored in (string or object, plain
 * `{ groups, users }` or the per-subdomain `{ '*': …, <subdomain>: … }` format). Null when the user has
 * no entry in it.
 *
 * `mergePatch`: the value to hand setDataById on SQLite, whose json_patch merges nested objects and
 * keeps keys a patch leaves out (only `null` deletes); Postgres' `||` replaces the top-level key, so it
 * gets the whole new value. A string value is replaced whole on both.
 */
function stripUser(raw, userId, { mergePatch = false } = {}) {
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  const id = String(userId);
  const asPatch = mergePatch && typeof raw !== 'string';
  const stripOne = (ap) => {
    const obj = parseJson(ap);
    if (!obj || !obj.users || !(id in obj.users)) return { changed: false, value: asPatch ? undefined : ap };
    const { [id]: _drop, ...users } = obj.users;
    const next = { ...obj, users };
    if (typeof ap === 'string') return { changed: true, value: JSON.stringify(next) };
    return { changed: true, value: asPatch ? { users: { [id]: null } } : next };
  };
  let changed = false;
  let next;
  if (parsed['*'] !== undefined) {
    next = {};
    for (const [sub, ap] of Object.entries(parsed)) {
      const r = stripOne(ap);
      changed = changed || r.changed;
      if (r.value !== undefined) next[sub] = r.value;
    }
  } else {
    const r = stripOne(parsed);
    changed = r.changed;
    next = r.value;
  }
  if (!changed) return null;
  return typeof raw === 'string' ? JSON.stringify(next) : next;
}

/** `{ key: strippedValue }` for each grant key of `data` that names the user; null when none does. */
function patchFor(data, userId, opts) {
  const patch = {};
  for (const key of GRANT_KEYS) {
    if (data[key] === undefined) continue;
    const next = stripUser(data[key], userId, opts);
    if (next !== null) patch[key] = next;
  }
  return Object.keys(patch).length ? patch : null;
}

/**
 * @param {object} opts
 * @param {() => object} opts.getController - the DMS controller (dms.controller createController)
 * @param {(pgEnv: string) => object} [opts.getDamaDb] - a DAMA pgEnv's db adapter; throws for an unknown
 *   or non-dama env
 */
function createSiteGrants({ getController, getDamaDb }) {
  /** Rows of `app` that grant `userId` something: `[{ id, type, patch, expect }]`. */
  async function listSiteGrants(app, userId) {
    const ctrl = getController();
    const rows = await ctrl.getRowsWithGrants(app);
    const opts = { mergePatch: ctrl.dbType === 'sqlite' };
    const out = [];
    for (const r of rows) {
      const patch = patchFor(parseJson(r.data) || {}, userId, opts);
      if (patch) out.push({ id: r.id, type: r.type, patch, expect: { type: r.type, dataText: r.data_text } });
    }
    return out;
  }

  /** Strip `userId` from every row of `app` that names them. Returns the rows written. */
  async function stripSiteGrants(app, userId, actor, reqMeta = null) {
    const ctrl = getController();
    const written = [];
    for (const g of await listSiteGrants(app, userId)) {
      let { patch, expect } = g;
      for (let attempt = 0; ; attempt++) {
        try {
          await ctrl.setDataById(g.id, patch, actor, app, null, reqMeta, { expect });
          written.push({ id: g.id, type: g.type });
          break;
        } catch (e) {
          if (e.code !== 'DMS_STALE_ROW' || attempt >= 2) throw e;
          const [row] = await ctrl.getRowsForWrite([g.id], app);
          if (!row) break;
          patch = patchFor(parseJson(row.data) || {}, userId, { mergePatch: ctrl.dbType === 'sqlite' });
          if (!patch) break;
          expect = { type: row.type, dataText: row.data_text };
        }
      }
    }
    return written;
  }

  /** External sources in `pgEnvs` that grant `userId` something: `[{ pgEnv, source_id, name }]`. */
  async function listExternalGrants(pgEnvs, userId) {
    const out = [];
    if (!getDamaDb) return out;
    const id = String(userId);
    for (const pgEnv of [...new Set(pgEnvs || [])]) {
      let db;
      try { db = getDamaDb(pgEnv); } catch { out.push({ pgEnv, error: 'unknown pgEnv' }); continue; }
      const table = db.type === 'postgres' ? 'data_manager.sources' : 'sources';
      const { rows } = await db.query(
        `SELECT source_id, name, auth_permissions FROM ${table} WHERE auth_permissions IS NOT NULL`);
      for (const r of rows) {
        const ap = parseJson(r.auth_permissions);
        if (!ap) continue;
        const entries = ap['*'] !== undefined ? Object.values(ap).map(parseJson) : [ap];
        if (entries.some(e => e && e.users && id in e.users)) out.push({ pgEnv, source_id: r.source_id, name: r.name });
      }
    }
    return out;
  }

  return { listSiteGrants, stripSiteGrants, listExternalGrants };
}

module.exports = { createSiteGrants, stripUser, patchFor };
