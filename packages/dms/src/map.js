// The map runtime, as a second library entry — imported only by code that
// renders maps (e.g. dms-template's map editor pattern, which loads lazily), so
// the main entry (./index.js) never pulls it into the eager bundle.
export { AvlMap, AvlLayer } from './ui/components/map'
export { default as useMapTheme } from './ui/components/map/useMapTheme'
export { default as useMapLegendTheme } from './ui/components/map/useMapLegendTheme'
export { getColorRange } from './ui/components/graph_new/colorRange'
