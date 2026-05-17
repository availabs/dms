import useMapSettingsFilters from "./filters.jsx";
import useMapSettingsLayers from "./layers.jsx";
import useMapSettingsMore from "./more.jsx";
import useMapSettingsSymbology from "./symbology.jsx";

/**
 * Builds the data and handlers used by the Map Settings panel.
 * This keeps the refactored UI connected to the same map state and update flow.
 */
export default function useMapSettingsControls(mapAPI) {
  const symbology = useMapSettingsSymbology(mapAPI || {});
  const layers = useMapSettingsLayers(mapAPI || {});
  const filters = useMapSettingsFilters(mapAPI || {});
  const more = useMapSettingsMore(mapAPI || {});

  return {
    ...more,
    ...symbology,
    ...layers,
    ...filters,
  };
}
