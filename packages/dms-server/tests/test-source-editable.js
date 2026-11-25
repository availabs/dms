/**
 * One Editable flag on every source, internal and external
 * (planning/tasks/current/source-editable-flag-everywhere.md).
 *
 *   1. A new internal source is created with data.metadata.isEditable = true; a creator's own value is kept.
 *   2. With Editable off, the server refuses to create, edit, mass-edit, delete or clear the dataset's rows, and
 *      takes them again once it is back on. A source with no value (an older row) stays editable.
 *   3. A new external source is created with metadata.isEditable = false; a creator's own value is kept.
 *   4. scripts/backfill-source-editable.js: internal blanks become true, external blanks false, a source
 *      with no metadata or an odd value is left alone, and a second run writes nothing.
 *
 * SQLite only by default (DMS_TEST_DB / DAMA_TEST_DB choose others).
 */
const { createTestGraph } = require('./graph');
const { getDb, awaitReady, loadConfig } = require('../src/db');
const { resolveTable } = require('../src/db/table-resolver');
const { createDamaSource } = require('../src/dama/upload/metadata');
const { bucketOf, auditDama, backfillDama, auditDms, backfillDms } = require('../src/scripts/backfill-source-editable');
const { withSourceEditableDefault, refusesRowWrites } = require('../src/routes/dms/sourceEditable');

const DB_NAME = process.env.DMS_TEST_DB || 'dms-sqlite-test';
const DAMA_DB = process.env.DAMA_TEST_DB || 'dama-sqlite-test';
process.env.DMS_DB_ENV = DB_NAME;

const APP = 'editable-test-' + Date.now();
const ENV = 'datasets_env';
let passed = 0; let failed = 0;
const check = (cond, m, detail) => {
  if (cond) { passed++; console.log(`  ✓ ${m}`); }
  else { failed++; console.log(`  ✗ ${m}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ''}`); }
};
const obj = (v) => (typeof v === 'string' ? JSON.parse(v) : v) || {};

