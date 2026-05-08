import useSymbologySelectorState from "./symbologySelector.jsx";

export default function useMapSettingsLayers({ state = {}, setState, doApiLoad } = {}) {
  const { selectedLayer, layerOptions, onLayerChange } = useSymbologySelectorState({
    state,
    setState,
    doApiLoad,
  });

  return { selectedLayer, layerOptions, onLayerChange };
}
