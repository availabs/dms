/**
 * Section commands.
 *
 * Sections (page components) are typed `{patternInstance}|component`.
 * Today's data uses `component`; the older `cms-section` form is gone
 * with the type-system refactor.
 */

import { merge, cloneDeep } from 'lodash-es';
import {
  makeClient, fetchAll, fetchById, fetchByIds, resolveIdOrSlug,
  resolvePattern, findPatternByKind,
  parseData, parseSetPairs, readFileOrJson,
} from '../utils/data.js';
import { pageTypeFor, componentTypeFor } from '../utils/types.js';
import { output, outputError } from '../utils/output.js';
import { afterDraftSectionsWrite } from '../utils/room-sync.js';

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
    const roomSync = await afterDraftSectionsWrite(config, pageId);

    output({
      id: sectionId,
      page_id: pageId,
      type: sectionType,
      message: 'Section created and attached to page',
      ...(roomSync && { room_sync: roomSync }),
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
 * The section's id leaves BOTH of a page's lists, `sections` (published) and `draft_sections`, before the
 * row is deleted, so no page is left pointing at a missing row (safe-delete-removes-rows.md F10). With
 * `--page <id|slug>` that one page is edited; without it, every page of the site that lists it, in any
 * pattern (a section can be listed by several pages, and by pages of another pattern).
 * The server's child sweep may already delete the row when its page drops it; the delete then finds
 * nothing left to do.
 */
const sectionIdOf = (s) => parseInt(typeof s === 'object' && s !== null ? s.id : s, 10);

export async function remove(sectionId, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const numId = parseInt(sectionId, 10);

    const section = await fetchById(falcor, config.app, numId, ['id', 'app', 'type']);
    if (!section?.type) {
      outputError(`Section not found: ${sectionId}`);
      return;
    }

    let pages;
    if (options.page) {
      const pattern = await resolvePagePattern(falcor, config, options.pattern);
      const pageAppType = `${config.app}+${pageTypeFor(pattern)}`;
      const pageId = await resolveIdOrSlug(falcor, pageAppType, options.page);
      pages = [await fetchById(falcor, config.app, pageId, ['id', 'data'])];
    } else {
      // Every pattern of the site, not only the section's own: a copied pattern's pages can list the
      // source pattern's rows (seen on mitigat-ny-prod, 2026-11-16 audit). A pattern with no pages
      // costs one length read.
      pages = [];
      const pageTypes = new Set((await resolvePattern(falcor, config)).map((p) => pageTypeFor(p)));
      for (const pageType of pageTypes) {
        const { items } = await fetchAll(falcor, `${config.app}+${pageType}`, ['id', 'data'], { limit: 100000 });
        pages.push(...items);
      }
    }

    const edited = [];
    for (const page of pages) {
      const d = parseData(page.data);
      const patch = {};
      for (const key of ['sections', 'draft_sections']) {
        const list = Array.isArray(d[key]) ? d[key] : [];
        const kept = list.filter((s) => sectionIdOf(s) !== numId);
        if (kept.length !== list.length) patch[key] = kept;
      }
      if (!Object.keys(patch).length) continue;
      if (patch.draft_sections) patch.has_changes = true;
      await falcor.call(['dms', 'data', 'edit'], [config.app, page.id, patch]);
      edited.push({ id: page.id, lists: Object.keys(patch).filter((k) => k !== 'has_changes') });
    }

    // A fresh client: the edit above may have swept the row, and this one's cache still holds it.
    const still = await fetchById(makeClient(config), config.app, numId, ['id', 'type']);
    if (still?.type) await falcor.call(['dms', 'data', 'delete'], [section.app, section.type, numId]);

    const roomSync = [];
    for (const e of edited) {
      if (!e.lists.includes('draft_sections')) continue;
      const r = await afterDraftSectionsWrite(config, e.id);
      if (r) roomSync.push(r);
    }

    output({
      id: numId,
      message: 'Section deleted',
      pages: edited,
      ...(roomSync.length && { room_sync: roomSync.length === 1 ? roomSync[0] : roomSync }),
    }, options);
  } catch (error) {
    outputError(error);
  }
}

export default { list, show, dump, create, update, remove };
