/**
 * DMS Workflow Integration Test
 *
 * Simulates the complete workflow a client goes through using Falcor routes:
 * 1. Create a site
 * 2. Add patterns (pages, auth, datasets)
 * 3. Create pages within the pages pattern
 * 4. Add section_groups and sections to pages
 * 5. Verify data can be queried back correctly
 *
 * Uses the test graph harness to call Falcor routes directly,
 * matching how the real client interacts with the API.
 */

const { createTestGraph } = require('./graph');

const DB_NAME = process.env.DMS_TEST_DB || 'dms-sqlite';

// Test app name - unique to avoid conflicts
const TEST_APP = 'workflow-test-' + Date.now();

let graph = null;

/**
 * Initialize the test graph
 */
async function setup() {
  console.log('Setting up test graph...');
  graph = createTestGraph(DB_NAME);
  console.log(`Database: ${DB_NAME} (${graph.dbType})`);
  console.log(`Test app: ${TEST_APP}\n`);
  return graph;
}

/**
 * Clean up test data using Falcor delete route
 */
async function cleanup() {
  // Cleanup is done via delete calls at the end of the test
  // The graph connection is handled internally
}

/**
 * Helper: Extract a value from a Falcor JSON Graph response
 */
function getValue(jsonGraph, ...path) {
  let current = jsonGraph;
  for (const key of path) {
    if (!current) return undefined;
    current = current[key];
  }
  // Handle $atom wrapped values
  if (current && typeof current === 'object' && '$type' in current) {
    if (current.$type === 'atom') return current.value;
    if (current.$type === 'ref') return current.value;
  }
  return current;
}

/**
 * Helper: Extract ID from a Falcor create response
 */
function getCreatedId(jsonGraph) {
  const byIdData = jsonGraph?.dms?.data?.byId;
  if (!byIdData) return null;
  return Object.keys(byIdData)[0];
}

// ============================================================================
// WORKFLOW TESTS
// ============================================================================

async function testCreateSite() {
  console.log('--- Step 1: Create Site ---');

  // A site is stored with a unique type (UUID in real usage)
  const siteType = `test-type-${crypto.randomUUID()}`;

  // Create site via Falcor route
  const result = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, siteType]
  );

  const siteId = getCreatedId(result.jsonGraph);
  console.log('Created site:', siteId);

  if (!siteId) {
    throw new Error('No site ID returned from create');
  }

  // Edit to add site_name and patterns array
  const editResult = await graph.callAsync(
    ['dms', 'data', 'edit'],
    [siteId, { site_name: 'Test Site', patterns: [] }]
  );

  const siteData = getValue(editResult.jsonGraph, 'dms', 'data', 'byId', siteId, 'data');
  console.log('  site_name:', siteData?.site_name);
  console.log('  patterns:', siteData?.patterns);

  if (siteData?.site_name !== 'Test Site') {
    throw new Error('Site name mismatch');
  }

  return { id: siteId, type: siteType, data: siteData };
}

async function testAddPatterns(site) {
  console.log('\n--- Step 2: Add Patterns to Site ---');

  // Patterns are typically stored as entries in the site's patterns array
  const patterns = [
    { type: 'pages', name: 'Pages', doc_type: 'cms-page' },
    { type: 'auth', name: 'Authentication' },
    { type: 'datasets', name: 'Datasets' }
  ];

  // Update site with patterns
  const result = await graph.callAsync(
    ['dms', 'data', 'edit'],
    [site.id, { patterns }]
  );

  const updatedData = getValue(result.jsonGraph, 'dms', 'data', 'byId', site.id, 'data');
  console.log('Added patterns:', updatedData?.patterns?.map(p => p.type).join(', '));

  if (updatedData?.patterns?.length !== 3) {
    throw new Error('Pattern count mismatch');
  }

  return { ...site, data: updatedData };
}

