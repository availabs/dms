/**
 * ClickHouse tile/colorDomain join unit tests (tile-join-clickhouse-source.md).
 *
 * Pure SQL-string tests — no live ClickHouse or PostgreSQL connection (idiom
 * from test-uda.js's stubbed-db CH tests). Covers:
 *   - buildSimpleFilterSqlCH: build-only twin of the PG builder (no LIMIT
 *     without indices; CH inlines values so no `values` array)
 *   - simpleFilter single-arm delegation: live queries run EXACTLY the
 *     builder's SQL text
 *   - injectJoinKeys: a tile's key list becomes one more filterGroups leaf,
 *     preserving the prior tree's own AND/OR op by nesting
 *   - chTypeToPg / chResultToRecordset: CH result meta → typed
 *     jsonb_to_recordset column definitions (+ col_N alias restore)
 */

const {
  simpleFilter,
  buildSimpleFilterSqlCH,
  chTypeToPg,
  chResultToRecordset,
} = require('../src/routes/uda/query_sets/clickhouse');
const { injectJoinKeys, MAX_CH_JOIN_TILE_KEYS } = require('../src/dama/tiles/tiles.rest');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

const CTX = { table_schema: 'npmrds', table_name: 'npmrds' };

const JOIN_OPTIONS = {
  filterGroups: {
    op: 'AND',
    groups: [
      { col: 'date', op: 'gte', value: ['2019-10-01'] },
      { col: 'date', op: 'lte', value: ['2019-10-31'] },
    ],
  },
  groupBy: ['tmc'],
};

const JOIN_ATTRIBUTES = ['tmc', 'avg(speed) as speed'];

