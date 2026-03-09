/**
 * Compare Falcor JSON Graph output between PostgreSQL and SQLite backends.
 *
 * Runs identical queries against both databases and highlights:
 *  - Type differences (string vs number for IDs, dates, etc.)
 *  - Shape differences (missing fields, different nesting)
 *  - $ref differences
 *
 * Usage:
 *   node tests/compare-outputs.js
 */

const { createTestGraph } = require('./graph');

// ── Helpers ──────────────────────────────────────────────────────────────────

function deepDiff(a, b, path = '') {
  const diffs = [];

  if (a === b) return diffs;

  // Both null/undefined
  if (a == null && b == null) return diffs;

  // One is null/undefined
  if (a == null || b == null) {
    diffs.push({ path, pg: a, sqlite: b, kind: 'missing' });
    return diffs;
  }

  // Type difference (the main thing we're looking for)
  if (typeof a !== typeof b) {
    diffs.push({ path, pg: a, sqlite: b, pgType: typeof a, sqliteType: typeof b, kind: 'type' });
    return diffs;
  }

  // Both are objects
  if (typeof a === 'object' && typeof b === 'object') {
    // Check for $ref differences
    if (a.$type === 'ref' || b.$type === 'ref') {
      const aVal = JSON.stringify(a);
      const bVal = JSON.stringify(b);
      if (aVal !== bVal) {
        diffs.push({ path, pg: a, sqlite: b, kind: '$ref' });
      }
      return diffs;
    }

    // Check for $atom differences
    if (a.$type === 'atom' || b.$type === 'atom') {
      const aVal = JSON.stringify(a);
      const bVal = JSON.stringify(b);
      if (aVal !== bVal) {
        // Recurse into the value if both are atoms
        if (a.$type === 'atom' && b.$type === 'atom') {
          diffs.push(...deepDiff(a.value, b.value, path + '.$atom.value'));
        } else {
          diffs.push({ path, pg: a, sqlite: b, kind: '$atom' });
        }
      }
      return diffs;
    }

    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of allKeys) {
      if (!(key in a)) {
        diffs.push({ path: path ? `${path}.${key}` : key, pg: undefined, sqlite: b[key], kind: 'missing-in-pg' });
      } else if (!(key in b)) {
        diffs.push({ path: path ? `${path}.${key}` : key, pg: a[key], sqlite: undefined, kind: 'missing-in-sqlite' });
      } else {
        diffs.push(...deepDiff(a[key], b[key], path ? `${path}.${key}` : key));
      }
    }
    return diffs;
  }

  // Primitive value difference
  if (a !== b) {
    diffs.push({ path, pg: a, sqlite: b, kind: 'value' });
  }

  return diffs;
}

function truncate(val, maxLen = 120) {
  const s = typeof val === 'object' ? JSON.stringify(val) : String(val);
  return s.length > maxLen ? s.slice(0, maxLen) + '...' : s;
}

function printDiffs(diffs) {
  if (diffs.length === 0) {
    console.log('  (no differences)');
    return;
  }
  for (const d of diffs) {
    const label = d.kind === 'type'
      ? `TYPE DIFF [pg: ${d.pgType}, sqlite: ${d.sqliteType}]`
      : d.kind === '$ref'
        ? '$REF DIFF'
        : d.kind === '$atom'
          ? '$ATOM DIFF'
          : d.kind.toUpperCase();
    console.log(`  ${label} at "${d.path}"`);
    console.log(`    pg:     ${truncate(d.pg)}`);
    console.log(`    sqlite: ${truncate(d.sqlite)}`);
  }
}

// ── Queries ──────────────────────────────────────────────────────────────────

const APP_TYPE = 'mitigat-ny-prod+prod';
const APP = 'mitigat-ny-prod';
const BYID_IDS = [1674053];

