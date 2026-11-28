// Islands path: everything a page loads when its first island has to mount, as one lazy module (IslandHost.jsx):
// the section code and the plugin host that registers the plugins the page's sections need.
export { default as SectionIslands } from './SectionIslands.jsx'
export { registerPlugin, loadPlugins, clientPluginUrl } from '../../plugins/index.js'
// the lazy chunks of section types (a Graph's chart code), fetched before the islands' first render (IslandHost.jsx)
export { preloadSectionComponents } from '../../patterns/page/components/sections/componentRegistry'
