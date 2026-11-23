// Loading plugins installed at run time (P2): a site's activation rows name the plugin and the installed version;
// each active one's entry is imported and registered through the host before the routes are built.
//
// Task: src/dms/planning/tasks/current/dms-plugin-system.md, P2 plan step 4. Where the code comes from is the
// caller's: in the browser, the API host's `/_dms/plugins/<name>/<version>/client.js`; on the server (SSR), the
// plugin's version folder, given as `resolveUrl` by the server (handler config `resolvePluginUrl`).
//
// One version of a plugin per JavaScript realm: ES modules can't be unloaded, so a second version asked for in the
// same process (two tenants pinning different versions on one server) is refused with a warning, and a page reload
// (browser) or the rolling restart (server) picks up an upgrade. A plugin compiled into the app is never loaded
// over: the compiled-in one wins.
import { registerPlugin, getPlugin } from './index'

const loading = new Map()   // plugin name -> { version, promise }

/**
 * The installed plugins a site turns on: its `plugin_activations` refs with `enabled` and a `version`
 * ([{ name, version }]). A plugin compiled into the app is left out (it is already registered).
 */
export function installedActivations(siteRow) {
  const out = []
  for (const ref of (Array.isArray(siteRow?.plugin_activations) ? siteRow.plugin_activations : [])) {
    const name = ref?.plugin
    const version = typeof ref?.version === 'string' ? ref.version.trim() : ''
    const raw = ref?.enabled
    const enabled = !(raw === false || raw === 'false' || raw === 0 || raw === '0')
    if (!name || !version || !enabled) continue
    const known = getPlugin(name)
    if (known && !loading.has(name)) continue   // compiled in
    out.push({ name, version })
  }
  return out
}

/** The browser's URL for a plugin's client entry, on the API host. */
export const clientPluginUrl = (apiHost, name, version) =>
  `${String(apiHost || '').replace(/\/+$/, '')}/_dms/plugins/${encodeURIComponent(name)}/${encodeURIComponent(version)}/client.js`

/**
 * Imports and registers `list` ([{ name, version, url }]); resolves when all have loaded or failed. A plugin that
 * fails to load is logged and left out, so a broken plugin costs a site that plugin's features, not the site.
 * @returns {Promise<string[]>} the names that are registered
 */
export async function loadPlugins(list = []) {
  if (!list.length) return []
  const { sharePeers } = await import('./peers')
  sharePeers()
  const done = await Promise.all(list.map(({ name, version, url }) => {
    const current = loading.get(name)
    if (current) {
      if (current.version !== version) {
        console.warn(`[plugins] ${name} ${version} asked for, but ${current.version} is loaded here; reload to switch`)
      }
      return current.promise
    }
    const promise = (async () => {
      if (!url) throw new Error('no URL for it')
      const mod = await import(/* @vite-ignore */ url)
      const def = mod.default || mod.plugin
      if (!def || def.name !== name) throw new Error(`the module is not plugin "${name}"`)
      if (def.version !== version) throw new Error(`the module is version ${def.version}, not ${version}`)
      // installed plugins are opt-in whatever they declare: on only where a tenant activates them
      registerPlugin({ ...def, activation: 'opt-in' })
      return name
    })().catch((e) => {
      console.error(`[plugins] ${name} ${version} did not load: ${e?.message || e}`)
      return null
    })
    loading.set(name, { version, promise })
    return promise
  }))
  return done.filter(Boolean)
}

/** A site's active installed plugins, loaded: `resolveUrl(name, version)` gives each entry's URL. */
export function loadSitePlugins(siteRow, resolveUrl) {
  if (typeof resolveUrl !== 'function') return Promise.resolve([])
  return loadPlugins(installedActivations(siteRow).map(p => ({ ...p, url: resolveUrl(p.name, p.version) })))
}
