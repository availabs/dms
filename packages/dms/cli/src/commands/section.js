/**
 * Section commands.
 *
 * Sections (page components) are typed `{patternInstance}|component`.
 * Today's data uses `component`; the older `cms-section` form is gone
 * with the type-system refactor.
 */

import { merge, cloneDeep } from 'lodash-es';
import {
  makeClient, fetchById, fetchByIds, resolveIdOrSlug,
  resolvePattern, findPatternByKind,
  parseData, parseSetPairs, readFileOrJson,
} from '../utils/data.js';
import { pageTypeFor, componentTypeFor } from '../utils/types.js';
import { output, outputError } from '../utils/output.js';

async function resolvePagePattern(falcor, config, patternFlag) {
  if (patternFlag) {
    return await resolvePattern(falcor, config, patternFlag);
  }
  return await findPatternByKind(falcor, config, 'page');
}

/**
 * List sections for a page.
 */
export async function list(pageIdOrSlug, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const pattern = await resolvePagePattern(falcor, config, options.pattern);
    const pageAppType = `${config.app}+${pageTypeFor(pattern)}`;

    const pageId = await resolveIdOrSlug(falcor, pageAppType, pageIdOrSlug);
    const page = await fetchById(falcor, config.app, pageId, ['id', 'data']);

    if (!page) {
      outputError(`Page not found: ${pageIdOrSlug}`);
      return;
    }

    const d = parseData(page.data);

    const sectionRefs = options.draft
      ? (d.draft_sections || [])
      : (d.sections || d.draft_sections || []);

    const sectionIds = sectionRefs
      .map((s) => (typeof s === 'object' ? s.id : s))
      .filter(Boolean);

    if (sectionIds.length === 0) {
      output([], { ...options, mode: 'list' });
      return;
    }

    const sections = await fetchByIds(falcor, config.app, sectionIds, [
      'id', 'app', 'type', 'data',
    ]);

    const result = sections.map((s) => {
      const sd = parseData(s.data);
      return {
        id: s.id,
        type: s.type,
        data: {
          title: sd.title || '(untitled)',
          level: sd.level || null,
          'element-type': sd['element-type'] || sd.element?.['element-type'] || '?',
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
 * Show section details.
 */
export async function show(sectionId, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const section = await fetchById(falcor, config.app, sectionId, [
      'id', 'app', 'type', 'data',
    ]);

    if (!section) {
      outputError(`Section not found: ${sectionId}`);
      return;
    }

    const d = parseData(section.data);

    output({
      id: section.id,
      type: section.type,
      title: d.title || '(untitled)',
      level: d.level || null,
      'element-type': d['element-type'] || d.element?.['element-type'] || '?',
      tags: d.tags || [],
    }, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Dump full section data.
 */
export async function dump(sectionId, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const section = await fetchById(falcor, config.app, sectionId, [
      'id', 'app', 'type', 'data', 'created_at', 'updated_at',
    ]);

    if (!section) {
      outputError(`Section not found: ${sectionId}`);
      return;
    }

    section.data = parseData(section.data);
    output(section, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Create a section and attach it to a page's `draft_sections`.
 */
export async function create(pageIdOrSlug, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const pattern = await resolvePagePattern(falcor, config, options.pattern);
    const pageAppType = `${config.app}+${pageTypeFor(pattern)}`;
    const sectionType = componentTypeFor(pattern);

    const pageId = await resolveIdOrSlug(falcor, pageAppType, pageIdOrSlug);

    let data = {};
    if (options.data) {
      try {
        // file path / '-' (stdin) / inline JSON — same as `section update`. Large section
        // payloads (e.g. map symbology configs) exceed the OS argv limit as inline JSON.
        data = await readFileOrJson(options.data);
      } catch (e) {
        outputError(`Invalid JSON data: ${e.message}`);
        return;
      }
    }

    if (options.elementType) data['element-type'] = options.elementType;
    if (options.title) data.title = options.title;
    if (options.level) data.level = options.level;

    const result = await falcor.call(
      ['dms', 'data', 'create'],
      [config.app, sectionType, data]
    );

    const byApp = result?.json?.dms?.data?.[config.app]?.byId
      || result?.json?.dms?.data?.byId
      || {};
    const createdId = Object.keys(byApp)[0];
    if (!createdId) {
      outputError('Failed to create section');
      return;
    }

    const sectionId = parseInt(createdId, 10);

    // Attach to the page's draft_sections.
    const page = await fetchById(falcor, config.app, pageId, ['id', 'data']);
    const pageData = parseData(page.data);
    const draftSections = pageData.draft_sections || [];

    draftSections.push({
      id: String(sectionId),
      ref: `${config.app}+${sectionType}`,
    });

    await falcor.call(['dms', 'data', 'edit'], [config.app, pageId, {
      draft_sections: draftSections,
      has_changes: true,
    }]);

    output({
      id: sectionId,
      page_id: pageId,
      type: sectionType,
      message: 'Section created and attached to page',
    }, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Update a section.
 */
export async function update(sectionId, config, options = {}) {
  try {
    const falcor = makeClient(config);

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

    if (Object.keys(data).length === 0) {
      outputError('No data to update. Use --data or --set');
      return;
    }

    const numId = parseInt(sectionId, 10);

    if (options.set) {
      const current = await fetchById(falcor, config.app, numId, ['id', 'data']);
      const currentData = current ? parseData(current.data) : {};
      data = merge(cloneDeep(currentData), data);
    }

    await falcor.call(['dms', 'data', 'edit'], [config.app, numId, data]);

    output({ id: numId, updated: data, message: 'Section updated' }, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Delete a section.
 *
 * If `--page <id|slug>` is given, also remove the section ref from
 * the page's draft_sections.
 */
export async function remove(sectionId, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const numId = parseInt(sectionId, 10);

    if (options.page) {
      const pattern = await resolvePagePattern(falcor, config, options.pattern);
      const pageAppType = `${config.app}+${pageTypeFor(pattern)}`;
      const sectionType = componentTypeFor(pattern);

      const pageId = await resolveIdOrSlug(falcor, pageAppType, options.page);
      const page = await fetchById(falcor, config.app, pageId, ['id', 'data']);
      const pageData = parseData(page.data);

      const draftSections = (pageData.draft_sections || []).filter((s) => {
        const sid = typeof s === 'object' ? s.id : s;
        return parseInt(sid, 10) !== numId;
      });

      await falcor.call(['dms', 'data', 'edit'], [config.app, pageId, {
        draft_sections: draftSections,
        has_changes: true,
      }]);

      await falcor.call(['dms', 'data', 'delete'], [config.app, sectionType, numId]);
    } else {
      // No page context — read the section's own type/app to issue delete.
      const section = await fetchById(falcor, config.app, numId, ['id', 'app', 'type']);
      if (!section) {
        outputError(`Section not found: ${sectionId}`);
        return;
      }
      await falcor.call(['dms', 'data', 'delete'], [section.app, section.type, numId]);
    }

    output({ id: numId, message: 'Section deleted' }, options);
  } catch (error) {
    outputError(error);
  }
}

export default { list, show, dump, create, update, remove };
