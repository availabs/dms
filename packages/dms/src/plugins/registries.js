// The plugin registries the route builder and the RSC client config read: themes and data-type pages. A module of
// its own with no imports, so those readers don't pull in the registration code (plugins/index.js) and its
// dependencies. Task: src/dms/planning/tasks/current/dms-plugin-system.md (P1).

export const themeLoaders = new Map()     // theme name -> () => Promise<theme object>
export const dataTypes = {}               // data-type name -> { def, plugin, activation }
export const patternTypeOwners = new Map() // pattern type -> { plugin, activation }

const activeIn = (activations, plugin, activation) => {
  const row = activations?.[plugin]
  return row && typeof row.enabled === 'boolean' ? row.enabled : activation === 'default-on'
}

export const sectionTypeOwners = new Map() // section (element) type -> { plugin, activation }

/** Whether a site may add a section type: a core or theme type always; a plugin's, when that plugin is active. */
export function isSectionTypeActive(type, activations = {}) {
  const owner = sectionTypeOwners.get(type)
  return !owner || activeIn(activations, owner.plugin, owner.activation)
}

/** Whether a site may use a pattern type: a core or app type always; a plugin's, when that plugin is active. */
export function isPatternTypeActive(type, activations = {}) {
  const owner = patternTypeOwners.get(type)
  return !owner || activeIn(activations, owner.plugin, owner.activation)
}

/**
 * A site's activations, from its row's `plugin_activations` refs (the site load fetches `plugin` and `enabled`;
 * `enabled` may arrive as text): { [plugin]: { enabled } }. A row without a plugin name is ignored.
 */
export function activationsOf(siteRow) {
  const out = {}
  for (const ref of (Array.isArray(siteRow?.plugin_activations) ? siteRow.plugin_activations : [])) {
    const name = ref?.plugin
    if (!name) continue
    const raw = ref.enabled
    out[name] = { enabled: !(raw === false || raw === 'false' || raw === 0 || raw === '0') }
  }
  return out
}

export function pluginThemeNames() {
  return [...themeLoaders.keys()]
}

/** Loads the plugin themes among `names`: { name: theme }. */
export async function loadPluginThemes(names = []) {
  const out = {}
  await Promise.all(names.filter(n => themeLoaders.has(n)).map(async (n) => {
    const theme = await themeLoaders.get(n)()
    if (theme) out[n] = theme
  }))
  return out
}

/**
 * A themes loader (the app's `loadThemes(names)`) that also loads plugin themes, for every place the library takes
 * one. App themes win on a name both have. `ALL_NAMES` (the theme picker's list) includes the plugins' themes.
 */
export function withPluginThemes(loader) {
  if (typeof loader !== 'function' || loader.withPlugins) return loader
  const wrapped = async (names = []) => {
    const base = (await loader(names)) || {}
    const missing = names.filter(n => !base[n])
    return missing.length ? { ...(await loadPluginThemes(missing)), ...base } : base
  }
  Object.defineProperty(wrapped, 'ALL_NAMES', {
    get: () => [...new Set([...(loader.ALL_NAMES || []), ...pluginThemeNames()])],
  })
  wrapped.withPlugins = true
  return wrapped
}

/**
 * Data-type client pages registered by active plugins: { name: definition }. `activations` is the tenant's
 * activation rows by plugin name ({ [plugin]: { enabled } }); without one a default-on plugin is active and an
 * opt-in one is not (dms-plugin-system.md, "Compiled-in plugins stay on by default").
 */
export function pluginDataTypes(activations = {}) {
  const out = {}
  for (const [name, { def, plugin, activation }] of Object.entries(dataTypes)) {
    if (activeIn(activations, plugin, activation)) out[name] = def
  }
  return out
}
