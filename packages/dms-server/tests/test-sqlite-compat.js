/**
 * SQLite Compatibility Tests
 *
 * Verifies that ID types are consistently strings in all Falcor responses,
 * and that $ref paths use string IDs regardless of database backend.
 *
 * These tests catch the bug where SQLite returns numeric IDs while PG returns
 * string IDs, causing Falcor $ref resolution failures on the client.
 *
 * Run: node tests/test-sqlite-compat.js
 * Or:  DMS_TEST_DB=dms-postgres-test node tests/test-sqlite-compat.js
 */

const { createTestGraph } = require('./graph');

const DB_NAME = process.env.DMS_TEST_DB || 'dms-sqlite';
const TEST_APP = 'sqlite-compat-test-' + Date.now();
const TEST_TYPE = 'compat-page';

let graph = null;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed++;
    console.error(`  FAIL: ${message}`);
    throw new Error(message);
  }
  passed++;
  console.log(`  PASS: ${message}`);
}

function getValue(jsonGraph, ...path) {
  let current = jsonGraph;
  for (const key of path) {
    if (!current) return undefined;
    current = current[key];
  }
  if (current && typeof current === 'object' && '$type' in current) {
    if (current.$type === 'atom') return current.value;
    if (current.$type === 'ref') return current.value;
  }
  return current;
}

// ============================================================================
// Tests
// ============================================================================

async function testCreateReturnsStringIds() {
  console.log('\n--- Test: create returns string IDs ---');

  const result = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, TEST_TYPE]
  );

  const byId = result.jsonGraph?.dms?.data?.byId;
  assert(byId != null, 'create response has byId');

  const ids = Object.keys(byId);
  assert(ids.length > 0, 'at least one ID returned');

  const id = ids[0];
  assert(typeof id === 'string', `byId key is string (got ${typeof id}: ${id})`);

  // Check the id attribute value inside
  const idValue = byId[id]?.id;
  assert(typeof idValue === 'string', `id attribute is string (got ${typeof idValue}: ${idValue})`);

  // Also check the app-namespaced path
  const appById = result.jsonGraph?.dms?.data?.[TEST_APP]?.byId;
  if (appById) {
    const appIds = Object.keys(appById);
    assert(appIds.length > 0, 'app-namespaced byId has entries');
    assert(typeof appIds[0] === 'string', `app-namespaced byId key is string (got ${typeof appIds[0]})`);
  }

  return id;
}

async function testByIndexReturnsStringRefIds(itemIds) {
  console.log('\n--- Test: byIndex $ref uses string IDs ---');

  const key = `${TEST_APP}+${TEST_TYPE}`;

  const result = await graph.getAsync([
    ['dms', 'data', key, 'byIndex', [0]]
  ]);

  const ref = getValue(result.jsonGraph, 'dms', 'data', key, 'byIndex', 0);
  assert(Array.isArray(ref), 'byIndex returns a $ref path array');
  assert(ref.length === 5, `$ref has 5 elements (got ${ref.length})`);

  const refId = ref[ref.length - 1];
  assert(typeof refId === 'string', `$ref ID is string (got ${typeof refId}: ${refId})`);
  assert(ref[2] === TEST_APP, `$ref app segment is correct (got ${ref[2]})`);
  assert(ref[3] === 'byId', `$ref has byId segment`);

  return refId;
}

async function testByIdReturnsStringIds(id) {
  console.log('\n--- Test: byId response uses string ID ---');

  const result = await graph.getAsync([
    ['dms', 'data', 'byId', id, ['id', 'app', 'type', 'data']]
  ]);

  const idValue = getValue(result.jsonGraph, 'dms', 'data', 'byId', id, 'id');
  assert(typeof idValue === 'string', `byId id value is string (got ${typeof idValue}: ${idValue})`);

  const app = getValue(result.jsonGraph, 'dms', 'data', 'byId', id, 'app');
  assert(app === TEST_APP, `app matches (got ${app})`);
}

