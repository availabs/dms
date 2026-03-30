#!/usr/bin/env node
'use strict';

const { loadConfig } = require('../db/config');
const { SqliteAdapter } = require('../db/adapters/sqlite');

// ---------------------------------------------------------------------------
// One-time script: delete pages that have a template_id (templated copies)
// along with their child sections and page-edits. Keeps the template source
// pages themselves (template_id = -99 or 'undefined').
//
// Also updates parent pages' sections/draft_sections refs to remove
// references to deleted sections.
// ---------------------------------------------------------------------------

const TEMPLATE_SOURCE_VALUES = ['-99', 'undefined'];

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { source: null, apply: false, types: null };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source': opts.source = args[++i]; break;
      case '--apply': opts.apply = true; break;
      case '--types': opts.types = args[++i].split(','); break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }
  if (!opts.source) {
    console.error('Usage: node delete-templated-pages.js --source <config> [--types shmp,design] [--apply]');
    process.exit(1);
  }
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

  console.log(`Delete Templated Pages`);
  console.log(`  Source: ${opts.source}`);
  console.log(`  Mode: ${opts.apply ? 'APPLY (will delete rows)' : 'DRY RUN (no changes)'}`);

  // Find all page types that have templated rows
  const typeFilter = opts.types
    ? `AND type IN (${opts.types.map(() => '?').join(',')})`
    : '';
  const typeParams = opts.types || [];

  const pageTypes = rawDb.prepare(`
    SELECT type, COUNT(*) as count
    FROM data_items
    WHERE json_extract(data, '$.template_id') IS NOT NULL
      AND json_extract(data, '$.template_id') NOT IN ('-99', 'undefined')
      ${typeFilter}
    GROUP BY type
    ORDER BY count DESC
  `).all(...typeParams);

  if (pageTypes.length === 0) {
    console.log('\n  No templated pages found.');
    rawDb.close();
    return;
  }

  console.log(`\n  Page types with templated rows:\n`);

  let totalPages = 0;
  let totalSections = 0;
  let totalPageEdits = 0;

  for (const { type, count } of pageTypes) {
    const sectionCount = rawDb.prepare(`
      SELECT COUNT(*) as cnt FROM data_items WHERE type = ?
    `).get(`${type}|cms-section`).cnt;

    const pageEditCount = rawDb.prepare(`
      SELECT COUNT(*) as cnt FROM data_items WHERE type = ?
    `).get(`${type}|page-edit`).cnt;

    // Count sections belonging to templated pages specifically
    const templatedPageIds = rawDb.prepare(`
      SELECT CAST(id AS TEXT) as pid FROM data_items
      WHERE type = ? AND json_extract(data, '$.template_id') IS NOT NULL
        AND json_extract(data, '$.template_id') NOT IN ('-99', 'undefined')
    `).all(type).map(r => r.pid);

    const idSet = new Set(templatedPageIds);

    // Count sections whose parent.id is a templated page
    const allSections = rawDb.prepare(`
      SELECT json_extract(data, '$.parent.id') as parent_id FROM data_items
      WHERE type = ?
    `).all(`${type}|cms-section`);

    const templatedSectionCount = allSections.filter(r => idSet.has(r.parent_id)).length;

    // Count page-edits whose parent is a templated page
    const allPageEdits = rawDb.prepare(`
      SELECT json_extract(data, '$.parent.id') as parent_id FROM data_items
      WHERE type = ?
    `).all(`${type}|page-edit`);

    const templatedPageEditCount = allPageEdits.filter(r => idSet.has(r.parent_id)).length;

    console.log(`  ${type}:`);
    console.log(`    Pages to delete: ${count} (of ${count + rawDb.prepare('SELECT COUNT(*) as cnt FROM data_items WHERE type = ? AND (json_extract(data, \'$.template_id\') IS NULL OR json_extract(data, \'$.template_id\') IN (\'-99\', \'undefined\'))').get(type).cnt} total)`);
    console.log(`    Sections to delete: ${templatedSectionCount} (of ${sectionCount} total)`);
    console.log(`    Page-edits to delete: ${templatedPageEditCount} (of ${pageEditCount} total)`);

    totalPages += count;
    totalSections += templatedSectionCount;
    totalPageEdits += templatedPageEditCount;
  }

  const totalRows = totalPages + totalSections + totalPageEdits;
  console.log(`\n  Total rows to delete: ${totalRows} (${totalPages} pages, ${totalSections} sections, ${totalPageEdits} page-edits)`);

  if (!opts.apply) {
    console.log('\n  Dry run complete. Use --apply to execute deletions.');
    rawDb.close();
    return;
  }

  console.log('\n  Deleting...');
  rawDb.pragma('journal_mode = WAL');

  let deletedTotal = 0;

  for (const { type } of pageTypes) {
    // Collect templated page IDs
    const templatedPageIds = rawDb.prepare(`
      SELECT CAST(id AS TEXT) as pid FROM data_items
      WHERE type = ? AND json_extract(data, '$.template_id') IS NOT NULL
        AND json_extract(data, '$.template_id') NOT IN ('-99', 'undefined')
    `).all(type).map(r => r.pid);

    const idSet = new Set(templatedPageIds);

    // Find section IDs to delete (parent.id matches a templated page)
    const sectionIds = rawDb.prepare(`
      SELECT id, json_extract(data, '$.parent.id') as parent_id FROM data_items
      WHERE type = ?
    `).all(`${type}|cms-section`)
      .filter(r => idSet.has(r.parent_id))
      .map(r => r.id);

    // Find page-edit IDs to delete
    const pageEditIds = rawDb.prepare(`
      SELECT id, json_extract(data, '$.parent.id') as parent_id FROM data_items
      WHERE type = ?
    `).all(`${type}|page-edit`)
      .filter(r => idSet.has(r.parent_id))
      .map(r => r.id);

    // Delete in batches (SQLite has a variable limit)
    const batchDelete = (ids, label) => {
      let deleted = 0;
      const BATCH = 500;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const ph = batch.map(() => '?').join(',');
        const result = rawDb.prepare(`DELETE FROM data_items WHERE id IN (${ph})`).run(...batch);
        deleted += result.changes;
      }
      if (deleted > 0) console.log(`    Deleted ${deleted} ${label}`);
      return deleted;
    };

    console.log(`  ${type}:`);
    deletedTotal += batchDelete(sectionIds, 'sections');
    deletedTotal += batchDelete(pageEditIds, 'page-edits');

    // Delete the templated pages themselves
    const pageIdsNum = templatedPageIds.map(Number);
    deletedTotal += batchDelete(pageIdsNum, 'pages');
  }

  console.log(`\n  Done. ${deletedTotal} rows deleted.`);
  console.log(`  Run VACUUM to reclaim disk space.`);

  rawDb.close();
}

try { main(); } catch(err) { console.error(err); process.exit(1); }
