/**
 * Result cache for dataset queries (src/routes/uda/resultCache.js, planning/tasks/current/uda-result-cache.md).
 * The engine against a stand-in database: no Postgres needed. The stand-in answers the cache's table-version
 * probe from `versions` and every other query from `answer`, counting the runs.
 *
 * The Postgres integration (real counters, the UDA routes, the Editable gate) is test-uda-result-cache-pg.js.
 */
const { createResultCache, VOLATILE } = require('../src/routes/uda/resultCache');

let passed = 0; let failed = 0;
const check = (cond, m, detail) => {
  if (cond) { passed++; console.log(`  ✓ ${m}`); }
  else { failed++; console.log(`  ✗ ${m}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ''}`); }
};

function fakeDb({ type = 'postgres' } = {}) {
  const db = {
    type, runs: 0, probes: 0, delay: 0, fail: null,
    versions: { 'gis.roads': { relkind: 'r', relfilenode: 1, ins: 10, upd: 0, del: 0 }, 'gis.names': { relkind: 'r', relfilenode: 2, ins: 5, upd: 0, del: 0 } },
    answer: () => [{ n: 1, at: new Date('2026-01-01T00:00:00Z') }],
    async query(sql, values) {
      if (/pg_stat_all_tables/.test(sql)) {
        db.probes++;
        return { rows: values[0].filter(name => db.versions[name]).map(name => {
          const v = db.versions[name];
          return { name, relkind: v.relkind, relfilenode: v.relfilenode, n_tup_ins: v.ins, n_tup_upd: v.upd, n_tup_del: v.del, stats_reset: v.reset || null };
        }) };
      }
      db.runs++;
      if (db.delay) await new Promise(r => setTimeout(r, db.delay));
      if (db.fail) throw new Error(db.fail);
      return { rows: db.answer(sql, values) };
    },
  };
  return db;
}
const ROADS = [{ table_schema: 'gis', table_name: 'roads' }];
const BOTH = [...ROADS, { table_schema: 'gis', table_name: 'names' }];
const SQL = 'SELECT count(1) n FROM gis.roads WHERE a = $1';

