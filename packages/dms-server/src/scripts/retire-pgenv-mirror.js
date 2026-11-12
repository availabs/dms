#!/usr/bin/env node
'use strict';
/**
 * RETIRE THE PGENV MIRROR — delete one app's mirror rows of its pgEnvs.
 *
 *     node retire-pgenv-mirror.js --db <dms config> --app <app> [--pg-env <name>]…        dry run
 *     node retire-pgenv-mirror.js --db <dms config> --app <app> --apply [--grants mirror|pgenv]
 *
 * Task: planning/tasks/current/pgenv-auth-without-mirror-rows.md (Phase 1).
 *
 * From 2026-11-05 to 2026-11-12 every source and view of a pgEnv was mirrored as a DMS row of each site
 * that used it (`dama/mirror.js`, now deleted). The auth layer reads the pgEnv itself again
 * (`routes/auth/owners.js`, `dama/pgEnv.js`), so those rows are residue. For each pgEnv (the ones
 * named, else every pgEnv the app has an env row or a mirror row for) this:
 *
 *   1. REPORTS THE GRANTS THAT DIFFER. While the mirror was read, a source's grants were edited on the
 *      mirror row and the pgEnv's `auth_permissions` column was left alone. The column is the record
 *      again, so a mirror row whose grants differ from the column holds something the column lacks —
 *      or the column was written since (an older server, a plugin, direct SQL) and the mirror is stale.
 *      The script cannot tell which, so `--apply` REFUSES while any differ until told:
 *          --grants mirror   write the mirror's grants to the column (they were what auth read)
 *          --grants pgenv    keep the column, drop the mirror's
 *      With `--grants mirror`, a source another app's mirror ALSO holds different grants for stops the
 *      run: two sites disagree, and one set of grants per pgEnv cannot hold both. The owner picks.
 *   2. DROPS THE APP FROM `settings.mirror_apps` of the pgEnv — first, so a server still running the
 *      mirror hooks stops re-creating rows.
 *   3. DELETES THE MIRROR ROWS: every `:source` / `:view` row of the app carrying `data.pgEnv` and the
 *      pgEnv's own id (`source_id` / `view_id`). By id, in one transaction, with a `D` change_log entry
 *      each. NOT through the controller's delete: its cascade finds a source's views by slug, and a
 *      mirror that shares a slug with an internal source would take that source's views and their
 *      data tables with it.
 *
 * The app's `:dmsenv` row for the pgEnv is kept: it holds the site's env-level grants.
 *
 * Idempotent: a second run finds nothing. Exit 0 done / nothing to do, 2 refused (grants differ and
 * no `--grants`, or two apps disagree), 1 error.
 */
const { jsonExtract } = require('../db/query-utils');
const { resolveTable } = require('../db/table-resolver');
const { sourcesTable } = require('../dama/pgEnv');

const CHUNK = 1000;
const parse = (v) => { if (v == null) return null; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } };
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const canonical = (v) => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
};
/** Grants as compared: an object, with an empty `groups` / `users` the same as an absent one. */
function normalGrants(v) {
  const g = parse(v);
  if (!isObj(g)) return {};
  const out = { ...g };
  for (const k of ['groups', 'users']) if (isObj(out[k]) && !Object.keys(out[k]).length) delete out[k];
  return out;
}
const sameGrants = (a, b) => canonical(normalGrants(a)) === canonical(normalGrants(b));
const chunks = (list) => { const out = []; for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK)); return out; };
const inList = (ids, from = 1) => ids.map((_, i) => `$${i + from}`).join(', ');

/** Does the app's main table exist? An app named in `mirror_apps` may never have had one. */
async function tableExists(dms, splitMode, app) {
  const { schema, table } = resolveTable(app, '', dms.type, splitMode);
  const { rows } = dms.type === 'postgres'
    ? await dms.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`, [schema || 'public', table])
    : await dms.query(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = $1`, [table]);
  return rows.length > 0;
}

