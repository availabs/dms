/**
 * Retiring DaMa views and sources (dama-parent-child-etl-support.md, G5).
 *
 * Deleting a source used to leave its tables behind (1,347 GB on hazmit_dama belongs to source
 * ids that no longer exist), and nothing could delete one view. Both now go through one plan:
 *
 *   1. Expand the set: a run view's outputs (views whose `metadata.produced_by.view_id` names it)
 *      join it only with `cascade`; without it, deleting a run view that produced views is refused.
 *   2. Refuse when a view OUTSIDE the set lists a member in its `view_dependencies` (deleting an
 *      input would break that view's lineage), or when a member is its source's authoritative view
 *      (clear it first). The authority check is skipped for a source being deleted whole.
 *   3. Drop each member's table by what it is (`pg_class.relkind`: table, view, materialized view,
 *      foreign table), never with CASCADE, so a Postgres object that still depends on it stops the
 *      delete instead of disappearing with it. A table another surviving view also names is kept.
 *   4. On Postgres the drops and the row deletes run in one transaction. ClickHouse tables and
 *      storage files can't roll back, so they go after the commit and failures become warnings.
 *
 * Owner decision 2026-10-02: there is one Delete, and it drops tables. The recoverable path is the
 * Archive lifecycle category, which deletes nothing.
 */

const { getDb, getChDb } = require('../db');
const { parseDependencies, outputsOf } = require('./lineage');
const { readAuthority } = require('../routes/uda/authority');

const viewsTable = (db) => (db.type === 'postgres' ? 'data_manager.views' : 'views');
const sourcesTable = (db) => (db.type === 'postgres' ? 'data_manager.sources' : 'sources');
const tasksTable = (db) => (db.type === 'postgres' ? 'data_manager.tasks' : 'tasks');
const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;
const chIdent = (name) => `\`${String(name).replace(/`/g, '``')}\``;

const toIds = (ids) => [...new Set((ids || []).map(Number).filter(n => Number.isInteger(n) && n > 0))];

class DeleteRefused extends Error {
  constructor(message, details) {
    super(message);
    this.code = 'DELETE_REFUSED';
    this.details = details;
  }
}

const parseJson = (value) => {
  if (value == null || typeof value !== 'string') return value ?? null;
  try { return JSON.parse(value); } catch { return null; }
};

const isClickHouse = (row) => typeof row.table_schema === 'string' && row.table_schema.startsWith('clickhouse.');

/**
 * Work out what deleting `viewIds` means, or throw DeleteRefused. Read-only.
 * `wholeSourceIds`: sources being deleted outright (their views are already in `viewIds`).
 */
