import useMapSettingsMore from "./more.jsx";
import useMapSettingsSymbology from "./symbology.jsx";

/**
 * Builds the data and handlers used by the Map Settings panel.
 * This keeps the refactored UI connected to the same map state and update flow.
 *
 * (The legacy per-active-symbology filter hook (`useMapSettingsFilters`) and the
 * layer-picker hook (`useMapSettingsLayers`) were removed with the controls that
 * consumed them — the current UI uses the per-symbology `getSymbologyBridge` /
 * `listBridgeSymbologies` helpers and `useMapSettingsSymbology`'s handlers.)
 */
export default function useMapSettingsControls(mapAPI) {
  const symbology = useMapSettingsSymbology(mapAPI || {});
  const more = useMapSettingsMore(mapAPI || {});

  return {
    ...more,
    ...symbology,
  };
}
