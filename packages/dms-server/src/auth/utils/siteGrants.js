/**
 * One user's or one group's own grants on a site, for when they leave it: "Remove from site"
 * (/user/project/remove, task permissions-auth-users-and-signup) and a group unlinked or deleted
 * (task permissions-auth-groups). Owner decisions 2026-10-25.
 *
 * - Who: `{ users: <userId> }` or `{ groups: <groupName> }`, the entry under that map of a grant.
 * - Site rows (patterns, pages, internal sources: every row of the app in the DMS db) are stripped
 *   through the DMS controller, so each write lands in change_log and reaches sync clients like any
 *   other edit. Each write is checked against the row as read (`expect`) and re-read on a clash.
 * - Format (owner): a row is written back in the shape and representation it already uses (a JSON
 *   string stays a string, per-subdomain stays per-subdomain, each subdomain entry keeps its own), under
 *   the key its kind reads (`auth_permissions` on a source, `authPermissions` on anything else), and
 *   only that entry changes. Grants that aren't a well-formed `{ groups, users }` of arrays are never
 *   rewritten: a row naming the user / group in such grants, or under a key its kind doesn't read, is
 *   returned in `skipped` with the reason.
 * - External sources (DAMA pgEnvs) are only listed, never written (owner): nothing in the db links a
 *   site to its pgEnvs (a client build setting), so the client names them, and other sites may use
 *   the same sources.
 */

const { getKind } = require('../../db/type-utils');

const GRANT_KEYS = ['authPermissions', 'auth_permissions'];
const keyForKind = (type) => (getKind(type || '') === 'source' ? 'auth_permissions' : 'authPermissions');

const parseJson = (v) => {
  if (v == null) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return undefined; } }
  return v;
};
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** `who` as `[map, key]`: `{ users: 7 }` → `['users', '7']`. */
const whoEntry = (who) => (who.users != null ? ['users', String(who.users)] : ['groups', String(who.groups)]);

/** A plain grant: an object with only `groups` / `users`, each a map of arrays of strings. */
function isWellFormedGrant(ap) {
  if (!isPlainObject(ap)) return false;
  return Object.entries(ap).every(([k, m]) => ['groups', 'users'].includes(k) && isPlainObject(m)
    && Object.values(m).every(perms => Array.isArray(perms) && perms.every(p => typeof p === 'string')));
}

/**
 * The stored grants, parsed and checked: `{ empty }` (nothing set: null, '', [] — the formats'
 * default), `{ malformed }`, or `{ subdomains, entries }` where `entries` maps each subdomain (or
 * `null` for a plain grant) to its parsed grant.
 */
function readGrants(raw) {
  if (raw == null || raw === '') return { empty: true };
  const parsed = parseJson(raw);
  if (parsed === undefined) return { malformed: 'not valid JSON' };
  if (Array.isArray(parsed) && parsed.length === 0) return { empty: true };
  if (!isPlainObject(parsed)) return { malformed: 'not an object' };
  if (parsed['*'] !== undefined) {
    const entries = {};
    for (const [sub, ap] of Object.entries(parsed)) {
      const v = parseJson(ap);
      if (v === undefined) return { malformed: `subdomain ${sub}: not valid JSON` };
      if (v == null || (Array.isArray(v) && v.length === 0)) { entries[sub] = {}; continue; }
      if (!isWellFormedGrant(v)) return { malformed: `subdomain ${sub}: not { groups, users } of arrays` };
      entries[sub] = v;
    }
    return { subdomains: true, entries };
  }
  if (!isWellFormedGrant(parsed)) return { malformed: 'not { groups, users } of arrays' };
  return { subdomains: false, entries: { [null]: parsed } };
}

/**
 * The grant value without `who`'s entry, in the representation it was stored in. Null when nothing
 * names `who`; throws for malformed grants (callers check with readGrants first).
 *
 * `mergePatch`: the value to hand setDataById on SQLite, whose json_patch merges nested objects and
 * keeps keys a patch leaves out (only `null` deletes); Postgres' `||` replaces the top-level key, so it
 * gets the whole new value. A string value is replaced whole on both.
 */
function stripEntry(raw, who, { mergePatch = false } = {}) {
  const g = readGrants(raw);
  if (g.malformed) throw new Error(`malformed grants: ${g.malformed}`);
  if (g.empty) return null;
  const [map, key] = whoEntry(who);
  const asPatch = mergePatch && typeof raw !== 'string';
  const stripOne = (stored, ap) => {
    if (!ap[map] || !(key in ap[map])) return { changed: false };
    const { [key]: _drop, ...rest } = ap[map];
    const next = { ...ap, [map]: rest };
    if (!isWellFormedGrant(next)) throw new Error('stripped grants are not well-formed');
    if (typeof stored === 'string') return { changed: true, value: JSON.stringify(next) };
    return { changed: true, value: asPatch ? { [map]: { [key]: null } } : next };
  };
  const parsed = parseJson(raw);
  let changed = false;
  let next;
  if (g.subdomains) {
    next = {};
    for (const [sub, stored] of Object.entries(parsed)) {
      const r = stripOne(stored, g.entries[sub]);
      changed = changed || r.changed;
      if (r.changed) next[sub] = r.value;
      else if (!asPatch) next[sub] = stored;
    }
  } else {
    const r = stripOne(parsed, g.entries[null]);
    changed = r.changed;
    next = r.value;
  }
  if (!changed) return null;
  return typeof raw === 'string' ? JSON.stringify(next) : next;
}