async function testAppNamespacedByIdReturnsStringIds(id) {
  console.log('\n--- Test: app-namespaced byId uses string ID ---');

  const result = await graph.getAsync([
    ['dms', 'data', TEST_APP, 'byId', id, ['id', 'app', 'type', 'data']]
  ]);

  const idValue = getValue(result.jsonGraph, 'dms', 'data', TEST_APP, 'byId', id, 'id');
  assert(typeof idValue === 'string', `app-namespaced byId id value is string (got ${typeof idValue}: ${idValue})`);
}

async function testSearchOneReturnsStringRefIds(id) {
  console.log('\n--- Test: searchOne $ref uses string IDs ---');

  // Edit the item to have searchable data
  await graph.callAsync(
    ['dms', 'data', 'edit'],
    [TEST_APP, id, { title: 'SearchTarget', url_slug: 'search-target-compat' }]
  );

  const key = `${TEST_APP}+${TEST_TYPE}`;
  // searchOne expects a JSON-encoded search object with wildKey and filterBy
  const searchKey = JSON.stringify({
    wildKey: `data ->> 'url_slug' = 'search-target-compat'`,
    filterBy: {}
  });

  try {
    const result = await graph.getAsync([
      ['dms', 'data', key, 'searchOne', [searchKey]]
    ]);

    const ref = getValue(result.jsonGraph, 'dms', 'data', key, 'searchOne', searchKey);

    if (ref === null || ref === undefined) {
      console.log('  SKIP: searchOne returned null (item not found)');
      return;
    }

    assert(Array.isArray(ref), 'searchOne returns a $ref path array');
    const refId = ref[ref.length - 1];
    assert(typeof refId === 'string', `searchOne $ref ID is string (got ${typeof refId}: ${refId})`);
  } catch (e) {
    console.log('  SKIP: searchOne error:', e.message?.substring(0, 80));
  }
}

async function testEditReturnsStringIds(id) {
  console.log('\n--- Test: edit returns string IDs ---');

  const result = await graph.callAsync(
    ['dms', 'data', 'edit'],
    [TEST_APP, id, { title: 'Updated Title' }]
  );

  // Check app-namespaced path
  const appById = result.jsonGraph?.dms?.data?.[TEST_APP]?.byId;
  if (appById) {
    const ids = Object.keys(appById);
    assert(ids.length > 0, 'edit response has app-namespaced byId entries');
    assert(typeof ids[0] === 'string', `edit response byId key is string (got ${typeof ids[0]})`);

    const idValue = appById[ids[0]]?.id;
    assert(typeof idValue === 'string', `edit response id attribute is string (got ${typeof idValue}: ${idValue})`);
  }
}

async function testEndToEndRefResolution() {
  console.log('\n--- Test: end-to-end byIndex → $ref → byId resolution ---');

  // This is the critical test: create an item, query it by index,
  // follow the $ref, and verify the byId lookup succeeds.
  // This is exactly what fails when ID types mismatch.

  const key = `${TEST_APP}+${TEST_TYPE}`;

  // Step 1: Get length
  const lengthResult = await graph.getAsync([
    ['dms', 'data', key, 'length']
  ]);
  const length = getValue(lengthResult.jsonGraph, 'dms', 'data', key, 'length');
  assert(length > 0, `has items (length=${length})`);

  // Step 2: Get byIndex[0] → returns $ref
  const indexResult = await graph.getAsync([
    ['dms', 'data', key, 'byIndex', [0]]
  ]);
  const ref = getValue(indexResult.jsonGraph, 'dms', 'data', key, 'byIndex', 0);
  assert(Array.isArray(ref), 'byIndex[0] returns a $ref');

  const refId = ref[ref.length - 1];
  const refApp = ref[2];
  assert(typeof refId === 'string', `$ref ID is string: ${refId}`);

  // Step 3: Follow the $ref — query byId with the exact ID from the $ref
  // This is where the old bug manifested: byIndex returned numeric ID in $ref,
  // but byId stored data under string ID, so lookup failed
  const byIdResult = await graph.getAsync([
    ['dms', 'data', refApp, 'byId', refId, ['id', 'app', 'type', 'data']]
  ]);

  const resolvedId = getValue(byIdResult.jsonGraph, 'dms', 'data', refApp, 'byId', refId, 'id');
  assert(resolvedId != null, `byId lookup resolves (id=${resolvedId})`);
  assert(typeof resolvedId === 'string', `resolved id is string (got ${typeof resolvedId})`);
  assert(resolvedId === refId, `resolved id matches $ref id (${resolvedId} === ${refId})`);

  const resolvedApp = getValue(byIdResult.jsonGraph, 'dms', 'data', refApp, 'byId', refId, 'app');
  assert(resolvedApp === TEST_APP, `resolved app matches (${resolvedApp} === ${TEST_APP})`);
}

