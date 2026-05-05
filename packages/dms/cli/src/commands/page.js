/**
 * Page commands.
 *
 * Pages are typed `{patternInstance}|page`. The pattern is resolved
 * via `--pattern <name|id>` (specific) or auto-picked among patterns
 * with `pattern_type === 'page'`. The pattern's own `type` column
 * provides the instance via `patternInstance(row)`.
 */

import { merge, cloneDeep } from 'lodash-es';
import {
  makeClient, fetchAll, fetchById, fetchByIds, resolveIdOrSlug,
  resolvePattern, findPatternByKind,
  parseData, parseSetPairs, readFileOrJson,
} from '../utils/data.js';
import { pageTypeFor } from '../utils/types.js';
import { output, outputError } from '../utils/output.js';

/**
 * Resolve which pattern's pages we're operating on.
 * If --pattern is given, use that one; else pick the first
 * page-type pattern under the site.
 */
async function resolvePagePattern(falcor, config, patternFlag) {
  if (patternFlag) {
    return await resolvePattern(falcor, config, patternFlag);
  }
  return await findPatternByKind(falcor, config, 'page');
}

/**
 * List pages.
 */
export async function list(config, options = {}) {
  try {
    const falcor = makeClient(config);
    const pattern = await resolvePagePattern(falcor, config, options.pattern);
    const pageType = pageTypeFor(pattern);
    const pageAppType = `${config.app}+${pageType}`;

    const limit = parseInt(options.limit, 10) || 50;
    const offset = parseInt(options.offset, 10) || 0;

    const { items, total } = await fetchAll(
      falcor, pageAppType,
      ['id', 'app', 'type', 'data'],
      { limit, offset }
    );

    let pages = items.map((p) => {
      const d = parseData(p.data);
      return {
        id: p.id,
        type: p.type,
        data: {
          title: d.title || '(untitled)',
          url_slug: d.url_slug || '',
          parent: d.parent || null,
          index: d.index || '0',
          published: d.published || 'draft',
        },
      };
    });

    if (options.published) {
      pages = pages.filter((p) => p.data.published === 'published');
    } else if (options.draft) {
      pages = pages.filter((p) => p.data.published !== 'published');
    }

    if (options.format === 'tree') {
      const treePages = items.map((p) => ({ id: p.id, data: parseData(p.data) }));
      output(treePages, options);
      return;
    }

    if (options.format === 'summary') {
      output(pages, { ...options, mode: 'list' });
    } else {
      output({ items: pages, total }, options);
    }
  } catch (error) {
    outputError(error);
  }
}

/**
 * Show page details.
 */
