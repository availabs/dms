import { cloneDeep } from "lodash-es";
import useSymbologySelectorState from "./symbologySelector.jsx";

/**
 * Symbology-management handlers for the unified Map Settings "Symbologies" manager.
 * Exposes the available-symbology options + selected symbology (from the shared
 * selector state), the merge-preserving Refresh (`onUpdateSymbology`), and the
 * multi-symbology library handlers: add-with-category / remove / per-symbology
 * visibility / active-layer — added symbologies come in hidden (isVisible:false,
 * every maplibre sub-layer layout.visibility 'none', including interactive-filter
 * variants) and get a `{name, type:'symbology', symbologyId}` row in the chosen
 * category tab.
 */
export default function useMapSettingsSymbology({ state = {}, setState, doApiLoad } = {}) {
  const {
    symbologies,
    selectedSymbology,
    symbologyOptions,
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

  // Toggle a symbology's on-map visibility from the settings manager. Mirrors the
  // add-to-library hide logic (both the layer sub-layers AND interactive-filter
  // variant sub-layers) so the maplibre layout.visibility stays in lockstep with
  // `isVisible` — the runtime interactive-filter effect then selects the variant.
  const setSymbologyVisible = (symbologyId, visible) => {
    if (!setState) return;
    setState((draft) => {
      const entry = draft.symbologies?.[symbologyId];
      if (!entry) return;
      entry.isVisible = Boolean(visible);
      const vis = visible ? "visible" : "none";
      Object.values(entry.symbology?.layers || {}).forEach((layer) => {
        (layer.layers || []).forEach((mlLayer) => {
          mlLayer.layout = { ...(mlLayer.layout || {}), visibility: vis };
        });
        (layer["interactive-filters"] || []).forEach((variant) => {
          (variant.layers || []).forEach((mlLayer) => {
            mlLayer.layout = { ...(mlLayer.layout || {}), visibility: vis };
          });
        });
      });
    });
  };

  // Pick which layer inside a symbology is active (settings/filters edit it).
  const setActiveLayer = (symbologyId, layerKey) => {
    if (!setState) return;
    setState((draft) => {
      if (draft.symbologies?.[symbologyId]?.symbology) {
        draft.symbologies[symbologyId].symbology.activeLayer = layerKey;
      }
    });
  };

  return {
    selectedSymbology,
    symbologyOptions,
    onUpdateSymbology,
    isUpdatingSymbology,
    libraryEntries,
    libraryCategories,
    addSymbologyToLibrary,
    removeSymbologyFromLibrary,
    setSymbologyVisible,
    setActiveLayer,
  };
}
