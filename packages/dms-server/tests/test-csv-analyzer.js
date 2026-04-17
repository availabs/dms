/**
 * Tests for the ported legacy CSV analyzer and the generateTableDescriptor
 * mapping-by-index fix.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const analyzeSchema = require('../src/dama/upload/analyzeSchema');
const {
  generateTableDescriptor,
  analyzeLayer,
} = require('../src/dama/upload/analysis');
const { parseRowObjectsStream } = require('../src/dama/upload/processors/csv');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}: ${err.message}`);
    failed++;
  }
}

async function* rows(objs) {
  for (const o of objs) yield o;
}

function writeTmpCsv(lines) {
  const p = path.join(os.tmpdir(), `dms-csv-analyzer-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`);
  fs.writeFileSync(p, lines.join('\n'));
  return p;
}

async function runTests() {
  console.log('\n=== CSV Analyzer Tests ===\n');

  // --- analyzeSchema: type ladder ---

  await test('all integers → INT', async () => {
    const { schemaAnalysis } = await analyzeSchema(
      rows([{ a: '1' }, { a: '2' }, { a: '3' }])
    );
    assert(schemaAnalysis[0].summary.db_type === 'INT', `got ${schemaAnalysis[0].summary.db_type}`);
  });

  await test('INT promotes to BIGINT past ±2.1B', async () => {
    const { schemaAnalysis } = await analyzeSchema(
      rows([{ a: '1' }, { a: '3000000000' }])
    );
    assert(schemaAnalysis[0].summary.db_type === 'BIGINT', `got ${schemaAnalysis[0].summary.db_type}`);
  });

  await test('BIGINT overflow → TEXT', async () => {
    const { schemaAnalysis } = await analyzeSchema(
      rows([{ a: '99999999999999999999' }])
    );
    assert(schemaAnalysis[0].summary.db_type === 'TEXT', `got ${schemaAnalysis[0].summary.db_type}`);
  });

  await test('decimal values → DOUBLE PRECISION / NUMERIC by digit count', async () => {
    // Note: REAL is unreachable from a fresh column because the first value
    // always transitions null → INT (via the boolean check), and INT + decimal
    // goes straight to DOUBLE PRECISION. This matches legacy DAMA behavior.
    const r1 = await analyzeSchema(rows([{ a: '1.23' }]));
    assert(r1.schemaAnalysis[0].summary.db_type === 'DOUBLE PRECISION', `short decimal: got ${r1.schemaAnalysis[0].summary.db_type}`);

    const r2 = await analyzeSchema(rows([{ a: '1.234567890' }]));
    assert(r2.schemaAnalysis[0].summary.db_type === 'DOUBLE PRECISION', `medium decimal: got ${r2.schemaAnalysis[0].summary.db_type}`);

    const r3 = await analyzeSchema(rows([{ a: '123456789012345.678' }]));
    assert(r3.schemaAnalysis[0].summary.db_type === 'NUMERIC', `long decimal: got ${r3.schemaAnalysis[0].summary.db_type}`);
  });

  await test('INT + decimal → DOUBLE PRECISION', async () => {
    const { schemaAnalysis } = await analyzeSchema(
      rows([{ a: '1' }, { a: '2.5' }])
    );
    assert(schemaAnalysis[0].summary.db_type === 'DOUBLE PRECISION', `got ${schemaAnalysis[0].summary.db_type}`);
  });

  await test('scientific notation → NUMERIC', async () => {
    const { schemaAnalysis } = await analyzeSchema(
      rows([{ a: '1.5e10' }])
    );
    assert(schemaAnalysis[0].summary.db_type === 'NUMERIC', `got ${schemaAnalysis[0].summary.db_type}`);
  });

  await test('zero-padded "036001" → TEXT (FIPS/GEOID heuristic)', async () => {
    const { schemaAnalysis } = await analyzeSchema(
      rows([{ a: '036001' }, { a: '036002' }])
    );
    assert(schemaAnalysis[0].summary.db_type === 'TEXT', `got ${schemaAnalysis[0].summary.db_type}`);
  });

  await test('plain "0" is NOT considered zero-padded', async () => {
    const { schemaAnalysis } = await analyzeSchema(
      rows([{ a: '0' }, { a: '1' }])
    );
    assert(schemaAnalysis[0].summary.db_type === 'INT', `got ${schemaAnalysis[0].summary.db_type}`);
  });

  await test('GEOID column name regex forces TEXT even with integer values', async () => {
    const { schemaAnalysis } = await analyzeSchema(
      rows([{ county_code: '36' }, { county_code: '37' }])
    );
    assert(schemaAnalysis[0].summary.db_type === 'TEXT', `county_code: got ${schemaAnalysis[0].summary.db_type}`);

    const r2 = await analyzeSchema(rows([{ geoid: '360010001001000' }]));
    assert(r2.schemaAnalysis[0].summary.db_type === 'TEXT', `geoid: got ${r2.schemaAnalysis[0].summary.db_type}`);

    const r3 = await analyzeSchema(rows([{ tract_id: '36001000100' }]));
    assert(r3.schemaAnalysis[0].summary.db_type === 'TEXT', `tract_id: got ${r3.schemaAnalysis[0].summary.db_type}`);
  });

  await test('mixed integer + text → TEXT sink', async () => {
    const { schemaAnalysis } = await analyzeSchema(
      rows([{ a: '1' }, { a: '2' }, { a: 'hello' }])
    );
    assert(schemaAnalysis[0].summary.db_type === 'TEXT', `got ${schemaAnalysis[0].summary.db_type}`);
  });

  await test('null/nonnull counts tracked correctly', async () => {
    const { schemaAnalysis } = await analyzeSchema(
      rows([{ a: '1' }, { a: '' }, { a: null }, { a: '2' }])
    );
    assert(schemaAnalysis[0].summary.nonnull === 2, `nonnull: ${schemaAnalysis[0].summary.nonnull}`);
    assert(schemaAnalysis[0].summary.null === 2, `null: ${schemaAnalysis[0].summary.null}`);
  });

  await test('samples collected per type', async () => {
    const data = [];
    for (let i = 0; i < 50; i++) data.push({ a: String(i) });
    const { schemaAnalysis } = await analyzeSchema(rows(data));
    const samples = schemaAnalysis[0].summary.types.string?.samples || [];
    assert(samples.length > 0 && samples.length <= 10, `expected 1-10 samples, got ${samples.length}`);
  });

  await test('row cap honored', async () => {
    const data = [];
    for (let i = 0; i < 15000; i++) data.push({ a: String(i) });
    const { objectsCount } = await analyzeSchema(rows(data), [], { maxRows: 10000 });
    assert(objectsCount === 10000, `objectsCount: ${objectsCount}`);
  });

  // --- parseRowObjectsStream ---

  await test('parseRowObjectsStream yields row objects keyed by header', async () => {
    const p = writeTmpCsv(['a,b,c', '1,2,3', '4,5,6']);
    const out = [];
    for await (const row of parseRowObjectsStream(p)) out.push(row);
    fs.unlinkSync(p);
    assert(out.length === 2, `row count: ${out.length}`);
    assert(out[0].a === '1' && out[0].b === '2' && out[0].c === '3', 'first row');
    assert(out[1].a === '4' && out[1].b === '5' && out[1].c === '6', 'second row');
  });

  await test('parseRowObjectsStream respects maxRows', async () => {
    const lines = ['a,b'];
    for (let i = 0; i < 100; i++) lines.push(`${i},${i}`);
    const p = writeTmpCsv(lines);
    const out = [];
    for await (const row of parseRowObjectsStream(p, { maxRows: 5 })) out.push(row);
    fs.unlinkSync(p);
    assert(out.length === 5, `row count: ${out.length}`);
  });

  // --- analyzeLayer integration ---

  await test('analyzeLayer on CSV uses legacy analyzer by default', async () => {
    const p = writeTmpCsv([
      'id,name,value,county_code',
      '1,alpha,1.5,36',
      '2,beta,2.5,37',
      '3,gamma,3.5,38',
    ]);
    const result = await analyzeLayer(p, path.basename(p, '.csv'));
    fs.unlinkSync(p);

    const fields = result.layerFieldsAnalysis.schemaAnalysis;
    const byKey = Object.fromEntries(fields.map(f => [f.key, f.summary.db_type]));

    assert(byKey.id === 'INTEGER', `id: ${byKey.id}`);
    assert(byKey.name === 'TEXT', `name: ${byKey.name}`);
    assert(byKey.value === 'REAL' || byKey.value === 'DOUBLE PRECISION', `value: ${byKey.value}`);
    assert(byKey.county_code === 'TEXT', `county_code should be TEXT (GEOID heuristic): ${byKey.county_code}`);
  });

  await test('analyzeLayer preserves leading zeros (zero-padding heuristic)', async () => {
    const p = writeTmpCsv([
      'id,padded_code',
      '1,036001',
      '2,036002',
    ]);
    const result = await analyzeLayer(p, path.basename(p, '.csv'));
    fs.unlinkSync(p);

    const fields = result.layerFieldsAnalysis.schemaAnalysis;
    const byKey = Object.fromEntries(fields.map(f => [f.key, f.summary.db_type]));
    assert(byKey.padded_code === 'TEXT', `padded_code: ${byKey.padded_code}`);
  });

  // --- generateTableDescriptor mapping-by-index regression tests ---

  await test('generateTableDescriptor pairs by INDEX (regression for view 3384)', async () => {
    // Simulates the view-3384 scenario: CSV header is `ttamp80pct`,
    // user renamed it to `ttamp_80_pct` in the analysis UI.
    const layerMeta = {
      layerName: 'regress_3384',
      fieldsMetadata: [
        { name: 'traveltimecode' },  // unchanged
        { name: 'ttamp_80_pct' },    // RENAMED from ttamp80pct
        { name: 'lottramp' },        // unchanged
      ],
    };
    const analysis = {
      layerFieldsAnalysis: {
        schemaAnalysis: [
          { key: 'traveltimecode', summary: { db_type: 'TEXT', nonnull: 3, null: 0 } },
          { key: 'ttamp80pct',     summary: { db_type: 'INTEGER', nonnull: 3, null: 0 } },  // raw CSV name
          { key: 'lottramp',       summary: { db_type: 'REAL', nonnull: 3, null: 0 } },
        ],
      },
      layerGeometriesAnalysis: {},
    };

    const desc = generateTableDescriptor(layerMeta, analysis);
    const byCol = Object.fromEntries(desc.columnTypes.map(c => [c.col, c.db_type]));

    assert(byCol.traveltimecode === 'TEXT', `traveltimecode: ${byCol.traveltimecode}`);
    assert(byCol.ttamp_80_pct === 'INTEGER',
      `ttamp_80_pct should carry INTEGER from ttamp80pct via index match, got ${byCol.ttamp_80_pct}`);
    assert(byCol.lottramp === 'REAL', `lottramp: ${byCol.lottramp}`);
  });

  await test('generateTableDescriptor still name-matches when names align', async () => {
    const layerMeta = {
      layerName: 'name_match',
      fieldsMetadata: [
        { name: 'id' },
        { name: 'value' },
      ],
    };
    const analysis = {
      layerFieldsAnalysis: {
        schemaAnalysis: [
          { key: 'id',    summary: { db_type: 'INTEGER' } },
          { key: 'value', summary: { db_type: 'REAL' } },
        ],
      },
      layerGeometriesAnalysis: {},
    };
    const desc = generateTableDescriptor(layerMeta, analysis);
    assert(desc.columnTypes[0].db_type === 'INTEGER', `id: ${desc.columnTypes[0].db_type}`);
    assert(desc.columnTypes[1].db_type === 'REAL', `value: ${desc.columnTypes[1].db_type}`);
  });

  await test('generateTableDescriptor falls back to name match when lengths differ', async () => {
    // User dropped a column in the UI — metadata is shorter than analysis.
    const layerMeta = {
      layerName: 'drop_col',
      fieldsMetadata: [
        { name: 'id' },
        { name: 'value' },
      ],
    };
    const analysis = {
      layerFieldsAnalysis: {
        schemaAnalysis: [
          { key: 'id',       summary: { db_type: 'INTEGER' } },
          { key: 'skipped',  summary: { db_type: 'TEXT' } },
          { key: 'value',    summary: { db_type: 'REAL' } },
        ],
      },
      layerGeometriesAnalysis: {},
    };
    const desc = generateTableDescriptor(layerMeta, analysis);
    const byCol = Object.fromEntries(desc.columnTypes.map(c => [c.col, c.db_type]));
    assert(byCol.id === 'INTEGER', `id: ${byCol.id}`);
    // Index position 1 is 'skipped' (TEXT), but name match should find 'value' → REAL.
    assert(byCol.value === 'REAL', `value: ${byCol.value}`);
  });

  await test('generateTableDescriptor preserves null/nonnull/samples for UI', async () => {
    const layerMeta = {
      layerName: 'with_samples',
      fieldsMetadata: [{ name: 'amount' }],
    };
    const analysis = {
      layerFieldsAnalysis: {
        schemaAnalysis: [
          {
            key: 'amount',
            summary: {
              db_type: 'INTEGER',
              nonnull: 95,
              null: 5,
              types: { string: { count: 100, samples: ['1', '2', '3'] } },
            },
          },
        ],
      },
      layerGeometriesAnalysis: {},
    };
    const desc = generateTableDescriptor(layerMeta, analysis);
    const col = desc.columnTypes[0];
    assert(col.summary.nonnull === 95, `nonnull: ${col.summary.nonnull}`);
    assert(col.summary.null === 5, `null: ${col.summary.null}`);
    assert(col.summary.types.string.samples.length === 3, 'samples length');
  });

  await test('generateTableDescriptor defaults to TEXT when no analysis entry', async () => {
    const layerMeta = {
      layerName: 'no_analysis',
      fieldsMetadata: [{ name: 'mystery' }],
    };
    const analysis = { layerFieldsAnalysis: { schemaAnalysis: [] }, layerGeometriesAnalysis: {} };
    const desc = generateTableDescriptor(layerMeta, analysis);
    assert(desc.columnTypes[0].db_type === 'TEXT', `got ${desc.columnTypes[0].db_type}`);
  });

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
