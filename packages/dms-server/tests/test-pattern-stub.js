/**
 * Regression tests for the no-access pattern stub
 * (planning/tasks/current/no-access-stub-default-theme.md).
 *
 * When a byId GET for a restricted pattern fails the server-side auth check,
 * the route returns a minimal stub so the client can still build the route and
 * redirect to login. That stub MUST include `theme` — omitting it made every
 * transient auth failure render the site with the default theme (and the
 * login redirect unbranded). `config` stays out (schema info, not needed for
 * routing/branding).
 *
 * Run: node tests/test-pattern-stub.js
 */
const assert = require('assert');
const { createTestGraph } = require('./graph');

const DB_NAME = process.env.DMS_TEST_DB || 'dms-sqlite';
const TEST_APP = 'stub-test-' + Date.now();
const PATTERN_TYPE = 'prod|dash:pattern';

const THEME = {
  selectedTheme: 'brand',
  layout: { options: { topNav: { size: 'compact' } } },
};
const AUTH = { groups: { 'Site Admin': ['*'], public: [] }, users: {} };
const LOCATIONS = [{ base_url: '/', subdomain: 'dash' }];
const RETIRED_SUBDOMAINS = ['dash-old'];

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
};

async function main() {
  const admin = createTestGraph(DB_NAME, {
    user: { id: 1, email: 'admin@test.com', groups: ['Site Admin'], authed: true },
  });
  await admin.ready;
  console.log(`Database: ${DB_NAME} (${admin.dbType})  app: ${TEST_APP}\n`);

  // Seed a restricted, themed pattern row
  const createResult = await admin.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, PATTERN_TYPE, {
      name: 'Dash',
      base_url: '/',
      pattern_type: 'page',
      subdomain: '*',
      theme: THEME,
      config: { attributes: [{ key: 'secret-schema' }] },
      authPermissions: AUTH,
      locations: LOCATIONS,
      retired_subdomains: RETIRED_SUBDOMAINS,
    }]
  );
  const id = Object.keys(createResult.jsonGraph?.dms?.data?.byId || {})[0];
  assert(id, 'pattern row created');

  const reqPaths = [['dms', 'data', TEST_APP, 'byId', id, ['data', 'type']]];
  const readData = (res) =>
    res.jsonGraph?.dms?.data?.[TEST_APP]?.byId?.[id]?.data?.value;

  // --- Anonymous request → stub ---
  const anon = createTestGraph(DB_NAME, { user: null });
  await anon.ready;
  const anonData = readData(await anon.getAsync(reqPaths));

  console.log('anonymous request for a restricted pattern:');
  t('returns the no-access stub', () =>
    assert.strictEqual(anonData?.id, 'no-access'));
  t('stub keeps routing info (base_url, pattern_type)', () => {
    assert.strictEqual(anonData?.base_url, '/');
    assert.strictEqual(anonData?.pattern_type, 'page');
  });
  t('stub includes theme (branded login redirect, no default-theme flash)', () =>
    assert.deepStrictEqual(anonData?.theme, THEME));
  t('stub keeps locations (non-primary mounts stay routable while logged out)', () =>
    assert.deepStrictEqual(anonData?.locations, LOCATIONS));
  t('stub keeps retired_subdomains (redirect still fires while logged out)', () =>
    assert.deepStrictEqual(anonData?.retired_subdomains, RETIRED_SUBDOMAINS));
  t('stub still omits config', () =>
    assert.strictEqual(anonData?.config, undefined));

  // --- Anonymous request for ONLY `data` (no `type`) → still the stub ---
  // The auth check keys off row.type; when the caller doesn't request `type`
  // the row used to come back without it, skipping the check entirely and
  // leaking full restricted data to anonymous callers.
  const dataOnly = readData(
    await anon.getAsync([['dms', 'data', TEST_APP, 'byId', id, 'data']]));
  console.log('anonymous request for only [data] (auth-check bypass probe):');
  t('still returns the stub, not full data', () => {
    assert.strictEqual(dataOnly?.id, 'no-access');
    assert.strictEqual(dataOnly?.config, undefined);
    assert.deepStrictEqual(dataOnly?.theme, THEME);
  });

  // --- Logged-in but unauthorized user → same stub shape ---
  const stranger = createTestGraph(DB_NAME, {
    user: { id: 99, email: 'rando@test.com', groups: ['Rando'], authed: true },
  });
  await stranger.ready;
  const strangerData = readData(await stranger.getAsync(reqPaths));

  console.log('logged-in but unauthorized user:');
  t('returns the stub with theme', () => {
    assert.strictEqual(strangerData?.id, 'no-access');
    assert.deepStrictEqual(strangerData?.theme, THEME);
  });

  // --- Permitted user → full data (control) ---
  const permittedData = readData(await admin.getAsync(reqPaths));
  console.log('permitted user (control):');
  t('gets full pattern data with theme and config', () => {
    assert.notStrictEqual(permittedData?.id, 'no-access');
    assert.deepStrictEqual(permittedData?.theme, THEME);
    assert.deepStrictEqual(permittedData?.config, { attributes: [{ key: 'secret-schema' }] });
  });

  // --- The site's admin pattern row is never stubbed ---
  // It only holds routing/branding config the stub returns anyway; stubbing it
  // for anonymous boots stopped the client caching its site snapshot. Even with
  // `public` removed from its grants, it comes back whole. (Admin pattern as a
  // saved row: dms planning/tasks/current/admin-pattern-data-row.md.)
  const ADMIN_TYPE = 'prod|admin:pattern';
  const adminCreate = await admin.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, ADMIN_TYPE, {
      name: 'Admin', base_url: 'list', pattern_type: 'admin', subdomain: '*',
      theme: THEME, authPermissions: AUTH,
    }]
  );
  const adminId = Object.keys(adminCreate.jsonGraph?.dms?.data?.byId || {})[0];
  assert(adminId, 'admin pattern row created');
  const anonAdmin = (await anon.getAsync([['dms', 'data', TEST_APP, 'byId', adminId, ['data', 'type']]]))
    .jsonGraph?.dms?.data?.[TEST_APP]?.byId?.[adminId]?.data?.value;
  console.log('anonymous request for the admin pattern row (restricted, no public grant):');
  t('returns the full row, not the stub', () => {
    assert.notStrictEqual(anonAdmin?.id, 'no-access');
    assert.strictEqual(anonAdmin?.pattern_type, 'admin');
    assert.strictEqual(anonAdmin?.base_url, 'list');
    assert.deepStrictEqual(anonAdmin?.theme, THEME);
  });
  t('a non-admin restricted pattern is still stubbed (exemption is admin-only)', () =>
    assert.strictEqual(anonData?.id, 'no-access'));

  // --- Admin-panel pattern permissions load the pattern row, not its pages ---
  // A user granted only edit-pattern (or edit-pattern-permissions /
  // delete-pattern) must be able to read the pattern row, or the admin list and
  // Pattern Editor can't show it. Its pages stay view-page-only.
  // (dms planning/tasks/completed/admin-granular-permissions.md, Phase 4)
  const ADMIN_PERMS_TYPE = 'prod|managed:pattern';
  const managedCreate = await admin.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, ADMIN_PERMS_TYPE, {
      name: 'Managed', base_url: '/managed', pattern_type: 'page', subdomain: '*',
      authPermissions: {
        groups: {
          'Site Admin': ['*'],
          public: [],
          Editors: ['edit-pattern'],
          Keepers: ['edit-pattern-permissions'],
          Deleters: ['delete-pattern'],
          Viewers: ['view-page'],
        },
        users: {},
      },
    }]
  );
  const managedId = Object.keys(managedCreate.jsonGraph?.dms?.data?.byId || {})[0];
  assert(managedId, 'managed pattern row created');
  const pageCreate = await admin.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, 'managed|page', { title: 'Secret page', url_slug: 'secret', index: 0 }]
  );
  const pageId = Object.keys(pageCreate.jsonGraph?.dms?.data?.byId || {})[0];
  assert(pageId, 'page row created');

  const asGroup = async (group) => {
    const g = createTestGraph(DB_NAME, { user: { id: 50, email: `${group}@test.com`, groups: [group], authed: true } });
    await g.ready;
    // A blocked page's `data` is the bare string 'no-access', not an atom.
    const read = async (rowId) => {
      const data = (await g.getAsync([['dms', 'data', TEST_APP, 'byId', rowId, ['data', 'type']]]))
        .jsonGraph?.dms?.data?.[TEST_APP]?.byId?.[rowId]?.data;
      return data?.$type === 'atom' ? data.value : data;
    };
    return { pattern: await read(managedId), page: await read(pageId) };
  };

  console.log('pattern-level admin permissions (pattern row vs its pages):');
  for (const group of ['Editors', 'Keepers', 'Deleters']) {
    const { pattern, page } = await asGroup(group);
    t(`${group}: reads the full pattern row`, () => {
      assert.notStrictEqual(pattern?.id, 'no-access');
      assert.strictEqual(pattern?.name, 'Managed');
    });
    t(`${group}: its pages are still blocked`, () =>
      assert.strictEqual(page, 'no-access'));
  }
  const viewers = await asGroup('Viewers');
  t('Viewers (view-page): pattern row and pages both readable (unchanged)', () => {
    assert.strictEqual(viewers.pattern?.name, 'Managed');
    assert.strictEqual(viewers.page?.title, 'Secret page');
  });
  const outsiders = await asGroup('Outsiders');
  t('a group with no grant still gets the pattern stub', () =>
    assert.strictEqual(outsiders.pattern?.id, 'no-access'));

  // --- A content pattern whose instance is `admin` shares the admin row's type ---
  // mitigat-ny-prod: page pattern 566466 and the backfilled admin row 2724987
  // are both `prod|admin:pattern`. Pages (`admin|page`) must be judged by the
  // content pattern's grants, never the admin row's (found 2026-09-30).
  const COLL_TYPE = 'prod|admin:pattern';
  const collPat = Object.keys((await admin.callAsync(['dms', 'data', 'create'], [TEST_APP, COLL_TYPE, {
    name: 'admin', base_url: '/admin', pattern_type: 'page', subdomain: '*',
    authPermissions: { '*': JSON.stringify({ groups: { 'Site Admin': ['*'], Viewers: ['view-page'], public: [] }, users: {} }) },
  }])).jsonGraph?.dms?.data?.byId || {})[0];
  const collPage = Object.keys((await admin.callAsync(['dms', 'data', 'create'], [TEST_APP, 'admin|page',
    { title: 'Admin Page', url_slug: 'admin-page', index: 0 }])).jsonGraph?.dms?.data?.byId || {})[0];
  // the admin row comes later (higher id), with no grants — as the backfill leaves it
  const collAdmin = Object.keys((await admin.callAsync(['dms', 'data', 'create'], [TEST_APP, COLL_TYPE, {
    name: 'Admin', base_url: 'list', pattern_type: 'admin', subdomain: '*',
  }])).jsonGraph?.dms?.data?.byId || {})[0];
  assert(collPat && collPage && collAdmin && +collAdmin > +collPat, 'collision rows created, admin row newest');

  const readPage = async (graph) => {
    const d = (await graph.getAsync([['dms', 'data', TEST_APP, 'byId', collPage, ['data', 'type']]]))
      .jsonGraph?.dms?.data?.[TEST_APP]?.byId?.[collPage]?.data;
    return d?.$type === 'atom' ? d.value : d;
  };
  const viewerG = createTestGraph(DB_NAME, { user: { id: 60, email: 'viewer@test.com', groups: ['Viewers'], authed: true } });
  await viewerG.ready;
  const isFull = v => v && v !== 'no-access' && (typeof v === 'string' ? JSON.parse(v) : v).title === 'Admin Page';

  console.log('content pattern sharing the admin row type (admin row empty):');
  const v1 = await readPage(viewerG), s1 = await readPage(stranger), a1 = await readPage(anon);
  t('viewer (view-page on the content pattern) reads its page', () => assert(isFull(v1), JSON.stringify(v1)));
  t('ungranted user is blocked (not let in by the empty admin row)', () => assert.strictEqual(s1, 'no-access'));
  t('anonymous is blocked (not let in by the empty admin row)', () => assert.strictEqual(a1, 'no-access'));

  await admin.callAsync(['dms', 'data', 'edit'], [TEST_APP, collAdmin, {
    authPermissions: { '*': JSON.stringify({ groups: { 'Site Admin': ['*'], Viewers: ['view-pattern-list'], public: [] }, users: {} }) },
  }]);
  console.log('…after site-level grants on the admin row:');
  const v2 = await readPage(viewerG), s2 = await readPage(stranger);
  t('viewer still reads the page (admin row grants are ignored for pages)', () => assert(isFull(v2), JSON.stringify(v2)));
  t('ungranted user still blocked', () => assert.strictEqual(s2, 'no-access'));

  await admin.callAsync(['dms', 'data', 'delete'], [TEST_APP, 'admin|page', collPage]);
  await admin.callAsync(['dms', 'data', 'delete'], [TEST_APP, COLL_TYPE, collAdmin]);
  await admin.callAsync(['dms', 'data', 'delete'], [TEST_APP, COLL_TYPE, collPat]);

  // --- A QA install's stub carries its "where to file" refs (client patterns/qa/reportIssue) ---
  // Only the tickets and covered-sites refs, under qa.intake; the install's full qa.datasets stays out.
  const QA_TYPE = 'prod|qa:pattern';
  const ref = (slug, n) => ({ slug, source_id: n, view_id: n + 1 });
  const QA_DATASETS = {
    tickets: ref('qa_tickets', 10), pages: ref('qa_pages', 12), stories: ref('qa_stories', 14),
    patterns: ref('qa_patterns', 16), history: ref('qa_history', 18),
  };
  const qaCreate = await admin.callAsync(['dms', 'data', 'create'], [TEST_APP, QA_TYPE, {
    name: 'QA', base_url: 'qa', pattern_type: 'qa', dmsEnvId: 7,
    qa: { version: 1, datasets: QA_DATASETS }, authPermissions: AUTH,
  }]);
  const qaId = Object.keys(qaCreate.jsonGraph?.dms?.data?.byId || {})[0];
  assert(qaId, 'qa install row created');
  const readQa = async (g) => (await g.getAsync([['dms', 'data', TEST_APP, 'byId', qaId, ['data', 'type']]]))
    .jsonGraph?.dms?.data?.[TEST_APP]?.byId?.[qaId]?.data?.value;
  console.log('QA install stub (Report an issue intake):');
  const qaStranger = await readQa(stranger);
  t('ungranted user gets the stub with only the tickets and covered-sites refs', () => {
    assert.strictEqual(qaStranger?.id, 'no-access');
    assert.deepStrictEqual(qaStranger?.qa, { intake: { tickets: QA_DATASETS.tickets, patterns: QA_DATASETS.patterns } });
    assert.strictEqual(qaStranger?.dmsEnvId, undefined);
  });
  const qaAnon = await readQa(anon);
  t('anonymous gets the same intake refs', () =>
    assert.deepStrictEqual(qaAnon?.qa, { intake: { tickets: QA_DATASETS.tickets, patterns: QA_DATASETS.patterns } }));
  const qaAdmin = await readQa(admin);
  t('granted user gets the full settings (qa.datasets, no intake)', () => {
    assert.deepStrictEqual(qaAdmin?.qa, { version: 1, datasets: QA_DATASETS });
    assert.strictEqual(qaAdmin?.dmsEnvId, 7);
  });
  const pageStub = readData(await stranger.getAsync(reqPaths));
  t('a non-qa pattern stub carries no qa key', () => assert.strictEqual(pageStub?.qa, undefined));
  // An install whose datasets aren't set up yet (an interrupted install) has nothing to file into.
  const partialCreate = await admin.callAsync(['dms', 'data', 'create'], [TEST_APP, QA_TYPE, {
    name: 'QA2', base_url: 'qa2', pattern_type: 'qa',
    qa: { version: 1, datasets: { tickets: QA_DATASETS.tickets } }, authPermissions: AUTH,
  }]);
  const partialId = Object.keys(partialCreate.jsonGraph?.dms?.data?.byId || {})[0];
  const qaPartial = (await stranger.getAsync([['dms', 'data', TEST_APP, 'byId', partialId, ['data', 'type']]]))
    .jsonGraph?.dms?.data?.[TEST_APP]?.byId?.[partialId]?.data?.value;
  t('an install without both refs: stub has no qa key', () => {
    assert.strictEqual(qaPartial?.id, 'no-access');
    assert.strictEqual(qaPartial?.qa, undefined);
  });
  await admin.callAsync(['dms', 'data', 'delete'], [TEST_APP, QA_TYPE, qaId, partialId]);

  // Cleanup
  await admin.callAsync(['dms', 'data', 'delete'], [TEST_APP, 'managed|page', pageId]);
  await admin.callAsync(['dms', 'data', 'delete'], [TEST_APP, ADMIN_PERMS_TYPE, managedId]);
  await admin.callAsync(['dms', 'data', 'delete'], [TEST_APP, ADMIN_TYPE, adminId]);
  await admin.callAsync(['dms', 'data', 'delete'], [TEST_APP, PATTERN_TYPE, id]);

  console.log(`\npattern-stub tests: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
