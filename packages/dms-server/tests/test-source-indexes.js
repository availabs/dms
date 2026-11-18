/**
 * Source indexes an author manages (routes/uda/source_indexes.js) — setindex-composite-covering-indexes.md.
 *
 * Part 1 (no database): expression scanning, alias stripping, index names and the generated DDL.
 * Part 2 (PostgreSQL DAMA, through the Falcor routes): the per-column toggle keeps its index name;
 * composite, covering, partial and expression indexes build in the background and report their state;
 * the planner uses an expression index for a query the UDA itself builds from a calculated-column
 * filter; injection attempts are refused before any DDL; the gate refuses anonymous and unpermitted
 * callers even under DMS_AUTH_MODE=log; a failed or interrupted build is recovered by a rebuild; an
 * index flag no longer moves the feature id. Part 3: an internal (DMS) source on the same database.
 *
 * Run: node tests/postgres-docker.js run tests/test-source-indexes.js   (npm run test:pg:source-indexes)
 * or, with a Postgres already on :5499 and a `dama-postgres-test` config (role dama, same database):
 *   DMS_TEST_DB=dms-postgres-test DMS_DB_ENV=dms-postgres-test node tests/test-source-indexes.js
 * Part 2/3 skip when the DAMA config isn't PostgreSQL.
 */
process.env.DMS_UDA_KEY_CACHE_TTL_MS = process.env.DMS_UDA_KEY_CACHE_TTL_MS || '0';
const DMS_DB = process.env.DMS_TEST_DB || 'dms-postgres-test';
const DAMA_DB = process.env.DAMA_TEST_DB || 'dama-postgres-test';
process.env.DMS_DB_ENV = process.env.DMS_DB_ENV || DMS_DB;

const assert = require('assert');
const si = require('../src/routes/uda/source_indexes');

