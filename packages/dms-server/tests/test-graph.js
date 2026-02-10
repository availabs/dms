/**
 * Test Graph Harness Sanity Tests
 *
 * Verifies the test graph harness can call Falcor routes directly.
 */

const { createTestGraph } = require('./graph');

const DB_NAME = process.env.DMS_TEST_DB || 'dms-sqlite';

let graph = null;
const TEST_APP = 'graph-test-' + Date.now();

async function setup() {
  console.log('Setting up test graph...');
  graph = createTestGraph(DB_NAME);
  console.log(`Database: ${DB_NAME} (${graph.dbType})`);
  console.log(`Test app: ${TEST_APP}\n`);
}

async function cleanup() {
  // Clean up test data using direct controller access
  if (graph && graph.controller) {
    // For now we'll leave cleanup to individual tests
  }
}

// ============================================================================
// TESTS
// ============================================================================

async function testGetLength() {
  console.log('--- Test: GET data length ---');

  return new Promise((resolve, reject) => {
    graph.get(
      [['dms', 'data', `${TEST_APP}+test-type`, 'length']],
      (error, result) => {
        if (error) {
          console.error('Error:', error);
          reject(error);
          return;
        }

        const length = result.jsonGraph?.dms?.data?.[`${TEST_APP}+test-type`]?.length;
        console.log(`  Length: ${length}`);

        if (typeof length !== 'number') {
          reject(new Error(`Expected number, got ${typeof length}`));
          return;
        }

        console.log('  ✓ GET length works\n');
        resolve();
      }
    );
  });
}

async function testGetLengthAsync() {
  console.log('--- Test: GET data length (async) ---');

  const result = await graph.getAsync([
    ['dms', 'data', `${TEST_APP}+test-type`, 'length']
  ]);

  const length = result.jsonGraph?.dms?.data?.[`${TEST_APP}+test-type`]?.length;
  console.log(`  Length: ${length}`);

  if (typeof length !== 'number') {
    throw new Error(`Expected number, got ${typeof length}`);
  }

  console.log('  ✓ GET length (async) works\n');
}

async function testCreateAndGet() {
  console.log('--- Test: CALL create and GET byId ---');

  // Create a data item
  const createResult = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, 'test-type']
  );

  // Find the created ID from the response
  const byIdData = createResult.jsonGraph?.dms?.data?.byId;
  if (!byIdData) {
    throw new Error('No byId data in create response');
  }

  const createdId = Object.keys(byIdData)[0];
  console.log(`  Created item ID: ${createdId}`);

  if (!createdId) {
    throw new Error('No ID returned from create');
  }

  // GET the item back
  const getResult = await graph.getAsync([
    ['dms', 'data', 'byId', createdId, ['id', 'app', 'type']]
  ]);

  const item = getResult.jsonGraph?.dms?.data?.byId?.[createdId];
  console.log(`  Retrieved: id=${item?.id}, app=${item?.app}, type=${item?.type}`);

  if (item?.app !== TEST_APP) {
    throw new Error(`Expected app=${TEST_APP}, got ${item?.app}`);
  }

  if (item?.type !== 'test-type') {
    throw new Error(`Expected type=test-type, got ${item?.type}`);
  }

  console.log('  ✓ CALL create and GET byId works\n');

  return createdId;
}

async function testEditData(id) {
  console.log('--- Test: CALL edit ---');

  // Edit the data
  const editResult = await graph.callAsync(
    ['dms', 'data', 'edit'],
    [id, { title: 'Test Title', count: 42 }]
  );

  // Verify the edit response
  const editedItem = editResult.jsonGraph?.dms?.data?.byId?.[id];
  console.log(`  Edited item data:`, editedItem?.data?.value);

  // GET the item to verify
  const getResult = await graph.getAsync([
    ['dms', 'data', 'byId', id, 'data']
  ]);

  const data = getResult.jsonGraph?.dms?.data?.byId?.[id]?.data?.value;
  console.log(`  Retrieved data: title=${data?.title}, count=${data?.count}`);

  if (data?.title !== 'Test Title') {
    throw new Error(`Expected title=Test Title, got ${data?.title}`);
  }

  if (data?.count !== 42) {
    throw new Error(`Expected count=42, got ${data?.count}`);
  }

  console.log('  ✓ CALL edit works\n');
}

async function testDelete(id) {
  console.log('--- Test: CALL delete ---');

  const deleteResult = await graph.callAsync(
    ['dms', 'data', 'delete'],
    [TEST_APP, 'test-type', id]
  );

  // The delete response should invalidate the paths
  console.log(`  Delete response paths:`, Object.keys(deleteResult));

  // Try to GET the deleted item - should return null or undefined
  const getResult = await graph.getAsync([
    ['dms', 'data', 'byId', id, 'id']
  ]);

  const item = getResult.jsonGraph?.dms?.data?.byId?.[id];
  console.log(`  After delete, item:`, item);

  // The item should be gone or null
  if (item?.id === parseInt(id)) {
    throw new Error('Item should have been deleted but still exists');
  }

  console.log('  ✓ CALL delete works\n');
}