/** An app's rows that carry `data.pgEnv`: `{ envs, sources, views }`, each parsed. Empty for an app with no table. */
async function mirrorRowsOf(dms, splitMode, app, pgEnv) {
  const tbl = resolveTable(app, '', dms.type, splitMode).fullName;
  const rows = !(await tableExists(dms, splitMode, app)) ? [] : (await dms.query(
    `SELECT id, type, data FROM ${tbl} WHERE app = $1 AND (type LIKE '%:source' OR type LIKE '%:view' OR type LIKE '%:dmsenv')
       AND ${jsonExtract('data', 'pgEnv', dms.type)} = $2`, [app, pgEnv])).rows;
  const out = { tbl, envs: [], sources: [], views: [] };
  for (const r of rows) {
    const row = { id: r.id, type: r.type, data: parse(r.data) || {} };
    if (r.type.endsWith(':dmsenv')) out.envs.push(row);
    else if (r.type.endsWith(':source') && row.data.source_id != null) out.sources.push(row);
    else if (r.type.endsWith(':view') && row.data.view_id != null) out.views.push(row);
  }
  return out;
}

/** The pgEnvs `app` has an env row or a mirror row for. */
async function pgEnvsOf(dms, splitMode, app) {
  const tbl = resolveTable(app, '', dms.type, splitMode).fullName;
  const col = jsonExtract('data', 'pgEnv', dms.type);
  if (!(await tableExists(dms, splitMode, app))) return [];
  const { rows } = await dms.query(
    `SELECT DISTINCT ${col} AS pgenv FROM ${tbl} WHERE app = $1 AND (type LIKE '%:source' OR type LIKE '%:view' OR type LIKE '%:dmsenv') AND ${col} IS NOT NULL`, [app]);
  return rows.map(r => r.pgenv).filter(Boolean);
}

/**
 * Retire `app`'s mirror of one pgEnv. `dms` / `dama` are adapters; `settings` is `{ get(), set(json) }`
 * over the pgEnv's settings row. Returns the report; writes only with `apply`.
 */
async function retireMirror({ dms, dama, splitMode, app, pgEnv, settings, apply = false, grants = null, log = () => {} }) {
  const mine = await mirrorRowsOf(dms, splitMode, app, pgEnv);
  const out = {
    app, pgEnv, envRows: mine.envs.length, sources: mine.sources.length, views: mine.views.length,
    differing: [], conflicts: [], copied: 0, deleted: 0, unregistered: false, refused: null,
  };

  // 1. grants: the mirror's against the column
  const { rows: cols } = await dama.query(`SELECT source_id, auth_permissions FROM ${sourcesTable(dama)}`);
  const column = new Map(cols.map(r => [+r.source_id, r.auth_permissions]));
  for (const r of mine.sources) {
    const id = +r.data.source_id;
    if (!column.has(id)) continue;                       // gone from the pgEnv: nothing to keep grants for
    if (!sameGrants(r.data.auth_permissions, column.get(id))) {
      out.differing.push({ source_id: id, row: r.id, mirror: normalGrants(r.data.auth_permissions), pgenv: normalGrants(column.get(id)) });
    }
  }
  const stored = parse(await settings.get()) || {};
  const apps = Array.isArray(stored.mirror_apps) ? stored.mirror_apps : [];
  if (out.differing.length) {
    const want = new Map(out.differing.map(d => [d.source_id, d]));
    for (const other of apps.filter(a => a !== app)) {
      for (const r of (await mirrorRowsOf(dms, splitMode, other, pgEnv)).sources) {
        const d = want.get(+r.data.source_id);
        if (d && !sameGrants(r.data.auth_permissions, d.mirror)) out.conflicts.push({ source_id: d.source_id, app: other, theirs: normalGrants(r.data.auth_permissions), mine: d.mirror });
      }
    }
  }
  for (const d of out.differing) log(`  ≠ source ${d.source_id} (row #${d.row})\n      mirror: ${JSON.stringify(d.mirror)}\n      pgEnv:  ${JSON.stringify(d.pgenv)}`);
  for (const c of out.conflicts) log(`  ✗ source ${c.source_id}: ${c.app}'s mirror differs too\n      ${app}: ${JSON.stringify(c.mine)}\n      ${c.app}: ${JSON.stringify(c.theirs)}`);

  if (!apply) return out;
  if (out.differing.length && !grants) { out.refused = 'grants differ: pass --grants mirror or --grants pgenv'; return out; }
  if (grants === 'mirror' && out.conflicts.length) { out.refused = 'two apps hold different grants for the same source'; return out; }

  if (grants === 'mirror') {
    for (const d of out.differing) {
      await dama.query(`UPDATE ${sourcesTable(dama)} SET auth_permissions = $1 WHERE source_id = $2`, [JSON.stringify(d.mirror), d.source_id]);
      out.copied++;
    }
  }

  // 2. stop the hooks of any server still running them
  if (apps.includes(app)) {
    await settings.set(JSON.stringify({ ...stored, mirror_apps: apps.filter(a => a !== app) }));
    out.unregistered = true;
  }

  // 3. the rows, by id
  const ids = [...mine.views, ...mine.sources].map(r => r.id);
  if (ids.length) {
    const log_tbl = dms.type === 'postgres' ? 'dms.change_log' : 'change_log';
    await dms.withTransaction(async (tx) => {
      for (const part of chunks(ids)) {
        await tx.query(`INSERT INTO ${log_tbl} (item_id, app, type, action) SELECT id, app, type, 'D' FROM ${mine.tbl} WHERE id IN (${inList(part)})`, part);
        const r = await tx.query(`DELETE FROM ${mine.tbl} WHERE id IN (${inList(part)})`, part);
        out.deleted += r.rowCount ?? part.length;
      }
    });
  }
  const left = await mirrorRowsOf(dms, splitMode, app, pgEnv);
  out.left = left.sources.length + left.views.length;
  return out;
}

