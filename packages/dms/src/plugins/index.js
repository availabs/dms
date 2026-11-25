// The DMS plugin contract, client and SSR side.
//
// Task: src/dms/planning/tasks/current/dms-plugin-system.md (P1, "the contract, still built in").
//
// A plugin is one package that can carry pattern types (with their page sections), section types, column types,
// format functions, nav widgets, themes and data-type pages. Its client entry exports
//
//   { name, version, api, activation?, register(host) }
//
//   name        unique plugin name (underscores, like every DMS identifier)
//   version     its semver version
//   api         the plugin API range it was written for, e.g. '^1.0' (PLUGIN_API_VERSION below)
//   activation  'default-on' (active for every tenant unless an activation row turns it off; what a plugin
//               compiled into the app uses, so converting one changes nothing) or 'opt-in' (active only where a
//               tenant activates it; the default for plugins installed at run time)
//   register    called once, synchronously, with a host; registers everything through it and does nothing at
//               import time. Heavy parts stay lazy (lazyComponent, theme loaders). The host also hands the plugin
//               the library's React contexts (`host.contexts`), so a plugin never imports the library itself.
//
// The host wraps today's registries, so a plugin never imports library internals to register, and it records
// what each plugin contributed: that is what lets activation be checked where a registry is read (`pluginOf`).
// ES modules can't be unloaded, so there is no unregister: activation decides what is offered and served.

import { registerPatternTypes, getPatternType } from '../patterns/registry'
import { defaultCheckAuth } from '../dms-manager/_auth'
import { registerComponents } from '../patterns/page/components/sections/componentRegistryStore'
import { registerColumnType } from '../ui/columnTypes'
import { registerFormatFunction } from '../patterns/page/components/sections/components/dataWrapper/utils/utils.jsx'
import { registerWidget } from '../ui/widgets'
import { ThemeContext } from '../ui/themeContext'
import { getComponentTheme } from '../ui/useTheme'
import { udaListViews, udaCreateView, udaUpdateSourceMetadata, udaGetSourceAuthorities, udaSetAuthoritativeView } from '../api'
import { singleAuthoritativeViewId } from '../patterns/datasets/utils/authority'
import { CMSContext, PageContext, ComponentContext, DataSourceContext } from '../patterns/page/context'
import { themeLoaders, dataTypes, patternTypeOwners, sectionTypeOwners, pluginRecords, contributionOwners } from './registries'

export { pluginThemeNames, loadPluginThemes, withPluginThemes, pluginDataTypes, activationsOf, isPatternTypeActive, isSectionTypeActive, pluginsOfSections } from './registries'
// plugins installed at run time (P2): loaded before routes are built
export { loadPlugins, loadSitePlugins, installedActivations, clientPluginUrl } from './load'

// The plugin API this library provides. Bump the minor for additions, the major for anything a plugin written
// for the previous one could trip on.
export const PLUGIN_API_VERSION = '1.1.0'

const ACTIVATION = ['default-on', 'opt-in']
const NAME = /^[a-z][a-z0-9_]*$/

const plugins = pluginRecords      // name -> record (what listPlugins shows); kept in ./registries for its readers
const definitions = new Map()      // name -> the plugin object it was registered with
const KINDS = ['patternTypes', 'sectionTypes', 'columnTypes', 'formatFunctions', 'widgets', 'themes', 'dataTypes']
for (const k of KINDS) contributionOwners[k] ||= new Map()
const owners = contributionOwners   // kind -> (registered name -> plugin name)

const parseVersion = (v) => String(v).trim().replace(/^v/, '').split('.').map(x => (x === 'x' || x === '*' ? null : Number(x)))

/**
 * Whether `range` accepts `version`. Supports what plugin manifests use: '^1.2', '~1.2.3', '1.x', '1.2.3', '*',
 * and '>=1.0 <2' style pairs.
 */
