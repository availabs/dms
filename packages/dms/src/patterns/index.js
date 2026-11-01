import { registerPatternTypes, listPatternTypes } from './registry'
import pageConfig from './page/siteConfig'
import adminConfig from './admin/siteConfig'
import authConfig from './auth/siteConfig'
import datasetsConfig from './datasets/siteConfig'
import pagesTheme from './page/defaultTheme'
import adminTheme from './admin/defaultTheme'
import authTheme from './auth/defaultTheme'
import datasetsTheme from './datasets/defaultTheme'
import cmsFormat from './page/page.format'
import pageChildRefs from './page/page.childRefs'
import siteFormat from './admin/admin.format'
import authFormat from './auth/auth.format'
import datasetsFormat from './datasets/datasets.format'

// The built-in pattern types. A host app registers its own the same way — see
// ./registry.js for the definition shape, and documentation/pattern-registry.md.
registerPatternTypes({
  page: {
    siteConfig: pageConfig,
    label: 'Page',
    // page patterns are created from the picker's page-template cards
    admin: { addable: true, order: 10, usesDmsEnv: true },
    defaultTheme: pagesTheme,
    formats: [cmsFormat],
    childRefs: pageChildRefs,
    themeKey: 'pages',
  },
  datasets: {
    siteConfig: datasetsConfig,
    label: 'Datasets',
    description: 'Connect and manage data sources',
    admin: { addable: true, order: 20, defaultName: 'Data', usesDmsEnv: true },
    providesDatasources: true,
    defaultTheme: datasetsTheme,
    // `form-manager` is the row kind that IS the datasets pattern: its domain is `self`.
    instanceFormat: datasetsFormat,
  },
  auth: {
    siteConfig: authConfig,
    label: 'Auth',
    description: 'Authentication and access control',
    admin: { addable: true, order: 30, defaultName: 'Auth' },
    defaultTheme: authTheme,
    formats: [authFormat],
    // a logged-out visitor needs this row to build the route that renders the login page
    publicRead: true,
    // While the admin row grants nothing, site access falls back to this pattern
    // (utils/adminPermissions.js `adminRowHasGrants`), so its Access editor offers the site-level
    // verbs too — borrowed from the type named here rather than hardcoded in the registry.
    siteFallback: 'admin',
  },
  // routed from the synthetic AdminPattern pattern2routes builds; never created by hand
  admin: {
    siteConfig: adminConfig,
    label: 'Admin',
    admin: { addable: false, order: 40 },
    defaultTheme: adminTheme,
    formats: [siteFormat],
    // routing/branding config the no-access stub returns anyway; blocking it only stops the
    // client caching its site snapshot. Access to the admin PANEL is decided from site grants.
    publicRead: true,
  },
})

export async function resolvePatterns() {
  return Object.fromEntries(listPatternTypes().map(({ name, siteConfig }) => [name, siteConfig]))
}
