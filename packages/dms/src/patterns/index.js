import { registerPatternTypes, listPatternTypes } from './registry'
import pageConfig from './page/siteConfig'
import adminConfig from './admin/siteConfig'
import authConfig from './auth/siteConfig'
import datasetsConfig from './datasets/siteConfig'
import pagesTheme from './page/defaultTheme'
import adminTheme from './admin/defaultTheme'
import authTheme from './auth/defaultTheme'
import datasetsTheme from './datasets/defaultTheme'
import pageAuthVocabulary from './page/page.authVocabulary'
import pageChildRefs from './page/page.childRefs'
import adminAuthVocabulary from './admin/admin.authVocabulary'
import authAuthVocabulary from './auth/auth.authVocabulary'
import datasetsAuthVocabulary from './datasets/datasets.authVocabulary'
import datasetsChildRefs from './datasets/datasets.childRefs'

// The built-in pattern types. A host app registers its own the same way — see
// ./registry.js for the definition shape, and documentation/pattern-registry.md.
registerPatternTypes({
  page: {
    siteConfig: pageConfig,
    label: 'Page',
    // page patterns are created from the picker's page-template cards
    admin: { addable: true, order: 10, usesDmsEnv: true },
    defaultTheme: pagesTheme,
    authVocabulary: pageAuthVocabulary,
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
    authVocabulary: datasetsAuthVocabulary,
    childRefs: datasetsChildRefs,
  },
  auth: {
    siteConfig: authConfig,
    label: 'Auth',
    description: 'Authentication and access control',
    admin: { addable: true, order: 30, defaultName: 'Auth' },
    defaultTheme: authTheme,
    authVocabulary: authAuthVocabulary,
  },
  // routed from the synthetic AdminPattern pattern2routes builds; never created by hand
  admin: {
    siteConfig: adminConfig,
    label: 'Admin',
    admin: { addable: false, order: 40 },
    defaultTheme: adminTheme,
    authVocabulary: adminAuthVocabulary,
  },
})

export async function resolvePatterns() {
  return Object.fromEntries(listPatternTypes().map(({ name, siteConfig }) => [name, siteConfig]))
}