async function run() {
  console.log('\n--- buildSimpleFilterSqlCH (build-only twin) ---');

  await test('no LIMIT/OFFSET when indices are omitted (join-subquery contract)', async () => {
    const { sql } = await buildSimpleFilterSqlCH(CTX, JSON.stringify(JOIN_OPTIONS), JOIN_ATTRIBUTES);
    assert(sql, 'expected sql to be built');
    assert(!/\bLIMIT\b/i.test(sql), `no LIMIT expected, got: ${sql}`);
    assert(!/\bOFFSET\b/i.test(sql), `no OFFSET expected, got: ${sql}`);
  });

  await test('filterGroups leaves render (IN list / comparison) with explicit aliases + GROUP BY', async () => {
    const options = JSON.stringify({
      ...JOIN_OPTIONS,
      filterGroups: {
        op: 'AND',
        groups: [
          { col: 'tmc', op: 'filter', value: ['120-11332', '120-11333'] },
          { col: 'date', op: 'gte', value: ['2019-10-01'] },
        ],
      },
    });
    const { sql } = await buildSimpleFilterSqlCH(CTX, options, JOIN_ATTRIBUTES);
    assert(sql.includes(`tmc IN ('120-11332', '120-11333')`), `IN list expected, got: ${sql}`);
    assert(sql.includes(`date >= '2019-10-01'`), `gte comparison expected, got: ${sql}`);
    assert(sql.includes('tmc as tmc'), `explicit self-alias expected, got: ${sql}`);
    assert(sql.includes('avg(speed) as speed'), `aggregate alias preserved, got: ${sql}`);
    assert(/GROUP BY tmc/.test(sql), `GROUP BY expected, got: ${sql}`);
    assert(sql.includes('FROM npmrds.npmrds'), `table ref expected, got: ${sql}`);
  });

  await test('indices produce LIMIT/OFFSET (paginated-caller parity)', async () => {
    const { sql } = await buildSimpleFilterSqlCH(
      CTX, JSON.stringify(JOIN_OPTIONS), JOIN_ATTRIBUTES, { from: 0, to: 9 });
    assert(/LIMIT 10/.test(sql), `LIMIT 10 expected, got: ${sql}`);
    assert(/OFFSET 0/.test(sql), `OFFSET 0 expected, got: ${sql}`);
  });

  await test('empty attributes → { sql: null }', async () => {
    const { sql, columnNameMap } = await buildSimpleFilterSqlCH(CTX, JSON.stringify(JOIN_OPTIONS), []);
    assert(sql === null, 'sql should be null');
    assert(Object.keys(columnNameMap).length === 0, 'columnNameMap should be empty');
  });

  await test('simpleFilter single-arm path runs EXACTLY the builder SQL (delegation regression)', async () => {
    let capturedSql = null;
    const fakeDb = {
      query: async ({ query }) => {
        capturedSql = query;
        return { json: async () => ({ data: [] }) };
      },
    };
    const indices = { from: 0, to: 49 };
    await simpleFilter({ ...CTX, db: fakeDb }, JSON.stringify(JOIN_OPTIONS), JOIN_ATTRIBUTES, indices);
    const { sql } = await buildSimpleFilterSqlCH(CTX, JSON.stringify(JOIN_OPTIONS), JOIN_ATTRIBUTES, indices);
    assert(capturedSql === sql,
      `simpleFilter must execute the builder's exact text.\n  ran: ${capturedSql}\n  built: ${sql}`);
  });

  console.log('\n--- injectJoinKeys (options-level tile-key narrowing) ---');

  await test('empty options → single keys leaf under an and-root', async () => {
    const injected = injectJoinKeys({}, 'tmc', ['a', 'b']);
    assert(injected.filterGroups.op === 'and', 'root op should be and');
    assert(injected.filterGroups.groups.length === 1, 'one leaf expected');
    const leaf = injected.filterGroups.groups[0];
    assert(leaf.col === 'tmc' && leaf.op === 'filter' && leaf.value.join() === 'a,b',
      `keys leaf malformed: ${JSON.stringify(leaf)}`);
  });

  await test('prior tree is nested as a child group — its own op is preserved', async () => {
    const prior = {
      op: 'OR',
      groups: [
        { col: 'date', op: 'gte', value: ['2019-10-01'] },
        { col: 'date', op: 'lte', value: ['2018-01-31'] },
      ],
    };
    const injected = injectJoinKeys({ filterGroups: prior, groupBy: ['tmc'] }, 'tmc', ['a']);
    assert(injected.groupBy.join() === 'tmc', 'other option keys carried through');
    assert(injected.filterGroups.op === 'and', 'root op should be and');
    assert(injected.filterGroups.groups.length === 2, 'prior tree + keys leaf');
    assert(injected.filterGroups.groups[0].op === 'OR', 'prior tree op preserved by nesting');
    assert(injected.filterGroups.groups[1].col === 'tmc', 'keys leaf appended last');
  });

  await test('injected options build to (prior OR-tree) AND keys-IN-list', async () => {
    const prior = {
      op: 'OR',
      groups: [
        { col: 'date', op: 'gte', value: ['2019-10-01'] },
        { col: 'date', op: 'lte', value: ['2018-01-31'] },
      ],
    };
    const injected = injectJoinKeys({ filterGroups: prior, groupBy: ['tmc'] }, 'tmc', ['a', 'b']);
    const { sql } = await buildSimpleFilterSqlCH(CTX, JSON.stringify(injected), JOIN_ATTRIBUTES);
    const normalized = sql.replace(/\s+/g, ' ');
    assert(
      normalized.includes(`((date >= '2019-10-01' OR date <= '2018-01-31') AND tmc IN ('a', 'b'))`),
      `expected the prior OR-tree ANDed with the keys list, got: ${normalized}`);
  });

  await test('key cap constant is the scoped 20k', async () => {
    assert(MAX_CH_JOIN_TILE_KEYS === 20000, `expected 20000, got ${MAX_CH_JOIN_TILE_KEYS}`);
  });

  console.log('\n--- chTypeToPg (CH result meta → recordset column types) ---');

  await test('numeric fidelity + wrapper unwrapping', async () => {
    assert(chTypeToPg('Float64') === 'double precision', 'Float64');
    assert(chTypeToPg('Nullable(Float64)') === 'double precision', 'Nullable(Float64)');
    assert(chTypeToPg('Float32') === 'double precision', 'Float32');
    assert(chTypeToPg('UInt64') === 'bigint', 'UInt64');
    assert(chTypeToPg('Int32') === 'bigint', 'Int32');
    assert(chTypeToPg('Nullable(UInt8)') === 'bigint', 'Nullable(UInt8)');
    assert(chTypeToPg('Decimal(18, 4)') === 'numeric', 'Decimal');
    assert(chTypeToPg('Bool') === 'boolean', 'Bool');
  });

  await test('strings/dates/unknowns → text (always a safe recordset target)', async () => {
    assert(chTypeToPg('String') === 'text', 'String');
    assert(chTypeToPg('LowCardinality(String)') === 'text', 'LowCardinality(String)');
    assert(chTypeToPg('Nullable(LowCardinality(String))') === 'text', 'nested wrappers');
    assert(chTypeToPg('FixedString(9)') === 'text', 'FixedString');
    assert(chTypeToPg('Date') === 'text', 'Date');
    assert(chTypeToPg("DateTime('UTC')") === 'text', 'DateTime');
    assert(chTypeToPg('SomeFutureType') === 'text', 'unknown');
    assert(chTypeToPg(undefined) === 'text', 'undefined');
  });

  console.log('\n--- chResultToRecordset (CH JSON result → jsonb_to_recordset pieces) ---');

  await test('typed column defs + rows JSON from a plain result', async () => {
    const chJson = {
      meta: [
        { name: 'tmc', type: 'LowCardinality(String)' },
        { name: 'speed', type: 'Nullable(Float64)' },
        { name: 'cnt', type: 'UInt64' },
      ],
      data: [
        { tmc: '120-11332', speed: 42.1, cnt: '288' },
        { tmc: '120-11333', speed: null, cnt: '0' },
      ],
    };
    const { columnDefs, rowsJson } = chResultToRecordset(chJson);
    assert(columnDefs === '"tmc" text, "speed" double precision, "cnt" bigint',
      `columnDefs mismatch: ${columnDefs}`);
    const rows = JSON.parse(rowsJson);
    assert(rows.length === 2 && rows[0].tmc === '120-11332' && rows[1].speed === null,
      `rows round-trip failed: ${rowsJson}`);
  });

  await test('col_N shortened aliases restored in both column defs and rows', async () => {
    const longName = 'x'.repeat(65);
    const columnNameMap = { [`avg(speed) as ${longName}`]: 'avg(speed) as col_0' };
    const chJson = {
      meta: [{ name: 'col_0', type: 'Float64' }],
      data: [{ col_0: 12.5 }],
    };
    const { columnDefs, rowsJson } = chResultToRecordset(chJson, columnNameMap);
    assert(columnDefs === `"${longName}" double precision`, `columnDefs mismatch: ${columnDefs}`);
    const rows = JSON.parse(rowsJson);
    assert(rows[0][longName] === 12.5, `long-name row key missing: ${rowsJson}`);
  });

  await test('empty result → empty defs (callers fall back before building SQL)', async () => {
    const { columnDefs, rowsJson } = chResultToRecordset({ meta: [], data: [] });
    assert(columnDefs === '', 'empty defs');
    assert(rowsJson === '[]', 'empty rows');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