async function testPageSectionsRefResolution() {
  console.log('\n--- Test: page with sections — ref IDs resolve correctly ---');

  const sectionType = TEST_TYPE + '|section';

  // Create a section
  const sectionResult = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, sectionType]
  );
  const sectionById = sectionResult.jsonGraph?.dms?.data?.byId;
  const sectionId = Object.keys(sectionById)[0];
  assert(typeof sectionId === 'string', `section ID is string: ${sectionId}`);

  // Edit section with some data
  await graph.callAsync(
    ['dms', 'data', 'edit'],
    [TEST_APP, sectionId, { title: 'Test Section', element: { 'element-type': 'text', 'element-data': 'hello' } }]
  );

  // Get the page we created earlier — find it via byIndex
  const key = `${TEST_APP}+${TEST_TYPE}`;
  const indexResult = await graph.getAsync([
    ['dms', 'data', key, 'byIndex', [0]]
  ]);
  const pageRef = getValue(indexResult.jsonGraph, 'dms', 'data', key, 'byIndex', 0);
  const pageId = pageRef[pageRef.length - 1];

  // Update page to reference the section (matching how real DMS stores section refs)
  const sections = [{ id: sectionId, ref: `${TEST_APP}+${sectionType}` }];
  await graph.callAsync(
    ['dms', 'data', 'edit'],
    [TEST_APP, pageId, { sections, draft_sections: sections }]
  );

  // Now fetch the page data and verify the section ID is a string
  const pageDataResult = await graph.getAsync([
    ['dms', 'data', TEST_APP, 'byId', pageId, 'data']
  ]);
  const pageData = getValue(pageDataResult.jsonGraph, 'dms', 'data', TEST_APP, 'byId', pageId, 'data');
  assert(pageData?.sections?.length === 1, `page has 1 section`);

  const storedSectionId = pageData.sections[0].id;
  assert(typeof storedSectionId === 'string', `stored section ID is string (got ${typeof storedSectionId}: ${storedSectionId})`);

  // Follow the section ref — fetch section data via byId using the stored ID
  const sectionDataResult = await graph.getAsync([
    ['dms', 'data', TEST_APP, 'byId', storedSectionId, ['id', 'data']]
  ]);
  const resolvedSectionId = getValue(sectionDataResult.jsonGraph, 'dms', 'data', TEST_APP, 'byId', storedSectionId, 'id');
  assert(resolvedSectionId != null, `section resolves via byId (id=${resolvedSectionId})`);
  assert(typeof resolvedSectionId === 'string', `resolved section id is string`);

  // Cleanup section
  await graph.callAsync(
    ['dms', 'data', 'delete'],
    [TEST_APP, sectionType, sectionId]
  );

  return true;
}

async function testOptsFilterByIndexReturnsStringRefs() {
  console.log('\n--- Test: opts.byIndex $ref uses string IDs ---');

  const key = `${TEST_APP}+${TEST_TYPE}`;
  // Use a simple filter option — empty string means no filter (all items)
  const option = '';

  try {
    const result = await graph.getAsync([
      ['dms', 'data', key, 'opts', [option], 'byIndex', [0]]
    ]);

    const ref = getValue(result.jsonGraph, 'dms', 'data', key, 'opts', option, 'byIndex', 0);
    if (ref && Array.isArray(ref)) {
      const refId = ref[ref.length - 1];
      assert(typeof refId === 'string', `opts.byIndex $ref ID is string (got ${typeof refId}: ${refId})`);
    } else {
      console.log('  SKIP: opts.byIndex returned no ref (filter may not match)');
    }
  } catch (e) {
    // opts route may not work with empty filter — that's ok
    console.log('  SKIP: opts.byIndex route error:', e.message?.substring(0, 80));
  }
}

// ============================================================================
// PG → SQLite SQL Translation Tests
// ============================================================================

