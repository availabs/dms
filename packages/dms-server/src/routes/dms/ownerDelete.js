'use strict';
/**
 * Deleting a pattern or a theme for real (safe-delete-removes-rows.md, Phase 2: F4 / F5). Mounted by
 * dms.controller.js with its own helpers (one transaction, change_log, the source cascade); the REST
 * routes are in ownerDeleteHttp.js. Each delete has a read-only plan (what goes, what is kept, what
 * blocks it) and an apply that writes a backup, then re-checks the plan's decisions inside its
 * transaction and refuses when they changed since the plan was shown.
 *
 * PATTERN (owner, 2026-11-13: "everything it owns except its database")
 *   deleted  the pattern row, its ref in every site's `patterns`, and every row under its container by
 *            type path (`<instance>|…`: pages, sections, history, templates — whatever the pattern type
 *            stores; the core reads the path, never the pattern type)
 *   dmsEnv   `data.dmsEnvId`: deleted with the pattern only when no other pattern in the app points at
 *            it, through the source cascade (sources, views, split tables, stored files, tasks), with its
 *            ref in every site's `dms_envs`. Kept, naming the patterns, when another pattern uses it.
 *            Kept when it is a pgEnv link (`data.pgEnv`): DAMA data is never deleted here.
 *   blocks   another pattern in the app with the same instance name (patterns on two sites can share a
 *            name, and `<instance>|page` does not say which one owns the rows)
 *
 * Rows under the container whose kind is one of the DMS model's own container kinds (site, pattern,
 * dmsenv, source, view, theme, tenant) are never taken: `<instance>|…:view` is a SOURCE named like the
 * pattern, not the pattern's row.
 *
 * THEME
 *   deleted  the theme row and its ref in every site's `theme_refs`
 *   blocks   a pattern that selects it (`theme.selectedTheme`, or the older `theme.settings.theme.theme`,
 *            by the theme's name): the warning names them, and nothing is deleted
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { getKind, getInstance } = require('#db/type-utils.js');

const CONTAINER_KINDS = new Set(['site', 'pattern', 'dmsenv', 'source', 'view', 'theme', 'tenant']);

const refuse = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const parse = (v) => { if (typeof v !== 'string') return v || null; try { return JSON.parse(v); } catch { return null; } };
const refIds = (list) => (Array.isArray(list) ? list : []).map(r => String(r && typeof r === 'object' ? r.id : r));

function backupRoot() {
  return process.env.DMS_DELETE_BACKUP_DIR || path.resolve(__dirname, '../../../var/delete-backups');
}

/** gzipped JSON of everything a delete removes. Throws when it can't: nothing is deleted without it. */
function writeBackup(label, payload) {
  const dir = backupRoot();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${label}-${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`);
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(payload)));
  return file;
}

function createOwnerDelete({ dms_db, dbType, splitMode, mainTable, appendChangeLog, removeIdFromRefArrays,
  cascadeSourceDelete, escapeLike, resolveTable, afterDelete }) {

  const rowsOfKind = (q, table, app, kind) =>
    q.promise(`SELECT id, type, data FROM ${table} WHERE app = $1 AND type LIKE $2;`, [app, `%:${kind}`]);

  const nameOf = (row) => { const d = parse(row.data) || {}; return d.name || d.title || getInstance(row.type) || `#${row.id}`; };

  async function rowById(q, table, app, id) {
    const [row] = await q.promise(`SELECT id, app, type, data FROM ${table} WHERE app = $1 AND id = $2;`, [app, id]);
    return row || null;
  }

  /** The sites (and so the ref arrays) that list `id` under `key`. */
  async function sitesListing(q, table, app, key, id) {
    return (await rowsOfKind(q, table, app, 'site'))
      .filter(s => refIds((parse(s.data) || {})[key]).includes(String(id)))
      .map(s => ({ id: +s.id, type: s.type, data: parse(s.data) || {} }));
  }

  /** Rows under the pattern's container by type path, minus the model's container kinds. */
  async function ownedRows(q, table, app, instance) {
    const rows = await q.promise(
      `SELECT id, type FROM ${table} WHERE app = $1 AND type LIKE $2 ESCAPE '\\';`, [app, `${escapeLike(instance)}|%`]);
    return rows.filter(r => !CONTAINER_KINDS.has(getKind(r.type)));
  }

  /** The two decisions the apply re-checks inside its transaction. */
  async function patternDecisions(q, table, app, pattern) {
    const data = parse(pattern.data) || {};
    const instance = getInstance(pattern.type);
    const patterns = (await rowsOfKind(q, table, app, 'pattern')).filter(p => String(p.id) !== String(pattern.id));
    const sameName = patterns.filter(p => getInstance(p.type) === instance).map(p => ({ id: +p.id, type: p.type, name: nameOf(p) }));

    let dmsEnv = null;
    const envId = data.dmsEnvId;
    if (envId !== undefined && envId !== null && envId !== '') {
      const env = await rowById(q, table, app, envId);
      if (env && getKind(env.type) === 'dmsenv') {
        const envData = parse(env.data) || {};
        const sharedWith = patterns
          .filter(p => String((parse(p.data) || {}).dmsEnvId) === String(env.id))
          .map(p => ({ id: +p.id, type: p.type, name: nameOf(p) }));
        const action = envData.pgEnv ? 'keep' : sharedWith.length ? 'keep' : 'delete';
        dmsEnv = { id: +env.id, type: env.type, name: envData.name || getInstance(env.type), pgEnv: envData.pgEnv || null,
          action, reason: envData.pgEnv ? 'pgEnv' : sharedWith.length ? 'shared' : null, sharedWith };
      }
    }
    return { instance, sameName, dmsEnv };
  }

  /** An unshared dmsEnv's contents: its internal sources and their views, split tables and files. */
  async function envContents(q, table, app, env) {
    const instance = getInstance(env.type);
    const sources = instance ? await q.promise(
      `SELECT id, app, type, data FROM ${table} WHERE app = $1 AND type LIKE $2 ESCAPE '\\';`,
      [app, `${escapeLike(instance)}|%:source`]) : [];
    const views = [];
    for (const s of sources) {
      const si = getInstance(s.type);
      if (!si) continue;
      for (const v of await q.promise(`SELECT id, app, type, data FROM ${table} WHERE app = $1 AND type LIKE $2 ESCAPE '\\';`,
        [app, `${escapeLike(si)}|%:view`])) views.push({ ...v, sourceId: s.id, sourceInstance: si });
    }
    const tables = [];
    for (const v of views) {
      const resolved = resolveTable(app, `${v.sourceInstance}|${v.id}:data`, dbType, splitMode, v.sourceId);
      if (!resolved.table.startsWith('data_items__')) continue;
      const [exists] = dbType === 'postgres'
        ? await q.promise(`SELECT 1 AS ok WHERE to_regclass($1) IS NOT NULL;`, [resolved.fullName])
        : await q.promise(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = $1;`, [resolved.table]);
      if (exists) tables.push(resolved.fullName);
    }
    const files = views.filter(v => { const d = parse(v.data) || {}; return d.file && d.file.dl_url; }).length;
    return { sources, views, tables, files };
  }

  async function planPatternDelete(app, patternId) {
    const table = await mainTable(app);
    const pattern = await rowById(dms_db, table, app, patternId);
    if (!pattern || getKind(pattern.type) !== 'pattern') throw refuse(404, `no pattern ${patternId} in ${app}`);
    const { instance, sameName, dmsEnv } = await patternDecisions(dms_db, table, app, pattern);
    const owned = instance ? await ownedRows(dms_db, table, app, instance) : [];
    const byKind = {};
    for (const r of owned) { const k = getKind(r.type) || r.type; byKind[k] = (byKind[k] || 0) + 1; }
    let env = dmsEnv;
    if (dmsEnv && dmsEnv.action === 'delete') {
      const c = await envContents(dms_db, table, app, { id: dmsEnv.id, type: dmsEnv.type });
      const envSites = await sitesListing(dms_db, table, app, 'dms_envs', dmsEnv.id);
      env = { ...dmsEnv, sources: c.sources.map(s => ({ id: +s.id, name: nameOf(s) })), views: c.views.length, tables: c.tables.length, files: c.files,
        sites: envSites.map(s => ({ id: s.id, type: s.type })) };
    }
    const sites = await sitesListing(dms_db, table, app, 'patterns', pattern.id);
    const blocked = sameName.length
      ? [{ reason: `another pattern is also named "${instance}", so the pages under that name can't be told apart`, patterns: sameName }]
      : [];
    return {
      pattern: { id: +pattern.id, type: pattern.type, name: nameOf(pattern), instance, pattern_type: (parse(pattern.data) || {}).pattern_type || null },
      rows: { total: owned.length, byKind },
      dmsEnv: env,
      sites: sites.map(s => ({ id: s.id, type: s.type })),
      blocked,
      // what the delete must still find inside its transaction; it refuses when this changed
      expect: { dmsEnv: dmsEnv ? dmsEnv.action : null },
    };
  }

  /**
   * `expect` is the plan's `expect`. The caller has judged (authorized) the plan's writes already.
   * Returns `{ deleted: { rows, pattern, dmsEnv, sources, views, tables }, backup }`.
   */
  async function deletePattern(app, patternId, { expect = {}, userId = null, reqMeta = null } = {}) {
    const plan = await planPatternDelete(app, patternId);
    if (plan.blocked.length) throw refuse(409, `Can't delete: ${plan.blocked[0].reason}`, { plan });
    const want = expect && Object.prototype.hasOwnProperty.call(expect, 'dmsEnv') ? expect.dmsEnv : undefined;
    if (want !== undefined && want !== plan.expect.dmsEnv) {
      throw refuse(409, 'What this delete would do changed since it was shown (the dmsEnv is now '
        + `${plan.expect.dmsEnv === 'keep' ? 'used by another pattern' : plan.expect.dmsEnv || 'gone'}). Look again before deleting.`, { plan });
    }
    const table = await mainTable(app);

    // backup: every main-table row the delete removes, and the split tables of an env that goes
    const pattern = await rowById(dms_db, table, app, patternId);
    const ownedIds = (await ownedRows(dms_db, table, app, plan.pattern.instance)).map(r => r.id);
    const backupRows = [pattern];
    for (let i = 0; i < ownedIds.length; i += 500) {
      const chunk = ownedIds.slice(i, i + 500);
      backupRows.push(...await dms_db.promise(
        `SELECT * FROM ${table} WHERE app = $1 AND id IN (${chunk.map((_, j) => `$${j + 2}`).join(',')});`, [app, ...chunk]));
    }
    const splitTables = {};
    if (plan.dmsEnv && plan.dmsEnv.action === 'delete') {
      const env = await rowById(dms_db, table, app, plan.dmsEnv.id);
      const c = await envContents(dms_db, table, app, env);
      backupRows.push(env, ...c.sources, ...c.views);
      for (const t of c.tables) splitTables[t] = await dms_db.promise(`SELECT * FROM ${t};`);
    }
    const backup = writeBackup(`${app}-pattern-${patternId}`, { app, kind: 'pattern', at: new Date().toISOString(), plan, rows: backupRows, splitTables });

    const deleted = { rows: 0, pattern: 0, dmsEnv: 0, sources: 0, views: plan.dmsEnv && plan.dmsEnv.views || 0, tables: plan.dmsEnv && plan.dmsEnv.tables || 0 };
    await dms_db.withTransaction(async (tx) => {
      const p = await rowById(tx, table, app, patternId);
      if (!p) throw refuse(409, 'The pattern is already gone');
      const now = await patternDecisions(tx, table, app, p);
      if (now.sameName.length) throw refuse(409, `Can't delete: another pattern is now also named "${now.instance}"`);
      if ((now.dmsEnv ? now.dmsEnv.action : null) !== plan.expect.dmsEnv) {
        throw refuse(409, 'The dmsEnv changed while deleting (another pattern started using it). Nothing was deleted.');
      }

      const owned = await ownedRows(tx, table, app, now.instance);
      for (let i = 0; i < owned.length; i += 500) {
        const chunk = owned.slice(i, i + 500);
        await tx.promise(`DELETE FROM ${table} WHERE app = $1 AND id IN (${chunk.map((_, j) => `$${j + 2}`).join(',')});`,
          [app, ...chunk.map(r => r.id)]);
        for (const r of chunk) await appendChangeLog(tx, r.id, app, r.type, 'D', null, userId, reqMeta);
      }
      deleted.rows = owned.length;

      await tx.promise(`DELETE FROM ${table} WHERE app = $1 AND id = $2;`, [app, p.id]);
      await appendChangeLog(tx, p.id, app, p.type, 'D', null, userId, reqMeta);
      deleted.pattern = 1;

      if (now.dmsEnv && now.dmsEnv.action === 'delete') {
        const env = await rowById(tx, table, app, now.dmsEnv.id);
        const c = await envContents(tx, table, app, env);
        for (const s of c.sources) {
          await tx.promise(`DELETE FROM ${table} WHERE app = $1 AND id = $2;`, [app, s.id]);
          await appendChangeLog(tx, s.id, app, s.type, 'D', null, userId, reqMeta);
          // views, their split tables and stored files, refs, tasks (with change_log)
          await cascadeSourceDelete(tx, { ...s, app }, userId, reqMeta);
        }
        deleted.sources = c.sources.length;
        await tx.promise(`DELETE FROM ${table} WHERE app = $1 AND id = $2;`, [app, env.id]);
        await appendChangeLog(tx, env.id, app, env.type, 'D', null, userId, reqMeta);
        await removeIdFromRefArrays(tx, app, 'dms_envs', ['site'], env.id, userId, reqMeta);
        deleted.dmsEnv = 1;
      }
      await removeIdFromRefArrays(tx, app, 'patterns', ['site'], p.id, userId, reqMeta);
    });
    afterDelete();
    return { deleted, backup };
  }

  async function themeUsers(q, table, app, name) {
    return (await rowsOfKind(q, table, app, 'pattern')).filter(p => {
      const t = parse((parse(p.data) || {}).theme) || {};
      return t.selectedTheme === name || (t.settings && t.settings.theme && t.settings.theme.theme === name);
    }).map(p => ({ id: +p.id, type: p.type, name: nameOf(p) }));
  }

  async function planThemeDelete(app, themeId) {
    const table = await mainTable(app);
    const theme = await rowById(dms_db, table, app, themeId);
    if (!theme || getKind(theme.type) !== 'theme') throw refuse(404, `no theme ${themeId} in ${app}`);
    const name = (parse(theme.data) || {}).name || getInstance(theme.type);
    const usedBy = await themeUsers(dms_db, table, app, name);
    const sites = await sitesListing(dms_db, table, app, 'theme_refs', theme.id);
    return {
      theme: { id: +theme.id, type: theme.type, name },
      usedBy,
      sites: sites.map(s => ({ id: s.id, type: s.type })),
      blocked: usedBy.length ? [{ reason: `patterns still use the theme "${name}"`, patterns: usedBy }] : [],
    };
  }

  async function deleteTheme(app, themeId, { userId = null, reqMeta = null } = {}) {
    const plan = await planThemeDelete(app, themeId);
    if (plan.blocked.length) throw refuse(409, `Can't delete: ${plan.usedBy.map(p => p.name).join(', ')} still use this theme`, { plan });
    const table = await mainTable(app);
    const theme = await rowById(dms_db, table, app, themeId);
    const backup = writeBackup(`${app}-theme-${themeId}`, { app, kind: 'theme', at: new Date().toISOString(), plan, rows: [theme] });
    await dms_db.withTransaction(async (tx) => {
      const t = await rowById(tx, table, app, themeId);
      if (!t) throw refuse(409, 'The theme is already gone');
      const usedBy = await themeUsers(tx, table, app, plan.theme.name);
      if (usedBy.length) throw refuse(409, `Can't delete: ${usedBy.map(p => p.name).join(', ')} started using this theme`);
      await tx.promise(`DELETE FROM ${table} WHERE app = $1 AND id = $2;`, [app, t.id]);
      await appendChangeLog(tx, t.id, app, t.type, 'D', null, userId, reqMeta);
      await removeIdFromRefArrays(tx, app, 'theme_refs', ['site'], t.id, userId, reqMeta);
    });
    afterDelete();
    return { deleted: { theme: 1 }, backup };
  }

  return { planPatternDelete, deletePattern, planThemeDelete, deleteTheme, rowById: (app, id) => mainTable(app).then(t => rowById(dms_db, t, app, id)) };
}

module.exports = { createOwnerDelete, backupRoot, CONTAINER_KINDS };