async function main() {
  console.log('\n=== UDA result cache (engine) ===\n');

  { // off: straight through
    const db = fakeDb(); const c = createResultCache({ mode: 'off' });
    await c.cachedQuery(db, SQL, [1], { tables: ROADS }); await c.cachedQuery(db, SQL, [1], { tables: ROADS });
    check(db.runs === 2 && db.probes === 0 && c.stats().queries === 0, 'off: every query runs, nothing probed or counted');
  }

  { // on: second ask is a hit; values are part of the key
    const db = fakeDb(); let t = 1000; const c = createResultCache({ mode: 'on', now: () => t });
    const a = await c.cachedQuery(db, SQL, [1], { tables: ROADS });
    const b = await c.cachedQuery(db, SQL, [1], { tables: ROADS });
    check(db.runs === 1 && c.stats().hits === 1, 'on: the same query again is answered from memory', c.stats());
    check(JSON.stringify(a.rows) === JSON.stringify(b.rows) && a.rows !== b.rows, 'a hit returns equal rows that are its own');
    b.rows[0].n = 99;
    check((await c.cachedQuery(db, SQL, [1], { tables: ROADS })).rows[0].n === 1, 'changing returned rows does not change the kept answer');
    await c.cachedQuery(db, SQL, [2], { tables: ROADS });
    check(db.runs === 2, 'other values are another query');
    check(db.probes === 1, 'one probe inside the window', db.probes);

    // a write: the counters move; inside the window the old version is still trusted
    db.versions['gis.roads'].ins = 11; db.answer = () => [{ n: 2 }];
    check((await c.cachedQuery(db, SQL, [1], { tables: ROADS })).rows[0].n === 1, 'inside the window a write is not seen yet');
    t += 5000;
    const fresh = await c.cachedQuery(db, SQL, [1], { tables: ROADS });
    check(fresh.rows[0].n === 2 && c.stats().stale === 1, 'after the window the changed table drops the entry and the query runs', c.stats());
    // a TRUNCATE or rewrite: the storage id moves
    t += 5000; db.versions['gis.roads'].relfilenode = 7; db.answer = () => [{ n: 0 }];
    check((await c.cachedQuery(db, SQL, [1], { tables: ROADS })).rows[0].n === 0, 'a new storage id drops the entry');
    // a counter reset: the counters may climb back to an old value, the reset time may not
    t += 5000; db.versions['gis.roads'].reset = '2026-11-25T12:00:00Z'; db.answer = () => [{ n: 5 }];
    check((await c.cachedQuery(db, SQL, [1], { tables: ROADS })).rows[0].n === 5, 'a counter reset drops the entry');
    // max age
    const runs = db.runs; t += 10 * 60 * 1000;
    await c.cachedQuery(db, SQL, [1], { tables: ROADS });
    check(db.runs === runs + 1 && c.stats().expired === 1, 'an entry expires at the maximum age');
  }

  { // a join: any of its tables changing drops the entry
    const db = fakeDb(); let t = 0; const c = createResultCache({ mode: 'on', now: () => t });
    await c.cachedQuery(db, 'SELECT 1 FROM gis.roads ds JOIN gis.names n ON true', [], { tables: BOTH });
    t += 5000; db.versions['gis.names'].upd = 3;
    await c.cachedQuery(db, 'SELECT 1 FROM gis.roads ds JOIN gis.names n ON true', [], { tables: BOTH });
    check(db.runs === 2 && c.stats().stale === 1, 'a joined table changing drops the entry');
  }

  { // what is never kept
    const db = fakeDb(); const c = createResultCache({ mode: 'on' });
    for (let i = 0; i < 2; i++) await c.cachedQuery(db, SQL, [1], { tables: null, why: 'editable' });
    check(db.runs === 2 && c.stats().notCached.editable === 2, 'an editable source is never kept');
    for (let i = 0; i < 2; i++) await c.cachedQuery(db, SQL, [1], {});
    check(db.runs === 4 && c.stats().notCached.noTables === 2, 'a query whose tables are unknown is never kept');
    for (let i = 0; i < 2; i++) await c.cachedQuery(db, 'SELECT count(1) FROM gis.roads WHERE d >= now() - $1 * interval \'1 day\'', [7], { tables: ROADS });
    check(db.runs === 6 && c.stats().notCached.volatile === 2, 'SQL that reads the clock is never kept');
    check(VOLATILE.test('x <= CURRENT_DATE') && VOLATILE.test('random()') && !VOLATILE.test("coalesce(nowhere, known_at)") && !VOLATILE.test('EXTRACT(YEAR from swd_begin_date)'), 'clock detection');
    db.versions['gis.view_of_roads'] = { relkind: 'v', relfilenode: 0, ins: null, upd: null, del: null };
    for (let i = 0; i < 2; i++) await c.cachedQuery(db, 'SELECT 1 FROM gis.view_of_roads', [], { tables: [{ table_schema: 'gis', table_name: 'view_of_roads' }] });
    for (let i = 0; i < 2; i++) await c.cachedQuery(db, 'SELECT 1 FROM gis.gone', [], { tables: [{ table_schema: 'gis', table_name: 'gone' }] });
    check(db.runs === 10 && c.stats().notCached.noCounters === 4, 'a database view, or a table Postgres does not know, is never kept', c.stats().notCached);
    db.answer = () => [{ blob: 'x'.repeat(2_100_000) }];
    for (let i = 0; i < 2; i++) await c.cachedQuery(db, 'SELECT blob FROM gis.roads', [], { tables: ROADS });
    check(db.runs === 12 && c.stats().notCached.tooBig === 2, 'an answer over the size limit is never kept');
    const lite = fakeDb({ type: 'sqlite' });
    for (let i = 0; i < 2; i++) await c.cachedQuery(lite, SQL, [1], { tables: ROADS });
    check(lite.runs === 2 && lite.probes === 0, 'SQLite is never kept');
  }

  { // in-flight sharing, errors
    const db = fakeDb(); db.delay = 30; const c = createResultCache({ mode: 'on' });
    const results = await Promise.all([1, 2, 3, 4].map(() => c.cachedQuery(db, SQL, [1], { tables: ROADS })));
    check(db.runs <= 2 && c.stats().shared >= 2, 'identical queries arriving together share a run', { runs: db.runs, shared: c.stats().shared });
    check(new Set(results.map(r => r.rows)).size === 4 && results.every(r => r.rows[0].at instanceof Date || typeof r.rows[0].at === 'string'), 'each waiter gets rows of its own');
    const editable = await Promise.all([1, 2, 3].map(() => c.cachedQuery(db, 'SELECT 2', [], { tables: null, why: 'editable' })));
    check(editable.length === 3 && c.stats().shared >= 4, 'an editable source still shares a run in progress');

    const bad = fakeDb(); bad.delay = 20; bad.fail = 'boom'; const cb = createResultCache({ mode: 'on' });
    const errs = await Promise.all([1, 2, 3].map(() => cb.cachedQuery(bad, SQL, [1], { tables: ROADS }).then(() => null, e => e.message)));
    check(errs.every(m => m === 'boom'), 'a failed query fails every waiter', errs);
    bad.fail = null;
    check((await cb.cachedQuery(bad, SQL, [1], { tables: ROADS })).rows[0].n === 1 && cb.stats().hits === 0, 'and is not kept');
  }

  { // the probe failing: not cached, the query still answers
    const db = fakeDb(); const c = createResultCache({ mode: 'on' });
    const q = db.query; db.query = (sql, v) => (/pg_stat_all_tables/.test(sql) ? Promise.reject(new Error('no access')) : q(sql, v));
    const r = await c.cachedQuery(db, SQL, [1], { tables: ROADS });
    await c.cachedQuery(db, SQL, [1], { tables: ROADS });
    check(r.rows[0].n === 1 && db.runs === 2 && c.stats().probeErrors === 2, 'unreadable table versions: the query runs uncached');
  }

  { // memory budget
    const db = fakeDb(); db.answer = (sql, v) => [{ v: v[0], pad: 'p'.repeat(1000) }];
    const c = createResultCache({ mode: 'on', maxChars: 5000 });
    for (let i = 0; i < 10; i++) await c.cachedQuery(db, SQL, [i], { tables: ROADS });
    const st = c.stats();
    check(st.chars <= 5000 && st.entries < 10 && st.evictions > 0, 'the budget evicts the least recently used', st);
    const runs = db.runs;
    await c.cachedQuery(db, SQL, [9], { tables: ROADS });
    await c.cachedQuery(db, SQL, [0], { tables: ROADS });
    check(db.runs === runs + 1, 'the newest is still kept, the oldest is gone');
    c.clear();
    check(c.stats().entries === 0, 'clear empties it');
  }

  { // shadow: never serves, counts would-be hits, reports a difference
    const db = fakeDb(); let t = 0; const c = createResultCache({ mode: 'shadow', now: () => t });
    await c.cachedQuery(db, SQL, [1], { tables: ROADS });
    await c.cachedQuery(db, SQL, [1], { tables: ROADS });
    check(db.runs === 2 && c.stats().wouldHits === 1 && c.stats().hits === 0 && c.stats().mismatches === 0, 'shadow: answers from the database and counts the would-be hit', c.stats());
    db.answer = () => [{ n: 2 }];   // the data changed and the counters did not: what shadow mode is for
    const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
    const r = await c.cachedQuery(db, SQL, [1], { tables: ROADS });
    console.warn = warn;
    check(r.rows[0].n === 2 && c.stats().mismatches === 1 && warned === 1, 'shadow: a kept answer that differs from the database is counted and logged');
  }

  { // shadow: last-digit differences of a float sum are not a stale answer
    const db = fakeDb(); const c = createResultCache({ mode: 'shadow' });
    db.answer = () => [{ loss: 114332726963.36789, label: 'x' }];
    await c.cachedQuery(db, SQL, [1], { tables: ROADS });
    db.answer = () => [{ loss: 114332726963.3679, label: 'x' }];
    await c.cachedQuery(db, SQL, [1], { tables: ROADS });
    check(c.stats().floatNoise === 1 && c.stats().mismatches === 0, 'shadow: a float sum differing in its last digits is noise, not a mismatch', c.stats());
    db.answer = () => [{ loss: 2296382687.05 }];
    await c.cachedQuery(db, 'SELECT 2', [], { tables: ROADS });
    db.answer = () => [{ loss: 2296382687.0499997 }];
    await c.cachedQuery(db, 'SELECT 2', [], { tables: ROADS });
    check(c.stats().floatNoise === 2 && c.stats().mismatches === 0, 'also across a rounding boundary');
    db.answer = () => [{ geoid: '01107' }];
    await c.cachedQuery(db, 'SELECT geoid FROM gis.roads LIMIT 1', [], { tables: ROADS });
    db.answer = () => [{ geoid: '08' }];
    await c.cachedQuery(db, 'SELECT geoid FROM gis.roads LIMIT 1', [], { tables: ROADS });
    check(c.stats().unordered === 1 && c.stats().mismatches === 0, 'shadow: a LIMIT with no ORDER BY giving other rows is not a mismatch');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
