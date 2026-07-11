import { cloneDeep } from "lodash-es";
import useSymbologySelectorState from "./symbologySelector.jsx";

/**
 * Exposes the active symbology and symbology picker handler for Map Settings.
 * This reuses the same selection behavior already used by the map toolbar flow.
 *
 * Also exposes the Layer Library management handlers (multi-symbology mode):
 * add-with-category / remove, mirroring map_dama's SelectSymbology.addLayer
 * semantics — added symbologies come in hidden (isVisible:false, every maplibre
 * sub-layer layout.visibility 'none', including interactive-filter variants)
 * and get a `{name, type:'symbology', symbologyId}` row in the chosen category
 * tab. The classic single-symbology picker (onSymbologyChange, replace-on-pick)
 * is unchanged.
 */
export default function useMapSettingsSymbology({ state = {}, setState, doApiLoad } = {}) {
  const {
    symbologies,
    selectedSymbology,
    symbologyOptions,
    onSymbologyChange,
    onUpdateSymbology,
    isUpdatingSymbology,
  } = useSymbologySelectorState({
    state,
    setState,
    doApiLoad,
  });

  const libraryEntries = (state.tabs || []).flatMap((tab) =>
    (tab.rows || []).map((row) => ({
      tabName: tab.name,
      symbologyId: row.symbologyId,
      name: state.symbologies?.[row.symbologyId]?.name || row.name,
    }))
  );

  const libraryCategories = (state.tabs || []).map((tab) => tab.name).filter(Boolean);

  const addSymbologyToLibrary = (symbologyId, categoryName) => {
    const sym = (symbologies || []).find((entry) => +entry.id === +symbologyId);
    if (!sym?.id || !setState) return;

    setState((draft) => {
      const cloned = cloneDeep(sym);
      Object.values(cloned.symbology?.layers || {}).forEach((layer) => {
        (layer.layers || []).forEach((mlLayer) => {
          mlLayer.layout = { ...(mlLayer.layout || {}), visibility: "none" };
        });
        (layer["interactive-filters"] || []).forEach((variant) => {
          (variant.layers || []).forEach((mlLayer) => {
            mlLayer.layout = { ...(mlLayer.layout || {}), visibility: "none" };
          });
        });
      });
      draft.symbologies[sym.id] = { ...cloned, isVisible: false };

      const catName = (categoryName || "").trim() || "Layers";
      if (!draft.tabs) draft.tabs = [];
      let tab = draft.tabs.find((entry) => entry.name === catName);
      if (!tab) {
        draft.tabs.push({ name: catName, rows: [] });
        tab = draft.tabs[draft.tabs.length - 1];
      }
      if (!tab.rows) tab.rows = [];
      if (!tab.rows.some((row) => +row.symbologyId === +sym.id)) {
        tab.rows.push({ name: sym.name, type: "symbology", symbologyId: sym.id });
      }
    });
  };

  const removeSymbologyFromLibrary = (symbologyId) => {
    if (!setState) return;
    setState((draft) => {
      delete draft.symbologies[symbologyId];
      (draft.tabs || []).forEach((tab) => {
        tab.rows = (tab.rows || []).filter((row) => +row.symbologyId !== +symbologyId);
      });
      draft.tabs = (draft.tabs || []).filter((tab) => (tab.rows || []).length > 0);
    });
  };

  return {
    selectedSymbology,
    symbologyOptions,
    onSymbologyChange,
    onUpdateSymbology,
    isUpdatingSymbology,
    libraryEntries,
    libraryCategories,
    addSymbologyToLibrary,
    removeSymbologyFromLibrary,
  };
}
