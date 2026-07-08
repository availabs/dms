import { useEffect, useMemo, useState } from "react";
import { cloneDeep } from "lodash-es";

const inFlightSymbologyRequests = new WeakMap();

/**
 * Merge a freshly-fetched layer with the author's DMS-configured layer, keeping
 * the FRESH copy as the structural source of truth (new/removed dynamic
 * variables, restyling, added/removed sub-layers flow in) while preserving every
 * field the DMS Map settings let an author configure for anything that still
 * exists. Field list mirrors `settings/filters.jsx`.
 */
function mergeUserConfigIntoLayer(freshLayer, prevLayer) {
  if (!prevLayer) return freshLayer;
  const merged = { ...freshLayer };

  // Layer-level author config.
  if (prevLayer.usePageFilters !== undefined) merged.usePageFilters = prevLayer.usePageFilters;
  if (prevLayer.searchParamKey !== undefined) merged.searchParamKey = prevLayer.searchParamKey;

  // Active interactive-filter index — guard if the fresh list shrank.
  const freshInteractive = Array.isArray(merged["interactive-filters"]) ? merged["interactive-filters"] : [];
  if (prevLayer.selectedInteractiveFilterIndex !== undefined) {
    merged.selectedInteractiveFilterIndex =
      prevLayer.selectedInteractiveFilterIndex < freshInteractive.length
        ? prevLayer.selectedInteractiveFilterIndex
        : 0;
  }

  // dynamic-filters — matched by column_name. New filters keep their fresh
  // definition; existing ones keep the author's configured values.
  if (Array.isArray(merged["dynamic-filters"])) {
    const prevByCol = new Map((prevLayer["dynamic-filters"] || []).map((f) => [f.column_name, f]));
    merged["dynamic-filters"] = merged["dynamic-filters"].map((freshF) => {
      const prevF = prevByCol.get(freshF.column_name);
      if (!prevF) return freshF;
      return {
        ...freshF,
        searchParamKey: prevF.searchParamKey ?? freshF.searchParamKey,
        defaultValue: prevF.defaultValue ?? freshF.defaultValue,
        values: prevF.values ?? freshF.values,
        dataType: prevF.dataType ?? freshF.dataType,
      };
    });
  }

  // interactive-filters — preserve the author's searchParamValue (match by
  // label, falling back to index).
  if (Array.isArray(merged["interactive-filters"]) && Array.isArray(prevLayer["interactive-filters"])) {
    merged["interactive-filters"] = merged["interactive-filters"].map((freshIf, i) => {
      const prevIf =
        prevLayer["interactive-filters"].find((p) => p.label === freshIf.label) ||
        prevLayer["interactive-filters"][i];
      return prevIf?.searchParamValue !== undefined
        ? { ...freshIf, searchParamValue: prevIf.searchParamValue }
        : freshIf;
    });
  }

  // click-filter mappings — preserve useSearchParams by index.
  if (Array.isArray(merged["click-filter"]?.mappings) && Array.isArray(prevLayer["click-filter"]?.mappings)) {
    merged["click-filter"] = {
      ...merged["click-filter"],
      mappings: merged["click-filter"].mappings.map((m, i) => {
        const prevM = prevLayer["click-filter"].mappings[i];
        return prevM?.useSearchParams !== undefined ? { ...m, useSearchParams: prevM.useSearchParams } : m;
      }),
    };
  }

  // Sub-layer visibility (layers[].layout.visibility) is author-toggled.
  if (Array.isArray(merged.layers) && Array.isArray(prevLayer.layers)) {
    merged.layers = merged.layers.map((subLayer, i) => {
      const prevVis = prevLayer.layers?.[i]?.layout?.visibility;
      return prevVis !== undefined && subLayer?.layout
        ? { ...subLayer, layout: { ...subLayer.layout, visibility: prevVis } }
        : subLayer;
    });
  }

  return merged;
}

/**
 * Merge a freshly-fetched symbology over the author's configured one. All work
 * happens on a plain cloneDeep'd object BEFORE setState — mutating the fetched
 * object inside an immer producer would hit frozen state.
 */
function mergeSymbologyPreservingUserConfig(freshSym, prevSym) {
  const merged = cloneDeep(freshSym);
  if (!prevSym) {
    merged.isVisible = true;
    return merged;
  }
  merged.isVisible = prevSym.isVisible ?? true;

  const prevSymbology = prevSym.symbology || {};
  const freshSymbology = merged.symbology || {};

  // Keep the author's active layer if it still exists.
  if (prevSymbology.activeLayer && freshSymbology.layers?.[prevSymbology.activeLayer]) {
    freshSymbology.activeLayer = prevSymbology.activeLayer;
  }

  // Merge each surviving layer; new layers keep their fresh definition, removed
  // layers are simply absent from the fresh copy.
  if (freshSymbology.layers) {
    Object.keys(freshSymbology.layers).forEach((layerId) => {
      const prevLayer = prevSymbology.layers?.[layerId];
      if (prevLayer) {
        freshSymbology.layers[layerId] = mergeUserConfigIntoLayer(freshSymbology.layers[layerId], prevLayer);
      }
    });
  }

  return merged;
}

