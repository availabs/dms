'use strict';

/**
 * Pattern filter sync — reconciles a pattern's filter group into every page's DRAFT
 * sections: patches any filter leaf (dataWrapper tree, legacy column mirror, Map
 * dynamic-filters) whose `searchParamKey` matches one of the group's searchKeys, and
 * (for dataWrapper sections) eagerly recomputes + persists fresh `data`.
 *
 * Full design: src/dms/planning/tasks/current/pattern-filter-sync.md
 * - Decision 1: Tier 2 (eager recompute), via the mirrored getData (./mirrors/getData.js)
 * - Decision 2: draft-only BY DEFAULT — see `scope` below
 * - Decision 3: one filter group per run (filterGroupKey, default '*')
 *
 *   POST /dama-admin/dms/:appType/sync-filters     (:appType = "<app>+<patternInstance>")
 *   body: { patternId, filterGroupKey? = '*', scope?, clearKeys?, dropRequestCache? }
 *   → { task_id }
 *
 * Full-coverage options (all default to the v1 behaviour — see
 * src/dms/planning/tasks/current/pattern-filter-sync-full-coverage.md):
 *   scope             'draft' (default) | 'published' | 'both'. A freshly DUPLICATED pattern needs
 *                     'both': its published `sections` are verbatim clones of the source's, and
 *                     nothing in the copy has been published yet, so draft-only leaves every
 *                     rendered page showing the source pattern's values.
 *   clearKeys         searchKeys whose leaves are EMPTIED instead of substituted, for keys with no
 *                     meaningful value in the target (e.g. a jurisdiction id in a brand-new county
 *                     site). Substitution cannot express this: applyPageFilters deliberately keeps
 *                     a saved value when the replacement normalizes to empty.
 *   dropRequestCache  delete the derived request memos from patched sections — `dataRequest`,
 *                     `lastDataRequest` and `outputSourceInfo.asUdaConfig` — which otherwise retain
 *                     the OLD filter values indefinitely. They are rebuilt on the next fetch
 *                     (asUdaConfig by buildUdaConfig); the rest of `outputSourceInfo`, which holds
 *                     real column metadata, is left alone.
 *                     ⚠ ONLY applied to v2 sections (those with `externalSource`). On a v1-legacy
 *                     section `dataRequest.filterGroups` is the authoritative filter store that
 *                     `legacyStateToBuildInput` reads — deleting it strips the section's filters
 *                     and it starts returning unfiltered rows. Those are patched by
 *                     filter-leaf-walk instead.
 *
 * patternId is required in the body (not derivable from :appType alone) because the
 * pattern ROW's type string is site-qualified (`{site}|{instance}:pattern`) while
 * :appType only carries the pattern instance — see the task file's "Design note" on this.
 */

