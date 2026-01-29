/**
 * Test script for DMS controller with SQLite
 * Tests the main controller functions
 */

// Override the config to use SQLite for testing
process.env.DMS_DB_ENV = 'dms-sqlite';

// Patch getDb to use SQLite config
const originalGetDb = require('#db/index.js').getDb;

const dbModule = require('#db/index.js');

// Temporarily modify the module to use sqlite config
const { SqliteAdapter } = require('#db/adapters/sqlite.js');
const { loadConfig } = require('#db/config.js');

let testDb = null;

async function setup() {
  // Create a test SQLite database
  const config = loadConfig('dms-sqlite');
  testDb = new SqliteAdapter(config);

  // Initialize schema
  const { readFileSync } = require('fs');
  const { join } = require('path');
  const sqlPath = join(__dirname, '../src/db/sql/dms/dms.sqlite.sql');
  const sql = readFileSync(sqlPath, 'utf8');

  const statements = sql.split(';').filter(s => s.trim());
  for (const stmt of statements) {
    if (stmt.trim()) {
      try {
        await testDb.query(stmt + ';');
      } catch (e) {
        // Ignore "already exists" errors
        if (!e.message.includes('already exists')) {
          console.error('Setup error:', e.message);
        }
      }
    }
  }

  console.log('Test database initialized');
  return testDb;
}

async function testBasicOperations(db) {
  console.log('\n--- Testing Basic Operations ---');

  // Test createData equivalent
  console.log('Creating test data...');
  const insertResult = await db.query(`
    INSERT INTO data_items (app, type, data, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?)
    RETURNING id, app, type, data, created_at, created_by, updated_at, updated_by
  `, ['test-app', 'test-type', JSON.stringify({ title: 'Test Page', url_slug: 'test-page' }), null, null]);

  console.log('Created:', insertResult.rows[0]);
  const testId = insertResult.rows[0].id;

  // Test getDataById equivalent
  console.log('\nRetrieving by ID...');
  const getResult = await db.query(`
    SELECT id, data, updated_at, created_at
    FROM data_items
    WHERE id IN (?)
  `, [testId]);
  console.log('Retrieved:', getResult.rows[0]);

  // Test dataLength equivalent
  console.log('\nCounting data...');
  const countResult = await db.query(`
    SELECT app || '+' || type AS key, COUNT(1) AS length
    FROM data_items
    WHERE app = ? AND type = ?
    GROUP BY 1
  `, ['test-app', 'test-type']);
  console.log('Count result:', countResult.rows[0]);

  // Test setDataById equivalent with json_patch
  console.log('\nUpdating data...');
  const updateResult = await db.query(`
    UPDATE data_items
    SET data = json_patch(COALESCE(data, '{}'), ?),
        updated_at = datetime('now'),
        updated_by = ?
    WHERE id = ?
    RETURNING id, app, type, data, CAST(created_at AS TEXT), created_by, CAST(updated_at AS TEXT), updated_by
  `, [JSON.stringify({ description: 'Updated description' }), null, testId]);
  console.log('Updated:', updateResult.rows[0]);

  // Verify the JSON was merged correctly
  const verifyResult = await db.query(`
    SELECT id, data, json_extract(data, '$.title') as title, json_extract(data, '$.description') as description
    FROM data_items
    WHERE id = ?
  `, [testId]);
  console.log('Verified merge:', verifyResult.rows[0]);

  // Test deleteData equivalent
  console.log('\nDeleting data...');
  const deleteResult = await db.query(`
    DELETE FROM data_items WHERE id IN (?)
  `, [testId]);
  console.log('Deleted, rowCount:', deleteResult.rowCount);

  return true;
}

async function testJsonOperations(db) {
  console.log('\n--- Testing JSON Operations ---');

  // Insert test data with complex JSON
  const insertResult = await db.query(`
    INSERT INTO data_items (app, type, data)
    VALUES (?, ?, ?)
    RETURNING id
  `, ['json-test', 'page', JSON.stringify({
    title: 'JSON Test Page',
    url_slug: 'json-test',
    sections: [{ id: '101' }, { id: '102' }],
    tags: 'test,json,sqlite'
  })]);

  const pageId = insertResult.rows[0].id;

  // Test json_extract for simple fields
  console.log('Testing json_extract...');
  const extractResult = await db.query(`
    SELECT
      id,
      json_extract(data, '$.title') as title,
      json_extract(data, '$.url_slug') as url_slug,
      json_extract(data, '$.tags') as tags
    FROM data_items
    WHERE id = ?
  `, [pageId]);
  console.log('Extracted:', extractResult.rows[0]);

  // Test json_each for array operations
  console.log('\nTesting json_each for array iteration...');
  const arrayResult = await db.query(`
    SELECT
      di.id,
      json_extract(di.data, '$.title') as title,
      json_extract(je.value, '$.id') as section_id
    FROM data_items di, json_each(di.data, '$.sections') as je
    WHERE di.id = ?
  `, [pageId]);
  console.log('Array elements:', arrayResult.rows);

  // Cleanup
  await db.query('DELETE FROM data_items WHERE app = ?', ['json-test']);

  return true;
}

