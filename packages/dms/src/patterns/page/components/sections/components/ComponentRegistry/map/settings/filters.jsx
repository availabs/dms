import { normalizeLayerClickFilterConfig } from "../../../../../../../mapeditor/MapEditor/stateUtils";

export default function useMapSettingsFilters({ state = {}, setState } = {}) {

  const activeSym = Object.keys(state.symbologies || {}).find((sym) => state.symbologies[sym].isVisible);
  const activeSymSymbology = state.symbologies?.[activeSym]?.symbology;
  const activeLayer = activeSymSymbology?.layers?.[activeSymSymbology?.activeLayer];
  const interactiveFilterOptions = activeLayer?.["interactive-filters"] || [];
  const dynamicFilterOptions = activeLayer?.["dynamic-filters"] || [];
  const clickFilterConfig = normalizeLayerClickFilterConfig(activeLayer?.["click-filter"] || {});
  const selectedVariableMappings = clickFilterConfig.mappings || [];
  const isSelectedVariableMappingsEnabled = clickFilterConfig.enabled || false;
  const activeFilter = activeLayer?.selectedInteractiveFilterIndex;

  return {
    activeSym,
    activeSymSymbology,
    activeLayer,
    interactiveFilterOptions,
    dynamicFilterOptions,
    selectedVariableMappings,
    isSelectedVariableMappingsEnabled,
    activeFilter,
    interactiveCount: interactiveFilterOptions.length,
    dynamicCount: dynamicFilterOptions.length,
    clickCount: isSelectedVariableMappingsEnabled ? selectedVariableMappings.length : 0,
    totalFilterItems:
      interactiveFilterOptions.length +
      dynamicFilterOptions.length +
      (isSelectedVariableMappingsEnabled ? selectedVariableMappings.length : 0) +
      2,
    setUsePageFilters: (value) =>
      setState?.((draft) => {
        draft.symbologies[activeSym].symbology.layers[activeSymSymbology?.activeLayer].usePageFilters = value;
      }),
    setSearchParamKey: (value) =>
      setState?.((draft) => {
        draft.symbologies[activeSym].symbology.layers[activeSymSymbology?.activeLayer].searchParamKey = value;
      }),
    setInteractiveSearchParamValue: (filterIndex, value) =>
      setState?.((draft) => {
        draft.symbologies[activeSym].symbology.layers[activeSymSymbology?.activeLayer]["interactive-filters"][filterIndex].searchParamValue = value;
      }),
    activateInteractiveFilter: (filterIndex) =>
      setState?.((draft) => {
        draft.symbologies[activeSym].symbology.layers[activeSymSymbology?.activeLayer].selectedInteractiveFilterIndex = filterIndex;
      }),
    setDynamicSearchParamKey: (filterIndex, value) =>
      setState?.((draft) => {
        draft.symbologies[activeSym].symbology.layers[activeSymSymbology?.activeLayer]["dynamic-filters"][filterIndex].searchParamKey = value;
      }),
    setDynamicDefaultValue: (filterIndex, nextValue) =>
      setState?.((draft) => {
        const value = nextValue?.length ? nextValue : undefined;
        draft.symbologies[activeSym].symbology.layers[activeSymSymbology?.activeLayer]["dynamic-filters"][filterIndex].defaultValue = value;
        draft.symbologies[activeSym].symbology.layers[activeSymSymbology?.activeLayer]["dynamic-filters"][filterIndex].values = value ? [value] : [];
      }),
    setDynamicDataType: (filterIndex, value) =>
      setState?.((draft) => {
        draft.symbologies[activeSym].symbology.layers[activeSymSymbology?.activeLayer]["dynamic-filters"][filterIndex].dataType = value;
      }),
    setClickFilterUseSearchParam: (mappingIndex, value) =>
      setState?.((draft) => {
        draft.symbologies[activeSym].symbology.layers[activeSymSymbology?.activeLayer]["click-filter"].mappings[mappingIndex].useSearchParams = value;
      }),
  };
}
