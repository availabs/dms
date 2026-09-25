/**
 * CLI Integration Test Runner.
 *
 * Spins up a local dms-server (SQLite, per-app split mode), seeds
 * fixtures via the modern type scheme (see test/seed.js), then
 * exercises the commands and verifies output.
 *
 * Usage: node test/run.js
 */

import {
  startServer, stopServer, authenticate, runCli, seed, HOST,
  describe, describeAsync, test, assert, assertEqual, assertIncludes, pass, summary,
} from './harness.js';
import { joinRoom, peekRoom, seedRoom } from './room-client.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server;
let manifest;

async function run() {
  console.log('\nDMS CLI Integration Tests\n');

  console.log('Setup:');
  server = await startServer();
  await authenticate();

  console.log('Seeding:');
  manifest = seed();
  console.log(
    `  Seeded: site=${manifest.site}, ${manifest.patterns.length} patterns, `
    + `${manifest.pages.length} pages, ${manifest.sections.length} sections, `
    + `${manifest.dmsEnvs.length} dmsEnvs, ${manifest.sources.length} sources`
  );

  // ================================================================
  // PHASE 1 — Raw commands
  // ================================================================

  describe('Phase 1 — Raw commands', () => {
    test('raw get returns correct item');
    const rawGet = runCli(`raw get ${manifest.site}`);
    assert(rawGet.json, 'should return JSON');
    // Server returns id as a string; manifest stores it as a number.
    assertEqual(parseInt(rawGet.json.id, 10), manifest.site, 'id matches');
    pass();

    test('raw list returns items');
    // Site type is `{TYPE}:site` under per-app split mode.
    const appType = `${manifest.app}+${manifest.type}:site`;
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
    assertEqual(parseInt(getResult.json.id, 10), parseInt(createdId, 10), 'id matches round-trip');
    pass();
  });

  // ================================================================
  // PHASE 2 — Site / pattern / page / section
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
    const patShow = runCli('pattern show docs');
    assert(patShow.json, 'should return JSON');
    assertEqual(patShow.json.name, 'docs', 'name matches');
    assertEqual(patShow.json.instance, 'docs', 'instance from row type');
    pass();

    test('pattern dump by name');
    const patDump = runCli('pattern dump docs');
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
    const createResult = runCli("page create --title 'Test Page' --slug 'test-page'");
    assert(createResult.json, 'create returns JSON');
    const testPageId = createResult.json.id;
    assert(testPageId, 'has created page id');

    const updateResult = runCli(`page update ${testPageId} --title 'Updated Test Page'`);
    assert(updateResult.json, 'update returns JSON');
    assertIncludes(updateResult.json.message, 'updated', 'update message');

    const pubResult = runCli(`page publish ${testPageId}`);
    assertIncludes(pubResult.json.message, 'published', 'publish message');

    const showPub = runCli(`page show ${testPageId}`);
    assertEqual(showPub.json.published, 'published', 'page is published');

    const unpubResult = runCli(`page unpublish ${testPageId}`);
    assertIncludes(unpubResult.json.message, 'unpublished', 'unpublish message');

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
    const createResult = runCli(
      `section create ${homeSlug} --element-type lexical --title 'New Section'`
    );
    assert(createResult.json, 'create returns JSON');
    const newSecId = createResult.json.id;
    assert(newSecId, 'has created section id');
    // Also confirm it ended up with the modern `|component` type.
    assertIncludes(createResult.json.type, '|component', 'created type ends in |component');

    const updateResult = runCli(`section update ${newSecId} --set title='Updated Section'`);
    assert(updateResult.json, 'update returns JSON');
    assertIncludes(updateResult.json.message, 'updated', 'update message');

    const delResult = runCli(`section delete ${newSecId} --page ${homeSlug}`);
    assertIncludes(delResult.json.message, 'deleted', 'delete message');
    pass();
  });

  // ================================================================
  // PHASE 3 — Datasets (dmsEnv-driven)
  // ================================================================

  describe('Phase 3 — Dataset commands', () => {
    test('dataset list resolves sources via pattern.dmsEnvId');
    const dsList = runCli('dataset list');
    assert(dsList.json, 'should return JSON');
    assert(dsList.json.items.length >= 1, 'has at least 1 source');
    assertEqual(dsList.json.items[0].data.name, 'test_dataset', 'name matches');
    assert(dsList.json.dmsEnv, 'response includes dmsEnv id/type');
    pass();

    test('dataset show by name');
    const dsShow = runCli("dataset show 'test_dataset'");
    assert(dsShow.json, 'should return JSON');
    assertEqual(dsShow.json.name, 'test_dataset', 'name matches');
    assert(dsShow.json.categories, 'has categories');
    pass();

    test('dataset views returns array (may be empty)');
    const dsViews = runCli("dataset views 'test_dataset'");
    assert(dsViews.json !== undefined, 'should return JSON');
    assert(Array.isArray(dsViews.json), 'is array');
    pass();
  });

  describe('Phase 3 — Site tree', () => {
    test('site tree renders patterns + pages + sections + sources');
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

    const showResult = runCli(`section show ${sectionId}`);
    assertEqual(showResult.json.title, 'Hero Updated via Stdin', 'title was updated via stdin');
    pass();
  });

  // ================================================================
  // PHASE 4 — Page-structure room sync (Bug 20)
  // ================================================================
  // A page's live-edit Yjs room wins over the DB once it has content, so a
  // CLI write to draft_sections must also update the room — else the next
  // browser section save reverts the page to the room's stale list.

  await describeAsync('Phase 4 — Page-structure room sync', async () => {
    const about = manifest.pages.find((p) => p.title === 'About');
    const pageId = about.id;
    const dbIds = () => {
      const row = runCli(`raw get ${pageId}`).json;
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      return (data.draft_sections || []).map((s) => String(s.id));
    };
    const stubsOf = (ids, ref) => ids.map((id) => ({ id, ref }));
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    // Long enough for the server to persist + destroy an emptied room, so the
    // next join reloads from yjs_states (tests persistence, not just memory).
    const PERSIST_MS = 1500;

    test('never-written room: CLI leaves it alone (no_room), room stays empty');
    let r = runCli(`section create ${pageId} --element-type lexical --title 'R1'`);
    assertEqual(r.json?.room_sync?.status, 'no_room', 'room_sync status');
    await sleep(PERSIST_MS);
    let peek = await peekRoom(HOST, pageId);
    if (assert(peek.empty, 'room still never-written (browser will seed from DB)')) pass();

    // Reproduce the incident: a browser opens the page and seeds the room
    // from the current (1-section) draft, then leaves.
    const ref = r.json && `cli-test+${r.json.type}`;
    const seeded = dbIds();
    await seedRoom(HOST, pageId, stubsOf(seeded, ref));
    await sleep(PERSIST_MS);

    test('incident repro: section create on a seeded room repairs it');
    r = runCli(`section create ${pageId} --element-type lexical --title 'R2'`);
    assertEqual(r.json?.room_sync?.status, 'repaired', 'room_sync status');
    r = runCli(`section create ${pageId} --element-type lexical --title 'R3'`);
    assertEqual(r.json?.room_sync?.status, 'repaired', 'second create also repaired');
    await sleep(PERSIST_MS);
    peek = await peekRoom(HOST, pageId);
    let ok = assertEqual(dbIds().length, 3, 'DB has 3 draft sections');
    ok = assert(same(peek.ids, dbIds()), `persisted room ${JSON.stringify(peek.ids)} == DB ${JSON.stringify(dbIds())}`) && ok;
    if (ok) pass();

    test('in-sync room: page update --set title reports in_sync, room unchanged');
    r = runCli(`page update ${pageId} --set title='About Renamed'`);
    assertEqual(r.json?.room_sync?.status, 'in_sync', 'room_sync status');
    peek = await peekRoom(HOST, pageId);
    if (assert(same(peek.ids, dbIds()), 'room still == DB')) pass();

    test('--no-room-sync skips sync; sync-room --check detects stale; sync-room repairs');
    r = runCli(`--no-room-sync section create ${pageId} --element-type lexical --title 'R4'`);
    ok = assertEqual(r.json?.room_sync, undefined, 'no room_sync in output');
    await sleep(PERSIST_MS);
    let chk = runCli(`page sync-room ${pageId} --check`, { expectError: true });
    ok = assertEqual(chk.exitCode, 1, '--check exits 1 when stale') && ok;
    ok = assertIncludes(chk.stdout, '"stale"', '--check reports stale') && ok;
    peek = await peekRoom(HOST, pageId);
    ok = assertEqual(peek.ids.length, 3, '--check did not write') && ok;
    r = runCli(`page sync-room ${pageId}`);
    ok = assertEqual(r.json?.room_sync?.status, 'repaired', 'sync-room repairs') && ok;
    r = runCli(`page sync-room ${pageId} --check`);
    ok = assertEqual(r.json?.room_sync?.status, 'in_sync', 'then in_sync (exit 0)') && ok;
    if (ok) pass();

    test('live browser in the room: CLI delete is applied to the live doc and persisted');
    const live = await joinRoom(HOST, pageId);
    ok = assert(same(live.ids(), dbIds()), 'live member starts in sync');
    const victim = dbIds()[1];
    r = runCli(`section delete ${victim} --page ${pageId}`);
    ok = assertEqual(r.json?.room_sync?.status, 'repaired', 'room_sync status') && ok;
    await sleep(300); // let the live member drain the relayed update
    ok = assert(same(live.ids(), dbIds()), `live doc ${JSON.stringify(live.ids())} == DB ${JSON.stringify(dbIds())}`) && ok;
    ok = assert(!live.ids().includes(victim), 'deleted section gone from live doc') && ok;
    await live.leave();
    await sleep(PERSIST_MS);
    peek = await peekRoom(HOST, pageId);
    ok = assert(same(peek.ids, dbIds()), 'persisted after the live member left') && ok;
    if (ok) pass();

    test('raw update: page row with draft_sections syncs; non-page row does not');
    const reordered = [...dbIds()].reverse();
    r = runCli(`raw update ${pageId} --data '${JSON.stringify({ draft_sections: stubsOf(reordered, ref) })}'`);
    ok = assertEqual(r.json?.room_sync?.status, 'repaired', 'page row repaired (reorder)');
    peek = await peekRoom(HOST, pageId);
    ok = assert(same(peek.ids, reordered), 'room has the new order') && ok;
    r = runCli(`raw update ${manifest.sections[0].id} --set title='Hero Raw'`);
    ok = assertEqual(r.json?.room_sync, undefined, 'section row: no room sync') && ok;
    if (ok) pass();

    test('full replace to empty draft_sections empties the room (not "never-written")');
    r = runCli(`page update ${pageId} --data '{"draft_sections":[]}'`);
    ok = assertEqual(r.json?.room_sync?.status, 'repaired', 'room_sync status');
    await sleep(PERSIST_MS);
    peek = await peekRoom(HOST, pageId);
    ok = assert(!peek.empty && peek.ids.length === 0, `room written and empty (empty=${peek.empty}, ids=${peek.ids})`) && ok;
    if (ok) pass();

    test('sync-room on a missing page fails with exit 1');
    chk = runCli('page sync-room 99999999', { expectError: true });
    ok = assertEqual(chk.exitCode, 1, 'exit code');
    if (assert(/failed|not found/i.test(chk.stdout + chk.stderr), 'reports failure') && ok) pass();
  });

  const exitCode = summary();

  stopServer(server);
  process.exit(exitCode);
}

run().catch((err) => {
  console.error('\nTest runner error:', err);
  if (server) stopServer(server);
  process.exit(1);
});
