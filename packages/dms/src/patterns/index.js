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
    // A logged-out visitor reads this row to build the login route: its site-level grants live on the
    // site row (rule 3), so the row itself is blank and the pattern rule's `read` lets it through.
  },
  // routed from the synthetic AdminPattern pattern2routes builds; never created by hand
  admin: {
    siteConfig: adminConfig,
    label: 'Admin',
    admin: { addable: false, order: 40 },
    defaultTheme: adminTheme,
    formats: [siteFormat],
    // its formats' rules are the site-level kinds' (site, theme, tenant, pattern, dmsenv): stamped
    // on the site row, not on the admin pattern row
    rulesOn: 'site',
    // Access to the admin PANEL is decided from the site row's grants; the admin row itself is blank
    // and readable like any other grantless pattern row.
  },
})

export async function resolvePatterns() {
  return Object.fromEntries(listPatternTypes().map(({ name, siteConfig }) => [name, siteConfig]))
}
