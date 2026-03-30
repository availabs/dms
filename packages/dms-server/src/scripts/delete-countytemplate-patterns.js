#!/usr/bin/env node
'use strict';

const { loadConfig } = require('../db/config');
const { SqliteAdapter } = require('../db/adapters/sqlite');

// ---------------------------------------------------------------------------
// One-time script: delete 5 deprecated countytemplate patterns and all
// their child data (pages, cms-sections, countytemplate rows, page-edits).
// Also removes the pattern refs from the site's patterns array.
// ---------------------------------------------------------------------------

const PATTERN_IDS = [1266142, 1297621, 1376019, 1393430, 1411304];

const DOC_TYPES = [
  'e34eb6ae-f184-4ab7-95b3-a665a2b36a64',
  '07a227f6-e4a9-4c13-a89f-065d919bc5cd',
  '1ba7782b-b9b8-4369-8caf-6e13561413bd',
  'a2333ef8-b5dd-4715-a215-1ee562acbe4b',
  '0fd38049-fd07-4b56-aeae-1fbc3d745e41',
];

const SITE_ID = 566430;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { source: null, apply: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source': opts.source = args[++i]; break;
      case '--apply': opts.apply = true; break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }
  if (!opts.source) { console.error('Usage: node delete-countytemplate-patterns.js --source <config> [--apply]'); process.exit(1); }
  return opts;
}

function main() {
  const opts = parseArgs();
  const config = loadConfig(opts.source);
  if (config.type !== 'sqlite') {
    console.error('This script only supports SQLite databases.');
    process.exit(1);
  }

  const db = new SqliteAdapter(config);
  const rawDb = db.getPool();

  console.log(`Delete Countytemplate Patterns`);
  console.log(`  Source: ${opts.source}`);
  console.log(`  Mode: ${opts.apply ? 'APPLY (will delete rows)' : 'DRY RUN (no changes)'}\n`);

  // Count rows to be deleted
  let totalRows = 0;

  for (const suffix of ['', '|cms-section', '|countytemplate', '|page-edit']) {
    const types = DOC_TYPES.map(d => d + suffix);
    const ph = types.map(() => '?').join(',');
    const row = rawDb.prepare(`SELECT COUNT(*) as cnt FROM data_items WHERE type IN (${ph})`).get(...types);
    const label = suffix || 'pages';
    totalRows += row.cnt;
    console.log(`  ${label}: ${row.cnt} rows`);
  }

  // Count patterns
  const patPh = PATTERN_IDS.map(() => '?').join(',');
  const patRow = rawDb.prepare(`SELECT COUNT(*) as cnt FROM data_items WHERE id IN (${patPh})`).get(...PATTERN_IDS);
  totalRows += patRow.cnt;
  console.log(`  patterns: ${patRow.cnt} rows`);

  console.log(`\n  Total rows to delete: ${totalRows}`);

  if (!opts.apply) {
    console.log('\n  Dry run complete. Use --apply to execute deletions.');
    rawDb.close();
    return;
  }

  console.log('\n  Deleting...');

  rawDb.pragma('journal_mode = WAL');
  const trx = rawDb.transaction(() => {
    let deleted = 0;

    // Delete child rows first (countytemplate, cms-section, page-edit), then pages, then patterns
    for (const suffix of ['|countytemplate', '|cms-section', '|page-edit', '']) {
      const types = DOC_TYPES.map(d => d + suffix);
      const ph = types.map(() => '?').join(',');
      const result = rawDb.prepare(`DELETE FROM data_items WHERE type IN (${ph})`).run(...types);
      const label = suffix || 'pages';
      console.log(`    Deleted ${result.changes} ${label} rows`);
      deleted += result.changes;
    }

    // Delete the 5 pattern rows
    const patResult = rawDb.prepare(`DELETE FROM data_items WHERE id IN (${patPh})`).run(...PATTERN_IDS);
    console.log(`    Deleted ${patResult.changes} pattern rows`);
    deleted += patResult.changes;

    // Remove pattern refs from the site's patterns array
    const siteRow = rawDb.prepare(`SELECT data FROM data_items WHERE id = ?`).get(SITE_ID);
    if (siteRow) {
      const siteData = JSON.parse(siteRow.data);
      const before = siteData.patterns?.length || 0;
      const removeSet = new Set(PATTERN_IDS.map(String));
      siteData.patterns = (siteData.patterns || []).filter(p => {
        const pid = String(p.id || p);
        return !removeSet.has(pid);
      });
      const after = siteData.patterns.length;
      rawDb.prepare(`UPDATE data_items SET data = ? WHERE id = ?`).run(JSON.stringify(siteData), SITE_ID);
      console.log(`    Removed ${before - after} pattern refs from site ${SITE_ID} (${before} → ${after})`);
    }

    return deleted;
  });

  const deleted = trx();
  console.log(`\n  Done. ${deleted} rows deleted.`);
  console.log(`  Run VACUUM to reclaim disk space.`);

  rawDb.close();
}

try { main(); } catch(err) { console.error(err); process.exit(1); }