async function testCreatePages(site) {
  console.log('\n--- Step 3: Create Pages ---');

  const pagesPattern = site.data.patterns.find(p => p.type === 'pages');
  const pageType = pagesPattern.doc_type;

  // Create home page
  const homeResult = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, pageType]
  );
  const homeId = getCreatedId(homeResult.jsonGraph);

  await graph.callAsync(
    ['dms', 'data', 'edit'],
    [homeId, {
      title: 'Home',
      url_slug: 'home',
      index: '0',
      parent: '',
      sections: [],
      section_groups: [],
      draft_sections: []
    }]
  );

  console.log('Created home page:', homeId, '- Home');

  // Create about page
  const aboutResult = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, pageType]
  );
  const aboutId = getCreatedId(aboutResult.jsonGraph);

  await graph.callAsync(
    ['dms', 'data', 'edit'],
    [aboutId, {
      title: 'About',
      url_slug: 'about',
      index: '1',
      parent: '',
      sections: [],
      section_groups: [],
      draft_sections: []
    }]
  );

  console.log('Created about page:', aboutId, '- About');

  // Create nested team page (child of about)
  const teamResult = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, pageType]
  );
  const teamId = getCreatedId(teamResult.jsonGraph);

  await graph.callAsync(
    ['dms', 'data', 'edit'],
    [teamId, {
      title: 'Team',
      url_slug: 'about/team',
      index: '0',
      parent: String(aboutId),
      sections: [],
      section_groups: [],
      draft_sections: []
    }]
  );

  console.log('Created team page:', teamId, '- Team (parent:', aboutId + ')');

  return { homePage: { id: homeId }, aboutPage: { id: aboutId }, teamPage: { id: teamId }, pageType };
}

async function testAddSectionGroups(pages) {
  console.log('\n--- Step 4: Add Section Groups to Pages ---');

  const { homePage } = pages;

  // Section groups define layout areas
  const sectionGroups = [
    { name: 'default', position: 'content', index: 0, theme: 'content' },
    { name: 'sidebar', position: 'sidebar', index: 1, theme: 'sidebar' }
  ];

  const result = await graph.callAsync(
    ['dms', 'data', 'edit'],
    [homePage.id, { section_groups: sectionGroups }]
  );

  const updatedData = getValue(result.jsonGraph, 'dms', 'data', 'byId', homePage.id, 'data');
  console.log('Added section_groups to home page:', updatedData?.section_groups?.length, 'groups');

  if (updatedData?.section_groups?.length !== 2) {
    throw new Error('Section group count mismatch');
  }

  return { ...homePage, data: updatedData };
}

async function testCreateSections(pages) {
  console.log('\n--- Step 5: Create Sections ---');

  const { homePage, pageType } = pages;

  // Sections are separate data items, referenced by pages
  const sectionType = pageType + '|cms-section';

  // Create header section
  const headerResult = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, sectionType]
  );
  const headerId = getCreatedId(headerResult.jsonGraph);

  await graph.callAsync(
    ['dms', 'data', 'edit'],
    [headerId, {
      title: 'Header Section',
      element: {
        'element-type': 'lexical',
        'element-data': '{"root":{"children":[]}}'
      },
      tags: 'header,intro'
    }]
  );

  console.log('Created header section:', headerId);

  // Create content section
  const contentResult = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, sectionType]
  );
  const contentId = getCreatedId(contentResult.jsonGraph);

  await graph.callAsync(
    ['dms', 'data', 'edit'],
    [contentId, {
      title: 'Main Content',
      element: {
        'element-type': 'lexical',
        'element-data': '{"root":{"children":[]}}'
      },
      tags: 'content,body'
    }]
  );

  console.log('Created content section:', contentId);

  // Link sections to the home page
  const sections = [
    { id: String(headerId), ref: `${TEST_APP}+${sectionType}` },
    { id: String(contentId), ref: `${TEST_APP}+${sectionType}` }
  ];

  await graph.callAsync(
    ['dms', 'data', 'edit'],
    [homePage.id, { sections, draft_sections: sections }]
  );

  console.log('Linked sections to home page');

  return { headerSection: { id: headerId }, contentSection: { id: contentId }, sectionType };
}

