/**
 * Upload pipeline tests — GIS/CSV infrastructure (Phase 2).
 * Tests metadata creation, event compat shim, GDAL detection, analysis utilities.
 * The actual ogr2ogr/pg-copy-streams tests require PG and are skipped without Docker.
 */

const DAMA_TEST_DB = process.env.DAMA_TEST_DB || 'dama-sqlite-test';

let db;
let tasks;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function setup() {
  const { join } = require('path');
  const { unlinkSync, existsSync } = require('fs');
  const configPath = join(__dirname, '..', 'src', 'db', 'configs', `${DAMA_TEST_DB}.config.json`);
  const config = require(configPath);
  if (config.type === 'sqlite' && config.filename) {
    const dbPath = join(__dirname, '..', 'src', 'db', 'configs', config.filename);
    if (existsSync(dbPath)) unlinkSync(dbPath);
  }

  const { getDb, awaitReady } = require('../src/db');
  getDb(DAMA_TEST_DB);
  await awaitReady();
  db = getDb(DAMA_TEST_DB);
  tasks = require('../src/tasks');
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

async function runTests() {
  console.log(`\n=== Upload Pipeline Tests (${DAMA_TEST_DB}) ===\n`);
  await setup();

  // --- GDAL detection ---

  await test('GDAL detection: gdalAvailable is boolean', async () => {
    const { gdalAvailable } = require('../src/upload/gdal');
    assert(typeof gdalAvailable === 'boolean', `should be boolean, got ${typeof gdalAvailable}`);
  });

  await test('GDAL detection: getGdal() throws when unavailable', async () => {
    const { gdalAvailable, getGdal } = require('../src/upload/gdal');
    if (gdalAvailable) {
      console.log('    (GDAL is available, skipping throw test)');
      return;
    }
    let threw = false;
    try { getGdal(); } catch (e) { threw = true; }
    assert(threw, 'should throw when GDAL not installed');
  });

  // --- GIS processor registration ---

  await test('GIS processor registered conditionally', async () => {
    const { processors } = require('../src/upload/processors');
    const { gdalAvailable } = require('../src/upload/gdal');
    const gisProc = processors.find(p => p.canHandle('.shp'));
    if (gdalAvailable) {
      assert(gisProc, '.shp should be handled when GDAL available');
    } else {
      assert(!gisProc, '.shp should NOT be handled when GDAL unavailable');
    }
  });

  // --- Analysis utilities ---

  await test('toSnakeCase converts names correctly', async () => {
    const { toSnakeCase } = require('../src/upload/analysis');
    assert(toSnakeCase('FieldName') === 'field_name', 'CamelCase');
    assert(toSnakeCase('field-name') === 'field_name', 'kebab-case');
    assert(toSnakeCase('FIELD NAME') === 'field_name', 'UPPER SPACE');
    assert(toSnakeCase('field__name') === 'field_name', 'double underscore');
  });

  await test('generateTableDescriptor builds descriptor from metadata', async () => {
    const { generateTableDescriptor } = require('../src/upload/analysis');
    const layerMeta = {
      layerName: 'TestLayer',
      fieldsMetadata: [
        { name: 'ID', type: 'integer' },
        { name: 'Name', type: 'string' },
        { name: 'Value', type: 'real' },
      ],
    };
    const analysis = {
      layerFieldsAnalysis: {
        schemaAnalysis: [
          { key: 'ID', summary: { db_type: 'BIGINT' } },
          { key: 'Name', summary: { db_type: 'TEXT' } },
          { key: 'Value', summary: { db_type: 'NUMERIC' } },
        ],
      },
      layerGeometriesAnalysis: { type: 'Point' },
    };

    const desc = generateTableDescriptor(layerMeta, analysis);
    assert(desc.tableSchema === 'gis_datasets', 'schema should be gis_datasets');
    assert(desc.layerName === 'TestLayer', 'layerName preserved');
    assert(desc.columnTypes.length === 3, 'should have 3 columns');
    assert(desc.columnTypes[0].col === 'id', 'first col snake_case');
    assert(desc.columnTypes[0].db_type === 'BIGINT', 'first col type from analysis');
    assert(desc.postGisGeometryType === 'Point', 'geometry type from analysis');
    assert(desc.promoteToMulti === true, 'Point should need promote to multi');
  });

  await test('generateTableDescriptor deduplicates column names', async () => {
    const { generateTableDescriptor } = require('../src/upload/analysis');
    const layerMeta = {
      layerName: 'Dupes',
      fieldsMetadata: [
        { name: 'Name' }, { name: 'name' }, { name: 'NAME' },
      ],
    };
    const analysis = { layerFieldsAnalysis: { schemaAnalysis: [] }, layerGeometriesAnalysis: {} };

    const desc = generateTableDescriptor(layerMeta, analysis);
    const cols = desc.columnTypes.map(c => c.col);
    assert(cols[0] === 'name', 'first is name');
    assert(cols[1] === 'name_1', 'second is name_1');
    assert(cols[2] === 'name_2', 'third is name_2');
  });

  // --- Source/view metadata ---

  await test('createDamaSource creates a source record', async () => {
    const { createDamaSource } = require('../src/upload/metadata');
    const source = await createDamaSource({
      name: 'Test Upload Source',
      type: 'gis_dataset',
      user_id: 1,
    }, DAMA_TEST_DB);

    assert(source.source_id, 'should have source_id');
    assert(source.name === 'Test Upload Source', 'name should match');

    // Verify auth defaults
    const stats = typeof source.statistics === 'string' ? JSON.parse(source.statistics) : source.statistics;
    assert(stats?.auth?.users?.['1'] === '10', 'should set default user auth');
  });

  await test('createDamaView creates view with gis_datasets schema', async () => {
    const { createDamaSource, createDamaView } = require('../src/upload/metadata');
    const source = await createDamaSource({ name: 'View Test Source', user_id: 1 }, DAMA_TEST_DB);

    const view = await createDamaView({
      source_id: source.source_id,
      user_id: 1,
    }, DAMA_TEST_DB);

    assert(view.view_id, 'should have view_id');
    assert(view.table_schema === 'gis_datasets', `table_schema should be gis_datasets, got ${view.table_schema}`);
    assert(view.table_name.startsWith('s'), `table_name should start with s, got ${view.table_name}`);
    assert(view.table_name.includes('_v'), 'table_name should contain _v');
  });

  // --- Event compat shim ---

  await test('eventsQuery returns events in legacy format', async () => {
    // Queue and complete a task with events
    tasks.registerHandler('test/events-compat', async (ctx) => {
      await ctx.dispatchEvent('upload:FINAL', 'upload done', { size: 100 });
      return { ok: true };
    });

    const taskId = await tasks.queueTask({ workerPath: 'test/events-compat' }, DAMA_TEST_DB);
    const claimed = await tasks.claimNextTask(DAMA_TEST_DB);
    await tasks.startTaskWorker(claimed, DAMA_TEST_DB);

    // Simulate the compat shim query
    const { getTaskEvents } = require('../src/tasks');
    const events = await getTaskEvents(taskId, DAMA_TEST_DB, 0);

    // Map to legacy format (same logic as eventsQuery route handler)
    const legacy = events.map(evt => ({
      event_id: evt.event_id,
      etl_context_id: evt.task_id,
      type: evt.type,
      payload: typeof evt.payload === 'string' ? JSON.parse(evt.payload || 'null') : evt.payload,
      meta: null,
      error: evt.type === 'error',
    }));

    assert(legacy.length >= 3, `should have >= 3 events, got ${legacy.length}`);

    const uploadFinal = legacy.find(e => e.type === 'upload:FINAL');
    assert(uploadFinal, 'should have upload:FINAL event');
    assert(uploadFinal.etl_context_id === taskId, 'etl_context_id should map to task_id');
    assert(uploadFinal.payload?.size === 100, 'payload should be preserved');
  });

  await test('eventsQuery supports incremental polling (sinceEventId)', async () => {
    tasks.registerHandler('test/incremental', async (ctx) => {
      await ctx.dispatchEvent('step1', 'first', null);
      await ctx.dispatchEvent('step2', 'second', null);
      return {};
    });

    const taskId = await tasks.queueTask({ workerPath: 'test/incremental' }, DAMA_TEST_DB);
    const claimed = await tasks.claimNextTask(DAMA_TEST_DB);
    await tasks.startTaskWorker(claimed, DAMA_TEST_DB);

    const { getTaskEvents } = require('../src/tasks');
    const allEvents = await getTaskEvents(taskId, DAMA_TEST_DB, 0);
    assert(allEvents.length >= 4, 'should have >= 4 events');

    // Poll since the 2nd event
    const sinceId = allEvents[1].event_id;
    const newer = await getTaskEvents(taskId, DAMA_TEST_DB, sinceId);
    assert(newer.length === allEvents.length - 2, `should return ${allEvents.length - 2} newer events`);
    assert(+newer[0].event_id > +sinceId, 'all events should be after sinceId');
  });

  // --- Worker registration ---

  await test('registerUploadWorkers runs without error', async () => {
    const { registerUploadWorkers } = require('../src/upload/workers');
    registerUploadWorkers();
    // Should not throw even without GDAL/pg
  });

  // --- findDataFile GIS extensions ---

  await test('findDataFile supports GIS extensions', async () => {
    // The supportedExts in routes.js now includes .shp, .gpkg, .geojson, .json
    // We can't easily test the function directly since it's not exported,
    // but we verify the extension list was updated
    const routesSrc = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'src', 'upload', 'routes.js'), 'utf8'
    );
    assert(routesSrc.includes('.shp'), 'routes.js should include .shp extension');
    assert(routesSrc.includes('.gpkg'), 'routes.js should include .gpkg extension');
    assert(routesSrc.includes('.geojson'), 'routes.js should include .geojson extension');
  });

  // --- summary ---

  console.log(`\n  ${passed} passing, ${failed} failing\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
