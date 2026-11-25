// An app's Settings: the sub pages of /list/settings, and of the hub's page for one tenant
// (src/dms/planning/tasks/current/app-settings-pages.md). One list, rendered in both places
// (pages/settingsPages.jsx); the sidenav's Settings group lists the same pages (siteConfig.jsx).
//
// A sub page:
//   { name, path, icon, order, component, can, forTenant, ownHeader }
//   path       its URL segment under settings/ (lowercase, digits, underscores); unique
//   order      position in the list (default 100); ties keep registration order
//   component  rendered with { target, item, onSummary }. `target` is the app it configures:
//              { app, tenant, apiBase, own }: `apiBase` is the dms-server path its routes hang off
//              (`/_dms/apps/<app>` on the app's own Settings, `/tenants/<subdomain>` on the hub's
//              tenant page); `own` is true on the app's own Settings. `item` is the app's site row
//              (own Settings only). It never reads "the current site" from context, so the same
//              component serves both places.
//   can        REQUIRED (ctx) => bool: whether this user may use the page. ctx = { user, app,
//              authPermissions, isMultiTenant, tenantSubdomain, pluginHub, own, staff }, all of
//              the site the admin is open on (on the hub's tenant page: the hub, `own` false).
//              `staff`: the hub's root and manage-tenants. The server judges the page's routes again.
//   forTenant  true: also on the hub's page for a tenant. Default false: only on an app's own Settings.
//   ownHeader  true: the page draws its own header (Storage, Server plugins); the Settings header is left out.
//
// Three doors, one list: the app (`registerSettingsPages`, exported from the library), a plugin
// (`host.registerSettingsPages`, plugins/index.js; shown only where the plugin is active), and a
// pattern type (`admin.settingsPages` on its definition, patterns/registry.js; shown when the site
// has a pattern of that type). A path registered twice is refused with a warning (the first wins);
// the built-in paths are reserved.

import { lazyComponent } from '../../utils/lazyComponent'
import { siteCan, MANAGE_DOMAINS, MANAGE_THEMES, MANAGE_STORAGE, INSTALL_PLUGINS, ACTIVATE_PLUGINS, MANAGE_TENANTS } from '../../utils/adminPermissions'
import { listPatternTypes } from '../registry'
import { activeIn, isPatternTypeActive } from '../../plugins/registries'

const PATH = /^[a-z][a-z0-9_]*$/

// [{ def, owner: null | { plugin, activation } }] in registration order
const entries = []
const BUILT_IN = new Set()

function validate(def, from) {
  if (!def || typeof def !== 'object') throw new Error(`${from}: a settings page object is expected`)
  if (!PATH.test(def.path || '')) throw new Error(`${from}: settings page path "${def.path}": lowercase letters, digits and underscores, starting with a letter`)
  if (!def.name) throw new Error(`${from}: settings page "${def.path}" has no name`)
  if (!def.component) throw new Error(`${from}: settings page "${def.path}" has no component`)
  if (typeof def.can !== 'function') throw new Error(`${from}: settings page "${def.path}" needs can(ctx), the permission it is shown for`)
}

function add(def, owner, from) {
  validate(def, from)
  if (entries.some(e => e.def.path === def.path) || (owner !== 'core' && BUILT_IN.has(def.path))) {
    console.warn(`${from}: settings page "${def.path}" is already registered; this one is ignored`)
    return false
  }
  entries.push({ def, owner: owner === 'core' ? null : owner })
  return true
}

/**
 * Adds Settings sub pages (the shape above). From the app, call it at module scope in a module both
 * its client and SSR entries import, as registerPatternTypes. Returns the paths added.
 * `owner` is for the plugin host: { plugin, activation }.
 */
export function registerSettingsPages(list = [], owner = null) {
  return list.filter(def => add(def, owner, owner ? `plugin "${owner.plugin}"` : 'registerSettingsPages')).map(def => def.path)
}

/** Drops what a plugin registered: the plugin host's rollback when its register(host) throws. */
export function removeSettingsPagesOf(plugin) {
  for (let i = entries.length - 1; i >= 0; i--) if (entries[i].owner?.plugin === plugin) entries.splice(i, 1)
}

/**
 * The sub pages for one place, in order:
 *   all      every page that place offers (an app's own Settings, or the hub's tenant page)
 *   allowed  those this user may use
 * `sitePatterns` (the site's pattern rows) decides which pattern types' pages are offered,
 * `activations` (plugins/registries.js activationsOf) which plugins' pages are.
 */
