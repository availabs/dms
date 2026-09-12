'use strict';

/**
 * Walks a section's FIVE page-filter leaf representations and patches any leaf that consumes one
 * of the given pattern filter searchKeys. Used by pattern-filter-sync.js.
 *
 *   1. `filters`                     — the v2 dataWrapper filter tree
 *   2. `columns[].filters`           — the legacy per-column mirror
 *   3. Map per-layer `dynamic-filters`
 *   4. symbology-level `pageFilters`
 *   5. `dataRequest.filterGroups`    — ⚠ NOT a cache. For a v1-legacy section (one bound via
 *      `sourceInfo` rather than `externalSource`), `legacyStateToBuildInput` reads its filters
 *      from `state.dataRequest.filterGroups` — the top-level `filters` key is ignored entirely.
 *      So for those sections this is the ONLY representation that reaches the query, and it must
 *      be patched, never dropped.
 *
 * See src/dms/planning/tasks/current/pattern-filter-sync.md's "Background" section for
 * the three-representation model this implements.
 *
 * NOT a mirror of a single client file — `patchTreeLeaves` reuses the mirrored
 * `applyPageFilters` from ./mirrors/buildUdaConfig.js verbatim (same value-normalization
 * rules: wrap scalar in array, drop null/empty entries, keep the saved value untouched
 * if normalization empties it entirely — mirrors applyPageFilters's own
 * "an unset page filter must behave like an absent one" comment). The column-mirror and
 * Map patchers are new logic (no single client function does this), written to match the
 * same normalization convention for consistency.
 */

const { applyPageFilters } = require('../../mirrors/buildUdaConfig');

function isGroup(node) {
  return !!(node && Array.isArray(node.groups));
}

// Mirrors applyPageFilters's own key resolution (searchParamKey, falling back to col)
// so this pre-check agrees with what applyPageFilters will actually match.
function treeHasMatchingLeaf(node, searchKeyMap) {
  if (!node) return false;
  if (isGroup(node)) return node.groups.some((c) => treeHasMatchingLeaf(c, searchKeyMap));
  if (!node.usePageFilters) return false;
  const key = node.searchParamKey || node.col;
  return !!(key && Object.prototype.hasOwnProperty.call(searchKeyMap, key));
}

function normalizeValues(raw) {
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.filter((v) => v != null && String(v).length);
}

// columns[i].filters[] — the legacy per-column mirror. Field names here are
// `values`/`operation`, NOT the tree's `value`/`op` (confirmed against a live section
// and creating-interactive-pages.md's cascading-filter example) — gated on
// `usePageFilters`, same as the tree.
function patchColumnFilters(columns, searchKeyMap) {
  let patched = false;
  const nextColumns = (columns || []).map((col) => {
    if (!Array.isArray(col.filters) || !col.filters.length) return col;
    let colPatched = false;
    const nextFilters = col.filters.map((leaf) => {
      if (!leaf?.usePageFilters || !leaf.searchParamKey) return leaf;
      if (!Object.prototype.hasOwnProperty.call(searchKeyMap, leaf.searchParamKey)) return leaf;
      const normalized = normalizeValues(searchKeyMap[leaf.searchParamKey]);
      // Mirror applyPageFilters: a fully-emptied substitution keeps the saved value.
      if (!normalized.length) return leaf;
      colPatched = true;
      return { ...leaf, values: normalized };
    });
    if (!colPatched) return col;
    patched = true;
    return { ...col, filters: nextFilters };
  });
  return { columns: nextColumns, patched };
}

