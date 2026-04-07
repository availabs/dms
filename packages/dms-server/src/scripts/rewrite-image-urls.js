#!/usr/bin/env node
'use strict';

/**
 * rewrite-image-urls.js — Update image src URLs in lexical content across a DMS database.
 *
 * Finds all lexical image nodes (type: "image") and rewrites their src URLs.
 * Matches images whose src starts with "/" or with a specified --match-url prefix,
 * and prepends/replaces with the --new-url base.
 *
 * Lexical content is stored as escaped JSON strings inside the JSONB data column,
 * so the script does text-level regex replacement on data::text.
 *
 * Usage:
 *   node rewrite-image-urls.js --source <db-config> --new-url https://site.com [options]
 *
 * Options:
 *   --source <config>     Database config name (required)
 *   --new-url <url>       New base URL to prepend/replace (required)
 *   --match-url <url>     Also match src starting with this URL prefix (repeatable)
 *   --app <app>           Limit to a specific app
 *   --schema <schema>     Limit to a specific PG schema (e.g., dms_mitigat_ny_prod)
 *   --apply               Actually write changes (default: dry run)
 *   --help                Show this help
 *
 * Examples:
 *   # Dry run — see what would change
 *   node rewrite-image-urls.js --source dms-mercury-3 --new-url https://mitigateny.org
 *
 *   # Replace an old domain and slash-relative paths, limit to one schema
 *   node rewrite-image-urls.js --source dms-mercury-3 --new-url https://mitigateny.org \
 *     --match-url https://old-site.com --schema dms_mitigat_ny_prod --apply
 */

const { loadConfig } = require('../db/config');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { PostgresAdapter } = require('../db/adapters/postgres');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    source: null, newUrl: null, matchUrls: [],
    app: null, schema: null, apply: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source': opts.source = args[++i]; break;
      case '--new-url': opts.newUrl = args[++i]; break;
      case '--match-url': opts.matchUrls.push(args[++i]); break;
      case '--app': opts.app = args[++i]; break;
      case '--schema': opts.schema = args[++i]; break;
      case '--apply': opts.apply = true; break;
      case '--help':
        console.log(`Usage: node rewrite-image-urls.js --source <config> --new-url <url> [options]

  --source <config>   Database config name (required)
  --new-url <url>     New base URL for images (required)
  --match-url <url>   URL prefix to match and replace (repeatable)
  --app <app>         Limit to a specific app
  --schema <schema>   Limit to a specific PG schema
  --apply             Write changes (default: dry run)
`);
        process.exit(0);
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!opts.source) { console.error('Missing --source <config>'); process.exit(1); }
  if (!opts.newUrl) { console.error('Missing --new-url <url>'); process.exit(1); }
  opts.newUrl = opts.newUrl.replace(/\/+$/, '');
  opts.matchUrls = opts.matchUrls.map(u => u.replace(/\/+$/, ''));
  return opts;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

function createDb(configName) {
  const config = loadConfig(configName);
  if (config.type === 'postgres') return new PostgresAdapter(config);
  if (config.type === 'sqlite') return new SqliteAdapter(config);
  throw new Error(`Unknown database type: ${config.type}`);
}

async function listTables(db, config, schema) {
  if (config.type === 'postgres') {
    let sql, params;
    if (schema) {
      sql = `SELECT schemaname || '.' || tablename AS full_name
             FROM pg_tables
             WHERE schemaname = $1 AND tablename LIKE 'data_items%'
             ORDER BY tablename`;
      params = [schema];
    } else {
      sql = `SELECT schemaname || '.' || tablename AS full_name
             FROM pg_tables
             WHERE schemaname LIKE 'dms_%' AND tablename LIKE 'data_items%'
             ORDER BY schemaname, tablename`;
      params = [];
    }
    const { rows } = await db.query(sql, params);
    return rows.map(r => r.full_name);
  }
  const { rows } = await db.query(
    `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'data_items%' ORDER BY name`
  );
  return rows.map(r => r.name);
}

// ---------------------------------------------------------------------------
// Lexical JSON walker
// ---------------------------------------------------------------------------

/**
 * Recursively walk a parsed object/array, find all lexical image nodes,
 * and rewrite their src. Also handles JSON-string-in-JSON (element-data).
 *
 * Returns { changed, count } where changed is whether any src was modified.
 */