function normalizeSymbologies(res) {
  return (res || []).map((sym) => ({
    ...sym,
    symbology: {
      ...sym.symbology,
      id: sym.id,
    },
  }));
}

function getSymbologyRequest(doApiLoad) {
  if (!doApiLoad) return null;

  const inFlight = inFlightSymbologyRequests.get(doApiLoad);
  if (inFlight) return inFlight;

  const request = Promise.resolve(doApiLoad())
    .then((res) => normalizeSymbologies(res))
    .finally(() => {
      inFlightSymbologyRequests.delete(doApiLoad);
    });

  inFlightSymbologyRequests.set(doApiLoad, request);
  return request;
}

/**
 * Loads available DMS symbologies and derives the current symbology/layer selection state.
 * This helper is shared by the Map Settings symbology and layer screens.
 */
export default function useSymbologySelectorState({ state = {}, setState, doApiLoad } = {}) {
  const [dmsSymbologies, setDmsSymbologies] = useState([]);

  useEffect(() => {
    if (!doApiLoad) return;
    const request = getSymbologyRequest(doApiLoad);
    if (!request) return;

    let isMounted = true;
    request.then((data) => {
      if (isMounted) {
        setDmsSymbologies(data);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [doApiLoad]);

  const symbologies = dmsSymbologies;

  const selectedSymbology =
    Object.values(state?.symbologies || {})[0]?.id ||
    Object.values(state?.symbologies || {})[0]?.symbology_id;

  const symbologyOptions = useMemo(
    () => symbologies.map((sym) => ({ label: sym.name, key: sym.id || sym.symbology_id })),
    [symbologies]
  );

  const selectedLayer = state.symbologies?.[selectedSymbology]?.symbology?.activeLayer;

  const layerOptions = useMemo(
    () =>
      Object.values(state.symbologies?.[selectedSymbology]?.symbology?.layers || {}).map((layer, index) => ({
        label: layer.name?.length && layer.name !== " " ? layer.name : `layer - ${index + 1}`,
        key: layer.id,
      })),
    [selectedSymbology, state.symbologies]
  );

  const onSymbologyChange = (nextSymbology) => {
    if (!setState) return;

    const sym = symbologies.find((entry) => +entry.id === +nextSymbology) || {};
    if (!sym?.id) return;

    setState((draft) => {
      draft.symbologies = { [nextSymbology]: { ...sym, isVisible: true } };
    });
  };

  const onLayerChange = (nextLayer) => {
    if (!setState || !selectedSymbology) return;

    const currLayer = state.symbologies?.[selectedSymbology]?.symbology?.[nextLayer] || {};
    if (currLayer) {
      setState((draft) => {
        draft.symbologies[selectedSymbology].symbology.activeLayer = nextLayer;
      });
    }
  };

  const [isUpdatingSymbology, setIsUpdatingSymbology] = useState(false);

  /**
   * Refresh: re-fetch the selected symbology fresh from the source and merge it
   * in, so map-editor changes (new/removed dynamic variables, restyling, added/
   * removed layers) flow in while the author's DMS Map settings are preserved.
   * This is a merge, not a replace — and it never touches component/page-level
   * settings (height, legend position, zoom/pan, basemap).
   */
  const onUpdateSymbology = async () => {
    if (!setState || !doApiLoad || !selectedSymbology) return;

    setIsUpdatingSymbology(true);
    try {
      // Invalidate the selected symbology's falcor cache so this pulls the
      // latest saved config from the source, not the stale client cache.
      const fresh = normalizeSymbologies(await doApiLoad({ invalidateId: selectedSymbology }));
      if (fresh?.length) setDmsSymbologies(fresh);

      const freshSym = fresh.find((entry) => +entry.id === +selectedSymbology);
      if (!freshSym) return;

      // Merge on a plain object BEFORE setState (immer would freeze it).
      const prevSym = state.symbologies?.[selectedSymbology];
      const merged = mergeSymbologyPreservingUserConfig(freshSym, prevSym);

      setState((draft) => {
        draft.symbologies = { [selectedSymbology]: merged };
        // Bump a refresh signal so MapSection tears down and rebuilds the layer
        // instances. They're otherwise kept by id, which would strand the map on
        // the pre-refresh config and skip every layer data/tile/legend fetch —
        // so the refreshed symbology wouldn't actually re-hit the APIs.
        draft.__symbologyRefreshAt = (draft.__symbologyRefreshAt || 0) + 1;
      });
    } finally {
      setIsUpdatingSymbology(false);
    }
  };

  return {
    selectedSymbology,
    symbologyOptions,
    onSymbologyChange,
    selectedLayer,
    layerOptions,
    onLayerChange,
    onUpdateSymbology,
    isUpdatingSymbology,
  };
}
