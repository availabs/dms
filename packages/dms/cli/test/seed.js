/**
 * Seed script — populates a fresh DMS database via Falcor HTTP calls.
 *
 * Produces fixtures that match the modern type scheme:
 *   site     → '{TYPE}:site'
 *   pattern  → '{TYPE}|{name}:pattern'
 *   page     → '{patternInstance}|page'
 *   section  → '{patternInstance}|component'
 *   dmsEnv   → '{TYPE}|{name}:dmsenv'
 *   source   → '{dmsEnvInstance}|{name}:source'
 *
 * The default site `--type` is the bare instance (e.g. `cli_test_site`);
 * the seed appends `:site` itself.
 *
 * Usage:
 *   node test/seed.js [host] [app] [type]
 *   Defaults: http://localhost:3456  cli-test  cli_test_site
 */

import { createFalcorClient } from '../src/client.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { nameToSlug } from '../../src/utils/type-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HOST = process.argv[2] || process.env.DMS_TEST_HOST || 'http://localhost:3456';
const APP = process.argv[3] || process.env.DMS_TEST_APP || 'cli-test';
const TYPE = process.argv[4] || process.env.DMS_TEST_TYPE || 'cli_test_site';

function loadFixture(name) {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf-8'));
}

/**
 * Pull the new row's id from a `dms.data.create` response. The server
 * may emit either app-namespaced (`dms.data.{app}.byId.{id}`) or
 * legacy (`dms.data.byId.{id}`) — we accept either.
 */
function getCreatedId(result, app) {
  const byApp = result?.json?.dms?.data?.[app]?.byId
    || result?.json?.dms?.data?.byId
    || {};
  const id = Object.keys(byApp)[0];
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
    dmsEnvs: [],
    sources: [],
  };

  // 1. Site row.
  const siteType = `${TYPE}:site`;
  const siteFixture = loadFixture('site.json');
  const siteResult = await falcor.call(
    ['dms', 'data', 'create'], [APP, siteType, siteFixture]
  );
  const siteId = getCreatedId(siteResult, APP);
  manifest.site = siteId;
  console.error(`  Created site id=${siteId}  type=${siteType}`);

  // 2. Pattern rows.
  const patternFixtures = loadFixture('patterns.json');

  for (const pat of patternFixtures) {
    const slug = nameToSlug(pat.name);
    const patType = `${TYPE}|${slug}:pattern`;
    const result = await falcor.call(
      ['dms', 'data', 'create'], [APP, patType, pat]
    );
    const id = getCreatedId(result, APP);
    manifest.patterns.push({
      id, name: pat.name, instance: slug, pattern_type: pat.pattern_type, type: patType,
    });
    console.error(`  Created pattern "${pat.name}" id=${id}  type=${patType}`);
  }

  // Attach patterns to site.
  const patternRefs = manifest.patterns.map((p) => ({
    id: String(p.id),
    ref: `${APP}+${TYPE}|${p.instance}:pattern`,
  }));
  await falcor.call(['dms', 'data', 'edit'], [APP, siteId, { patterns: patternRefs }]);
  console.error(`  Attached ${patternRefs.length} patterns to site`);

  // 3. Pages — attached to the page-type pattern.
  const pageFixtures = loadFixture('pages.json');
  const pagesPattern = manifest.patterns.find((p) => p.pattern_type === 'page');
  if (!pagesPattern) throw new Error('seed: no page pattern in fixtures');
  const pageType = `${pagesPattern.instance}|page`;

  for (const pg of pageFixtures) {
    if (pg.parent === '__ABOUT_ID__') {
      const aboutPage = manifest.pages.find((p) => p.title === 'About');
      pg.parent = aboutPage ? String(aboutPage.id) : null;
    }
    const result = await falcor.call(
      ['dms', 'data', 'create'], [APP, pageType, pg]
    );
    const id = getCreatedId(result, APP);
    manifest.pages.push({ id, title: pg.title, url_slug: pg.url_slug });
    console.error(`  Created page "${pg.title}" id=${id}  type=${pageType}`);
  }

  // 4. Sections — modern `|component` suffix, attached to Home page.
  const sectionFixtures = loadFixture('sections.json');
  const sectionType = `${pagesPattern.instance}|component`;
  const homePage = manifest.pages.find((p) => p.title === 'Home');
  const sectionRefs = [];

  for (const sec of sectionFixtures) {
    const result = await falcor.call(
      ['dms', 'data', 'create'], [APP, sectionType, sec]
    );
    const id = getCreatedId(result, APP);
    manifest.sections.push({ id, title: sec.title });
    sectionRefs.push({ id: String(id), ref: `${APP}+${sectionType}` });
    console.error(`  Created section "${sec.title}" id=${id}  type=${sectionType}`);
  }

  if (homePage && sectionRefs.length > 0) {
    await falcor.call(['dms', 'data', 'edit'], [APP, homePage.id, {
      draft_sections: sectionRefs,
      sections: sectionRefs,
    }]);
    console.error(`  Attached ${sectionRefs.length} sections to Home page`);
  }

  // 5. dmsEnv — owns the dataset sources.
  const dmsEnvName = 'test_env';
  const dmsEnvType = `${TYPE}|${dmsEnvName}:dmsenv`;
  const dmsEnvResult = await falcor.call(
    ['dms', 'data', 'create'], [APP, dmsEnvType, { name: dmsEnvName, sources: [] }]
  );
  const dmsEnvId = getCreatedId(dmsEnvResult, APP);
  manifest.dmsEnvs.push({ id: dmsEnvId, name: dmsEnvName, instance: dmsEnvName, type: dmsEnvType });
  console.error(`  Created dmsEnv "${dmsEnvName}" id=${dmsEnvId}  type=${dmsEnvType}`);

  // Link dmsEnv onto the datasets pattern via dmsEnvId, and onto site.dms_envs.
  const dsPattern = manifest.patterns.find((p) => p.pattern_type === 'datasets');
  if (dsPattern) {
    await falcor.call(['dms', 'data', 'edit'], [APP, dsPattern.id, {
      dmsEnvId,
    }]);
    console.error(`  Linked dmsEnv ${dmsEnvId} to datasets pattern ${dsPattern.id}`);
  }

  await falcor.call(['dms', 'data', 'edit'], [APP, siteId, {
    dms_envs: [{ id: String(dmsEnvId), ref: `${APP}+${dmsEnvType}` }],
  }]);

  // 6. Source rows under the dmsEnv.
  const datasetFixtures = loadFixture('datasets.json');
  const sourceRefs = [];
  for (const ds of datasetFixtures) {
    const slug = nameToSlug(ds.name);
    const sourceType = `${dmsEnvName}|${slug}:source`;
    const result = await falcor.call(
      ['dms', 'data', 'create'], [APP, sourceType, ds]
    );
    const id = getCreatedId(result, APP);
    manifest.sources.push({ id, name: ds.name, instance: slug, type: sourceType });
    sourceRefs.push({ id: String(id), ref: `${APP}+${sourceType}` });
    console.error(`  Created source "${ds.name}" id=${id}  type=${sourceType}`);
  }

  if (sourceRefs.length > 0) {
    await falcor.call(['dms', 'data', 'edit'], [APP, dmsEnvId, {
      sources: sourceRefs,
    }]);
    console.error(`  Attached ${sourceRefs.length} sources to dmsEnv`);
  }

  console.log(JSON.stringify(manifest, null, 2));
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
