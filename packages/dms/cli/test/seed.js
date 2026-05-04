/**
 * Seed script — populates a fresh DMS database via Falcor HTTP calls
 *
 * Uses the same client as the CLI to seed test data.
 * Outputs a JSON manifest with all created IDs to stdout.
 *
 * Usage:
 *   node test/seed.js [host] [app] [type]
 *   Defaults: http://localhost:3456  cli-test  cli-test-site
 */

import { createFalcorClient } from '../src/client.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HOST = process.argv[2] || process.env.DMS_TEST_HOST || 'http://localhost:3456';
const APP = process.argv[3] || process.env.DMS_TEST_APP || 'cli-test';
const TYPE = process.argv[4] || process.env.DMS_TEST_TYPE || 'cli-test-site';

function loadFixture(name) {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf-8'));
}

function getCreatedId(result) {
  const byId = result?.json?.dms?.data?.byId || {};
  const id = Object.keys(byId)[0];
  return id ? parseInt(id, 10) : null;
}

async function seed() {
  const falcor = createFalcorClient(HOST);

  const manifest = {
    host: HOST,
    app: APP,
    type: TYPE,
    site: null,
    patterns: [],
    pages: [],
    sections: [],
    datasets: [],
  };

  // 1. Create site item
  const siteFixture = loadFixture('site.json');
  const siteResult = await falcor.call(
    ['dms', 'data', 'create'],
    [APP, TYPE, siteFixture]
  );
  const siteId = getCreatedId(siteResult);
  manifest.site = siteId;
  console.error(`  Created site id=${siteId}`);

  // 2. Create patterns
  const patternFixtures = loadFixture('patterns.json');
  const patternType = `${TYPE}|pattern`;

  for (const pat of patternFixtures) {
    const result = await falcor.call(
      ['dms', 'data', 'create'],
      [APP, patternType, pat]
    );
    const id = getCreatedId(result);
    manifest.patterns.push({ id, name: pat.name, pattern_type: pat.pattern_type });
    console.error(`  Created pattern "${pat.name}" id=${id}`);
  }

  // Update site with pattern refs
  const patternRefs = manifest.patterns.map(p => ({
    ref: `dms.data.byId.${p.id}`,
    id: p.id,
  }));

  await falcor.call(['dms', 'data', 'edit'], [siteId, { patterns: patternRefs }]);
  console.error(`  Updated site with ${patternRefs.length} pattern refs`);

  // 3. Create pages
  const pageFixtures = loadFixture('pages.json');
  const pagesPattern = manifest.patterns.find(p => p.pattern_type === 'page');
  const docType = 'docs-page'; // from fixture

  for (const pg of pageFixtures) {
    // Resolve __ABOUT_ID__ parent placeholder
    if (pg.parent === '__ABOUT_ID__') {
      const aboutPage = manifest.pages.find(p => p.title === 'About');
      pg.parent = aboutPage ? String(aboutPage.id) : null;
    }

    const result = await falcor.call(
      ['dms', 'data', 'create'],
      [APP, docType, pg]
    );
    const id = getCreatedId(result);
    manifest.pages.push({ id, title: pg.title, url_slug: pg.url_slug });
    console.error(`  Created page "${pg.title}" id=${id}`);
  }

  // 4. Create sections and attach to Home page
  const sectionFixtures = loadFixture('sections.json');
  const sectionType = `${docType}|cms-section`;
  const homePage = manifest.pages.find(p => p.title === 'Home');

  const sectionRefs = [];

  for (const sec of sectionFixtures) {
    const result = await falcor.call(
      ['dms', 'data', 'create'],
      [APP, sectionType, sec]
    );
    const id = getCreatedId(result);
    manifest.sections.push({ id, title: sec.title });
    sectionRefs.push({ ref: `dms.data.byId.${id}`, id });
    console.error(`  Created section "${sec.title}" id=${id}`);
  }

  // Attach sections to Home page
  if (homePage) {
    await falcor.call(['dms', 'data', 'edit'], [homePage.id, {
      draft_sections: sectionRefs,
      sections: sectionRefs,
    }]);
    console.error(`  Attached ${sectionRefs.length} sections to Home page`);
  }

  // 5. Create dataset source
  const datasetFixtures = loadFixture('datasets.json');
  const dsPattern = manifest.patterns.find(p => p.pattern_type === 'datasets');
  const dsDocType = 'test-datasets';
  const sourceType = `${dsDocType}|source`;

  for (const ds of datasetFixtures) {
    const result = await falcor.call(
      ['dms', 'data', 'create'],
      [APP, sourceType, ds]
    );
    const id = getCreatedId(result);
    manifest.datasets.push({ id, name: ds.name });
    console.error(`  Created dataset source "${ds.name}" id=${id}`);
  }

  // Output manifest to stdout
  console.log(JSON.stringify(manifest, null, 2));
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
