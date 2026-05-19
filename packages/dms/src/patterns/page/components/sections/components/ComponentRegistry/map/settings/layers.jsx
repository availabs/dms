import useSymbologySelectorState from "./symbologySelector.jsx";

/**
 * Exposes the currently selected layer and layer picker handler for Map Settings.
 * The underlying selection logic is shared with the symbology selector state helper.
 */
export default function useMapSettingsLayers({ state = {}, setState, doApiLoad } = {}) {
  const { selectedLayer, layerOptions, onLayerChange } = useSymbologySelectorState({
    state,
    setState,
    doApiLoad,
  });

  return { selectedLayer, layerOptions, onLayerChange };
}
