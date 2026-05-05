/**
 * Site commands.
 *
 * Show site info, list its patterns, render the full tree.
 *
 * Site type is the bare instance form (`nhomb`) or the full form
 * (`nhomb:site`) — the CLI normalizes via `siteTypeFor()`.
 */

import {
  makeClient, fetchAll, fetchByIds, parseData, resolvePattern,
} from '../utils/data.js';
import {
  siteTypeFor, patternInstance, pageTypeFor,
} from '../utils/types.js';
import { getKind } from '../../../src/utils/type-utils.js';
import { output, outputError } from '../utils/output.js';

/**
 * Show site info.
 */
export async function show(config, options = {}) {
  try {
    const falcor = makeClient(config);
    const siteType = siteTypeFor(config.type);
    const siteAppType = `${config.app}+${siteType}`;

    const { items } = await fetchAll(falcor, siteAppType, ['id', 'app', 'type', 'data'], { limit: 1 });

    if (items.length === 0) {
      outputError(`No site found for ${siteAppType}`);
      return;
    }

    const site = items[0];
    const data = parseData(site.data);

    output({
      id: site.id,
      site_name: data.site_name || data.name || '(unnamed)',
      app: site.app,
      type: site.type,
      pattern_count: (data.patterns || []).length,
      theme_refs_count: (data.theme_refs || []).length,
    }, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * List patterns under this site.
 */
export async function patterns(config, options = {}) {
  try {
    const falcor = makeClient(config);
    const patternRows = await resolvePattern(falcor, config);

    if (patternRows.length === 0) {
      output([], { ...options, mode: 'list' });
      return;
    }

    const result = patternRows.map((p) => {
      const d = parseData(p.data);
      return {
        id: p.id,
        type: p.type,
        data: {
          name: d.name || patternInstance(p) || '(unnamed)',
          pattern_type: d.pattern_type || '?',
          base_url: d.base_url || '/',
          subdomain: d.subdomain || '*',
          dmsEnvId: d.dmsEnvId || null,
        },
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
 * Show full tree: site → patterns → pages → sections, datasets.
 */
export async function tree(config, options = {}) {
  try {
    const falcor = makeClient(config);
    const siteType = siteTypeFor(config.type);
    const siteAppType = `${config.app}+${siteType}`;

    const { items } = await fetchAll(falcor, siteAppType, ['id', 'app', 'type', 'data'], { limit: 1 });
    if (items.length === 0) {
      outputError(`No site found for ${siteAppType}`);
      return;
    }

    const site = items[0];
    const patternRows = await resolvePattern(falcor, config);

    if (patternRows.length === 0) {
      output({ site, patterns: [] }, { ...options, format: 'tree' });
      return;
    }

    for (const pat of patternRows) {
      const d = parseData(pat.data);
      pat.data = d;

      if (d.pattern_type === 'page') {
        const pageType = pageTypeFor(pat);
        const pageAppType = `${config.app}+${pageType}`;

        const { items: pages } = await fetchAll(falcor, pageAppType, ['id', 'data'], { limit: 500 });

        for (const pg of pages) {
          pg.data = parseData(pg.data);
          const sectionRefs = pg.data.sections || pg.data.draft_sections || [];
          const sectionIds = sectionRefs
            .map((s) => (typeof s === 'object' ? s.id : s))
            .filter(Boolean);

          if (sectionIds.length > 0) {
            const secs = await fetchByIds(falcor, config.app, sectionIds, ['id', 'app', 'type', 'data']);
            secs.forEach((s) => { s.data = parseData(s.data); });
            pg._sections = secs;
          } else {
            pg._sections = [];
          }
        }

        pat._pages = pages;
      } else if (d.pattern_type === 'datasets' || d.pattern_type === 'forms') {
        // Sources for a datasets/forms pattern live under its dmsEnv row.
        // Resolve the dmsEnv if dmsEnvId is set.
        const dmsEnvId = d.dmsEnvId;
        if (dmsEnvId) {
          const [envRow] = await fetchByIds(falcor, config.app, [dmsEnvId], ['id', 'type', 'data']);
          if (envRow) {
            const envData = parseData(envRow.data);
            const sourceIds = (envData.sources || [])
              .map((s) => (typeof s === 'object' ? s.id : s))
              .filter(Boolean);

            if (sourceIds.length > 0) {
              const sources = await fetchByIds(
                falcor, config.app, sourceIds, ['id', 'app', 'type', 'data']
              );
              pat._datasets = sources.map((s) => ({ ...s, data: parseData(s.data) }));
            } else {
              pat._datasets = [];
            }
          }
        } else {
          pat._datasets = [];
        }
      }
    }

    output({ site, patterns: patternRows }, { ...options, format: 'tree' });
  } catch (error) {
    outputError(error);
  }
}

export default { show, patterns, tree };
