/**
 * CLI Integration Test Runner
 *
 * Starts a local dms-server with SQLite, seeds test data,
 * then exercises all CLI commands and verifies output.
 *
 * Usage: node test/run.js
 */

import {
  startServer, stopServer, runCli, seed,
  describe, test, assert, assertEqual, assertIncludes, pass, summary,
} from './harness.js';

let server;
let manifest;

async function run() {
  console.log('\nDMS CLI Integration Tests\n');

  // ---- Setup ----
  console.log('Setup:');
  server = await startServer();

  console.log('Seeding:');
  manifest = seed();
  console.log(`  Seeded: site=${manifest.site}, ${manifest.patterns.length} patterns, ${manifest.pages.length} pages, ${manifest.sections.length} sections, ${manifest.datasets.length} datasets`);

  // ================================================================
  // PHASE 1: Raw commands
  // ================================================================

  describe('Phase 1 — Raw commands', () => {
    test('raw get returns correct item');
    const rawGet = runCli(`raw get ${manifest.site}`);
    assert(rawGet.json, 'should return JSON');
    assertEqual(rawGet.json.id, manifest.site, 'id matches');
    pass();

    test('raw list returns items');
    const appType = `${manifest.app}+${manifest.type}`;
    const rawList = runCli(`raw list "${appType}"`);
    assert(rawList.json, 'should return JSON');
    assert(rawList.json.total >= 1, 'total >= 1');
    assert(rawList.json.items.length >= 1, 'has items');
    pass();

    test('raw create + get round-trip');
    const createResult = runCli(`raw create ${manifest.app} test-temp --data '{"hello":"world"}'`);
    assert(createResult.json, 'create returns JSON');
    const createdId = createResult.json.id;
    assert(createdId, 'has created id');

    const getResult = runCli(`raw get ${createdId}`);
    assert(getResult.json, 'get returns JSON');
    assertEqual(getResult.json.id, createdId, 'id matches round-trip');
    pass();
  });

  // ================================================================
  // PHASE 2: Content-aware commands
  // ================================================================

  describe('Phase 2 — Site commands', () => {
    test('site show returns site info');
    const siteShow = runCli('site show');
    assert(siteShow.json, 'should return JSON');
    assertEqual(siteShow.json.site_name, 'CLI Test Site', 'site_name matches');
    assertEqual(siteShow.json.pattern_count, 3, 'pattern_count is 3');
    pass();

    test('site patterns returns 3 patterns');
    const sitePatterns = runCli('site patterns');
    assert(sitePatterns.json, 'should return JSON');
    assert(Array.isArray(sitePatterns.json), 'is array');
    assertEqual(sitePatterns.json.length, 3, 'has 3 patterns');
    pass();
  });

  describe('Phase 2 — Pattern commands', () => {
    test('pattern list returns patterns');
    const patList = runCli('pattern list');
    assert(patList.json, 'should return JSON');
    assert(patList.json.items.length >= 3, 'has at least 3 patterns');
    pass();

    test('pattern show by name');
    const patShow = runCli('pattern show Pages');
    assert(patShow.json, 'should return JSON');
    assertEqual(patShow.json.name, 'Pages', 'name matches');
    pass();

    test('pattern dump by name');
    const patDump = runCli('pattern dump Pages');
    assert(patDump.json, 'should return JSON');
    assert(patDump.json.data, 'has data field');
    pass();
  });

  describe('Phase 2 — Page commands', () => {
    test('page list returns pages');
    const pageList = runCli('page list');
    assert(pageList.json, 'should return JSON');
    assert(pageList.json.items.length >= 3, 'has at least 3 pages');
    pass();

    test('page show by slug');
    const pageShow = runCli('page show home');
    assert(pageShow.json, 'should return JSON');
    assertEqual(pageShow.json.title, 'Home', 'title matches');
    assertEqual(pageShow.json.url_slug, 'home', 'slug matches');
    pass();

    test('page dump with --sections');
    const pageDump = runCli('page dump home --sections');
    assert(pageDump.json, 'should return JSON');
    assert(pageDump.json._expanded_sections, 'has expanded sections');
    assert(pageDump.json._expanded_sections.length >= 2, 'at least 2 sections');
    pass();

    test('page create/update/publish/unpublish/delete lifecycle');
    // Create
    const createResult = runCli("page create --title 'Test Page' --slug 'test-page'");
    assert(createResult.json, 'create returns JSON');
    const testPageId = createResult.json.id;
    assert(testPageId, 'has created page id');

    // Update
    const updateResult = runCli(`page update ${testPageId} --title 'Updated Test Page'`);
    assert(updateResult.json, 'update returns JSON');
    assertIncludes(updateResult.json.message, 'updated', 'update message');

    // Publish
    const pubResult = runCli(`page publish ${testPageId}`);
    assertIncludes(pubResult.json.message, 'published', 'publish message');

    // Verify published
    const showPub = runCli(`page show ${testPageId}`);
    assertEqual(showPub.json.published, 'published', 'page is published');

    // Unpublish
    const unpubResult = runCli(`page unpublish ${testPageId}`);
    assertIncludes(unpubResult.json.message, 'unpublished', 'unpublish message');

    // Delete
    const delResult = runCli(`page delete ${testPageId}`);
    assertIncludes(delResult.json.message, 'deleted', 'delete message');
    pass();
  });

  describe('Phase 2 — Section commands', () => {
    const homeSlug = 'home';

    test('section list returns sections');
    const secList = runCli(`section list ${homeSlug}`);
    assert(secList.json, 'should return JSON');
    assert(Array.isArray(secList.json), 'is array');
    assert(secList.json.length >= 2, 'has at least 2 sections');
    pass();

    test('section show by id');
    const sectionId = manifest.sections[0].id;
    const secShow = runCli(`section show ${sectionId}`);
    assert(secShow.json, 'should return JSON');
    assertEqual(secShow.json.title, 'Hero', 'title matches');
    pass();

    test('section dump by id');
    const secDump = runCli(`section dump ${sectionId}`);
    assert(secDump.json, 'should return JSON');
    assert(secDump.json.data, 'has data field');
    pass();

    test('section create/update/delete lifecycle');
    // Create
    const createResult = runCli(`section create ${homeSlug} --element-type lexical --title 'New Section'`);
    assert(createResult.json, 'create returns JSON');
    const newSecId = createResult.json.id;
    assert(newSecId, 'has created section id');

    // Update
    const updateResult = runCli(`section update ${newSecId} --set title='Updated Section'`);
    assert(updateResult.json, 'update returns JSON');
    assertIncludes(updateResult.json.message, 'updated', 'update message');

    // Delete
    const delResult = runCli(`section delete ${newSecId} --page ${homeSlug}`);
    assertIncludes(delResult.json.message, 'deleted', 'delete message');
    pass();
  });

  // ================================================================
  // PHASE 3: New commands
  // ================================================================

  describe('Phase 3 — Dataset commands', () => {
    test('dataset list returns sources');
    const dsList = runCli('dataset list');
    assert(dsList.json, 'should return JSON');
    assert(dsList.json.items.length >= 1, 'has at least 1 source');
    assertEqual(dsList.json.items[0].name, 'Test Dataset', 'name matches');
    pass();

    test('dataset show by name');
    const dsShow = runCli("dataset show 'Test Dataset'");
    assert(dsShow.json, 'should return JSON');
    assertEqual(dsShow.json.name, 'Test Dataset', 'name matches');
    assert(dsShow.json.categories, 'has categories');
    pass();

    test('dataset views returns views array');
    const dsViews = runCli("dataset views 'Test Dataset'");
    assert(dsViews.json !== undefined, 'should return JSON');
    // Test dataset has empty views, so should be empty array
    assert(Array.isArray(dsViews.json), 'is array');
    pass();
  });

  describe('Phase 3 — Site tree', () => {
    test('site tree output has box-drawing chars and hierarchy');
    const treeResult = runCli('site tree');
    assertIncludes(treeResult.stdout, 'Site:', 'contains Site: header');
    assertIncludes(treeResult.stdout, 'Pattern:', 'contains Pattern: label');
    assertIncludes(treeResult.stdout, '├', 'contains box-drawing chars');
    assertIncludes(treeResult.stdout, 'Home', 'contains Home page');
    assertIncludes(treeResult.stdout, 'Source:', 'contains Source: for datasets');
    pass();
  });

  describe('Phase 3 — Stdin support', () => {
    test('section update with stdin (--data -)');
    const sectionId = manifest.sections[0].id;
    const inputJson = JSON.stringify({ title: 'Hero Updated via Stdin' });
    const result = runCli(`section update ${sectionId} --data -`, { stdin: inputJson });
    assert(result.json, 'should return JSON');
    assertIncludes(result.json.message, 'updated', 'update message');

    // Verify the update
    const showResult = runCli(`section show ${sectionId}`);
    assertEqual(showResult.json.title, 'Hero Updated via Stdin', 'title was updated via stdin');
    pass();
  });

  // ---- Summary ----
  const exitCode = summary();

  stopServer(server);
  process.exit(exitCode);
}

run().catch(err => {
  console.error('\nTest runner error:', err);
  if (server) stopServer(server);
  process.exit(1);
});
