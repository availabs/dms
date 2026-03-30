#!/usr/bin/env node
'use strict';

const { loadConfig } = require('../db/config');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { createHash } = require('crypto');
const { mkdirSync, existsSync, writeFileSync } = require('fs');
const { join } = require('path');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    source: null, output: './extracted-images', urlPrefix: '/img/',
    app: null, type: null, dryRun: false, minSize: 0, perApp: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source': opts.source = args[++i]; break;
      case '--output': opts.output = args[++i]; break;
      case '--url-prefix': opts.urlPrefix = args[++i]; break;
      case '--app': opts.app = args[++i]; break;
      case '--type': opts.type = args[++i]; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--min-size': opts.minSize = parseInt(args[++i], 10); break;
      case '--per-app': opts.perApp = true; break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!opts.source) { console.error('Missing --source <config>'); process.exit(1); }
  if (!opts.urlPrefix.endsWith('/')) opts.urlPrefix += '/';

  return opts;
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

function createDb(configName) {
  const config = loadConfig(configName);
  if (config.type === 'postgres') return new PostgresAdapter(config);
  if (config.type === 'sqlite') return new SqliteAdapter(config);
  throw new Error(`Unknown database type: ${config.type}`);
}

// ---------------------------------------------------------------------------
// Image extraction
// ---------------------------------------------------------------------------

const MIME_TO_EXT = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/png': 'png', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/svg+xml': 'svg',
  'image/bmp': 'bmp', 'image/tiff': 'tiff',
  'image/heic': 'heic', 'image/heif': 'heif',
  'image/avif': 'avif',
};

/**
 * Recursively walk a Lexical node tree, calling `visitor` for every image
 * node whose src is a data URI.
 */
function walkImageNodes(node, visitor) {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const child of node) walkImageNodes(child, visitor);
    return;
  }

  if (node.type === 'image' && typeof node.src === 'string' && node.src.startsWith('data:image/')) {
    visitor(node);
  }

  if (node.children) walkImageNodes(node.children, visitor);
  if (node.caption?.editorState?.root) walkImageNodes(node.caption.editorState.root, visitor);
}

/**
 * Parse a data URI, returning { mime, ext, buffer, b64Length }.
 */
function parseDataUri(dataUri) {
  const match = dataUri.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!match) return null;

  const mime = match[1].toLowerCase();
  const b64 = match[2];
  const ext = MIME_TO_EXT[mime] || mime.split('/')[1] || 'bin';
  const buffer = Buffer.from(b64, 'base64');

  return { mime, ext, buffer, b64Length: b64.length };
}

/**
 * Process a single row's data string. Returns { modified, images } where
 * `modified` is the new data string (or null if unchanged) and
 * `images` is an array of extracted image info.
 */
function processRow(id, dataStr, urlPrefix, minSize) {
  let data;
  try {
    data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
  } catch {
    return { modified: null, images: [] };
  }

  const elementData = data?.element?.['element-data'];
  if (!elementData) return { modified: null, images: [] };

  let inner;
  try {
    inner = typeof elementData === 'string' ? JSON.parse(elementData) : elementData;
  } catch {
    return { modified: null, images: [] };
  }

  const images = [];
  let nodeIndex = 0;

  // Extract from Lexical node tree (text sections)
  const root = inner?.text?.root || inner?.root;
  if (root) {
    walkImageNodes(root, (node) => {
      const parsed = parseDataUri(node.src);
      if (!parsed) return;
      if (parsed.buffer.length < minSize) return;

      const hash = createHash('sha256').update(parsed.buffer).digest('hex').slice(0, 12);
      const filename = `${id}_${nodeIndex}_${hash}.${parsed.ext}`;
      const newSrc = `${urlPrefix}${filename}`;

      images.push({
        filename, mime: parsed.mime, ext: parsed.ext,
        buffer: parsed.buffer, decodedBytes: parsed.buffer.length,
        b64Chars: parsed.b64Length, hash, newSrc,
      });

      node.src = newSrc;
      nodeIndex++;
    });
  }

  // Extract from direct img property (map/component sections)
  if (typeof inner.img === 'string' && inner.img.startsWith('data:image/')) {
    const parsed = parseDataUri(inner.img);
    if (parsed && parsed.buffer.length >= minSize) {
      const hash = createHash('sha256').update(parsed.buffer).digest('hex').slice(0, 12);
      const filename = `${id}_${nodeIndex}_${hash}.${parsed.ext}`;
      const newSrc = `${urlPrefix}${filename}`;

      images.push({
        filename, mime: parsed.mime, ext: parsed.ext,
        buffer: parsed.buffer, decodedBytes: parsed.buffer.length,
        b64Chars: parsed.b64Length, hash, newSrc,
      });

      inner.img = newSrc;
      nodeIndex++;
    }
  }

  if (images.length === 0) return { modified: null, images: [] };

  data.element['element-data'] = JSON.stringify(inner);
  const modified = JSON.stringify(data);
  return { modified, images };
}

