import useMapSettingsFilters from "./filters.jsx";
import useMapSettingsLayers from "./layers.jsx";
import useMapSettingsMore from "./more.jsx";
import useMapSettingsSymbology from "./symbology.jsx";

export default function useMapSettingsControls(dwAPI) {
  const { state, setState, doApiLoad } = dwAPI || {};
  const mapAPI = { state, setState, doApiLoad };

  const symbology = useMapSettingsSymbology(mapAPI);
  const layers = useMapSettingsLayers(mapAPI);
  const filters = useMapSettingsFilters(mapAPI);
  const more = useMapSettingsMore(mapAPI);

  return {
    ...more,
    ...symbology,
    ...layers,
    ...filters,
  };
}