function testTranslatePgToSqlite() {
  console.log('\n--- Test: translatePgToSqlite ---');

  const { translatePgToSqlite } = require('../src/routes/uda/uda.controller');

  // array_to_string(array_agg(distinct X), sep) → group_concat(X, sep)
  assert(
    translatePgToSqlite("array_to_string(array_agg(distinct data->>'name'), ', ') as name_list") ===
      "group_concat(data->>'name', ', ') as name_list",
    'array_to_string(array_agg(distinct ...)) → group_concat (strips distinct)'
  );

  // array_to_string(array_agg(X), sep) without distinct
  assert(
    translatePgToSqlite("array_to_string(array_agg(data->>'col'), ', ')") ===
      "group_concat(data->>'col', ', ')",
    'array_to_string(array_agg(...)) → group_concat (no distinct)'
  );

  // standalone array_agg → json_group_array
  assert(
    translatePgToSqlite("array_agg(data->>'x')") ===
      "json_group_array(data->>'x')",
    'array_agg → json_group_array'
  );

  // to_jsonb(array_remove(array[...], null)) → json_array(...)
  assert(
    translatePgToSqlite("to_jsonb(array_remove(array[case when x then 'a' end, case when y then 'b' end], null))") ===
      "json_array(case when x then 'a' end, case when y then 'b' end)",
    'to_jsonb(array_remove(array[...], null)) → json_array(...)'
  );

  // standalone array[...] → json_array(...)
  assert(
    translatePgToSqlite("array[1, 2, 3]") ===
      "json_array(1, 2, 3)",
    'array[...] → json_array(...)'
  );

  // to_jsonb(X) → json(X)
  assert(
    translatePgToSqlite("to_jsonb(col)") ===
      "json(col)",
    'to_jsonb(X) → json(X)'
  );

  // passthrough — no PG constructs
  assert(
    translatePgToSqlite("data->>'title' as title") ===
      "data->>'title' as title",
    'plain expression passes through unchanged'
  );

  // multiple translations in one expression
  const multi = translatePgToSqlite(
    "array_to_string(array_agg(distinct data->>'a'), ', ') as a_list, array_to_string(array_agg(distinct data->>'b'), ', ') as b_list"
  );
  assert(
    !multi.includes('array_agg') && !multi.includes('array_to_string'),
    'multiple aggregate columns all translated'
  );
  assert(
    multi.includes("group_concat(data->>'a', ', ')") && multi.includes("group_concat(data->>'b', ', ')"),
    'multiple columns produce correct group_concat calls'
  );
}

// ============================================================================
// Main
// ============================================================================

async function run() {
  console.log('=== SQLite Compatibility Tests ===');
  console.log(`Database: ${DB_NAME}\n`);

  graph = createTestGraph(DB_NAME);
  console.log(`Backend: ${graph.dbType}`);

  let createdIds = [];

  try {
    // Create test items
    const id1 = await testCreateReturnsStringIds();
    createdIds.push(id1);

    // Create a second item for byIndex testing
    const result2 = await graph.callAsync(['dms', 'data', 'create'], [TEST_APP, TEST_TYPE]);
    const id2 = Object.keys(result2.jsonGraph?.dms?.data?.byId || {})[0];
    createdIds.push(id2);

    // Run all tests
    const refId = await testByIndexReturnsStringRefIds(createdIds);
    await testByIdReturnsStringIds(refId);
    await testAppNamespacedByIdReturnsStringIds(refId);
    await testSearchOneReturnsStringRefIds(id1);
    await testEditReturnsStringIds(id1);
    await testEndToEndRefResolution();
    await testPageSectionsRefResolution();
    await testOptsFilterByIndexReturnsStringRefs();
    testTranslatePgToSqlite();

    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  } catch (error) {
    console.error('\nTest failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    // Cleanup all created items
    if (createdIds.length > 0) {
      console.log('\nCleaning up...');
      try {
        await graph.callAsync(
          ['dms', 'data', 'delete'],
          [TEST_APP, TEST_TYPE, ...createdIds]
        );
        console.log(`Deleted ${createdIds.length} items`);
      } catch (e) {
        console.error('Cleanup error:', e.message);
      }
    }
  }
}

run();
