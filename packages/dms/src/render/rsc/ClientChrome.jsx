'use client'
// The RSC spike's client island (rsc-view-pages.md, phase 2): a view page's chrome (the theme's Layout:
// top and side nav, user menu, search) as the only client component on a page whose content is static
// HTML from the server. It is given serializable props (render/rsc/resolvePage.js) and rebuilds what
// today's route tree provides: the theme, the auth provider, CMSContext and PatternAuthContext.
//
// Its import graph is the point of the spike: no section registry, no Lexical, no dms-manager, no
// patterns. Import modules directly, never the library's barrel (src/index.js) or the page pattern's
// siteConfig, both of which pull everything in. A page with live sections loads those through
// IslandHost's lazy chunk, after hydration.
import React from 'react'
import { useLocation } from 'react-router'
import { cloneDeep } from 'lodash-es'
import { falcorGraph } from '@availabs/avl-falcor'

import UI from '../../ui'
import defaultTheme from '../../ui/defaultTheme'
import { ThemeContext, getPatternTheme, mergeTheme, getComponentTheme, resetBaseThemeCache } from '../../ui/useTheme'
import { MountContext } from '../../ui/mountContext'
import { registerWidget } from '../../ui/widgets'
import Layout from '../../ui/components/Layout'
import pagesDefaultTheme from '../../patterns/page/defaultTheme'
import { CMSContext } from '../../patterns/page/context'
import UserMenu from '../../patterns/page/components/userMenu'
import SearchButton from '../../patterns/page/components/search'
import { authProvider } from '../../patterns/auth/providers'
import { AuthContext } from '../../patterns/auth/context'
import { PatternAuthContext } from '../../utils/patternAuthContext'
import { isUserAuthed } from '../../utils/auth'
import { nav2Level } from '../../utils/nav'
import { tagFalcorRequests } from '../../utils/authedFetch'
import PatternColorScheme, { getPatternColorScheme } from '../spa/utils/PatternColorScheme'
import { getRscClientConfig } from './clientConfig'
import IslandHost from './IslandHost'

// What the page pattern's registration and siteConfig do at module load: the `pages` defaults on the
// library theme (patterns/registry.js) and the two widgets the user menu slots name.
if (!defaultTheme.pages) {
  defaultTheme.pages = pagesDefaultTheme
  resetBaseThemeCache()
}
registerWidget('UserMenu', { label: 'User Menu', component: UserMenu })
registerWidget('SearchButton', { label: 'Search Button', component: SearchButton })

// One load per theme name, shared by every render (and by hydration, which must see the same theme
// as the server: React waits on the promise in both).
const themeLoads = new Map()
function loadCodeTheme(name) {
  if (!themeLoads.has(name)) {
    const { loadThemes } = getRscClientConfig()
    themeLoads.set(name, name === 'default' || !loadThemes
      ? Promise.resolve({})
      : loadThemes([name]).then((themes) => themes?.[name] || {}))
  }
  return themeLoads.get(name)
}

const falcors = new Map()
function falcorFor(app) {
  if (!falcors.has(app)) {
    const falcor = falcorGraph(getRscClientConfig().API_HOST)
    tagFalcorRequests(falcor, null, app)
    falcors.set(app, falcor)
  }
  return falcors.get(app)
}

function Chrome({ island, top, content, bottom }) {
  const { pathname } = useLocation()
  const { user } = React.useContext(AuthContext) || {}
  const codeTheme = React.use(loadCodeTheme(island.selection))

  const theme = React.useMemo(() => {
    const themes = { [island.selection]: codeTheme, ...(island.selection === 'default' ? {} : { default: {} }) }
    let t = getPatternTheme(themes, { theme: cloneDeep(island.patternTheme || {}) })
    if (island.authMenu) t = { ...t, navOptions: { ...(t.navOptions || {}), authMenu: island.authMenu } }
    return mergeTheme(t, island.itemTheme || {})
  }, [codeTheme, island])

  const defaultColorScheme = getPatternColorScheme({ [island.selection]: codeTheme }, { theme: island.patternTheme })
  const { app, type, siteType, baseUrl, authPermissions, authBaseUrl, hasEditor } = island
  const cms = React.useMemo(() => ({
    app, type, siteType, baseUrl, authPermissions, authBaseUrl, hasEditor, user,
    API_HOST: getRscClientConfig().API_HOST,
    falcor: falcorFor(app),
    isUserAuthed: (reqPermissions) => isUserAuthed({ user, authPermissions, reqPermissions }),
  }), [app, type, siteType, baseUrl, authPermissions, authBaseUrl, hasEditor, user])
  const patternAuth = React.useMemo(() => ({ app, authPermissions }), [app, authPermissions])
  const mount = React.useMemo(() => ({ baseUrl, siteRootPaths: [] }), [baseUrl])
  const themeValue = React.useMemo(() => ({ theme, UI, getComponentTheme }), [theme])
  const resolveNav = React.useCallback(
    (navDepth, navTitle) => nav2Level(island.navItems, navDepth, pathname, baseUrl, navTitle),
    [island.navItems, pathname, baseUrl])

  return (
    <PatternAuthContext.Provider value={patternAuth}>
      <CMSContext.Provider value={cms}>
        <ThemeContext.Provider value={themeValue}>
          <MountContext.Provider value={mount}>
            <PatternColorScheme defaultColorScheme={defaultColorScheme} />
            {island.sectionIslands
              ? <IslandHost key={island.sectionIslands.page.renderKey} islands={island.sectionIslands} />
              : null}
            <Layout navItems={island.navItems} resolveNav={resolveNav} secondNav={island.secondNav}
              headerChildren={top} footerChildren={bottom}>
              {content}
            </Layout>
          </MountContext.Provider>
        </ThemeContext.Provider>
      </CMSContext.Provider>
    </PatternAuthContext.Provider>
  )
}

const authed = new Map()
export default function ClientChrome(props) {
  const { AUTH_HOST, isMultiTenant } = getRscClientConfig()
  const { app, siteType } = props.island
  const key = `${app}|${siteType}`
  if (!authed.has(key)) {
    authed.set(key, authProvider(Chrome, { AUTH_HOST, PROJECT_NAME: app, isMultiTenant, siteType }))
  }
  const Authed = authed.get(key)
  // the user the server rendered this page for (resolvePage.js), so the first render matches its HTML
  return <Authed {...props} session={props.island.session} />
}