function parseArgs(argv) {
  const o = { apply: false, pgEnvs: [], grants: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--db') o.db = argv[++i];
    else if (argv[i] === '--app') o.app = argv[++i];
    else if (argv[i] === '--pg-env') o.pgEnvs.push(argv[++i]);
    else if (argv[i] === '--grants') o.grants = argv[++i];
    else if (argv[i] === '--apply') o.apply = true;
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(1); }
  }
  if (!o.db || !o.app) { console.error('--db and --app are required'); process.exit(1); }
  if (o.grants && !['mirror', 'pgenv'].includes(o.grants)) { console.error('--grants takes mirror or pgenv'); process.exit(1); }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  process.env.DMS_DB_ENV = o.db;
  const { getDb, awaitReady, loadConfig } = require('../db');
  const { getSettings, setSettings } = require('../routes/uda/uda.tasks.controller');
  const dms = getDb(o.db); await awaitReady();
  const splitMode = loadConfig(o.db).splitMode;
  const pgEnvs = o.pgEnvs.length ? o.pgEnvs : await pgEnvsOf(dms, splitMode, o.app);

  console.log(`\nretire the pgEnv mirror — ${o.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`  db=${o.db}  app=${o.app}  pgEnvs=${pgEnvs.join(', ') || '(none)'}`);
  let refused = false;
  for (const pgEnv of pgEnvs) {
    console.log(`\n== ${pgEnv}`);
    const dama = getDb(pgEnv); await awaitReady();
    const r = await retireMirror({
      dms, dama, splitMode, app: o.app, pgEnv, apply: o.apply, grants: o.grants, log: (l) => console.log(l),
      settings: { get: () => getSettings(pgEnv), set: (v) => setSettings(pgEnv, v) },
    });
    console.log(`  env row: ${r.envRows ? 'kept' : 'none'}   mirror rows: ${r.sources} sources, ${r.views} views`);
    console.log(`  grants that differ from the pgEnv's column: ${r.differing.length}${r.conflicts.length ? `   (another app differs too: ${r.conflicts.length})` : ''}`);
    if (r.refused) { refused = true; console.log(`  ✗ REFUSED, nothing written: ${r.refused}`); continue; }
    if (o.apply) console.log(`  grants copied to the pgEnv: ${r.copied}   removed from mirror_apps: ${r.unregistered ? 'yes' : 'was not listed'}   rows deleted: ${r.deleted}   left: ${r.left}`);
  }
  if (!o.apply) console.log('\nDRY RUN — nothing was written. Re-run with --apply.');
  process.exit(refused ? 2 : 0);
}

module.exports = { retireMirror, mirrorRowsOf, normalGrants, sameGrants };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