function walkAndRewrite(obj, newUrl, matchUrls) {
  if (obj === null || obj === undefined) return { changed: false, count: 0, rewrites: [] };
  if (typeof obj === 'string') {
    // Could be a nested JSON string (element-data)
    try {
      const parsed = JSON.parse(obj);
      if (typeof parsed === 'object' && parsed !== null) {
        const result = walkAndRewrite(parsed, newUrl, matchUrls);
        if (result.changed) {
          return { changed: true, count: result.count, rewrites: result.rewrites, serialized: JSON.stringify(parsed) };
        }
      }
    } catch { /* not JSON */ }
    return { changed: false, count: 0, rewrites: [] };
  }
  if (Array.isArray(obj)) {
    let totalCount = 0;
    let anyChanged = false;
    const allRewrites = [];
    for (let i = 0; i < obj.length; i++) {
      const result = walkAndRewrite(obj[i], newUrl, matchUrls);
      if (result.changed) {
        anyChanged = true;
        totalCount += result.count;
        allRewrites.push(...result.rewrites);
        if (result.serialized !== undefined) obj[i] = result.serialized;
      }
    }
    return { changed: anyChanged, count: totalCount, rewrites: allRewrites };
  }
  if (typeof obj !== 'object') return { changed: false, count: 0, rewrites: [] };

  let totalCount = 0;
  let anyChanged = false;
  const allRewrites = [];

  // Check if this is a lexical image node
  if (obj.type === 'image' && typeof obj.src === 'string') {
    const oldSrc = obj.src;
    const newSrc = rewriteSrc(oldSrc, newUrl, matchUrls);
    if (newSrc !== oldSrc) {
      obj.src = newSrc;
      anyChanged = true;
      totalCount++;
      allRewrites.push({ before: oldSrc, after: newSrc });
    }
  }

  // Recurse into all values
  for (const key of Object.keys(obj)) {
    const result = walkAndRewrite(obj[key], newUrl, matchUrls);
    if (result.changed) {
      anyChanged = true;
      totalCount += result.count;
      allRewrites.push(...result.rewrites);
      if (result.serialized !== undefined) obj[key] = result.serialized;
    }
  }

  return { changed: anyChanged, count: totalCount, rewrites: allRewrites };
}

/**
 * Rewrite a single src URL.
 * - If src starts with a matchUrl, replace that prefix with newUrl
 * - If src starts with "/", prepend newUrl
 * - Otherwise return unchanged
 */
function rewriteSrc(src, newUrl, matchUrls) {
  for (const mu of matchUrls) {
    if (src.startsWith(mu)) {
      return newUrl + src.slice(mu.length);
    }
  }
  if (src.startsWith('/')) {
    return newUrl + src;
  }
  return src;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();
  const config = loadConfig(opts.source);
  const db = createDb(opts.source);

  console.log(`Database:  ${opts.source} (${config.type})`);
  console.log(`New URL:   ${opts.newUrl}`);
  if (opts.matchUrls.length) console.log(`Match URLs: ${opts.matchUrls.join(', ')}`);
  if (opts.app) console.log(`App filter: ${opts.app}`);
  if (opts.schema) console.log(`Schema:    ${opts.schema}`);
  console.log(`Mode:      ${opts.apply ? 'APPLY' : 'DRY RUN'}\n`);

  const tables = await listTables(db, config, opts.schema);
  console.log(`Scanning ${tables.length} table(s)...\n`);

  let totalRows = 0;
  let totalImages = 0;

  for (const table of tables) {
    // Fetch rows that likely contain image nodes (fast text filter)
    const appFilter = opts.app ? ` AND app = '${opts.app.replace(/'/g, "''")}'` : '';
    const { rows } = await db.query(
      `SELECT id, app, data FROM ${table} WHERE data::text LIKE '%"type":"image"%' OR data::text LIKE '%\\\\\"type\\\\\":\\\\\"image\\\\\"%'${appFilter}`
    );

    if (!rows.length) continue;

    let tableRows = 0;
    let tableImages = 0;

    for (const row of rows) {
      // data is already parsed by the adapter (JSONB → object)
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      const { changed, count, rewrites } = walkAndRewrite(data, opts.newUrl, opts.matchUrls);

      if (!changed) continue;

      tableRows++;
      tableImages += count;

      for (const r of rewrites) {
        console.log(`  [${table}] id=${row.id} app=${row.app}`);
        console.log(`    ${r.before}`);
        console.log(`    → ${r.after}`);
      }

      if (opts.apply) {
        try {
          if (config.type === 'postgres') {
            await db.query(`UPDATE ${table} SET data = $1, updated_at = NOW() WHERE id = $2`, [data, row.id]);
          } else {
            await db.query(`UPDATE ${table} SET data = $1, updated_at = datetime('now') WHERE id = $2`, [data, row.id]);
          }
        } catch (e) {
          console.error(`  ERROR updating ${table} id=${row.id}: ${e.message}`);
        }
      }
    }

    if (tableRows > 0) {
      console.log(`${table}: ${tableRows} row(s), ${tableImages} image(s)\n`);
      totalRows += tableRows;
      totalImages += tableImages;
    }
  }

  console.log(`\nTotal: ${totalRows} row(s), ${totalImages} image(s) ${opts.apply ? 'rewritten' : 'would be rewritten'}.`);
  if (!opts.apply && totalRows > 0) {
    console.log('Run with --apply to write changes.');
  }

  if (db.end) await db.end();
  else if (db.close) await db.close();
  else process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