export function satisfies(version, range) {
  const [ma, mi = 0, pa = 0] = parseVersion(version)
  const cmp = (a, b) => { for (let i = 0; i < 3; i++) { const d = (a[i] ?? 0) - (b[i] ?? 0); if (d) return d } return 0 }
  const v = [ma, mi, pa]
  const r = String(range || '').trim()
  if (!r || r === '*') return true
  if (/\s/.test(r)) return r.split(/\s+/).every(part => satisfies(version, part))
  const op = r.match(/^(\^|~|>=|<=|>|<|=)?(.*)$/)
  const want = parseVersion(op[2])
  const lo = want.map(x => x ?? 0)
  switch (op[1]) {
    // ^1.2.3: same major; ^0.2.3: same minor (0.2.x); ^0.0.3: exactly that
    case '^':
      if (cmp(v, lo) < 0) return false
      if (lo[0] > 0) return ma === lo[0]
      if (lo[1] > 0) return ma === 0 && mi === lo[1]
      return cmp(v, lo) === 0
    case '~': return cmp(v, lo) >= 0 && ma === lo[0] && mi === lo[1]
    case '>=': return cmp(v, lo) >= 0
    case '<=': return cmp(v, lo) <= 0
    case '>': return cmp(v, lo) > 0
    case '<': return cmp(v, lo) < 0
    default:
      // '1.x', '1.2.x', '1.2.3', '=1.2.3'
      return want.every((w, i) => w === null || w === undefined || w === v[i])
  }
}

function claim(kind, name, plugin) {
  const owner = owners[kind].get(name)
  if (owner && owner !== plugin) {
    throw new Error(`plugin "${plugin}" registers ${kind} "${name}", which plugin "${owner}" already registered`)
  }
  owners[kind].set(name, plugin)
}

function createHost(plugin, activation, contributes) {
  const take = (kind, map, register) => {
    for (const [name, def] of Object.entries(map || {})) {
      claim(kind, name, plugin)
      contributes[kind].push(name)
      register(name, def)
    }
  }
  return {
    apiVersion: PLUGIN_API_VERSION,
    plugin,
    // The host's own React contexts. A plugin reads them through the host instead of importing the library: a
    // separately built plugin can't import it (the library is part of the app's bundle, and a shared copy of the
    // whole library is ~1.9 MB gzipped), and only the host's instances carry the page's values. The theme's UI set
    // comes through ThemeContext (`{ theme, UI }`), as it does for every library component.
    contexts: { ThemeContext, CMSContext, PageContext, ComponentContext, DataSourceContext },
    // Building on another pattern type (the page pattern's route shell, as qa and chat do) and the standard route
    // auth check, for the same reason: read through the host, never imported.
    getPatternType,
    defaultCheckAuth,
    // Since 1.1: what a code theme's components need besides the contexts. A theme's components read their styles
    // with getComponentTheme; a section editing dataset views uses the UDA calls (each takes the host's falcor, from
    // CMSContext) and the authoritative-view rule. (mergeTheme needs no host: ui/mergeTheme.js is pure, so a plugin
    // bundles it.)
    getComponentTheme,
    api: { udaListViews, udaCreateView, udaUpdateSourceMetadata, udaGetSourceAuthorities, udaSetAuthoritativeView },
    datasets: { singleAuthoritativeViewId },
    /** Pattern types, as registerPatternTypes takes them (their pageComponents come with them). */
    registerPatternTypes(map) {
      take('patternTypes', map, (name) => patternTypeOwners.set(name, { plugin, activation }))
      registerPatternTypes(map)
      for (const def of Object.values(map || {})) {
        for (const section of Object.keys(def?.pageComponents || {})) {
          claim('sectionTypes', section, plugin); contributes.sectionTypes.push(section)
          sectionTypeOwners.set(section, { plugin, activation })
        }
      }
    },
    /** Page section types, as registerComponents takes them. */
    registerSectionTypes(map) { take('sectionTypes', map, (name) => sectionTypeOwners.set(name, { plugin, activation })); registerComponents(map) },
    /** Column types: { name: definition }. */
    registerColumnTypes(map) { take('columnTypes', map, (name, def) => registerColumnType(name, def)) },
    /** Format functions: { name: fn } or { name: { fn, label, preserveSpaces } }. */
    registerFormatFunctions(map) {
      take('formatFunctions', map, (name, def) => (typeof def === 'function'
        ? registerFormatFunction(name, def)
        : registerFormatFunction(name, def.fn, { label: def.label, preserveSpaces: def.preserveSpaces })))
    },
    /** Nav widgets: { name: { label, component, internal } }. Register them identically on server and client. */
    registerWidgets(map) { take('widgets', map, (name, def) => registerWidget(name, def)) },
    /** Themes: { name: () => Promise<theme> }, loaded only when a pattern selects the name. */
    registerThemes(map) { take('themes', map, (name, loader) => { if (typeof loader !== 'function') throw new Error(`theme "${name}" of plugin "${plugin}": a loader function is expected`); themeLoaders.set(name, loader) }) },
    /** Data-type client pages: { name: definition }, as the app's damaDataTypes map holds them. */
    registerDataTypes(map) { take('dataTypes', map, (name, def) => { dataTypes[name] = { def, plugin, activation } }) },
  }
}

