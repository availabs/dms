/**
 * Site commands
 *
 * Display site info and list its patterns.
 */

import { makeClient, fetchAll, fetchById, fetchByIds, getPageType, getDatasetType, parseData } from '../utils/data.js';
import { output, outputError } from '../utils/output.js';

/**
 * Show site info
 */
export async function show(config, options = {}) {
  try {
    const falcor = makeClient(config);
    const siteType = `${config.app}+${config.type}`;

    const { items, total } = await fetchAll(falcor, siteType, ['id', 'app', 'type', 'data'], { limit: 1 });

    if (items.length === 0) {
      outputError(`No site found for ${siteType}`);
      return;
    }

    const site = items[0];
    const data = parseData(site.data);

    const result = {
      id: site.id,
      site_name: data.site_name || data.name || '(unnamed)',
      app: site.app,
      type: site.type,
      pattern_count: (data.patterns || []).length,
      theme_refs_count: (data.theme_refs || []).length,
    };

    output(result, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * List site patterns
 */
export async function patterns(config, options = {}) {
  try {
    const falcor = makeClient(config);
    const siteType = `${config.app}+${config.type}`;

    // Fetch site to get pattern refs
    const { items } = await fetchAll(falcor, siteType, ['id', 'data'], { limit: 1 });

    if (items.length === 0) {
      outputError(`No site found for ${siteType}`);
      return;
    }

    const siteData = parseData(items[0].data);
    const patternRefs = siteData.patterns || [];

    if (patternRefs.length === 0) {
      output([], { ...options, mode: 'list' });
      return;
    }

    // Extract pattern IDs from refs (could be { ref: 'dms.data.byId.X', id: X })
    const patternIds = patternRefs.map(ref => {
      if (typeof ref === 'object' && ref.id) return ref.id;
      if (typeof ref === 'number') return ref;
      return null;
    }).filter(Boolean);

    const patternItems = await fetchByIds(falcor, patternIds, ['id', 'app', 'type', 'data']);

    const result = patternItems.map(p => {
      const d = parseData(p.data);
      return {
        id: p.id,
        name: d.name || '(unnamed)',
        pattern_type: d.pattern_type || '?',
        base_url: d.base_url || '/',
        subdomain: d.subdomain || '*',
      };
    });

    if (options.format === 'summary') {
      output(result, { ...options, mode: 'list' });
    } else {
      output(result, options);
    }
  } catch (error) {
    outputError(error);
  }
}

/**
 * Show full site tree: site → patterns → pages/datasets → sections
 */
export async function tree(config, options = {}) {
  try {
    const falcor = makeClient(config);
    const siteType = `${config.app}+${config.type}`;

    // Fetch site
    const { items } = await fetchAll(falcor, siteType, ['id', 'app', 'type', 'data'], { limit: 1 });

    if (items.length === 0) {
      outputError(`No site found for ${siteType}`);
      return;
    }

    const site = items[0];
    const siteData = parseData(site.data);
    const patternRefs = siteData.patterns || [];

    if (patternRefs.length === 0) {
      output({ site, patterns: [] }, { ...options, format: 'tree' });
      return;
    }

    // Fetch pattern items
    const patternIds = patternRefs.map(ref => {
      if (typeof ref === 'object' && ref.id) return ref.id;
      if (typeof ref === 'number') return ref;
      return null;
    }).filter(Boolean);

    const patternItems = await fetchByIds(falcor, patternIds, ['id', 'app', 'type', 'data']);

    // For each pattern, fetch children based on type
    for (const pat of patternItems) {
      const d = parseData(pat.data);
      pat.data = d;

      if (d.pattern_type === 'page') {
        // Fetch pages
        const docType = d.doc_type || (d.base_url || '').replace(/\//g, '');
        const pageType = `${config.app}+${docType}`;
        const sectionSuffix = `${docType}|cms-section`;

        const { items: pages } = await fetchAll(falcor, pageType, ['id', 'data'], { limit: 500 });

        // For each page, fetch sections
        for (const pg of pages) {
          pg.data = parseData(pg.data);
          const sectionRefs = pg.data.sections || pg.data.draft_sections || [];
          const sectionIds = sectionRefs
            .map(s => (typeof s === 'object' ? s.id : s))
            .filter(Boolean);

          if (sectionIds.length > 0) {
            pg._sections = await fetchByIds(falcor, sectionIds, ['id', 'data']);
            pg._sections.forEach(s => { s.data = parseData(s.data); });
          } else {
            pg._sections = [];
          }
        }

        pat._pages = pages;
      } else if (d.pattern_type === 'datasets' || d.pattern_type === 'forms') {
        // Fetch dataset sources
        const docType = d.doc_type || (d.base_url || '').replace(/\//g, '');
        const sourceType = `${config.app}+${docType}|source`;

        const { items: sources } = await fetchAll(falcor, sourceType, ['id', 'data'], { limit: 500 });

        pat._datasets = sources.map(s => ({
          ...s,
          data: parseData(s.data),
        }));
      }
    }

    output({ site, patterns: patternItems }, { ...options, format: 'tree' });
  } catch (error) {
    outputError(error);
  }
}

export default { show, patterns, tree };
