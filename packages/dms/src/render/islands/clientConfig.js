import { withPluginThemes } from '../../plugins/registries'
// What the islands path's client chrome (ClientChrome.jsx) needs from the host app, which the library can't
// import itself: the app's theme loader and hosts. Set once on each side: the browser entry
// (./entry.browser.jsx, from the host modules the app's build config aliases: ./README.md) and the SSR
// handler (render/ssr2/handler.jsx, from its own config).
const config = {
  loadThemes: null,      // (names) => Promise<{ [name]: theme }>, src/themes/index.js
  API_HOST: '',
  AUTH_HOST: '',
  isMultiTenant: false,
  // { [plugin name]: () => Promise<{ default: plugin }> }: the plugins compiled into the app, each loaded
  // only by a page whose live sections need it (the server names them: plugins/registries.js
  // pluginsOfSections; IslandHost registers what it loads). A plugin not listed here is taken to be one
  // installed at run time and is loaded from the API host.
  pluginLoaders: null,
}

export function configureIslandsClient(values) {
  Object.assign(config, values)
  // the themes plugins register load through the same loader (plugins/index.js)
  if (typeof config.loadThemes === 'function') config.loadThemes = withPluginThemes(config.loadThemes)
}

export function getIslandsClientConfig() {
  return config
}