async function testQueryData(pages, sections) {
  console.log('\n--- Step 6: Query Data Back (Verify) ---');

  const { homePage, pageType } = pages;
  const { sectionType } = sections;

  // Query the page data via Falcor GET
  const pageResult = await graph.getAsync([
    ['dms', 'data', 'byId', homePage.id, ['data', 'id', 'app', 'type']]
  ]);

  const pageData = getValue(pageResult.jsonGraph, 'dms', 'data', 'byId', homePage.id, 'data');

  console.log('Retrieved home page:');
  console.log('  title:', pageData?.title);
  console.log('  sections count:', pageData?.sections?.length);
  console.log('  section_groups count:', pageData?.section_groups?.length);

  if (pageData?.sections?.length !== 2) {
    throw new Error('Expected 2 sections, got ' + pageData?.sections?.length);
  }

  // Query data length for pages
  const lengthResult = await graph.getAsync([
    ['dms', 'data', `${TEST_APP}+${pageType}`, 'length']
  ]);

  const pageCount = getValue(lengthResult.jsonGraph, 'dms', 'data', `${TEST_APP}+${pageType}`, 'length');
  console.log('\nAll pages:', pageCount);

  if (pageCount !== 3) {
    throw new Error('Expected 3 pages, got ' + pageCount);
  }

  // Query pages by index to verify content
  const pagesResult = await graph.getAsync([
    ['dms', 'data', `${TEST_APP}+${pageType}`, 'byIndex', [0, 1, 2]]
  ]);

  // The byIndex returns refs, so we need to follow them
  for (let i = 0; i < 3; i++) {
    const ref = getValue(pagesResult.jsonGraph, 'dms', 'data', `${TEST_APP}+${pageType}`, 'byIndex', i);
    if (ref) {
      const refId = ref[ref.length - 1]; // Get the ID from the ref path
      const detailResult = await graph.getAsync([
        ['dms', 'data', 'byId', refId, 'data']
      ]);
      const data = getValue(detailResult.jsonGraph, 'dms', 'data', 'byId', refId, 'data');
      console.log('  -', data?.title, '(' + data?.url_slug + ')');
    }
  }

  // Query sections
  const sectionLengthResult = await graph.getAsync([
    ['dms', 'data', `${TEST_APP}+${sectionType}`, 'length']
  ]);

  const sectionCount = getValue(sectionLengthResult.jsonGraph, 'dms', 'data', `${TEST_APP}+${sectionType}`, 'length');
  console.log('\nAll sections:', sectionCount);

  if (sectionCount !== 2) {
    throw new Error('Expected 2 sections, got ' + sectionCount);
  }

  return true;
}

async function testDeleteWorkflow(site, pages, sections) {
  console.log('\n--- Step 7: Delete Workflow ---');

  const { sectionType, headerSection, contentSection } = sections;
  const { pageType, homePage, aboutPage, teamPage } = pages;

  // Delete sections first
  const deleteSectionsResult = await graph.callAsync(
    ['dms', 'data', 'delete'],
    [TEST_APP, sectionType, headerSection.id, contentSection.id]
  );

  console.log('Deleted sections: 2');

  // Delete pages
  const deletePagesResult = await graph.callAsync(
    ['dms', 'data', 'delete'],
    [TEST_APP, pageType, homePage.id, aboutPage.id, teamPage.id]
  );

  console.log('Deleted pages: 3');

  // Delete site
  await graph.callAsync(
    ['dms', 'data', 'delete'],
    [TEST_APP, site.type, site.id]
  );

  // Verify everything is deleted by checking length
  const lengthResult = await graph.getAsync([
    ['dms', 'data', `${TEST_APP}+${pageType}`, 'length']
  ]);

  const remainingPages = getValue(lengthResult.jsonGraph, 'dms', 'data', `${TEST_APP}+${pageType}`, 'length');
  console.log('Remaining pages:', remainingPages);

  if (remainingPages !== 0) {
    throw new Error('Expected 0 remaining pages, got ' + remainingPages);
  }

  return true;
}

// ============================================================================
// MAIN
// ============================================================================

async function runWorkflowTest() {
  console.log('=== DMS Workflow Integration Test ===\n');

  try {
    await setup();

    // Run the complete workflow using Falcor routes
    const site = await testCreateSite();
    const updatedSite = await testAddPatterns(site);
    const pages = await testCreatePages(updatedSite);
    await testAddSectionGroups(pages);
    const sections = await testCreateSections(pages);
    await testQueryData(pages, sections);
    await testDeleteWorkflow(updatedSite, pages, sections);

    console.log('\n=== Workflow Test Passed! ===');

  } catch (error) {
    console.error('\nWorkflow test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

runWorkflowTest();
