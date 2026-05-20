import useSymbologySelectorState from "./symbologySelector.jsx";

/**
 * Exposes the active symbology and symbology picker handler for Map Settings.
 * This reuses the same selection behavior already used by the map toolbar flow.
 */
export default function useMapSettingsSymbology({ state = {}, setState, doApiLoad } = {}) {
  const { selectedSymbology, symbologyOptions, onSymbologyChange } = useSymbologySelectorState({
    state,
    setState,
    doApiLoad,
  });

  return { selectedSymbology, symbologyOptions, onSymbologyChange };
}