// Map sections: element-data.symbologies[symId].symbology.layers[layerId]['dynamic-filters'][].
// Field name is `values` (plural). Design note: unlike the tree/column-mirror leaves, a Map
// dynamic-filter is NOT gated on `usePageFilters` here — per creating-a-map-section.md §5,
// the live runtime (map/index.jsx's dataPageFilters effect) matches on
// `searchParamKey || column_name` alone; `usePageFilters` is only read by the Map settings
// UI's toggle for author-facing consistency, it is not a functional gate. Matching the real
// runtime behavior (not the tree/column convention) so this sync doesn't silently skip a
// dynamic-filter an author never bothered to flag `usePageFilters` on but that IS live.
function patchMapDynamicFilters(symbologies, searchKeyMap) {
  let patched = false;
  if (!symbologies || typeof symbologies !== 'object') return { symbologies, patched };
  const nextSymbologies = {};
  for (const [symId, sym] of Object.entries(symbologies)) {
    const layers = sym?.symbology?.layers;
    if (!layers || typeof layers !== 'object') { nextSymbologies[symId] = sym; continue; }
    let symPatched = false;
    const nextLayers = {};
    for (const [layerId, layer] of Object.entries(layers)) {
      const dfs = layer?.['dynamic-filters'];
      if (!Array.isArray(dfs) || !dfs.length) { nextLayers[layerId] = layer; continue; }
      let layerPatched = false;
      const nextDfs = dfs.map((df) => {
        const key = df.searchParamKey || df.column_name;
        if (!key || !Object.prototype.hasOwnProperty.call(searchKeyMap, key)) return df;
        const normalized = normalizeValues(searchKeyMap[key]);
        layerPatched = true;
        // A static map's `defaultValue` must mirror `values` — when the two disagree the
        // page-filter sync on load wipes the value back to the default. Only mirrored when the
        // key is already present, so we never invent one.
        const next = { ...df, values: normalized };
        if (Object.prototype.hasOwnProperty.call(df, 'defaultValue')) next.defaultValue = normalized;
        return next;
      });
      if (!layerPatched) { nextLayers[layerId] = layer; continue; }
      symPatched = true;
      nextLayers[layerId] = { ...layer, 'dynamic-filters': nextDfs };
    }
    if (!symPatched) { nextSymbologies[symId] = sym; continue; }
    patched = true;
    nextSymbologies[symId] = { ...sym, symbology: { ...sym.symbology, layers: nextLayers } };
  }
  return { symbologies: nextSymbologies, patched };
}

// symbologies[symId].symbology.pageFilters[] — the symbology-level filter list, sibling to the
// per-layer dynamic-filters. Shape is `[{ searchKey, values }]`, keyed `searchKey` (NOT the
// `searchParamKey`/`column_name` the layer filters use). Not gated on `usePageFilters` for the
// same reason patchMapDynamicFilters isn't: the Map runtime matches on the key alone.
function patchSymbologyPageFilters(symbologies, searchKeyMap) {
  let patched = false;
  if (!symbologies || typeof symbologies !== 'object') return { symbologies, patched };
  const nextSymbologies = {};
  for (const [symId, sym] of Object.entries(symbologies)) {
    const pfs = sym?.symbology?.pageFilters;
    if (!Array.isArray(pfs) || !pfs.length) { nextSymbologies[symId] = sym; continue; }
    let symPatched = false;
    const nextPfs = pfs.map((pf) => {
      const key = pf?.searchKey;
      if (!key || !Object.prototype.hasOwnProperty.call(searchKeyMap, key)) return pf;
      symPatched = true;
      return { ...pf, values: normalizeValues(searchKeyMap[key]) };
    });
    if (!symPatched) { nextSymbologies[symId] = sym; continue; }
    patched = true;
    nextSymbologies[symId] = { ...sym, symbology: { ...sym.symbology, pageFilters: nextPfs } };
  }
  return { symbologies: nextSymbologies, patched };
}