const crypto = require('crypto');
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
    const {
      app, patternInstance, patternId, filterGroupKey = '*', userId,
      scope = 'draft', clearKeys = [], dropRequestCache = false, concurrency = 10,
    } = ctx.task.descriptor;
    const REF_KEYS = scope === 'both' ? ['draft_sections', 'sections']
      : scope === 'published' ? ['sections']
      : ['draft_sections'];
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
    console.log(`${tag} scope=${scope} (${REF_KEYS.join('+')}) clearKeys=[${clearKeys.join(', ')}] dropRequestCache=${dropRequestCache}`);
    await ctx.dispatchEvent('log', `Group "${filterGroupKey}": ${keyCount} filter key(s)`, searchKeyMap);
    // clearKeys alone is enough work to justify a run even with an empty group.
    if (!keyCount && !clearKeys.length) {
      return { pagesScanned: 0, pagesPatched: 0, sectionsPatched: 0, sectionsSkipped: 0, warnings: 0, note: 'Filter group is empty — nothing to sync' };
    }

    // 2. Load all pages for the pattern (draft_sections only — Decision 2)
    // ─── Tier-2 result cache ────────────────────────────────────────────────────
    // A freshly duplicated pattern holds draft and published sections as DISJOINT rows with
    // IDENTICAL content, so `scope: 'both'` would issue every query twice. Measured on a county
    // copy: 788 Tier-2 recomputes but only 424 distinct queries — 46% pure duplication.
    //
    // Keyed on the full getData input (the patched element-data minus `data`, which is output).
    // `sectionId` is part of the key ONLY when the section carries the `$self` sentinel, since
    // that is the one case where the section's own id reaches the query (via selfParamKey);
    // including it unconditionally would defeat the cache for everything.
    // The PROMISE is cached, not the result, so concurrent duplicates share one in-flight fetch.
    const tier2Cache = new Map();
    const tier2Key = (state, sectionId) => {
      const { data, ...rest } = state;
      const usesSelf = JSON.stringify(rest).includes('$self');
      return crypto.createHash('sha1')
        .update(JSON.stringify(rest) + (usesSelf ? `|${sectionId}` : ''))
        .digest('hex');
    };
    const cachedGetData = (state, sectionId) => {
      const key = tier2Key(state, sectionId);
      if (!tier2Cache.has(key)) {
        tier2Cache.set(key, getData({ state, currentPage: 0, sectionId }));
      } else {
        tier2Hits++;
      }
      return tier2Cache.get(key);
    };

    // Processes one section: parse -> patch -> (Tier-2) -> write. Returns a plain result object so
    // the caller can fold counters in deterministically rather than mutating from parallel tasks.
    async function processSection(secRow, page) {
      const secData = asObj(secRow.data);
      const element = secData.element || {};
      const rawElementData = element['element-data'];
      // `element-data` is stored EITHER as a JSON string or as an already-parsed jsonb object —
      // both shapes exist in the wild (49 of 3,615 sections in a county-template copy are
      // objects). JSON.parse on an object stringifies it to "[object Object]" and throws, so the
      // original `try { JSON.parse } catch { continue }` silently skipped every object-shaped
      // section. Read both, and write back in the SAME shape so this sync never rewrites a row's
      // storage format.
      const storedAsString = typeof rawElementData === 'string';
      let elementData;
      if (storedAsString) {
        try { elementData = JSON.parse(rawElementData || '{}'); }
        catch (e) { return null; }   // genuinely malformed JSON — not this sync's job to fix
      } else if (rawElementData && typeof rawElementData === 'object') {
        elementData = rawElementData;
      } else {
        return null;
      }

      let { elementData: patchedElementData, patched } = patchSectionElementData(elementData, searchKeyMap, { clearKeys });

      // Derived request memos still echo the OLD filter values. They are rebuilt on the
      // dataWrapper's next fetch, so deleting is safe — reconstructing them here would mean
      // mirroring the client's request builder forever. Dropped even when nothing else changed:
      // a memo captures the filters live at request time, INCLUDING page-level ones, so a section
      // storing no filter of its own can still carry the source pattern's values.
      // v2 ONLY — see the dropRequestCache note in the header.
      let memoDropped = false;
      if (dropRequestCache && patchedElementData.externalSource) {
        const hasMemo = patchedElementData.dataRequest !== undefined
          || patchedElementData.lastDataRequest !== undefined
          || patchedElementData.outputSourceInfo?.asUdaConfig !== undefined;
        if (hasMemo) {
          patchedElementData = { ...patchedElementData };
          delete patchedElementData.dataRequest;
          delete patchedElementData.lastDataRequest;
          // Only the compiled config — outputSourceInfo.columns is real metadata, not an echo.
          if (patchedElementData.outputSourceInfo?.asUdaConfig) {
            patchedElementData.outputSourceInfo = { ...patchedElementData.outputSourceInfo };
            delete patchedElementData.outputSourceInfo.asUdaConfig;
          }
          memoDropped = true;
        }
      }

      if (!patched && !memoDropped) return { id: secRow.id, skipped: true };

      // Tier 2 — recompute the cached rows. Covers BOTH binding shapes: getData resolves
      // `state.externalSource || state.sourceInfo` (v2 vs v1 legacy), so gating on externalSource
      // alone left every legacy-bound section holding the SOURCE pattern's rows — e.g. the county
      // template's Jurisdictional Annexes table, which shipped Sullivan's municipalities to every
      // copy. Map sections have no getData-compatible shape and only get the filter-value patch.
      let tier2Warning = null;
      if (patched && (patchedElementData.externalSource || patchedElementData.sourceInfo)) {
        try {
          const result = await cachedGetData(patchedElementData, secRow.id);
          patchedElementData.data = result.data;
        } catch (e) {
          tier2Warning = e.message || String(e);
        }
      }

      await controller.setDataById(
        secRow.id,
        { element: { ...element, 'element-data': storedAsString ? JSON.stringify(patchedElementData) : patchedElementData } },
        user,
        app
      );
      return { id: secRow.id, patched, memoDropped, tier2Warning, touched: true };
    }

    const pageType = `${patternInstance}|page`;
    const pages = await controller.getRowsByTypes(app, [pageType]);
    let pagesPatched = 0, sectionsPatched = 0, sectionsSkipped = 0, warnings = 0, memosDropped = 0, tier2Hits = 0;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageData = asObj(page.data);
      // Published and draft sections are DIFFERENT rows (a duplicate keeps them disjoint), so the
      // two passes never touch the same row and their ids can simply be unioned.
      const refs = REF_KEYS.flatMap((k) => (Array.isArray(pageData[k]) ? pageData[k] : []));
      const draftRefs = refs;

      if (draftRefs.length) {
        const sectionIds = [...new Set(draftRefs
          .map((r) => (r && typeof r === 'object' ? +r.id : +r))
          .filter((id) => Number.isFinite(id) && id > 0))];

        if (sectionIds.length) {
          const sectionRows = await controller.getDataById(sectionIds, ['id', 'data'], app);
          const foundIds = new Set(sectionRows.map((r) => +r.id));
          const missing = sectionIds.filter((id) => !foundIds.has(id));
          if (missing.length) {
            warnings += missing.length;
            console.warn(`${tag} page ${page.id}: dangling draft_sections ref(s) ${missing.join(',')} — skipped`);
            await ctx.dispatchEvent('warn', `Page ${page.id}: dangling draft_sections ref(s) — skipped`, { pageId: page.id, missing });
          }

          // Sections are processed in CONCURRENT batches. The work per section is dominated by
          // Tier-2 (up to two UDA round trips) and a row write; run serially that was ~0.28s per
          // section and ~10 min per county. Same shape as dms-duplicate.js's COMP_BATCH loop.
          const results = [];
          for (let b = 0; b < sectionRows.length; b += concurrency) {
            const batch = sectionRows.slice(b, b + concurrency);
            results.push(...await Promise.all(batch.map((secRow) => processSection(secRow, page))));
          }
          const pageTouched = results.some((r) => r && r.touched);
          for (const r of results) {
            if (!r) continue;
            if (r.skipped) sectionsSkipped++;
            if (r.patched) sectionsPatched++;
            if (r.memoDropped) memosDropped++;
            if (r.tier2Warning) {
              warnings++;
              console.warn(`${tag} section ${r.id}: filter value patched, Tier-2 recompute failed: ${r.tier2Warning}`);
              await ctx.dispatchEvent('warn', `Section ${r.id}: filter patched, Tier-2 recompute failed`, { sectionId: r.id, error: r.tier2Warning });
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

    console.log(`${tag} done — ${pages.length} pages scanned, ${pagesPatched} patched, ${sectionsPatched} sections patched, ${memosDropped} request memo(s) dropped, ${sectionsSkipped} sections skipped, ${warnings} warning(s)`);
    return { pagesScanned: pages.length, pagesPatched, sectionsPatched, sectionsSkipped, memosDropped,
             tier2Queries: tier2Cache.size, tier2CacheHits: tier2Hits, warnings, scope, clearKeys, dropRequestCache, concurrency };
  });

  return async function syncFilters(req, res) {
    const [app, patternInstance] = (req.params.appType || '').split('+');
    const { filterGroupKey = '*', patternId, scope = 'draft', clearKeys = [], dropRequestCache = false, concurrency } = req.body || {};
    const userId = req.user?.id ?? null;

    if (!app || !patternInstance || !patternId) {
      return res.status(400).json({ err: 'appType ("app+patternInstance") and body.patternId are required' });
    }

    try {
      if (!['draft', 'published', 'both'].includes(scope)) {
        return res.status(400).json({ err: `scope must be 'draft', 'published' or 'both' (got ${scope})` });
      }
      const taskId = await queueTask({
        workerPath: 'dms/pattern_filter_sync',
        app,
        patternInstance,
        patternId,
        filterGroupKey,
        userId,
        scope,
        clearKeys: Array.isArray(clearKeys) ? clearKeys : [],
        dropRequestCache: !!dropRequestCache,
        ...(Number.isFinite(+concurrency) && +concurrency > 0 ? { concurrency: Math.min(+concurrency, 50) } : {}),
      });
      return res.json({ task_id: taskId });
    } catch (err) {
      console.error('[pattern-filter-sync] failed to queue task:', err.message);
      return res.status(500).json({ err: err.message });
    }
  };
}

module.exports = { createPatternFilterSyncHandler };
