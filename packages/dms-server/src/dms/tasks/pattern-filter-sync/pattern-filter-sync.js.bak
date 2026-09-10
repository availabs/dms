'use strict';

/**
 * Pattern filter sync — reconciles a pattern's filter group into every page's DRAFT
 * sections: patches any filter leaf (dataWrapper tree, legacy column mirror, Map
 * dynamic-filters) whose `searchParamKey` matches one of the group's searchKeys, and
 * (for dataWrapper sections) eagerly recomputes + persists fresh `data`.
 *
 * Full design: src/dms/planning/tasks/current/pattern-filter-sync.md
 * - Decision 1: Tier 2 (eager recompute), via the mirrored getData (./mirrors/getData.js)
 * - Decision 2: draft-only for v1 — only draft_sections rows are touched
 * - Decision 3: one filter group per run (filterGroupKey, default '*')
 *
 *   POST /dama-admin/dms/:appType/sync-filters     (:appType = "<app>+<patternInstance>")
 *   body: { patternId, filterGroupKey? = '*' }
 *   → { task_id }
 *
 * patternId is required in the body (not derivable from :appType alone) because the
 * pattern ROW's type string is site-qualified (`{site}|{instance}:pattern`) while
 * :appType only carries the pattern instance — see the task file's "Design note" on this.
 */

const { registerHandler, queueTask } = require('../index');
const { patchSectionElementData } = require('./filter-leaf-walk');
const { getData } = require('../../mirrors/getData');

function parseIfJSON(raw, fallback) {
  if (raw == null) return fallback;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return fallback; }
}

// Mirrors patterns/admin/pages/patternEditor/default/filterEditor.jsx's normaliseFilters —
// small enough (4 lines) not to warrant a separate mirror file with its own drift-warning
// header; kept in sync by hand same as any other mirrored logic in this file's family.
function normaliseFilters(raw) {
  const parsed = parseIfJSON(raw, []);
  if (Array.isArray(parsed)) return { '*': parsed };
  if (parsed && typeof parsed === 'object') return parsed;
  return { '*': [] };
}

function asObj(d) {
  return typeof d === 'string'
    ? (() => { try { return JSON.parse(d); } catch { return {}; } })()
    : (d ? { ...d } : {});
}

function appendHistoryEntry(rawHistory, message, user) {
  const history = parseIfJSON(rawHistory, []);
  const arr = Array.isArray(history) ? history : [];
  return [...arr, { action: message, date: Date.now(), user_id: user?.id ?? null }];
}