/** Whether `raw`'s text might name `who` (for reporting grants that can't be parsed). */
function mentions(raw, who) {
  const [, key] = whoEntry(who);
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  return text.includes(JSON.stringify(key)) || text.includes(`\\"${key}\\"`);
}

/**
 * What stripping `who` from a row needs: `{ patch }` (null when nothing names them) or `{ skip }` (a
 * reason) when the row names them in grants that can't be rewritten safely.
 */
function planRow(row, data, who, opts) {
  const readKey = keyForKind(row.type);
  const patch = {};
  for (const key of GRANT_KEYS) {
    if (data[key] === undefined) continue;
    const g = readGrants(data[key]);
    if (g.malformed) {
      if (mentions(data[key], who)) return { skip: `${key}: ${g.malformed}` };
      continue;
    }
    const next = stripEntry(data[key], who, opts);
    if (next === null) continue;
    if (key !== readKey) return { skip: `${key} is not read on a ${getKind(row.type || '') || 'row'} (it reads ${readKey})` };
    patch[key] = next;
  }
  return { patch: Object.keys(patch).length ? patch : null };
}

/**
 * @param {object} opts
 * @param {() => object} opts.getController - the DMS controller (dms.controller createController)
 * @param {(pgEnv: string) => object} [opts.getDamaDb] - a DAMA pgEnv's db adapter; throws for an unknown
 *   or non-dama env
 */
function createSiteGrants({ getController, getDamaDb }) {
  /**
   * Rows of `app` that grant `who` something: `{ grants: [{ id, type, patch, expect }], skipped:
   * [{ id, type, reason }] }`.
   */
  async function listSiteGrants(app, who) {
    const ctrl = getController();
    const rows = await ctrl.getRowsWithGrants(app);
    const opts = { mergePatch: ctrl.dbType === 'sqlite' };
    const grants = [];
    const skipped = [];
    for (const r of rows) {
      const plan = planRow(r, parseJson(r.data) || {}, who, opts);
      if (plan.skip) skipped.push({ id: r.id, type: r.type, reason: plan.skip });
      else if (plan.patch) grants.push({ id: r.id, type: r.type, patch: plan.patch, expect: { type: r.type, dataText: r.data_text } });
    }
    return { grants, skipped };
  }

  /** Strip `who` from every row of `app` that names them. Returns `{ written, skipped }`. */
  async function stripSiteGrants(app, who, actor, reqMeta = null) {
    const ctrl = getController();
    const opts = { mergePatch: ctrl.dbType === 'sqlite' };
    const { grants, skipped } = await listSiteGrants(app, who);
    const written = [];
    for (const g of grants) {
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
          const plan = planRow(row, parseJson(row.data) || {}, who, opts);
          if (plan.skip) { skipped.push({ id: g.id, type: g.type, reason: plan.skip }); break; }
          if (!plan.patch) break;
          patch = plan.patch;
          expect = { type: row.type, dataText: row.data_text };
        }
      }
    }
    return { written, skipped };
  }

  /** External sources in `pgEnvs` that grant `who` something: `[{ pgEnv, source_id, name }]`. */
  async function listExternalGrants(pgEnvs, who) {
    const out = [];
    if (!getDamaDb) return out;
    const [map, key] = whoEntry(who);
    for (const pgEnv of [...new Set(pgEnvs || [])]) {
      let db;
      try { db = getDamaDb(pgEnv); } catch { out.push({ pgEnv, error: 'unknown pgEnv' }); continue; }
      const table = db.type === 'postgres' ? 'data_manager.sources' : 'sources';
      const { rows } = await db.query(
        `SELECT source_id, name, auth_permissions FROM ${table} WHERE auth_permissions IS NOT NULL`);
      for (const r of rows) {
        const g = readGrants(r.auth_permissions);
        if (g.malformed) {
          if (mentions(r.auth_permissions, who)) out.push({ pgEnv, source_id: r.source_id, name: r.name, malformed: g.malformed });
          continue;
        }
        if (g.empty) continue;
        if (Object.values(g.entries).some(e => e[map] && key in e[map])) out.push({ pgEnv, source_id: r.source_id, name: r.name });
      }
    }
    return out;
  }

  return { listSiteGrants, stripSiteGrants, listExternalGrants };
}

module.exports = { createSiteGrants, stripEntry, readGrants, isWellFormedGrant, planRow };
