import { useEffect, useMemo, useState } from "react";

/**
 * Loads available DMS symbologies and derives the current symbology/layer selection state.
 * This helper is shared by the Map Settings symbology and layer screens.
 */
export default function useSymbologySelectorState({ state = {}, setState, doApiLoad } = {}) {
  const [dmsSymbologies, setDmsSymbologies] = useState([]);

  useEffect(() => {
    if (!doApiLoad) return;

    doApiLoad().then((res) => {
      setDmsSymbologies(
        res.map((sym) => ({
          ...sym,
          symbology: {
            ...sym.symbology,
            id: sym.id,
          },
        }))
      );
    });
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

  return {
    selectedSymbology,
    symbologyOptions,
    onSymbologyChange,
    selectedLayer,
    layerOptions,
    onLayerChange,
  };
}