function createPatternFilterSyncHandler(controller) {
  // Register the worker once — controller is captured in closure, same shape as
  // dama/upload/dms-duplicate.js's createDuplicateHandler.
  registerHandler('dms/pattern_filter_sync', async (ctx) => {
    const { app, patternInstance, patternId, filterGroupKey = '*', userId } = ctx.task.descriptor;
    const user = { id: userId ?? null };
    const tag = `[pattern-filter-sync task=${ctx.task.task_id}]`;

    // 1. Load pattern row, resolve the requested filter group -> searchKeyMap
    const [patternRow] = await controller.getDataById([patternId], ['id', 'data'], app);
    if (!patternRow) throw new Error(`Pattern ${patternId} not found (app=${app})`);
    const patternData = asObj(patternRow.data);
    const filterGroups = normaliseFilters(patternData.filters);
    const group = Array.isArray(filterGroups[filterGroupKey]) ? filterGroups[filterGroupKey] : [];
    const searchKeyMap = {};
    for (const f of group) {
      if (f && f.searchKey) searchKeyMap[f.searchKey] = f.values;
    }
    const keyCount = Object.keys(searchKeyMap).length;
    console.log(`${tag} group "${filterGroupKey}": ${keyCount} filter key(s) — ${Object.keys(searchKeyMap).join(', ')}`);
    await ctx.dispatchEvent('log', `Group "${filterGroupKey}": ${keyCount} filter key(s)`, searchKeyMap);
    if (!keyCount) {
      return { pagesScanned: 0, pagesPatched: 0, sectionsPatched: 0, sectionsSkipped: 0, warnings: 0, note: 'Filter group is empty — nothing to sync' };
    }

    // 2. Load all pages for the pattern (draft_sections only — Decision 2)
    const pageType = `${patternInstance}|page`;
    const pages = await controller.getRowsByTypes(app, [pageType]);
    let pagesPatched = 0, sectionsPatched = 0, sectionsSkipped = 0, warnings = 0;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageData = asObj(page.data);
      const draftRefs = Array.isArray(pageData.draft_sections) ? pageData.draft_sections : [];

      if (draftRefs.length) {
        const sectionIds = draftRefs
          .map((r) => (r && typeof r === 'object' ? +r.id : +r))
          .filter((id) => Number.isFinite(id) && id > 0);

        if (sectionIds.length) {
          const sectionRows = await controller.getDataById(sectionIds, ['id', 'data'], app);
          const foundIds = new Set(sectionRows.map((r) => +r.id));
          const missing = sectionIds.filter((id) => !foundIds.has(id));
          if (missing.length) {
            warnings += missing.length;
            console.warn(`${tag} page ${page.id}: dangling draft_sections ref(s) ${missing.join(',')} — skipped`);
            await ctx.dispatchEvent('warn', `Page ${page.id}: dangling draft_sections ref(s) — skipped`, { pageId: page.id, missing });
          }

          let pageTouched = false;
          for (const secRow of sectionRows) {
            const secData = asObj(secRow.data);
            const element = secData.element || {};
            let elementData;
            try {
              elementData = JSON.parse(element['element-data'] || '{}');
            } catch (e) {
              // Unparseable element-data pre-dates this feature — not this sync's job to fix.
              continue;
            }

            const { elementData: patchedElementData, patched } = patchSectionElementData(elementData, searchKeyMap);
            if (!patched) { sectionsSkipped++; continue; }

            // Tier 2 — recompute for dataWrapper (Card/Spreadsheet/Graph) sections only.
            // Map sections have no externalSource / getData-compatible shape and no `data`
            // array to refresh — they only get the filter-value patch.
            let tier2Warning = null;
            if (patchedElementData.externalSource) {
              try {
                const result = await getData({ state: patchedElementData, currentPage: 0, sectionId: secRow.id });
                patchedElementData.data = result.data;
              } catch (e) {
                tier2Warning = e.message || String(e);
              }
            }

            await controller.setDataById(
              secRow.id,
              { element: { ...element, 'element-data': JSON.stringify(patchedElementData) } },
              user,
              app
            );
            sectionsPatched++;
            pageTouched = true;

            if (tier2Warning) {
              warnings++;
              console.warn(`${tag} section ${secRow.id}: filter value patched, Tier-2 recompute failed: ${tier2Warning}`);
              await ctx.dispatchEvent('warn', `Section ${secRow.id}: filter patched, Tier-2 recompute failed`, { sectionId: secRow.id, error: tier2Warning });
            }
          }

          if (pageTouched) {
            await controller.setDataById(
              page.id,
              {
                has_changes: true,
                history: appendHistoryEntry(pageData.history, `pattern filter synced (group: ${filterGroupKey})`, user),
              },
              user,
              app
            );
            pagesPatched++;
          }

          console.log(`${tag} page ${i + 1}/${pages.length} (id=${page.id}) — ${pageTouched ? 'patched' : 'no consumers'}`);
        }
      }

      await ctx.updateProgress((i + 1) / pages.length);
    }

    console.log(`${tag} done — ${pages.length} pages scanned, ${pagesPatched} patched, ${sectionsPatched} sections patched, ${sectionsSkipped} sections skipped, ${warnings} warning(s)`);
    return { pagesScanned: pages.length, pagesPatched, sectionsPatched, sectionsSkipped, warnings };
  });

  return async function syncFilters(req, res) {
    const [app, patternInstance] = (req.params.appType || '').split('+');
    const { filterGroupKey = '*', patternId } = req.body || {};
    const userId = req.user?.id ?? null;

    if (!app || !patternInstance || !patternId) {
      return res.status(400).json({ err: 'appType ("app+patternInstance") and body.patternId are required' });
    }

    try {
      const taskId = await queueTask({
        workerPath: 'dms/pattern_filter_sync',
        app,
        patternInstance,
        patternId,
        filterGroupKey,
        userId,
      });
      return res.json({ task_id: taskId });
    } catch (err) {
      console.error('[pattern-filter-sync] failed to queue task:', err.message);
      return res.status(500).json({ err: err.message });
    }
  };
}

module.exports = { createPatternFilterSyncHandler };