export async function show(idOrSlug, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const pattern = await resolvePagePattern(falcor, config, options.pattern);
    const pageAppType = `${config.app}+${pageTypeFor(pattern)}`;

    const id = await resolveIdOrSlug(falcor, pageAppType, idOrSlug);
    const page = await fetchById(falcor, config.app, id, [
      'id', 'app', 'type', 'data', 'created_at', 'updated_at',
    ]);

    if (!page) {
      outputError(`Page not found: ${idOrSlug}`);
      return;
    }

    const d = parseData(page.data);

    output({
      id: page.id,
      title: d.title || '(untitled)',
      url_slug: d.url_slug || '',
      parent: d.parent || null,
      index: d.index || '0',
      published: d.published || 'draft',
      sections_count: (d.sections || []).length,
      draft_sections_count: (d.draft_sections || []).length,
      has_changes: d.has_changes || false,
      created_at: page.created_at,
      updated_at: page.updated_at,
    }, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Dump full page data.
 */
export async function dump(idOrSlug, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const pattern = await resolvePagePattern(falcor, config, options.pattern);
    const pageAppType = `${config.app}+${pageTypeFor(pattern)}`;

    const id = await resolveIdOrSlug(falcor, pageAppType, idOrSlug);
    const page = await fetchById(falcor, config.app, id, [
      'id', 'app', 'type', 'data', 'created_at', 'updated_at',
    ]);

    if (!page) {
      outputError(`Page not found: ${idOrSlug}`);
      return;
    }

    page.data = parseData(page.data);

    if (options.sections) {
      const sectionIds = [
        ...(page.data.sections || []).map((s) => s.id || s),
        ...(page.data.draft_sections || []).map((s) => s.id || s),
      ].filter(Boolean);

      const uniqueIds = [...new Set(sectionIds)];

      if (uniqueIds.length > 0) {
        const sections = await fetchByIds(falcor, config.app, uniqueIds, [
          'id', 'app', 'type', 'data',
        ]);
        page._expanded_sections = sections.map((s) => ({
          ...s,
          data: parseData(s.data),
        }));
      }
    }

    output(page, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Create a new page.
 */
export async function create(config, options = {}) {
  try {
    const falcor = makeClient(config);
    const pattern = await resolvePagePattern(falcor, config, options.pattern);
    const pageType = pageTypeFor(pattern);

    let data = {};
    if (options.data) {
      try {
        data = JSON.parse(options.data);
      } catch (e) {
        outputError(`Invalid JSON data: ${e.message}`);
        return;
      }
    }

    if (options.title) data.title = options.title;
    if (options.slug) data.url_slug = options.slug;
    if (options.parent) data.parent = options.parent;

    if (!data.published) data.published = 'draft';
    if (!data.index) data.index = '0';

    const result = await falcor.call(['dms', 'data', 'create'], [config.app, pageType, data]);

    const byApp = result?.json?.dms?.data?.[config.app]?.byId
      || result?.json?.dms?.data?.byId
      || {};
    const createdId = Object.keys(byApp)[0];

    output({
      id: createdId ? parseInt(createdId, 10) : null,
      title: data.title,
      url_slug: data.url_slug,
      type: pageType,
      message: 'Page created',
    }, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Update a page.
 */
export async function update(idOrSlug, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const pattern = await resolvePagePattern(falcor, config, options.pattern);
    const pageAppType = `${config.app}+${pageTypeFor(pattern)}`;

    const id = await resolveIdOrSlug(falcor, pageAppType, idOrSlug);

    let data = {};
    if (options.data) {
      try {
        data = await readFileOrJson(options.data);
      } catch (e) {
        outputError(`Invalid JSON data: ${e.message}`);
        return;
      }
    }

    const setPairs = parseSetPairs(options.set);
    data = { ...data, ...setPairs };

    if (options.title) data.title = options.title;
    if (options.slug) data.url_slug = options.slug;

    if (Object.keys(data).length === 0) {
      outputError('No data to update. Use --data, --set, --title, or --slug');
      return;
    }

    if (options.set || options.title || options.slug) {
      const current = await fetchById(falcor, config.app, id, ['id', 'data']);
      const currentData = current ? parseData(current.data) : {};
      data = merge(cloneDeep(currentData), data);
    }

    await falcor.call(['dms', 'data', 'edit'], [config.app, id, data]);

    output({ id, updated: data, message: 'Page updated' }, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Publish a page (copy draft_sections → sections).
 */
export async function publish(idOrSlug, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const pattern = await resolvePagePattern(falcor, config, options.pattern);
    const pageAppType = `${config.app}+${pageTypeFor(pattern)}`;

    const id = await resolveIdOrSlug(falcor, pageAppType, idOrSlug);
    const page = await fetchById(falcor, config.app, id, ['id', 'data']);

    if (!page) {
      outputError(`Page not found: ${idOrSlug}`);
      return;
    }

    const d = parseData(page.data);

    const updateData = {
      published: 'published',
      has_changes: false,
      sections: d.draft_sections || d.sections || [],
      section_groups: d.draft_section_groups || d.section_groups || [],
    };

    await falcor.call(['dms', 'data', 'edit'], [config.app, id, updateData]);

    output({ id, message: 'Page published' }, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Unpublish a page.
 */
export async function unpublish(idOrSlug, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const pattern = await resolvePagePattern(falcor, config, options.pattern);
    const pageAppType = `${config.app}+${pageTypeFor(pattern)}`;

    const id = await resolveIdOrSlug(falcor, pageAppType, idOrSlug);
    await falcor.call(['dms', 'data', 'edit'], [config.app, id, { published: 'draft' }]);

    output({ id, message: 'Page unpublished' }, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Delete a page.
 */
export async function remove(idOrSlug, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const pattern = await resolvePagePattern(falcor, config, options.pattern);
    const pageType = pageTypeFor(pattern);
    const pageAppType = `${config.app}+${pageType}`;

    const id = await resolveIdOrSlug(falcor, pageAppType, idOrSlug);
    await falcor.call(['dms', 'data', 'delete'], [config.app, pageType, id]);

    output({ id, message: 'Page deleted' }, options);
  } catch (error) {
    outputError(error);
  }
}

export default { list, show, dump, create, update, publish, unpublish, remove };
