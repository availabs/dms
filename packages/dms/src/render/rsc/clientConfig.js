import { withPluginThemes } from '../../plugins/registries'
// What the RSC spike's client chrome (ClientChrome.jsx) needs from the host app, which the library can't
// import itself: the app's theme loader and hosts. The library's browser and SSR entries set it once
// (./entries/browser.js, ./entries/ssr.js), from the host modules the app's build config aliases
// (./entries/README.md). rsc-view-pages.md, phase 2.
const config = {
  loadThemes: null,      // (names) => Promise<{ [name]: theme }>, src/themes/index.js
  API_HOST: '',
  AUTH_HOST: '',
  isMultiTenant: false,
  // () => Promise: registers the app's own pattern types (registerPatternTypes), whose pageComponents
  // a page's sections may be (the map editor's Map). Awaited before section islands render (IslandHost),
  // so a page with no islands never loads them.
  loadPatternTypes: null,
}

export function configureRscClient(values) {
  Object.assign(config, values)
  // the themes plugins register load through the same loader (plugins/index.js)
  if (typeof config.loadThemes === 'function') config.loadThemes = withPluginThemes(config.loadThemes)
}

export function getRscClientConfig() {
  return config
}