export function settingsPagesFor({ user, app, authPermissions, isMultiTenant = false, tenantSubdomain = '', pluginHub = false, own = true, sitePatterns = [], activations = {} } = {}) {
  const staff = Boolean(isMultiTenant) && !tenantSubdomain && siteCan(user, app, authPermissions, MANAGE_TENANTS)
  const ctx = { user, app, authPermissions, isMultiTenant, tenantSubdomain, pluginHub, own, staff }

  const seen = new Set()
  const list = []
  const offer = (def, i) => {
    if (seen.has(def.path)) return
    seen.add(def.path)
    list.push({ def, i })
  }
  entries.forEach(({ def, owner }, i) => {
    if (owner && !activeIn(activations, owner.plugin, owner.activation)) return
    offer(def, i)
  })
  // a pattern type's pages, when the site has a pattern of that type
  const types = new Set((sitePatterns || []).map(p => p?.pattern_type).filter(Boolean))
  listPatternTypes().forEach((type, t) => {
    if (!types.has(type.name) || !isPatternTypeActive(type.name, activations)) return
    for (const def of type.admin?.settingsPages || []) {
      try { validate(def, `pattern type "${type.name}" admin.settingsPages`) } catch (e) { console.warn(e.message); continue }
      if (seen.has(def.path)) { console.warn(`pattern type "${type.name}": settings page "${def.path}" is already registered; this one is ignored`); continue }
      offer(def, entries.length + t)
    }
  })

  const all = list
    .filter(({ def }) => own || def.forTenant)
    .sort((a, b) => ((a.def.order ?? 100) - (b.def.order ?? 100)) || (a.i - b.i))
    .map(({ def }) => def)
  const allowed = all.filter(def => {
    try { return Boolean(def.can(ctx)) } catch (e) { console.warn(`settings page "${def.path}": can() threw: ${e.message}`); return false }
  })
  return { all, allowed, ctx }
}

// ---- built in ----

const OverviewPage = lazyComponent('admin/settings/Overview', () => import('./pages/settings/overview'))
const PluginsPage = lazyComponent('admin/settings/Plugins', () => import('./pages/settings/plugins'))
const StoragePage = lazyComponent('admin/settings/Storage', () => import('./pages/siteStorage'))
const ServerPluginsPage = lazyComponent('admin/settings/ServerPlugins', () => import('./pages/plugins'))

/** The server's hub and a user with install-plugins on it; never a tenant host (pages/plugins.jsx). */
export const mayInstallPlugins = (user, { app, authPermissions, isMultiTenant = false, tenantSubdomain = '' } = {}) =>
  !(isMultiTenant && tenantSubdomain) && siteCan(user, app, authPermissions, INSTALL_PLUGINS)

const core = [
  {
    // Domains (a tenant of a hub with a root domain), data environments, the app and its icon: one card each
    name: 'Overview', path: 'overview', icon: 'InfoCircle', order: 0, forTenant: true, component: OverviewPage,
    can: ({ user, app, authPermissions, own, staff }) => !own || staff
      || [MANAGE_DOMAINS, MANAGE_THEMES].some(v => siteCan(user, app, authPermissions, v)),
  },
  {
    // turning plugins on and off for this app (components/pluginsCard.jsx)
    name: 'Plugins', path: 'plugins', icon: 'Puzzle', order: 10, forTenant: true, component: PluginsPage,
    can: ({ user, app, authPermissions, own, staff }) => !own || staff || siteCan(user, app, authPermissions, ACTIVATE_PLUGINS),
  },
  {
    // what the app's rows take up, and cleaning up the ones nothing can reach (was /list/storage)
    name: 'Storage', path: 'storage', icon: 'HardDrive', order: 20, ownHeader: true, component: StoragePage,
    can: ({ user, app, authPermissions }) => siteCan(user, app, authPermissions, MANAGE_STORAGE),
  },
  {
    // installing plugin releases on this server: its hub only (was /list/plugins)
    name: 'Server plugins', path: 'server_plugins', icon: 'Puzzle', order: 30, ownHeader: true, component: ServerPluginsPage,
    can: (ctx) => ctx.pluginHub === true && mayInstallPlugins(ctx.user, ctx),
  },
]
for (const def of core) { BUILT_IN.add(def.path); add(def, 'core', 'core settings') }
