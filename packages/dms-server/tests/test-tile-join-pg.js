/**
 * Joined map tiles over PostgreSQL (src/dms/planning/tasks/current/joined-tile-nested-loop-fix.md).
 *
 * Run:  npm run test:pg:tile-join
 *   (= DMS_TEST_PG_IMAGE=postgis/postgis:16-3.4 node tests/postgres-docker.js run tests/test-tile-join-pg.js)
 *
 * A tile whose joined view is on Postgres builds `tile_keys` and `joined_cte` as CTEs. Postgres 12+
 * folds a CTE used once into the query and guesses it returns one row, so it chose a nested loop that
 * re-ran the whole join once per feature (13.7 s for a 1299-feature tile). Both are now
 * `AS MATERIALIZED`. Checks, against a geometry view and an aggregated join view in PostGIS:
 *   - the tile statement materializes both CTEs;
 *   - the tile is byte-identical to the one the old (inlined) statement returns;
 *   - in the new plan the join is computed once (joined_cte scanned with loops=1).
 * Timings of both statements are printed for information only.
 */
const DAMA_DB = process.env.DAMA_TEST_DB || 'dama-postgres-test';

const { getDb, awaitReady } = require('../src/db/index.js');
const { getJoinedTileData } = require('../src/dama/tiles/tiles.rest');

const STAMP = Date.now().toString(36);
// one z12 tile over Albany: 12/1208/1510
const [Z, X, Y] = [12, 1208, 1510];
const FEATURES = 1500;          // geometry rows inside the tile
const READINGS = 40;            // join-view rows per key, aggregated by the join

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n      ${e.stack || e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(`Assertion failed: ${msg}`); }

let db;
async function makeView(name, createSql, fillSql) {
  const { rows: [s] } = await db.query(
    `INSERT INTO data_manager.sources (name, metadata) VALUES ($1, '{}'::jsonb) RETURNING source_id`, [`${name}-${STAMP}`]);
  const { rows: [v] } = await db.query(`INSERT INTO data_manager.views (source_id) VALUES ($1) RETURNING view_id`, [s.source_id]);
  const table = `s${s.source_id}_v${v.view_id}_${name}`;
  await db.query(
    `UPDATE data_manager.views SET table_schema = 'gis_datasets', table_name = $1, data_table = $2 WHERE view_id = $3`,
    [table, `gis_datasets.${table}`, v.view_id]);
  await db.query(createSql(`gis_datasets.${table}`));
  await db.query(fillSql(`gis_datasets.${table}`));
  await db.query(`ANALYZE gis_datasets.${table}`);
  return v.view_id;
}

async function main() {
  db = getDb(DAMA_DB);
  await awaitReady();
  try { await db.query('CREATE EXTENSION IF NOT EXISTS postgis'); }
  catch (e) { throw new Error(`PostGIS is not available (${e.message}). Run with npm run test:pg:tile-join`); }
  await db.query('CREATE SCHEMA IF NOT EXISTS gis_datasets');

  // geometry: FEATURES points spread over the tile's middle, each with a key; plus some outside it
  const geoView = await makeView('roads',
    (t) => `CREATE TABLE ${t} (ogc_fid SERIAL PRIMARY KEY, tmc TEXT, county TEXT, wkb_geometry geometry(POINT, 4326))`,
    (t) => `INSERT INTO ${t} (tmc, county, wkb_geometry)
            SELECT 'tmc' || g, 'c' || (g % 7),
                   ST_SetSRID(ST_MakePoint(-73.80 + (g % 50) * 0.0012, 42.62 + (g / 50) * 0.0010), 4326)
              FROM generate_series(0, ${FEATURES - 1}) g
            UNION ALL
            SELECT 'far' || g, 'c0', ST_SetSRID(ST_MakePoint(-76 + g * 0.001, 43), 4326)
              FROM generate_series(0, 4999) g`);
  // join view: READINGS rows per key, summed per key by the join (like a measure per segment)
  const joinView = await makeView('readings',
    (t) => `CREATE TABLE ${t} (ogc_fid SERIAL PRIMARY KEY, tmc TEXT, year INT, value DOUBLE PRECISION)`,
    (t) => `INSERT INTO ${t} (tmc, year, value)
            SELECT CASE WHEN g < ${FEATURES} THEN 'tmc' || g ELSE 'far' || (g - ${FEATURES}) END, 2020 + r % 5, (g * 31 + r) % 97
              FROM generate_series(0, ${FEATURES + 4999}) g, generate_series(1, ${READINGS}) r`);

  const join = {
    viewId: joinView, localKey: 'tmc', joinKey: 'tmc',
    options: { groupBy: ['tmc'], filter: { year: [2021, 2022, 2023] } },
    attributes: ['tmc', 'sum(value) as total'],
    tileCols: ['total'],
  };

  // capture the tile statement the route runs
  const statements = [];
  const query = db.query.bind(db);
  db.query = (sql, values) => { if (/ST_AsMVT/.test(sql)) statements.push({ sql, values }); return query(sql, values); };
  const tile = await getJoinedTileData(DAMA_DB, geoView, Z, X, Y, ['county'], null, join);
  db.query = query;
  const { sql, values } = statements[0] || {};

  console.log('\nJoined tile over a Postgres join view');
  await test('the tile is built, from one statement', async () => {
    assert(tile && tile.length > 1000, `tile bytes: ${tile && tile.length}`);
    assert(statements.length === 1, `statements: ${statements.length}`);
  });
  await test('both CTEs are materialized', async () => {
    assert(/tile_keys AS MATERIALIZED \(/.test(sql), 'tile_keys');
    assert(/joined_cte AS MATERIALIZED \(/.test(sql), 'joined_cte');
  });

  const inlinedSql = sql.replace(/ AS MATERIALIZED \(/g, ' AS (');
  const time = async (s) => { const t0 = process.hrtime.bigint(); const r = await query(s, values); return [r.rows[0].mvt, Number(process.hrtime.bigint() - t0) / 1e6]; };
  await time(inlinedSql); await time(sql);   // warm the cache for both
  const [oldTile, oldMs] = await time(inlinedSql);
  const [newTile, newMs] = await time(sql);

  await test('the tile is byte-identical to the one the inlined statement returns', async () => {
    assert(Buffer.compare(Buffer.from(oldTile), Buffer.from(newTile)) === 0, `old ${oldTile.length}b, new ${newTile.length}b`);
    assert(Buffer.compare(Buffer.from(tile), Buffer.from(newTile)) === 0, 'route tile vs rerun');
  });
  await test('the joined subquery runs once, not once per feature', async () => {
    const plan = (await query(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`, values)).rows[0]['QUERY PLAN'][0].Plan;
    const scans = [];
    const walk = (n) => { if (n['Node Type'] === 'CTE Scan' && n['CTE Name'] === 'joined_cte') scans.push(n); (n.Plans || []).forEach(walk); };
    walk(plan);
    assert(scans.length === 1, `CTE Scan on joined_cte: ${scans.length}`);
    assert(scans[0]['Actual Loops'] === 1, `joined_cte loops: ${scans[0]['Actual Loops']}`);
  });
  console.log(`    (info: ${FEATURES} features, inlined ${oldMs.toFixed(0)} ms, materialized ${newMs.toFixed(0)} ms)`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