// Empty every leaf whose key is in `clearKeys`, across all four representations.
//
// Substitution can't express this: applyPageFilters (and the mirrors here) deliberately KEEP a
// saved value when the replacement normalizes to empty — "an unset page filter must behave like an
// absent one". Clearing is the opposite intent, and only a caller knows which keys have no
// meaningful value in the target pattern (e.g. a jurisdiction id when a county site is first
// created), so it is opt-in and key-scoped rather than inferred.
function clearLeaves(elementData, clearKeys) {
  const keys = new Set(clearKeys || []);
  if (!keys.size) return { elementData, patched: false };
  let patched = false;
  const json = JSON.parse(JSON.stringify(elementData));

  const walkTree = (node) => {
    if (!node) return;
    if (Array.isArray(node.groups)) { node.groups.forEach(walkTree); return; }
    const key = node.searchParamKey || node.col;
    if (key && keys.has(key) && node.value != null) { node.value = []; patched = true; }
  };
  walkTree(json.filters);
  for (const key of ['dataRequest', 'lastDataRequest']) {
    if (json[key] && json[key].filterGroups) walkTree(json[key].filterGroups);
  }

  for (const col of json.columns || []) {
    for (const leaf of col.filters || []) {
      if (leaf?.searchParamKey && keys.has(leaf.searchParamKey)) { leaf.values = []; patched = true; }
    }
  }

  for (const sym of Object.values(json.symbologies || {})) {
    for (const pf of sym?.symbology?.pageFilters || []) {
      if (pf?.searchKey && keys.has(pf.searchKey)) { pf.values = []; patched = true; }
    }
    for (const layer of Object.values(sym?.symbology?.layers || {})) {
      for (const df of layer?.['dynamic-filters'] || []) {
        const key = df.searchParamKey || df.column_name;
        if (key && keys.has(key)) {
          df.values = [];
          if (Object.prototype.hasOwnProperty.call(df, 'defaultValue')) df.defaultValue = [];
          patched = true;
        }
      }
    }
  }

  return { elementData: patched ? json : elementData, patched };
}

/**
 * Given a section's parsed element-data and a searchKeyMap ({ [searchKey]: value }, value
 * scalar or array — raw pattern-filter `values`, un-normalized), returns
 * { elementData, patched }. `elementData` is a NEW object only if something was patched;
 * otherwise the SAME reference is returned, so callers can use `patched` (not deep-equal)
 * to decide whether to write the row / recompute Tier-2 data.
 */
function patchSectionElementData(elementData, searchKeyMap, options = {}) {
  const { clearKeys = [] } = options;
  const hasWork = (searchKeyMap && Object.keys(searchKeyMap).length) || clearKeys.length;
  if (!elementData || typeof elementData !== 'object' || !hasWork) {
    return { elementData, patched: false };
  }
  searchKeyMap = searchKeyMap || {};
  let patched = false;
  let next = elementData;

  if (next.filters && treeHasMatchingLeaf(next.filters, searchKeyMap)) {
    next = { ...next, filters: applyPageFilters(next.filters, searchKeyMap) };
    patched = true;
  }

  if (Array.isArray(next.columns)) {
    const res = patchColumnFilters(next.columns, searchKeyMap);
    if (res.patched) { next = { ...next, columns: res.columns }; patched = true; }
  }

  if (next.symbologies) {
    const res = patchMapDynamicFilters(next.symbologies, searchKeyMap);
    if (res.patched) { next = { ...next, symbologies: res.symbologies }; patched = true; }
  }

  if (next.symbologies) {
    const res = patchSymbologyPageFilters(next.symbologies, searchKeyMap);
    if (res.patched) { next = { ...next, symbologies: res.symbologies }; patched = true; }
  }

  // dataRequest / lastDataRequest .filterGroups — same tree shape, same leaf fields.
  for (const key of ['dataRequest', 'lastDataRequest']) {
    const fg = next[key] && next[key].filterGroups;
    if (fg && treeHasMatchingLeaf(fg, searchKeyMap)) {
      next = { ...next, [key]: { ...next[key], filterGroups: applyPageFilters(fg, searchKeyMap) } };
      patched = true;
    }
  }

  // Clearing runs last so an explicit clearKeys entry wins over a substitution for the same key.
  if (clearKeys.length) {
    const res = clearLeaves(next, clearKeys);
    if (res.patched) { next = res.elementData; patched = true; }
  }

  return { elementData: next, patched };
}

module.exports = { patchSectionElementData, treeHasMatchingLeaf, normalizeValues, patchSymbologyPageFilters, clearLeaves };