async function planDelete(db, viewIds, { cascade = false, wholeSourceIds = [] } = {}) {
  const members = new Set(toIds(viewIds));
  const viaCascade = [];

  // 1. Outputs of run views, transitively.
  let frontier = [...members];
  while (frontier.length) {
    const produced = (await outputsOf(db, frontier)).filter(o => !members.has(o.view_id));
    if (!produced.length) break;
    if (!cascade) {
      const byRun = {};
      for (const o of produced) (byRun[o.run_view_id] ??= []).push(o.view_id);
      const lines = Object.entries(byRun).map(([run, ids]) => `#${run} produced ${ids.length} view(s): ${ids.slice(0, 10).map(i => `#${i}`).join(', ')}${ids.length > 10 ? ', …' : ''}`);
      throw new DeleteRefused(
        `Run view ${lines.join('; ')}. Delete those first, or delete with cascade.`,
        { reason: 'has_outputs', outputs: produced.map(o => ({ run_view_id: o.run_view_id, view_id: o.view_id, source_id: o.source_id })) });
    }
    for (const o of produced) { members.add(o.view_id); viaCascade.push(o.view_id); }
    frontier = produced.map(o => o.view_id);
  }

  const ids = [...members];
  if (!ids.length) return { rows: [], viaCascade, sharedTables: new Set() };

  const { rows } = await db.query(`
    SELECT view_id, source_id, table_schema, table_name, metadata
    FROM ${viewsTable(db)} WHERE view_id = ANY($1)`, [ids]);
  const missing = ids.filter(id => !rows.some(r => +r.view_id === id));
  if (missing.length) throw new Error(`View(s) ${missing.join(', ')} do not exist`);

  // 2a. Views outside the set that were built from a member.
  const depRows = db.type === 'postgres'
    ? (await db.query(`SELECT view_id, source_id, view_dependencies FROM data_manager.views
                       WHERE view_dependencies && $1::int[] AND NOT (view_id = ANY($1))`, [ids])).rows
    : (await db.query(`SELECT view_id, source_id, view_dependencies FROM views
                       WHERE view_dependencies IS NOT NULL`)).rows.filter(r => !members.has(+r.view_id));
  const dependents = depRows
    .map(r => ({ view_id: +r.view_id, source_id: +r.source_id, inputs: parseDependencies(r.view_dependencies).filter(id => members.has(id)) }))
    .filter(d => d.inputs.length);
  if (dependents.length) {
    const lines = dependents.slice(0, 10).map(d => `#${d.view_id} (source ${d.source_id}) is built from #${d.inputs.join(', #')}`);
    throw new DeleteRefused(
      `Other views were built from ${dependents.length === 1 ? 'this view' : 'these views'}: ${lines.join('; ')}${dependents.length > 10 ? '; …' : ''}. Delete them first.`,
      { reason: 'has_dependents', dependents });
  }

  // 2b. Authoritative views (skipped for a source deleted whole: its authority goes with it).
  const whole = new Set(toIds(wholeSourceIds));
  const sourceIds = [...new Set(rows.map(r => +r.source_id))].filter(id => !whole.has(id));
  if (sourceIds.length) {
    const { rows: srcRows } = await db.query(
      `SELECT source_id, metadata FROM ${sourcesTable(db)} WHERE source_id = ANY($1)`, [sourceIds]);
    const marked = [];
    for (const s of srcRows) {
      const authority = readAuthority(parseJson(s.metadata));
      for (const entry of authority?.views || []) {
        if (members.has(+entry.view_id)) marked.push({ view_id: +entry.view_id, source_id: +s.source_id, key: entry.key || null });
      }
    }
    if (marked.length) {
      throw new DeleteRefused(
        `${marked.map(m => `#${m.view_id}`).join(', ')} ${marked.length === 1 ? 'is' : 'are'} marked authoritative on ${marked.length === 1 ? 'its source' : 'their sources'}. Clear the authoritative view first.`,
        { reason: 'authoritative', marked });
    }
  }

  // 3. Tables another surviving view still names stay.
  const named = rows.filter(r => r.table_name);
  const sharedTables = new Set();
  if (named.length) {
    const { rows: others } = await db.query(`
      SELECT view_id, table_schema, table_name FROM ${viewsTable(db)}
      WHERE table_name = ANY($1) AND NOT (view_id = ANY($2))`, [[...new Set(named.map(r => r.table_name))], ids]);
    for (const o of others) sharedTables.add(`${o.table_schema || ''}.${o.table_name}`);
  }

  return { rows, viaCascade, sharedTables };
}

// The DROP statement for a Postgres relation, by kind; null when it doesn't exist.
async function pgDropStatement(tx, schema, table) {
  const { rows } = await tx.query(`
    SELECT c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = $1 AND c.relname = $2`, [schema || 'public', table]);
  const kind = rows[0]?.relkind;
  const target = `${quoteIdent(schema || 'public')}.${quoteIdent(table)}`;
  if (kind === 'r' || kind === 'p') return { kind: 'table', sql: `DROP TABLE ${target}` };
  if (kind === 'v') return { kind: 'view', sql: `DROP VIEW ${target}` };
  if (kind === 'm') return { kind: 'materialized view', sql: `DROP MATERIALIZED VIEW ${target}` };
  if (kind === 'f') return { kind: 'foreign table', sql: `DROP FOREIGN TABLE ${target}` };
  return null;
}

async function sqliteDropStatement(tx, table) {
  const { rows } = await tx.query(`SELECT type FROM sqlite_master WHERE name = $1 AND type IN ('table', 'view')`, [table]);
  if (!rows.length) return null;
  return { kind: rows[0].type, sql: `DROP ${rows[0].type === 'view' ? 'VIEW' : 'TABLE'} ${quoteIdent(table)}` };
}

// Download files recorded on a view (`metadata.download = {fileType: url}`); local urls are `/files/{rel}`.
function downloadPaths(row) {
  const download = parseJson(row.metadata)?.download || {};
  return Object.values(download)
    .map(url => (typeof url === 'string' ? url.replace(/^\/files\//, '') : null))
    .filter(Boolean);
}

/**
 * Run a plan: drop the tables and delete the rows (one transaction), then ClickHouse and storage.
 * `inTx(tx)` adds statements to the same transaction (deleting a source's tasks and row).
 */
async function executeDelete(pgEnv, db, plan, { drop = true, inTx, storagePaths = [] } = {}) {
  const dropped_tables = [];
  const kept_tables = [];
  const warnings = [];
  const removed_files = [];
  const ids = plan.rows.map(r => +r.view_id);

  const extra = await db.withTransaction(async (tx) => {
    if (drop) {
      for (const r of plan.rows) {
        if (!r.table_name || isClickHouse(r)) continue;
        const fq = `${r.table_schema || ''}.${r.table_name}`;
        if (plan.sharedTables.has(fq)) { kept_tables.push({ view_id: +r.view_id, table: fq, reason: 'another view names this table' }); continue; }
        const stmt = tx.type === 'postgres'
          ? await pgDropStatement(tx, r.table_schema, r.table_name)
          : await sqliteDropStatement(tx, r.table_name);
        if (!stmt) { warnings.push(`view ${r.view_id}: table ${fq} was already gone`); continue; }
        await tx.query(stmt.sql);
        dropped_tables.push(fq);
      }
    }
    if (ids.length) await tx.query(`DELETE FROM ${viewsTable(tx)} WHERE view_id = ANY($1)`, [ids]);
    return inTx ? inTx(tx) : null;
  });

  if (drop) {
    for (const r of plan.rows.filter(isClickHouse)) {
      const fq = `${r.table_schema}.${r.table_name}`;
      if (plan.sharedTables.has(fq)) { kept_tables.push({ view_id: +r.view_id, table: fq, reason: 'another view names this table' }); continue; }
      try {
        const database = r.table_schema.replace(/^clickhouse\./, '');
        await getChDb(pgEnv).exec({ query: `DROP TABLE IF EXISTS ${chIdent(database)}.${chIdent(r.table_name)}` });
        dropped_tables.push(fq);
      } catch (err) {
        warnings.push(`failed to drop ClickHouse table ${fq}: ${err.message}`);
      }
    }
  }

  const paths = [...plan.rows.flatMap(downloadPaths), ...storagePaths];
  if (paths.length) {
    let storage = null;
    try { storage = require('./storage'); } catch (err) { warnings.push(`storage module unavailable: ${err.message}`); }
    for (const rel of storage ? paths : []) {
      try { await storage.remove(rel); removed_files.push(rel); }
      catch (err) { warnings.push(`failed to remove file ${rel}: ${err.message}`); }
    }
  }

  const source_ids = [...new Set(plan.rows.map(r => +r.source_id))];
  return { deleted_views: ids, cascaded_views: plan.viaCascade, source_ids, dropped_tables, kept_tables, removed_files, warnings, extra };
}

/**
 * Delete views (and, with `drop`, their tables). See the module comment for what is refused.
 * @param {string} pgEnv
 * @param {number|number[]} viewIds
 * @param {Object} [opts] - { drop = true, cascade = false, db, authorize }
 *   `authorize(sourceIds)`: called with every source the plan touches (a cascade can reach other
 *   sources) before anything is deleted; throw to refuse.
 * @returns {Object} { deleted_views, cascaded_views, source_ids, dropped_tables, kept_tables, removed_files, warnings }
 */
async function deleteDamaView(pgEnv, viewIds, { drop = true, cascade = false, db = getDb(pgEnv), authorize } = {}) {
  const ids = toIds(Array.isArray(viewIds) ? viewIds : [viewIds]);
  if (!ids.length) throw new Error('deleteDamaView: a view id is required');
  const plan = await planDelete(db, ids, { cascade });
  if (authorize) await authorize([...new Set(plan.rows.map(r => +r.source_id))]);
  const { extra, ...result } = await executeDelete(pgEnv, db, plan, { drop });
  return result;
}

/**
 * Delete a source: every view and its table, its tasks, its stored files, and the source row.
 * Refused while a view outside it was built from one of its views, or while its run views have
 * produced views in other sources (unless `cascade`, which deletes those too).
 */
async function deleteDamaSource(pgEnv, sourceId, { cascade = false, db = getDb(pgEnv), authorize } = {}) {
  const id = Number(sourceId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('deleteDamaSource: a source id is required');
  const { rows: viewRows } = await db.query(`SELECT view_id FROM ${viewsTable(db)} WHERE source_id = $1`, [id]);
  const plan = await planDelete(db, viewRows.map(r => r.view_id), { cascade, wholeSourceIds: [id] });
  if (authorize) await authorize([...new Set([id, ...plan.rows.map(r => +r.source_id)])]);

  const { extra, ...result } = await executeDelete(pgEnv, db, plan, {
    drop: true,
    storagePaths: [`${pgEnv}/s_${id}`], // the create-download worker's per-source folder
    inTx: async (tx) => {
      const { rowCount: deletedTasks } = await tx.query(`DELETE FROM ${tasksTable(tx)} WHERE source_id = $1`, [id]);
      const { rowCount: deletedSource } = await tx.query(`DELETE FROM ${sourcesTable(tx)} WHERE source_id = $1`, [id]);
      return { deletedTasks, deletedSource };
    },
  });
  return { source_id: id, deleted_source: extra.deletedSource > 0, deleted_tasks: extra.deletedTasks, ...result };
}

module.exports = { deleteDamaView, deleteDamaSource, planDelete, DeleteRefused };
