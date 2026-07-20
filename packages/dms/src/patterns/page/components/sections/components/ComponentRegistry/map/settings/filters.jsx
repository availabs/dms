import { normalizeLayerClickFilterConfig } from "../../../../../../../mapeditor/MapEditor/stateUtils";

/**
 * Multi-symbology page-bridge accessor. Resolves the page-interaction bridge for
 * a SPECIFIC symbology id (its active layer) — not just the single first-visible
 * symbology — and returns scoped update handlers.
 *
 * This is what lets the author wire each symbology's page variable independently
 * (the unify model: an interactive symbology shares its selected variant through
 * this layer's own `searchParamKey` page var). All writes target that symbology's
 * active layer, so no parallel state is created.
 */
export function getSymbologyBridge(state, setState, symId) {
  const entry = state?.symbologies?.[symId];
  const symbology = entry?.symbology;
  const layerKey = symbology?.activeLayer;
  const layer = symbology?.layers?.[layerKey];
  const interactiveFilterOptions = layer?.["interactive-filters"] || [];
  const dynamicFilterOptions = layer?.["dynamic-filters"] || [];
  const clickConfig = normalizeLayerClickFilterConfig(layer?.["click-filter"] || {});

  // Every write resolves the layer fresh from the draft and no-ops if the
  // symbology/layer went away (e.g. removed from the Layer Library mid-edit).
  const update = (mutate) =>
    setState?.((draft) => {
      const draftLayer = draft.symbologies?.[symId]?.symbology?.layers?.[layerKey];
      if (draftLayer) mutate(draftLayer);
    });

  return {
    symId,
    name: entry?.name || `Symbology ${symId}`,
    layerKey,
    layer,
    hasLayer: Boolean(layer),
    searchParamKey: layer?.searchParamKey || "",
    usePageFilters: layer?.usePageFilters,
    interactiveFilterOptions,
    dynamicFilterOptions,
    activeFilter: layer?.selectedInteractiveFilterIndex,
    clickFilterEnabled: clickConfig.enabled || false,
    clickFilterMappings: clickConfig.mappings || [],
    setUsePageFilters: (value) => update((l) => { l.usePageFilters = value; }),
    setSearchParamKey: (value) => update((l) => { l.searchParamKey = value; }),
    setInteractiveSearchParamValue: (i, value) =>
      update((l) => { l["interactive-filters"][i].searchParamValue = value; }),
    activateInteractiveFilter: (i) =>
      update((l) => { l.selectedInteractiveFilterIndex = i; }),
    setDynamicSearchParamKey: (i, value) =>
      update((l) => { l["dynamic-filters"][i].searchParamKey = value; }),
    setDynamicDefaultValue: (i, nextValue) =>
      update((l) => {
        const value = nextValue?.length ? nextValue : undefined;
        l["dynamic-filters"][i].defaultValue = value;
        l["dynamic-filters"][i].values = value ? [value] : [];
      }),
    setDynamicDataType: (i, value) =>
      update((l) => { l["dynamic-filters"][i].dataType = value; }),
    setClickFilterUseSearchParam: (i, value) =>
      update((l) => { l["click-filter"].mappings[i].useSearchParams = value; }),
  };
}

/**
 * Summary of every symbology for the multi-symbology bridge drill-in list.
 * Symbologies with no filters are still listed (so the author sees they exist);
 * the `searchParamKey` badge shows whether a page var is wired.
 */
export function listBridgeSymbologies(state) {
  return Object.keys(state?.symbologies || {}).map((symId) => {
    const b = getSymbologyBridge(state, undefined, symId);
    return {
      symId,
      name: b.name,
      hasLayer: b.hasLayer,
      searchParamKey: b.searchParamKey,
      interactiveCount: b.interactiveFilterOptions.length,
      dynamicCount: b.dynamicFilterOptions.length,
    };
  });
}
