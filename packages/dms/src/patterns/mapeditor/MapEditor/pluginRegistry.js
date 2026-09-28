// The map plugin registry — pluggable map/symbology tools activated on a
// MapEditor or on a page Map section. Kept in its own module (re-exported
// from ./index.jsx for existing importers) so callers that only REGISTER
// plugins — patterns/page/siteConfig.jsx, patterns/mapeditor/siteConfig.jsx —
// don't statically pull the whole map editor into the eager bundle. See
// planning/tasks/completed/bundle-split-initial-graph.md.

export const PLUGIN_TYPE = 'plugin'

export const PluginLibrary = {};

export const RegisterPlugin = (name, plugin) => {
  PluginLibrary[name] = plugin
}