/** Registers one plugin. Registering the same plugin object twice is a no-op; another plugin of that name throws. */
export function registerPlugin(def) {
  if (!def || typeof def !== 'object') throw new Error('registerPlugin: a plugin object is expected')
  const { name, version, api, activation = 'opt-in', register } = def
  if (!NAME.test(name || '')) throw new Error(`plugin name "${name}": lowercase letters, digits and underscores, starting with a letter`)
  if (!parseVersion(version || '').every(Number.isFinite)) throw new Error(`plugin "${name}": version "${version}" is not x.y.z`)
  if (!satisfies(PLUGIN_API_VERSION, api)) throw new Error(`plugin "${name}" needs plugin API ${api}; this library provides ${PLUGIN_API_VERSION}`)
  if (!ACTIVATION.includes(activation)) throw new Error(`plugin "${name}": activation must be ${ACTIVATION.join(' or ')}`)
  if (typeof register !== 'function') throw new Error(`plugin "${name}": register(host) is missing`)
  const existing = plugins.get(name)
  if (existing) {
    if (definitions.get(name) === def) return existing
    throw new Error(`plugin "${name}" is already registered (version ${existing.version})`)
  }
  const contributes = Object.fromEntries(KINDS.map(k => [k, []]))
  const record = { name, version, api, activation, contributes }
  plugins.set(name, record)
  definitions.set(name, def)
  try {
    register(createHost(name, activation, contributes))
  } catch (e) {
    plugins.delete(name)
    definitions.delete(name)
    for (const kind of KINDS) for (const n of contributes[kind]) if (owners[kind].get(n) === name) owners[kind].delete(n)
    for (const n of contributes.patternTypes) if (patternTypeOwners.get(n)?.plugin === name) patternTypeOwners.delete(n)
    for (const n of contributes.sectionTypes) if (sectionTypeOwners.get(n)?.plugin === name) sectionTypeOwners.delete(n)
    for (const n of contributes.themes) themeLoaders.delete(n)
    for (const n of contributes.dataTypes) if (dataTypes[n]?.plugin === name) delete dataTypes[n]
    throw e
  }
  return record
}

/** Registers several plugins, in order. */
export function registerPlugins(list = []) {
  return list.map(registerPlugin)
}

/** Every registered plugin: { name, version, api, activation, contributes }. */
export function listPlugins() {
  return [...plugins.values()].map(r => ({ ...r }))
}

export function getPlugin(name) {
  const r = plugins.get(name)
  return r ? { ...r } : null
}

/** The plugin that registered `name` as a `kind` ('patternTypes', 'sectionTypes', …), or null (core / the app). */
export function pluginOf(kind, name) {
  return owners[kind]?.get(name) || null
}

/**
 * Whether a plugin is active, given the activation rows of the tenant (`{ [plugin]: { enabled } }`). A name no
 * plugin owns is core, always active.
 */
export function isPluginActive(name, activations = {}) {
  if (!name) return true
  const r = plugins.get(name)
  if (!r) return false
  const row = activations[name]
  if (row && typeof row.enabled === 'boolean') return row.enabled
  return r.activation === 'default-on'
}