async function main() {
  const graph = createTestGraph(DB_NAME);
  const db = getDb(DB_NAME);
  await awaitReady();
  const splitMode = loadConfig(DB_NAME).splitMode;
  const t = resolveTable(APP, '', db.type, splitMode);
  const T = db.type === 'postgres' ? `"${t.schema}"."${t.table}"` : `"${t.table}"`;

  const create = async (type, data) => {
    const r = await graph.callAsync(['dms', 'data', 'create'], [APP, type, data]);
    return +Object.keys(r.jsonGraph?.dms?.data?.[APP]?.byId || r.jsonGraph?.dms?.data?.byId || {}).find(k => k !== '$__path');
  };
  const stored = async (id) => obj((await db.query(`SELECT data FROM ${T} WHERE id = $1`, [id])).rows[0]?.data);
  const refused = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

  console.log(`\n=== Source Editable flag (${DB_NAME}, ${DAMA_DB}) ===\n`);

  // ── helpers ──
  check(obj(withSourceEditableDefault({ name: 'x' }, `${ENV}|x:source`)).metadata.isEditable === true, 'default: a source row gets isEditable true');
  check(withSourceEditableDefault({ name: 'x' }, 'docs|page').metadata === undefined, 'default: another row kind is untouched');
  check(obj(withSourceEditableDefault({ metadata: { isEditable: false, a: 1 } }, `${ENV}|x:source`)).metadata.isEditable === false, 'default: a stated false is kept');
  check(refusesRowWrites({ metadata: { isEditable: false } }) && !refusesRowWrites({ metadata: {} }) && !refusesRowWrites({}) && !refusesRowWrites(null), 'only an explicit false refuses row writes');
  check(bucketOf(null) === 'none' && bucketOf({}) === 'blank' && bucketOf('{"isEditable":true}') === 'true'
    && bucketOf({ isEditable: 'yes' }) === 'not_boolean' && bucketOf('[1]') === 'not_object', 'bucketOf');

  // ── 1. internal create default ──
  const srcId = await create(`${ENV}|roads:source`, { name: 'Roads', type: 'internal_table' });
  check((await stored(srcId)).metadata?.isEditable === true, 'a new internal source is editable', await stored(srcId));
  const lockedId = await create(`${ENV}|locked:source`, { name: 'Locked', type: 'internal_table', metadata: { isEditable: false, note: 'kept' } });
  check((await stored(lockedId)).metadata?.isEditable === false && (await stored(lockedId)).metadata?.note === 'kept', 'a creator\'s own value is kept');

  // ── 2. row writes follow the flag ──
  const DATA = 'roads|1:data';
  const rowId = await create(DATA, { name: 'Main St' });
  check(Number.isFinite(rowId), 'an editable dataset takes a new row');

  await graph.callAsync(['dms', 'data', 'edit'], [APP, srcId, { metadata: { ...(await stored(srcId)).metadata, isEditable: false } }]);
  check((await stored(srcId)).metadata?.isEditable === false, 'Editable switched off');
  for (const [what, fn] of [
    ['create', () => graph.callAsync(['dms', 'data', 'create'], [APP, DATA, { name: 'Elm St' }])],
    ['edit', () => graph.callAsync(['dms', 'data', 'edit'], [APP, rowId, { name: 'Changed' }, DATA])],
    ['mass edit', () => graph.callAsync(['dms', 'data', 'massedit'], [APP, DATA, 'name', [{ invalidValue: 'Main St', validValue: 'Main' }]])],
    ['delete', () => graph.callAsync(['dms', 'data', 'delete'], [APP, DATA, rowId])],
  ]) {
    const e = await refused(fn);
    check(e && /not editable/i.test(e.message || String(e)), `off: ${what} is refused`, e && (e.message || String(e)));
  }
  const dt = resolveTable(APP, DATA, db.type, splitMode, srcId);
  const DT = db.type === 'postgres' ? `"${dt.schema}"."${dt.table}"` : `"${dt.table}"`;
  const rows = (await db.query(`SELECT id, data FROM ${DT} WHERE type = $1`, [DATA])).rows;
  check(rows.length === 1 && obj(rows[0].data).name === 'Main St', 'off: the row is as it was', rows);
  // the source row itself is still editable (that is how Editable comes back on)
  await graph.callAsync(['dms', 'data', 'edit'], [APP, srcId, { metadata: { ...(await stored(srcId)).metadata, isEditable: true } }]);
  check(await refused(() => graph.callAsync(['dms', 'data', 'edit'], [APP, rowId, { name: 'Changed' }, DATA])) === null, 'back on: the edit is taken');

  // clearing a version's rows is a row write too (uda.viewsById.clearData)
  const viewId = await create('roads|v1:view', { name: 'version 1' });
  const VDATA = `roads|${viewId}:data`;
  await create(VDATA, { name: 'Oak St' });
  const vt = resolveTable(APP, VDATA, db.type, splitMode, srcId);
  const VT = db.type === 'postgres' ? `"${vt.schema}"."${vt.table}"` : `"${vt.table}"`;
  const count = async () => +(await db.query(`SELECT count(*) AS n FROM ${VT} WHERE type = $1`, [VDATA])).rows[0].n;
  const setEditable = async (v) => graph.callAsync(['dms', 'data', 'edit'], [APP, srcId, { metadata: { ...(await stored(srcId)).metadata, isEditable: v } }]);
  await setEditable(false);
  const ce = await refused(() => graph.callAsync(['uda', 'viewsById', 'clearData'], [`${APP}+roads`, viewId]));
  check(ce && /not editable/i.test(ce.message || String(ce)) && await count() === 1, 'off: clearing the version is refused, its row kept', ce && (ce.message || String(ce)));
  await setEditable(true);
  check(await refused(() => graph.callAsync(['uda', 'viewsById', 'clearData'], [`${APP}+roads`, viewId])) === null && await count() === 0, 'back on: the clear is taken');

  // a source with no value (created before the flag) stays editable
  await db.query(`UPDATE ${T} SET data = $1 WHERE id = $2`, [JSON.stringify({ name: 'Roads', type: 'internal_table' }), srcId]);
  await new Promise(r => setTimeout(r, 5200)); // the controller remembers a source's flag for 5 s
  check(await refused(() => graph.callAsync(['dms', 'data', 'edit'], [APP, rowId, { name: 'Again' }, DATA])) === null, 'no value: the edit is taken');

  // ── 4a. internal backfill ──
  await db.query(`UPDATE ${T} SET data = $1 WHERE id = $2`, [JSON.stringify({ name: 'Locked', type: 'internal_table', metadata: { isEditable: 'no' } }), lockedId]);
  const before = await auditDms(db, APP, splitMode);
  check(before.find(r => r.id === srcId)?.bucket === 'blank' && before.find(r => r.id === lockedId)?.bucket === 'not_boolean', 'audit: one blank, one odd value', before);
  const wrote = await backfillDms(db, APP, splitMode);
  check(wrote.length === 1 && wrote[0] === srcId && (await stored(srcId)).metadata?.isEditable === true && (await stored(srcId)).name === 'Roads', 'backfill: the blank internal source becomes true, the rest of its data kept');
  check((await stored(lockedId)).metadata?.isEditable === 'no', 'backfill: an odd value is left alone');
  check((await backfillDms(db, APP, splitMode)).length === 0, 'backfill: a second run writes nothing');

  // ── 3. external create default, 4b. external backfill ──
  const dama = getDb(DAMA_DB);
  await awaitReady();
  const S = dama.type === 'postgres' ? 'data_manager.sources' : 'sources';
  const meta = async (id) => { const m = (await dama.query(`SELECT metadata FROM ${S} WHERE source_id = $1`, [id])).rows[0]?.metadata; return m == null ? m : obj(m); };
  const stamp = Date.now();
  const plain = await createDamaSource({ name: `editable plain ${stamp}`, type: 'csv_dataset' }, DAMA_DB);
  check((await meta(plain.source_id))?.isEditable === false, 'a new external source is not editable', await meta(plain.source_id));
  const withCols = await createDamaSource({ name: `editable cols ${stamp}`, type: 'csv_dataset', metadata: { columns: [{ name: 'a' }] } }, DAMA_DB);
  check((await meta(withCols.source_id))?.isEditable === false && (await meta(withCols.source_id)).columns?.length === 1, 'its other metadata is kept');
  const on = await createDamaSource({ name: `editable on ${stamp}`, type: 'csv_dataset', metadata: { isEditable: true } }, DAMA_DB);
  check((await meta(on.source_id))?.isEditable === true, 'a creator\'s own true is kept');

  // older rows: metadata with no value, and no metadata at all
  await dama.query(`UPDATE ${S} SET metadata = $1 WHERE source_id = $2`, [JSON.stringify({ columns: [{ name: 'a' }] }), withCols.source_id]);
  await dama.query(`UPDATE ${S} SET metadata = NULL WHERE source_id = $1`, [plain.source_id]);
  const audit = await auditDama(dama);
  check(audit.find(r => r.id === +withCols.source_id)?.bucket === 'blank' && audit.find(r => r.id === +plain.source_id)?.bucket === 'none'
    && audit.find(r => r.id === +on.source_id)?.bucket === 'true', 'audit: blank, none and true are told apart');
  const ids = await backfillDama(dama);
  check(ids.includes(+withCols.source_id) && !ids.includes(+plain.source_id) && !ids.includes(+on.source_id), 'backfill: only the source with metadata and no value is written', ids);
  check((await meta(withCols.source_id))?.isEditable === false && (await meta(withCols.source_id)).columns?.length === 1, 'backfill: it becomes false, its columns kept');
  check((await meta(plain.source_id)) == null, 'backfill: a source with no metadata is left alone');
  check(!(await backfillDama(dama)).includes(+withCols.source_id), 'backfill: a second run does not write it again');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