const queries = [
  {
    name: 'length',
    paths: [['dms', 'data', APP_TYPE, 'length']],
  },
  {
    name: 'byIndex[0] — first item',
    paths: [['dms', 'data', APP_TYPE, 'byIndex', 0, ['id', 'app', 'type', 'data']]],
  },
  {
    name: `byId[${BYID_IDS}] — specific item`,
    paths: [['dms', 'data', APP, 'byId', BYID_IDS, ['id', 'app', 'type', 'data', 'created_at', 'updated_at']]],
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Creating test graphs...');
  const pgGraph = createTestGraph('dms-mercury');
  const sqliteGraph = createTestGraph('dms-mitigateny-sqlite');
  console.log(`  pg dbType:     ${pgGraph.dbType}`);
  console.log(`  sqlite dbType: ${sqliteGraph.dbType}`);
  console.log();

  for (const q of queries) {
    console.log('═'.repeat(80));
    console.log(`QUERY: ${q.name}`);
    console.log(`  paths: ${JSON.stringify(q.paths)}`);
    console.log('─'.repeat(80));

    let pgResult, sqliteResult;
    let pgError, sqliteError;

    try {
      pgResult = await pgGraph.getAsync(q.paths);
    } catch (e) {
      pgError = e;
    }

    try {
      sqliteResult = await sqliteGraph.getAsync(q.paths);
    } catch (e) {
      sqliteError = e;
    }

    if (pgError || sqliteError) {
      if (pgError) console.log(`  PG ERROR: ${pgError.message || pgError}`);
      if (sqliteError) console.log(`  SQLITE ERROR: ${sqliteError.message || sqliteError}`);
      console.log();
      continue;
    }

    // Print full JSON
    console.log('\nPG result:');
    console.log(JSON.stringify(pgResult.jsonGraph, null, 2));
    console.log('\nSQLite result:');
    console.log(JSON.stringify(sqliteResult.jsonGraph, null, 2));

    // Compute and print diffs
    console.log('\nDIFFERENCES:');
    const diffs = deepDiff(pgResult.jsonGraph, sqliteResult.jsonGraph);
    printDiffs(diffs);
    console.log();
  }

  // ── Summary: focus on id types ─────────────────────────────────────────────
  console.log('═'.repeat(80));
  console.log('SUMMARY: ID Type Analysis');
  console.log('─'.repeat(80));

  // Get a few items and check id types
  try {
    const pgItems = await pgGraph.getAsync([['dms', 'data', APP_TYPE, 'byIndex', { from: 0, to: 2 }, ['id', 'app', 'type']]]);
    const sqliteItems = await sqliteGraph.getAsync([['dms', 'data', APP_TYPE, 'byIndex', { from: 0, to: 2 }, ['id', 'app', 'type']]]);

    const pgById = pgItems.jsonGraph?.dms?.data?.byId || {};
    const sqliteById = sqliteItems.jsonGraph?.dms?.data?.byId || {};

    console.log('\nPG byId keys and id field types:');
    for (const [key, val] of Object.entries(pgById)) {
      const id = val?.id;
      console.log(`  key="${key}" (${typeof key}), id=${JSON.stringify(id)} (type: ${typeof id})`);
    }

    console.log('\nSQLite byId keys and id field types:');
    for (const [key, val] of Object.entries(sqliteById)) {
      const id = val?.id;
      console.log(`  key="${key}" (${typeof key}), id=${JSON.stringify(id)} (type: ${typeof id})`);
    }

    // Check $ref values in byIndex
    const pgByIndex = pgItems.jsonGraph?.dms?.data?.[APP_TYPE]?.byIndex || {};
    const sqliteByIndex = sqliteItems.jsonGraph?.dms?.data?.[APP_TYPE]?.byIndex || {};

    console.log('\nPG $ref values in byIndex:');
    for (const [idx, ref] of Object.entries(pgByIndex)) {
      console.log(`  [${idx}] = ${JSON.stringify(ref)}`);
    }

    console.log('\nSQLite $ref values in byIndex:');
    for (const [idx, ref] of Object.entries(sqliteByIndex)) {
      console.log(`  [${idx}] = ${JSON.stringify(ref)}`);
    }
  } catch (e) {
    console.log(`  Error in summary: ${e.message || e}`);
  }

  // ── data column: parsed vs raw string ──────────────────────────────────────
  console.log('\n' + '═'.repeat(80));
  console.log('SUMMARY: data column type (parsed object vs raw string)');
  console.log('─'.repeat(80));

  try {
    const pgItem = await pgGraph.getAsync([['dms', 'data', APP, 'byId', BYID_IDS, ['id', 'data']]]);
    const sqliteItem = await sqliteGraph.getAsync([['dms', 'data', APP, 'byId', BYID_IDS, ['id', 'data']]]);

    for (const id of BYID_IDS) {
      const pgData = pgItem.jsonGraph?.dms?.data?.byId?.[id]?.data;
      const sqliteData = sqliteItem.jsonGraph?.dms?.data?.byId?.[id]?.data;
      console.log(`\n  ID ${id}:`);
      console.log(`    pg    data type:     ${typeof pgData}  (is $atom: ${pgData?.$type === 'atom'})`);
      console.log(`    sqlite data type:    ${typeof sqliteData}  (is $atom: ${sqliteData?.$type === 'atom'})`);
      if (pgData?.$type === 'atom') {
        console.log(`    pg    data.value type: ${typeof pgData.value}`);
      }
      if (sqliteData?.$type === 'atom') {
        console.log(`    sqlite data.value type: ${typeof sqliteData.value}`);
      }
    }
  } catch (e) {
    console.log(`  Error: ${e.message || e}`);
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
