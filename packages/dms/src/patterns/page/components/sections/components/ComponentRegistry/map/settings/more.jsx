import { HEIGHT_OPTIONS, PANEL_POSITION_OPTIONS } from "../index.jsx";

/**
 * Returns the inline "more" settings shown on the main Map Settings screen.
 * These handlers write directly to the existing map display config keys.
 */
export default function useMapSettingsMore({ state = {}, setState } = {}) {
  const arePluginsLoaded = Object.values(state.symbologies || {}).some(
    (symbology) => Object.keys(symbology?.symbology?.plugins || {}).length > 0
  );

  return {
    state,
    arePluginsLoaded,
    heightOptions: Object.keys(HEIGHT_OPTIONS),
    panelPositionOptions: Object.keys(PANEL_POSITION_OPTIONS),
    setHeight: (value) =>
      setState?.((draft) => {
        draft.height = value;
      }),
    setLegendPosition: (value) =>
      setState?.((draft) => {
        draft.legendPosition = value;
      }),
    setPluginControlPosition: (value) =>
      setState?.((draft) => {
        draft.pluginControlPosition = value;
      }),
    setZoomPan: (value) =>
      setState?.((draft) => {
        draft.zoomPan = value;
      }),
    setInitialBounds: (value) =>
      setState?.((draft) => {
        draft.setInitialBounds = value;
        if (!value) {
          draft.initialBounds = undefined;
        }
      }),
    setBlankBasemap: (value) =>
      setState?.((draft) => {
        draft.blankBaseMap = value;
      }),
    setZoomToFitBounds: (value) =>
      setState?.((draft) => {
        draft.zoomToFitBounds = value;
      }),
  };
}
