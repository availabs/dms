'use strict';

/**
 * Walks a section's three page-filter leaf representations (dataWrapper filter tree,
 * the legacy per-column mirror, and Map's dynamic-filters) and patches any leaf that
 * consumes one of the given pattern filter searchKeys. Used by pattern-filter-sync.js.
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
        return { ...df, values: normalized };
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

/**
 * Given a section's parsed element-data and a searchKeyMap ({ [searchKey]: value }, value
 * scalar or array — raw pattern-filter `values`, un-normalized), returns
 * { elementData, patched }. `elementData` is a NEW object only if something was patched;
 * otherwise the SAME reference is returned, so callers can use `patched` (not deep-equal)
 * to decide whether to write the row / recompute Tier-2 data.
 */
function patchSectionElementData(elementData, searchKeyMap) {
  if (!elementData || typeof elementData !== 'object' || !searchKeyMap || !Object.keys(searchKeyMap).length) {
    return { elementData, patched: false };
  }
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

  return { elementData: next, patched };
}

module.exports = { patchSectionElementData, treeHasMatchingLeaf, normalizeValues };