async function testFiltering(db) {
  console.log('\n--- Testing Filtering ---');

  // Insert multiple test records
  for (let i = 0; i < 5; i++) {
    await db.query(`
      INSERT INTO data_items (app, type, data)
      VALUES (?, ?, ?)
    `, ['filter-test', 'item', JSON.stringify({ title: `Item ${i}`, index: i })]);
  }

  // Test LIKE filtering
  console.log('Testing LIKE filter...');
  const likeResult = await db.query(`
    SELECT id, json_extract(data, '$.title') as title
    FROM data_items
    WHERE app = ? AND type = ?
    AND json_extract(data, '$.title') LIKE ?
  `, ['filter-test', 'item', '%2%']);
  console.log('LIKE result:', likeResult.rows);

  // Test comparison filtering
  console.log('\nTesting comparison filter...');
  const compareResult = await db.query(`
    SELECT id, json_extract(data, '$.title') as title, json_extract(data, '$.index') as idx
    FROM data_items
    WHERE app = ? AND type = ?
    AND CAST(json_extract(data, '$.index') AS INTEGER) > ?
    ORDER BY json_extract(data, '$.index')
  `, ['filter-test', 'item', 2]);
  console.log('Comparison result:', compareResult.rows);

  // Test pagination with LIMIT/OFFSET
  console.log('\nTesting pagination...');
  const pageResult = await db.query(`
    SELECT id, json_extract(data, '$.title') as title
    FROM data_items
    WHERE app = ? AND type = ?
    ORDER BY id
    LIMIT 2 OFFSET 1
  `, ['filter-test', 'item']);
  console.log('Page result:', pageResult.rows);

  // Cleanup
  await db.query('DELETE FROM data_items WHERE app = ?', ['filter-test']);

  return true;
}

async function testJsonColumnParsing(db) {
  console.log('\n--- Testing JSON Column Parsing (data vs ->>) ---');

  // Insert data with JSON arrays (like sections/section_groups in a real page)
  await db.query(`
    INSERT INTO data_items (app, type, data)
    VALUES (?, ?, ?)
  `, ['parse-test', 'page', JSON.stringify({
    title: 'Parse Test Page',
    url_slug: 'parse-test',
    sections: [{ id: '101', ref: 'parse-test+page|section' }],
    section_groups: [{ name: 'default', position: 'content', index: 0 }]
  })]);

  // Query the raw `data` column — should be parsed into an object
  console.log('Testing raw data column is parsed...');
  const rawResult = await db.query(`
    SELECT id, data
    FROM data_items
    WHERE app = ? AND type = ?
  `, ['parse-test', 'page']);

  const dataValue = rawResult.rows[0].data;
  if (typeof dataValue !== 'object' || dataValue === null) {
    throw new Error(`Expected data column to be a parsed object, got ${typeof dataValue}: ${dataValue}`);
  }
  console.log('  data column type:', typeof dataValue, '(correct)');

  // Query with ->> extraction — should remain as strings, matching PostgreSQL behavior
  console.log('Testing ->> extracted fields remain as strings...');
  const extractResult = await db.query(`
    SELECT id,
      data ->> 'sections' as sections,
      data ->> 'section_groups' as section_groups,
      data ->> 'title' as title
    FROM data_items
    WHERE app = ? AND type = ?
  `, ['parse-test', 'page']);

  const row = extractResult.rows[0];

  if (typeof row.sections !== 'string') {
    throw new Error(`Expected sections to be a string, got ${typeof row.sections}: ${JSON.stringify(row.sections)}`);
  }
  console.log('  sections type:', typeof row.sections, '(correct)');
  console.log('  sections value:', row.sections);

  if (typeof row.section_groups !== 'string') {
    throw new Error(`Expected section_groups to be a string, got ${typeof row.section_groups}: ${JSON.stringify(row.section_groups)}`);
  }
  console.log('  section_groups type:', typeof row.section_groups, '(correct)');

  if (typeof row.title !== 'string') {
    throw new Error(`Expected title to be a string, got ${typeof row.title}`);
  }
  console.log('  title type:', typeof row.title, '(correct)');

  // Cleanup
  await db.query('DELETE FROM data_items WHERE app = ?', ['parse-test']);

  return true;
}

async function runTests() {
  console.log('=== DMS Controller SQLite Tests ===\n');

  try {
    const db = await setup();

    await testBasicOperations(db);
    await testJsonOperations(db);
    await testFiltering(db);
    await testJsonColumnParsing(db);

    console.log('\n=== All Controller Tests Passed! ===');

    // Cleanup
    db.end();

  } catch (error) {
    console.error('\nTest failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