let passed = 0; let failed = 0;
const t = async (name, fn) => {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n      ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e}`); }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const STATE_EXPR = "CASE WHEN owner_type IN ('2') THEN 1 ELSE 0 END";

async function part1() {
  console.log('\n--- Part 1: scanning, names, DDL ---');
  await t('stripAlias drops the trailing AS alias of a calculated column, and only that', async () => {
    assert.strictEqual(si.stripAlias(`${STATE_EXPR} AS is_state`), STATE_EXPR);
    assert.strictEqual(si.stripAlias(`${STATE_EXPR} as "Is State"`), STATE_EXPR);
    assert.strictEqual(si.stripAlias(STATE_EXPR), STATE_EXPR);
  });
  await t('a calculated column passes the scan, whitespace collapsed', async () => {
    assert.strictEqual(si.scanSqlExpression(`CASE  WHEN owner_type\n IN ('2')  THEN 1 ELSE 0 END`), STATE_EXPR);
    // inside quotes, `--`, `,`, `)` are text; a `;` is refused anywhere, as the UDA refuses it in a query
    assert.strictEqual(si.scanSqlExpression(`coalesce("Odd ""name""", 'a, b) -- c')`), `coalesce("Odd ""name""", 'a, b) -- c')`);
  });
  const refusals = [
    ['1; DROP TABLE x', /one expression/],
    ['owner_type -- hi', /comments/],
    ['owner_type /* hi */', /comments/],
    ['1) FROM pg_shadow WHERE (1', /unmatched \)/],
    ['(owner_type', /unmatched \(/],
    ['owner_type, county_name', /comma/],
    ['(select 1)', /word queries can't use/],
    ['owner_type IN (VALUES (1))', /subquery/],
    ['$1', /\$/],
    ["E'\\''", /backslash/],
    ["'unclosed", /unclosed/],
    ['', /empty/],
  ];
  for (const [expr, re] of refusals) {
    await t(`scan refuses ${JSON.stringify(expr)}`, async () => {
      assert.throws(() => si.scanSqlExpression(expr), re);
    });
  }
  await t('the toggle\'s index name is unchanged: idx_<table>_<col> (cut at 63)', async () => {
    const spec = si.normalizeSpec('county_name');
    assert.strictEqual(si.indexNameFor('s1649_v2354_parcel_to_footprint_ny_v_2', spec), 'idx_s1649_v2354_parcel_to_footprint_ny_v_2_county_name');
    assert.strictEqual(si.specKey(spec), 'col:county_name');
    const long = 'x'.repeat(70);
    assert.strictEqual(si.indexNameFor(long, spec), `idx_${long}_county_name`.slice(0, 63));
  });
  await t('other specs: deterministic key, a name that keeps its hash within 63 characters', async () => {
    const a = si.normalizeSpec({ expression: `${STATE_EXPR} AS is_state` });
    const b = si.normalizeSpec({ expression: `CASE WHEN owner_type IN ('2')   THEN 1 ELSE 0 END` });
    assert.strictEqual(si.specKey(a), si.specKey(b));
    const name = si.indexNameFor('y'.repeat(70), a);
    assert(name.length <= 63 && name.endsWith(si.specKey(a).replace('ix_', '')), name);
    assert.notStrictEqual(si.specKey(si.normalizeSpec({ columns: ['a', 'b'] })), si.specKey(si.normalizeSpec({ columns: ['b', 'a'] })));
  });
  await t('DDL: composite, covering, partial, expression; identifiers quoted', async () => {
    const sql = (spec) => si.buildCreateIndexSql({ schema: 's', table: 't', name: 'n', spec: si.normalizeSpec(spec), concurrently: true });
    assert.strictEqual(sql({ columns: ['state', 'region_name'] }), 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "n" ON "s"."t" ("state", "region_name")');
    assert.strictEqual(sql({ columns: ['state'], include: ['x'] }), 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "n" ON "s"."t" ("state") INCLUDE ("x")');
    assert.strictEqual(sql({ columns: ['state'], where: "owner_type = '2'" }), `CREATE INDEX CONCURRENTLY IF NOT EXISTS "n" ON "s"."t" ("state") WHERE (owner_type = '2')`);
    assert.strictEqual(sql({ expression: `${STATE_EXPR} AS is_state` }), `CREATE INDEX CONCURRENTLY IF NOT EXISTS "n" ON "s"."t" ((${STATE_EXPR}))`);
    assert.throws(() => sql({ columns: ['we"ird'] }), /character/, 'a " in a column name is refused');
  });
  await t('spec shape errors', async () => {
    assert.throws(() => si.normalizeSpec({}), /at least one column/);
    assert.throws(() => si.normalizeSpec({ columns: ['a'], expression: 'b' }), /not both/);
    assert.throws(() => si.normalizeSpec({ columns: ['a', 'a'] }), /twice/);
    assert.throws(() => si.normalizeSpec({ columns: ['a'], include: ['a'] }), /both indexed and included/);
    assert.throws(() => si.normalizeSpec({ columns: ['a'], include: ['b'] }, { isDms: true }), /only available/);
    assert.throws(() => si.normalizeSpec({ columns: ["a'b"] }, { isDms: true }), /character/);
  });
}

async function part2() {
  const { getDb, awaitReady } = require('../src/db');
  const { createTestGraph } = require('./graph');
  const db = getDb(DAMA_DB);
  getDb(DMS_DB);
  await awaitReady();
  if (db.type !== 'postgres') { console.log(`\nskip Part 2/3: ${DAMA_DB} is not PostgreSQL`); return; }
  console.log('\n--- Part 2: a DAMA source on PostgreSQL ---');

  const SCHEMA = 'gis_datasets';
  const TABLE = `idx_test_${Date.now()}`;
  const FQT = `${SCHEMA}.${TABLE}`;
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await db.query(`CREATE TABLE ${FQT} (ogc_fid serial PRIMARY KEY, owner_type text, county_name text, state text,
    region_name text, sub text, nri_ltng_risk_score numeric, building_full_market_val numeric)`);
  // 60k rows, 0.3 % state-owned (the BILD shape, scaled down)
  await db.query(`INSERT INTO ${FQT} (owner_type, county_name, state, region_name, sub, nri_ltng_risk_score, building_full_market_val)
    SELECT CASE WHEN g % 333 = 0 THEN '2' ELSE (1 + g % 7)::text END, 'county_' || (g % 62), CASE WHEN g % 10 = 0 THEN 'NJ' ELSE 'NY' END,
           'region_' || (g % 11), 'sub_' || (g % 5), (g % 100), g * 10
    FROM generate_series(1, 60000) g`);
  await db.query(`ANALYZE ${FQT}`);
  const columns = ['ogc_fid', 'owner_type', 'county_name', 'state', 'region_name', 'sub', 'nri_ltng_risk_score', 'building_full_market_val']
    .map(name => ({ name, type: 'TEXT' }));
  const { rows: [src] } = await db.query(
    `INSERT INTO data_manager.sources (name, type, metadata, auth_permissions) VALUES ($1, 'gis_dataset', $2, $3) RETURNING source_id`,
    [TABLE, JSON.stringify({ columns }), JSON.stringify({ groups: { Editors: ['update-source'] }, users: {} })]);
  const { rows: [view] } = await db.query(
    `INSERT INTO data_manager.views (source_id, table_schema, table_name) VALUES ($1, $2, $3) RETURNING view_id`,
    [src.source_id, SCHEMA, TABLE]);
  const S = src.source_id; const V = view.view_id;

  const APP = `idxtest_${Date.now()}`;
  const editor = { authed: true, id: 71, email: 'editor@x', groups: ['Editors'] };
  const stranger = { authed: true, id: 72, email: 'stranger@x', groups: ['Rando'] };
  // The pgEnv's env row of the requesting site: what locates an external source for the judge
  // (the source's own grants then apply), as in test-uda-auth.js.
  const controller = require('../src/routes/dms/dms.controller').createController(DMS_DB);
  await controller.createData([APP, 'site|extenv:dmsenv', { name: 'extenv', pgEnv: DAMA_DB }], null);
  const gEditor = createTestGraph(DMS_DB, { user: editor, requestApp: APP });
  const gStranger = createTestGraph(DMS_DB, { user: stranger, requestApp: APP });
  const gAnon = createTestGraph(DMS_DB, { user: null, requestApp: APP });

  const info = async () => {
    await gEditor.getAsync([['uda', DAMA_DB, 'sources', 'byId', S, 'indexesInfo']]).catch(() => null);
    const r = await gEditor.getAsync([['uda', DAMA_DB, 'sources', 'byId', S, 'indexesInfo']]);
    const v = r.jsonGraph.uda[DAMA_DB].sources.byId[S].indexesInfo;
    return (v && v.value) || v;
  };
  const call = async (graph, name, args) => {
    const r = await graph.callAsync(['uda', 'sources', name], [DAMA_DB, S, ...args]);
    const byId = r.jsonGraph.uda[DAMA_DB].sources.byId[S];
    const out = byId.indexesCall; const res = (out && out.value) || out;
    const i = byId.indexesInfo; return { ...res, info: (i && i.value) || i };
  };
  const waitSettled = async (key, ms = 30000) => {
    const end = Date.now() + ms;
    for (;;) {
      const inf = await info();
      const m = inf.managed.find(x => x.key === key);
      if (!m || !['building', 'dropping'].includes(m.state)) return { inf, m };
      if (Date.now() > end) throw new Error(`index ${key} still ${m.state}`);
      await sleep(150);
    }
  };
  const pgIndex = async (name) => (await db.query(
    `SELECT i.indisvalid AS valid, pg_get_indexdef(i.indexrelid) AS def FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = $2`, [SCHEMA, name])).rows[0] || null;
  const storedMeta = async () => JSON.parse((await db.query(`SELECT metadata::text AS m FROM data_manager.sources WHERE source_id = $1`, [S])).rows[0].m);
  const tableIndexCount = async () => +(await db.query(`SELECT count(*) AS n FROM pg_indexes WHERE schemaname = $1 AND tablename = $2`, [SCHEMA, TABLE])).rows[0].n;

  // The SQL the UDA itself runs for a section filtered on the calculated column (as buildUdaConfig
  // sends it: the expression before AS as the filter key), captured from the adapter, then EXPLAINed.
  const udaSql = async () => {
    const options = JSON.stringify({
      filter: { [STATE_EXPR]: [1] },
      gte: { nri_ltng_risk_score: 80 },
      groupBy: ['county_name'],
      orderBy: { 'sum(building_full_market_val) as total': 'desc' },
    });
    const orig = db.query.bind(db); const seen = [];
    db.query = (sql, values) => { if (typeof sql === 'string' && sql.includes(TABLE) && /CASE WHEN/.test(sql)) seen.push({ sql, values }); return orig(sql, values); };
    try {
      await gEditor.getAsync([['uda', DAMA_DB, 'viewsById', V, 'options', options, 'dataByIndex', { from: 0, to: 9 }, ['county_name', 'sum(building_full_market_val) as total']]]);
    } finally { db.query = orig; }
    assert(seen.length, 'the UDA ran no query on the table');
    return seen[seen.length - 1];
  };
  const plan = async ({ sql, values }) => JSON.stringify((await db.query(`EXPLAIN (FORMAT JSON) ${sql}`, values)).rows[0]);

  const prevMode = process.env.DMS_AUTH_MODE;
  process.env.DMS_AUTH_MODE = 'log'; // the gate must hold even in log mode

  await t('gate: anonymous refused, a signed-in user without update-source refused under log mode, nothing written', async () => {
    const before = await tableIndexCount();
    const a = await call(gAnon, 'createIndex', [{ columns: ['state'] }]);
    assert(!a.ok && /Sign in/.test(a.error), JSON.stringify(a));
    const s = await call(gStranger, 'createIndex', [{ expression: STATE_EXPR }]);
    assert(!s.ok && /permission/.test(s.error), JSON.stringify(s));
    const d = await call(gStranger, 'dropIndex', ['col:state']);
    assert(!d.ok && /permission/.test(d.error), JSON.stringify(d));
    assert.strictEqual(await tableIndexCount(), before);
    assert(!(await storedMeta()).indexes);
  });

  await t('indexesInfo lists the indexes made outside DMS (the primary key) as other, read-only', async () => {
    const inf = await info();
    assert.strictEqual(inf.managed.length, 0);
    assert(inf.other.some(o => o.isPrimary && /ogc_fid/.test(o.definition)), JSON.stringify(inf.other));
    assert(inf.columns.includes('owner_type'));
  });

  await t('back-compat: the per-column toggle (setIndex) builds idx_<table>_<col> and flags the column', async () => {
    await gEditor.callAsync(['uda', 'sources', 'setIndex'], [DAMA_DB, S, 'county_name', true]);
    const { m } = await waitSettled('col:county_name');
    assert.strictEqual(m && m.state, 'ready', JSON.stringify(m));
    assert(m.legacy);
    const idx = await pgIndex(`idx_${TABLE}_county_name`);
    assert(idx && idx.valid && /\(county_name\)$/.test(idx.def), JSON.stringify(idx));
    assert((await storedMeta()).columns.find(c => c.name === 'county_name').isIndex);
  });

  await t('back-compat: a bare column string through createIndex is the same toggle', async () => {
    const r = await call(gEditor, 'createIndex', ['region_name']);
    assert(r.ok, r.error);
    const { m } = await waitSettled('col:region_name');
    assert.strictEqual(m.state, 'ready');
    assert((await pgIndex(`idx_${TABLE}_region_name`)).valid);
    assert((await storedMeta()).columns.find(c => c.name === 'region_name').isIndex);
  });

  await t('feature id: indexing a filter column (owner_type) leaves dataById on ogc_fid', async () => {
    await gEditor.callAsync(['uda', 'sources', 'setIndex'], [DAMA_DB, S, 'owner_type', true]);
    await waitSettled('col:owner_type');
    const r = await gEditor.getAsync([['uda', DAMA_DB, 'viewsById', V, 'dataById', [333, 334], ['owner_type']]]);
    const byId = r.jsonGraph.uda[DAMA_DB].viewsById[V].dataById;
    assert.strictEqual(byId[333].owner_type, '2', JSON.stringify(byId));
    assert.strictEqual(byId[334].owner_type, String(1 + 334 % 7));
  });

  let compositeKey;
  await t('composite: builds (state, region_name, sub), records metadata.indexes, drop removes it by name', async () => {
    const r = await call(gEditor, 'createIndex', [{ columns: ['state', 'region_name', 'sub'], label: 'Region lookup' }]);
    assert(r.ok, r.error);
    compositeKey = r.info.managed.find(m => m.columns.join() === 'state,region_name,sub').key;
    const { m } = await waitSettled(compositeKey);
    assert.strictEqual(m.state, 'ready', JSON.stringify(m));
    const name = m.tables[0].name;
    assert(/\(state, region_name, sub\)$/.test((await pgIndex(name)).def));
    const meta = await storedMeta();
    assert(meta.indexes.some(e => e.key === compositeKey && e.label === 'Region lookup' && e.addedBy === 'editor@x'));
    const d = await call(gEditor, 'dropIndex', [compositeKey]);
    assert(d.ok, d.error);
    for (let i = 0; i < 100 && await pgIndex(name); i++) await sleep(100);
    assert.strictEqual(await pgIndex(name), null);
    assert(!(await storedMeta()).indexes.some(e => e.key === compositeKey));
    const inf = await info();
    assert(!inf.managed.some(x => x.key === compositeKey) && !inf.other.some(o => o.name === name));
  });

  await t('covering: INCLUDE', async () => {
    const r = await call(gEditor, 'createIndex', [{ columns: ['state'], include: ['region_name'] }]);
    assert(r.ok, r.error);
    const key = r.info.managed.find(m => m.include.length).key;
    const { m } = await waitSettled(key);
    assert.strictEqual(m.state, 'ready');
    assert(/\(state\) INCLUDE \(region_name\)$/.test((await pgIndex(m.tables[0].name)).def));
  });

  await t('partial: WHERE', async () => {
    const r = await call(gEditor, 'createIndex', [{ columns: ['county_name'], where: "owner_type = '2'" }]);
    assert(r.ok, r.error);
    const key = r.info.managed.find(m => m.where).key;
    const { m } = await waitSettled(key);
    assert.strictEqual(m.state, 'ready');
    assert(/WHERE \(owner_type = '2'::text\)$/.test((await pgIndex(m.tables[0].name)).def), (await pgIndex(m.tables[0].name)).def);
  });

  await t('expression: a pasted calculated column (with AS alias) is indexed; the planner uses it for the UDA\'s own query', async () => {
    const before = await plan(await udaSql());
    assert(/Seq Scan/.test(before) && !/Index/.test(before.replace(/idx_/g, '')), `before: ${before}`);
    const r = await call(gEditor, 'createIndex', [{ expression: `${STATE_EXPR} AS is_state` }]);
    assert(r.ok, r.error);
    const key = r.info.managed.find(m => m.kind === 'expression').key;
    assert.strictEqual(r.info.managed.find(m => m.kind === 'expression').expression, STATE_EXPR);
    const { m } = await waitSettled(key);
    assert.strictEqual(m.state, 'ready', JSON.stringify(m));
    const name = m.tables[0].name;
    const after = await plan(await udaSql());
    assert(after.includes(`"Index Name":"${name}"`), `after: ${after}`);
    assert(/Bitmap Index Scan|Index Scan/.test(after));
  });

  await t('injection and bad expressions are refused before any DDL', async () => {
    const before = await tableIndexCount();
    const metaBefore = JSON.stringify((await storedMeta()).indexes);
    const cases = [
      [{ expression: `1); DROP TABLE ${FQT}; --` }, /one expression|comments|unmatched/],
      [{ expression: 'owner_type) WHERE (true' }, /unmatched/],
      [{ expression: '(select passwd from pg_shadow limit 1)' }, /word queries can't use/],
      [{ expression: 'now()' }, /can't be indexed/],
      [{ expression: 'pg_sleep(5) IS NULL' }, /can't be indexed/],
      [{ expression: 'pg_shadow.passwd' }, /doesn't work on/],
      [{ expression: 'no_such_column + 1' }, /doesn't work on/],
      [{ expression: 'sum(nri_ltng_risk_score)' }, /doesn't work on/],
      [{ columns: ['state'], where: "1=1) OR (1=1" }, /unmatched/],
      [{ columns: ['no_such_column'] }, /has no column/],
      [{ columns: ['state"; DROP TABLE x; --'] }, /character an index can't use/],
    ];
    for (const [spec, re] of cases) {
      const r = await call(gEditor, 'createIndex', [spec]);
      assert(!r.ok && re.test(r.error), `${JSON.stringify(spec)} → ${JSON.stringify(r)}`);
    }
    assert.strictEqual(await tableIndexCount(), before);
    assert.strictEqual(JSON.stringify((await storedMeta()).indexes), metaBefore);
    assert(+(await db.query(`SELECT count(*) AS n FROM ${FQT}`)).rows[0].n === 60000);
  });

  await t('the legacy toggle can no longer inject through a column name', async () => {
    const before = await tableIndexCount();
    await gEditor.callAsync(['uda', 'sources', 'setIndex'], [DAMA_DB, S, 'state") WHERE (true', true]).catch(() => null);
    await sleep(300);
    assert.strictEqual(await tableIndexCount(), before);
  });

  await t('background state: building while the build waits, a second build is refused, then ready', async () => {
    let release;
    const held = new Promise(r => { release = r; });
    // CREATE INDEX CONCURRENTLY needs SHARE UPDATE EXCLUSIVE; holding it keeps the build waiting.
    const locker = db.withTransaction(async (tx) => {
      await tx.query(`LOCK TABLE ${FQT} IN SHARE UPDATE EXCLUSIVE MODE`);
      await held;
    });
    await sleep(100);
    try {
      const r = await call(gEditor, 'createIndex', [{ columns: ['sub', 'state'] }]);
      assert(r.ok, r.error);
      const key = r.info.managed.find(m => m.columns.join() === 'sub,state').key;
      await sleep(300);
      const m = (await info()).managed.find(x => x.key === key);
      assert.strictEqual(m.state, 'building', JSON.stringify(m));
      const again = await call(gEditor, 'createIndex', [{ columns: ['sub', 'state'] }]);
      assert(!again.ok && /already being built/.test(again.error), JSON.stringify(again));
      release();
      await locker;
      const { m: done } = await waitSettled(key);
      assert.strictEqual(done.state, 'ready');
    } finally { release(); await locker.catch(() => {}); }
  });

  await t('a failed build is reported with its error and leaves an invalid index; Remove drops it', async () => {
    // Passes every check (EXPLAIN evaluates nothing) and fails on the first row at build time.
    const r = await call(gEditor, 'createIndex', [{ expression: '1 / (nri_ltng_risk_score - nri_ltng_risk_score)' }]);
    assert(r.ok, r.error);
    const key = r.info.managed.find(m => m.expression && m.expression.startsWith('1 /')).key;
    const { m } = await waitSettled(key);
    assert.strictEqual(m.state, 'failed', JSON.stringify(m));
    assert(/division by zero/.test(m.tables[0].error), JSON.stringify(m.tables[0]));
    const idx = await pgIndex(m.tables[0].name);
    assert(idx && !idx.valid, 'a failed CONCURRENTLY build leaves an invalid index');
    const d = await call(gEditor, 'dropIndex', [key]);
    assert(d.ok, d.error);
    for (let i = 0; i < 100 && await pgIndex(m.tables[0].name); i++) await sleep(100);
    assert.strictEqual(await pgIndex(m.tables[0].name), null);
  });

  await t('an interrupted build (invalid index, no task) shows failed; rebuilding drops it and builds a valid one', async () => {
    const spec = si.normalizeSpec({ columns: ['county_name', 'state'] });
    const key = si.specKey(spec);
    const name = si.indexNameFor(TABLE, spec);
    // A unique CONCURRENTLY build on duplicate values fails and leaves an invalid index of that name,
    // as a server restart mid-build would.
    await db.query(`CREATE UNIQUE INDEX CONCURRENTLY "${name}" ON ${FQT} (county_name)`).catch(() => {});
    assert.strictEqual((await pgIndex(name)).valid, false);
    const meta = await storedMeta();
    await db.query(`UPDATE data_manager.sources SET metadata = $1 WHERE source_id = $2`,
      [JSON.stringify({ ...meta, indexes: [...meta.indexes, { key, columns: spec.columns, include: [], where: null, expression: null }] }), S]);
    const m = (await info()).managed.find(x => x.key === key);
    assert.strictEqual(m.state, 'failed', JSON.stringify(m));
    const r = await call(gEditor, 'createIndex', [{ columns: ['county_name', 'state'] }]);
    assert(r.ok, r.error);
    const { m: done } = await waitSettled(key);
    assert.strictEqual(done.state, 'ready');
    const idx = await pgIndex(name);
    assert(idx.valid && !/UNIQUE/.test(idx.def) && /\(county_name, state\)$/.test(idx.def), JSON.stringify(idx));
  });

  await t('a generic metadata save (the Metadata page) keeps metadata.indexes', async () => {
    const meta = await storedMeta();
    const { indexes, ...stale } = meta;
    await gEditor.callAsync(['uda', 'sources', 'update'], [DAMA_DB, S, { metadata: { ...stale, description: 'x' } }]);
    assert.deepStrictEqual((await storedMeta()).indexes, indexes);
  });

  await t('turning the toggle off drops the column index', async () => {
    await gEditor.callAsync(['uda', 'sources', 'setIndex'], [DAMA_DB, S, 'region_name', false]);
    for (let i = 0; i < 100 && await pgIndex(`idx_${TABLE}_region_name`); i++) await sleep(100);
    assert.strictEqual(await pgIndex(`idx_${TABLE}_region_name`), null);
    assert(!(await info()).managed.some(m => m.key === 'col:region_name'));
  });

  if (prevMode === undefined) delete process.env.DMS_AUTH_MODE; else process.env.DMS_AUTH_MODE = prevMode;

  // cleanup
  await db.query(`DELETE FROM data_manager.views WHERE view_id = $1`, [V]);
  await db.query(`DELETE FROM data_manager.sources WHERE source_id = $1`, [S]);
  await db.query(`DROP TABLE ${FQT}`);

  await part3(gEditor);
}

// Part 3: an internal (DMS) source — its split table holds the columns in `data`.
async function part3() {
  const { getDb } = require('../src/db');
  const dms = getDb(DMS_DB);
  if (dms.type !== 'postgres') return;
  console.log('\n--- Part 3: an internal (DMS) source on PostgreSQL ---');
  const { createTestGraph } = require('./graph');
  const { resolveTable } = require('../src/db/table-resolver');
  const controller = require('../src/routes/dms/dms.controller').createController(DMS_DB);
  const APP = `idxdms_${Date.now()}`;
  const graph = createTestGraph(DMS_DB, { user: { authed: true, id: 73, email: 'admin@x', groups: [`${APP} Admin`] }, requestApp: APP });
  const insert = async (type, data) => +(await controller.createData([APP, type, data], null))[0].id;
  const viewId = await insert('roads|v1:view', { name: 'v1' });
  const srcId = await insert('env1|roads:source', {
    name: 'roads', type: 'internal_table', views: [{ id: viewId }],
    config: { attributes: [{ name: 'owner_type' }, { name: 'county' }] },
  });
  const dataType = `roads|${viewId}:data`;
  for (let i = 0; i < 20; i++) await insert(dataType, { owner_type: String(i % 3), county: `c${i % 4}` });
  const { schema, table } = resolveTable(APP, dataType, 'postgres', 'per-app', srcId);
  const ENV = `${APP}+internal_table`;
  const call = async (name, args) => {
    const r = await graph.callAsync(['uda', 'sources', name], [ENV, srcId, ...args]);
    const b = r.jsonGraph.uda[ENV].sources.byId[srcId];
    return { ...((b.indexesCall && b.indexesCall.value) || b.indexesCall), info: (b.indexesInfo && b.indexesInfo.value) || b.indexesInfo };
  };
  const settled = async (key) => {
    for (let i = 0; i < 200; i++) {
      const r = await graph.getAsync([['uda', ENV, 'sources', 'byId', srcId, 'indexesInfo']]);
      const v = r.jsonGraph.uda[ENV].sources.byId[srcId].indexesInfo;
      const m = ((v && v.value) || v).managed.find(x => x.key === key);
      if (m && !['building', 'dropping'].includes(m.state)) return m;
      await sleep(100);
    }
    throw new Error('not settled');
  };
  const def = async (name) => (await dms.query(`SELECT indexdef FROM pg_indexes WHERE schemaname = $1 AND indexname = $2`, [schema, name])).rows[0]?.indexdef || null;

  await t('DMS: the toggle builds idx_<split table>_<col> on (data ->> col)', async () => {
    await graph.callAsync(['uda', 'sources', 'setIndex'], [ENV, srcId, 'county', true]);
    const m = await settled('col:county');
    assert.strictEqual(m.state, 'ready', JSON.stringify(m));
    const d = await def(`idx_${table}_county`.slice(0, 63));
    assert(/\(\(data ->> 'county'::text\)\)/.test(d), d);
  });
  await t('DMS: an expression index over data, and a column the source doesn\'t have is refused', async () => {
    const r = await call('createIndex', [{ expression: "CASE WHEN data->>'owner_type' IN ('2') THEN 1 ELSE 0 END AS is_state" }]);
    assert(r.ok, r.error);
    const m = await settled(r.info.managed.find(x => x.kind === 'expression').key);
    assert.strictEqual(m.state, 'ready', JSON.stringify(m));
    const bad = await call('createIndex', [{ columns: ['nope'] }]);
    assert(!bad.ok && /Not a column/.test(bad.error), JSON.stringify(bad));
  });
}

(async () => {
  await part1();
  await part2();
})()
  .then(() => { console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); })
  .catch((e) => { console.error(e); process.exit(1); });