async function testCreateWithData() {
  console.log('--- Test: CALL create with data (regression test) ---');
  console.log('  This tests that createData preserves the data argument');
  console.log('  Bug: createData was ignoring args[2] and always using {}');

  // Create a data item WITH initial data (simulates creating a section with element data)
  const sectionData = {
    title: 'Test Section',
    trackingId: 'test-tracking-123',
    element: {
      'element-type': 'lexical',
      'element-data': { content: 'Hello world' }
    }
  };

  const createResult = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, 'section', sectionData]
  );

  const byIdData = createResult.jsonGraph?.dms?.data?.byId;
  if (!byIdData) {
    throw new Error('No byId data in create response');
  }

  const createdId = Object.keys(byIdData)[0];
  console.log(`  Created section ID: ${createdId}`);

  // GET the item to verify the data was actually saved
  const getResult = await graph.getAsync([
    ['dms', 'data', 'byId', createdId, 'data']
  ]);

  const data = getResult.jsonGraph?.dms?.data?.byId?.[createdId]?.data?.value;
  console.log(`  Retrieved data:`, JSON.stringify(data).slice(0, 100) + '...');

  // Verify the data was saved correctly
  if (!data || typeof data !== 'object') {
    throw new Error(`Expected data to be an object, got ${typeof data}`);
  }

  if (data.title !== 'Test Section') {
    throw new Error(`Expected title='Test Section', got '${data.title}'`);
  }

  if (data.trackingId !== 'test-tracking-123') {
    throw new Error(`Expected trackingId='test-tracking-123', got '${data.trackingId}'`);
  }

  if (!data.element || data.element['element-type'] !== 'lexical') {
    throw new Error(`Expected element.element-type='lexical', got '${data.element?.['element-type']}'`);
  }

  console.log('  ✓ createData preserves data argument\n');

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, 'section', createdId]);
  console.log('  Cleaned up test section\n');
}

async function testSearchOneWithIntegerIndex() {
  console.log('--- Test: searchOne with integer index (regression test) ---');
  console.log('  Bug 1: dataByIdResponse used || null, converting 0 to null');
  console.log('  Bug 2: SQLite ->> returns integer 0, which != text \'0\'');

  // Create a page with index: 0 (integer, not string)
  const pageData = {
    title: 'SearchOne Test Page',
    url_slug: 'searchone-test',
    index: 0,
    parent: null,
    template_id: null
  };

  const createResult = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, 'test-page', pageData]
  );

  const byIdData = createResult.jsonGraph?.dms?.data?.byId;
  const pageId = Object.keys(byIdData)[0];
  console.log(`  Created page ID: ${pageId}`);

  // Test Bug 1 fix: GET byId with data ->> 'index' should return 0, not null
  const getResult = await graph.getAsync([
    ['dms', 'data', 'byId', pageId, ["data ->> 'index'", "data ->> 'title'"]]
  ]);

  const pageRow = getResult.jsonGraph?.dms?.data?.byId?.[pageId];
  const indexValue = pageRow?.["data ->> 'index'"];
  console.log(`  data ->> 'index' = ${JSON.stringify(indexValue)} (type: ${typeof indexValue})`);

  if (indexValue === null || indexValue === undefined) {
    throw new Error(`Expected index to be 0, got ${indexValue} — falsy value was dropped`);
  }

  console.log('  ✓ Bug 1 fix verified: index 0 not converted to null');

  // Test Bug 2 fix: searchOne should find the page using defaultSearch
  const searchKey = JSON.stringify({
    wildKey: "data ->> 'url_slug'",
    params: "",
    defaultSearch: "data ->> 'index' = '0' and (data ->> 'parent' = '' or data ->> 'parent' is null) and (data ->> 'template_id' is null)"
  });

  const searchResult = await graph.getAsync([
    ['dms', 'data', `${TEST_APP}+test-page`, 'searchOne', searchKey]
  ]);

  const searchOneValue = searchResult.jsonGraph?.dms?.data?.[`${TEST_APP}+test-page`]?.searchOne?.[searchKey];
  console.log(`  searchOne result:`, JSON.stringify(searchOneValue));

  if (!searchOneValue || searchOneValue.$type !== 'ref') {
    throw new Error(`Expected searchOne to return a $ref, got ${JSON.stringify(searchOneValue)}`);
  }

  const refId = searchOneValue.value?.[searchOneValue.value.length - 1];
  if (String(refId) !== String(pageId)) {
    throw new Error(`Expected searchOne ref to point to ${pageId}, got ${refId}`);
  }

  console.log('  ✓ Bug 2 fix verified: searchOne finds page with integer index 0');

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, 'test-page', pageId]);
  console.log('  Cleaned up test page\n');
}

async function testRespondInterface() {
  console.log('--- Test: respond() interface ---');

  return new Promise((resolve, reject) => {
    graph.respond(
      {
        queryStringParameters: {
          method: 'get',
          paths: JSON.stringify([['dms', 'data', `${TEST_APP}+test-type`, 'length']])
        }
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        const length = result.jsonGraph?.dms?.data?.[`${TEST_APP}+test-type`]?.length;
        console.log(`  Length via respond(): ${length}`);

        if (typeof length !== 'number') {
          reject(new Error(`Expected number, got ${typeof length}`));
          return;
        }

        console.log('  ✓ respond() interface works\n');
        resolve();
      }
    );
  });
}

// ============================================================================
// MAIN
// ============================================================================

async function runTests() {
  console.log('=== Test Graph Harness Tests ===\n');

  try {
    await setup();

    await testGetLength();
    await testGetLengthAsync();
    const createdId = await testCreateAndGet();
    await testEditData(createdId);
    await testDelete(createdId);
    await testCreateWithData();  // Regression test for createData with data argument
    await testSearchOneWithIntegerIndex();  // Regression test for searchOne with index: 0
    await testRespondInterface();

    console.log('=== All Graph Harness Tests Passed! ===');

  } catch (error) {
    console.error('\nTest failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

runTests();