// ---------------------------------------------------------------------------
// Row iterators — avoid slow LIKE '%data:image%' full-text scan
//
// Instead, scan all candidate rows (filtered by app/type) and check for
// 'data:image' in JS with a fast string includes(). For SQLite we use the
// raw better-sqlite3 iterate() API to avoid the adapter's auto JSON parsing.
// For PostgreSQL we use a server-side cursor with ::TEXT cast.
// ---------------------------------------------------------------------------

/**
 * Collect candidate row IDs from SQLite using raw better-sqlite3 iterate().
 * Returns an array of IDs whose data contains 'data:image'.
 *
 * We can't yield + update in the same loop because better-sqlite3's
 * iterate() holds the connection busy — any write attempt throws
 * "This database connection is busy executing a query".
 */
function collectSqliteCandidateIds(db, app, type) {
  const rawDb = db.getPool();
  const conditions = [];
  const params = [];

  if (app) { conditions.push('app = ?'); params.push(app); }
  if (type) { conditions.push('type LIKE ?'); params.push(type); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const stmt = rawDb.prepare(`SELECT id, data FROM data_items ${where} ORDER BY id`);

  const ids = [];
  for (const row of stmt.iterate(...params)) {
    const dataStr = typeof row.data === 'object' ? JSON.stringify(row.data) : row.data;
    if (dataStr && dataStr.includes('data:image')) {
      ids.push(row.id);
    }
  }
  return ids;
}

/**
 * Read a single row's data as raw text from SQLite.
 */
function readSqliteRow(db, id) {
  const rawDb = db.getPool();
  const row = rawDb.prepare('SELECT data FROM data_items WHERE id = ?').get(id);
  if (!row) return null;
  return typeof row.data === 'object' ? JSON.stringify(row.data) : row.data;
}

/**
 * Iterate PostgreSQL rows using a server-side cursor.
 * Returns an async generator yielding { id, data } strings.
 */
async function* iteratePostgresRows(db, app, type) {
  const client = await db.getConnection();
  const conditions = [];
  const params = [];
  let idx = 1;

  if (app) { conditions.push(`app = $${idx++}`); params.push(app); }
  if (type) { conditions.push(`type LIKE $${idx++}`); params.push(type); }
  conditions.push(`data::TEXT LIKE '%data:image%'`);

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const FETCH_SIZE = 200;

  try {
    await client.query('BEGIN');
    await client.query(
      `DECLARE img_cursor NO SCROLL CURSOR FOR SELECT id, app, data::TEXT AS data FROM dms.data_items ${where} ORDER BY id`,
      params
    );

    while (true) {
      const { rows } = await client.query(`FETCH ${FETCH_SIZE} FROM img_cursor`);
      if (rows.length === 0) break;

      for (const row of rows) {
        yield { id: row.id, app: row.app, data: row.data };
      }
    }

    await client.query('CLOSE img_cursor');
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();
  const startTime = Date.now();

  console.log('DMS Extract Embedded Images');
  console.log(`  Source: ${args.source}`);
  console.log(`  Output: ${args.output}`);
  console.log(`  URL prefix: ${args.urlPrefix}`);
  if (args.app) console.log(`  App filter: ${args.app}`);
  if (args.type) console.log(`  Type filter: ${args.type}`);
  if (args.perApp) console.log(`  Per-app subdirs: yes`);
  if (args.minSize) console.log(`  Min size: ${args.minSize} bytes`);
  if (args.dryRun) console.log(`  Dry run: yes`);
  console.log();

  if (!args.dryRun) {
    console.log('  WARNING: This will modify database rows in-place.');
    console.log('  Make a backup before proceeding (e.g., npm run db:copy).');
    console.log();
  }

  const db = createDb(args.source);
  const table = db.type === 'postgres' ? 'dms.data_items' : 'data_items';

  if (!args.dryRun) {
    mkdirSync(args.output, { recursive: true });
  }

  let rowsScanned = 0;
  let rowsWithImages = 0;
  let totalImages = 0;
  let totalBytesSaved = 0;
  let totalDecodedBytes = 0;
  const filesSeen = new Set();

  const updateStmt = db.type === 'sqlite'
    ? db.getPool().prepare(`UPDATE data_items SET data = ?, updated_at = datetime('now') WHERE id = ?`)
    : null;

  /**
   * Process a single candidate row: extract images, write files, update DB.
   */
  async function handleRow(id, dataStr, rowApp) {
    rowsScanned++;

    const urlPrefix = args.perApp && rowApp
      ? `${args.urlPrefix}${rowApp}/`
      : args.urlPrefix;
    const outputDir = args.perApp && rowApp
      ? join(args.output, rowApp)
      : args.output;

    const { modified, images } = processRow(id, dataStr, urlPrefix, args.minSize);
    if (!modified || images.length === 0) return;

    rowsWithImages++;
    totalImages += images.length;

    for (const img of images) {
      totalDecodedBytes += img.decodedBytes;

      if (!args.dryRun) {
        mkdirSync(outputDir, { recursive: true });
        const filePath = join(outputDir, img.filename);
        if (!existsSync(filePath)) {
          writeFileSync(filePath, img.buffer);
        }
        filesSeen.add(img.hash);
      }
    }

    const savedChars = dataStr.length - modified.length;
    totalBytesSaved += savedChars;

    if (args.dryRun) {
      const mb = (savedChars / 1024 / 1024).toFixed(2);
      console.log(`  id=${id}: ${images.length} image(s), would save ${mb} MB`);
    } else if (db.type === 'postgres') {
      await db.query(
        `UPDATE ${table} SET data = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [modified, id]
      );
    } else {
      updateStmt.run(modified, id);
    }

    if (rowsScanned % 50 === 0) {
      process.stdout.write(`\r  Progress: ${rowsScanned} rows scanned, ${rowsWithImages} with images, ${totalImages} images   `);
    }
  }

  if (db.type === 'sqlite') {
    // Phase 1: collect candidate IDs (iterate() holds connection busy)
    console.log('  Scanning for candidate rows...');
    const candidateIds = collectSqliteCandidateIds(db, args.app, args.type);
    console.log(`  Found ${candidateIds.length} candidate rows\n`);

    // Phase 2: read + process + update one at a time (no open iterator)
    for (const id of candidateIds) {
      const dataStr = readSqliteRow(db, id);
      if (!dataStr) continue;
      await handleRow(id, dataStr, args.app);
    }
  } else {
    // PostgreSQL: stream with server-side cursor
    const rows = iteratePostgresRows(db, args.app, args.type);
    for await (const row of rows) {
      await handleRow(row.id, row.data, row.app);
    }
  }

  if (rowsScanned > 50) process.stdout.write('\n');

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const savedMb = (totalBytesSaved / 1024 / 1024).toFixed(1);
  const imageMb = (totalDecodedBytes / 1024 / 1024).toFixed(1);

  console.log();
  console.log(`Done in ${elapsed}s`);
  console.log(`  Rows scanned: ${rowsScanned}`);
  console.log(`  Rows with images: ${rowsWithImages}`);
  console.log(`  Images extracted: ${totalImages} (${imageMb} MB decoded)`);
  console.log(`  Database size saved: ~${savedMb} MB (base64 text removed)`);
  if (!args.dryRun && totalImages > 0) {
    console.log(`  Files written to: ${args.output}/`);
    console.log();
    console.log(`  Next step: serve extracted images at ${args.urlPrefix}`);
    console.log(`  For dms-server: add static middleware for ${args.output}/`);
    console.log(`  For Netlify: copy ${args.output}/ into the build output`);
  }

  await db.end();
}

if (require.main === module) {
  main().catch(err => {
    console.error(`\nFatal: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { processRow, walkImageNodes, parseDataUri };
