/**
 * Section commands
 *
 * List, show, dump, create, update, and delete sections within pages.
 */

import {
  makeClient, fetchById, fetchByIds,
  resolveIdOrSlug, getPageType, parseData, parseSetPairs, readFileOrJson,
} from '../utils/data.js';
import { output, outputError } from '../utils/output.js';

/**
 * List sections for a page
 */
export async function list(pageIdOrSlug, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const docType = await getPageType(falcor, config, options.pattern);
    const pageType = `${config.app}+${docType}`;

    const pageId = await resolveIdOrSlug(falcor, pageType, pageIdOrSlug);
    const page = await fetchById(falcor, pageId, ['id', 'data']);

    if (!page) {
      outputError(`Page not found: ${pageIdOrSlug}`);
      return;
    }

    const d = parseData(page.data);

    // Use draft_sections or sections based on --draft flag
    const sectionRefs = options.draft
      ? (d.draft_sections || [])
      : (d.sections || d.draft_sections || []);

    const sectionIds = sectionRefs
      .map(s => (typeof s === 'object' ? s.id : s))
      .filter(Boolean);

    if (sectionIds.length === 0) {
      output([], { ...options, mode: 'list' });
      return;
    }

    const sections = await fetchByIds(falcor, sectionIds, ['id', 'app', 'type', 'data']);

    const result = sections.map(s => {
      const sd = parseData(s.data);
      return {
        id: s.id,
        title: sd.title || '(untitled)',
        level: sd.level || null,
        'element-type': sd['element-type'] || sd.element_type || '?',
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
 * Show section details
 */
export async function show(sectionId, config, options = {}) {
  try {
    const falcor = makeClient(config);

    const section = await fetchById(falcor, sectionId, ['id', 'app', 'type', 'data']);

    if (!section) {
      outputError(`Section not found: ${sectionId}`);
      return;
    }

    const d = parseData(section.data);

    const result = {
      id: section.id,
      title: d.title || '(untitled)',
      level: d.level || null,
      'element-type': d['element-type'] || d.element_type || '?',
      tags: d.tags || [],
    };

    output(result, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Dump full section data
 */
export async function dump(sectionId, config, options = {}) {
  try {
    const falcor = makeClient(config);

    const section = await fetchById(falcor, sectionId, ['id', 'app', 'type', 'data', 'created_at', 'updated_at']);

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
 * Create a new section and attach it to a page
 */
export async function create(pageIdOrSlug, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const docType = await getPageType(falcor, config, options.pattern);
    const pageType = `${config.app}+${docType}`;
    const sectionType = `${docType}|cms-section`;

    const pageId = await resolveIdOrSlug(falcor, pageType, pageIdOrSlug);

    let data = {};

    if (options.data) {
      try {
        data = JSON.parse(options.data);
      } catch (e) {
        outputError(`Invalid JSON data: ${e.message}`);
        return;
      }
    }

    if (options.elementType) data['element-type'] = options.elementType;
    if (options.title) data.title = options.title;
    if (options.level) data.level = options.level;

    // Create the section
    const result = await falcor.call(
      ['dms', 'data', 'create'],
      [config.app, sectionType, data]
    );

    const byId = result?.json?.dms?.data?.byId || {};
    const createdId = Object.keys(byId)[0];

    if (!createdId) {
      outputError('Failed to create section');
      return;
    }

    const sectionId = parseInt(createdId, 10);

    // Attach to page's draft_sections
    const page = await fetchById(falcor, pageId, ['id', 'data']);
    const pageData = parseData(page.data);
    const draftSections = pageData.draft_sections || [];

    draftSections.push({
      ref: `dms.data.byId.${sectionId}`,
      id: sectionId,
    });

    await falcor.call(['dms', 'data', 'edit'], [pageId, {
      draft_sections: draftSections,
      has_changes: true,
    }]);

    output({
      id: sectionId,
      page_id: pageId,
      message: 'Section created and attached to page',
    }, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Update a section
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

    // Handle --set pairs
    const setPairs = parseSetPairs(options.set);
    data = { ...data, ...setPairs };

    if (Object.keys(data).length === 0) {
      outputError('No data to update. Use --data or --set');
      return;
    }

    await falcor.call(['dms', 'data', 'edit'], [parseInt(sectionId, 10), data]);

    output({ id: parseInt(sectionId, 10), updated: data, message: 'Section updated' }, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Delete a section
 */
export async function remove(sectionId, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const numId = parseInt(sectionId, 10);

    // If --page specified, also remove ref from page's draft_sections
    if (options.page) {
      const docType = await getPageType(falcor, config, options.pattern);
      const pageType = `${config.app}+${docType}`;
      const sectionType = `${docType}|cms-section`;

      const pageId = await resolveIdOrSlug(falcor, pageType, options.page);
      const page = await fetchById(falcor, pageId, ['id', 'data']);
      const pageData = parseData(page.data);

      // Remove from draft_sections
      const draftSections = (pageData.draft_sections || []).filter(s => {
        const sid = typeof s === 'object' ? s.id : s;
        return sid !== numId;
      });

      await falcor.call(['dms', 'data', 'edit'], [pageId, {
        draft_sections: draftSections,
        has_changes: true,
      }]);

      // Delete the section
      await falcor.call(['dms', 'data', 'delete'], [config.app, sectionType, numId]);
    } else {
      // Delete without page context — need app+type info
      // We'll try to get it from the section itself
      const section = await fetchById(falcor, numId, ['id', 'app', 'type']);
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
