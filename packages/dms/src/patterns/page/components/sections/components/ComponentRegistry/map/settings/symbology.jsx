import useSymbologySelectorState from "./symbologySelector.jsx";

export default function useMapSettingsSymbology({ state = {}, setState, doApiLoad } = {}) {
  const { selectedSymbology, symbologyOptions, onSymbologyChange } = useSymbologySelectorState({
    state,
    setState,
    doApiLoad,
  });

  return { selectedSymbology, symbologyOptions, onSymbologyChange };
}
