// Static HTML with islands (static-html-islands.md, phase 1), browser entry. The only code a page served by
// this path loads is this, React Router, the client chrome (./ClientChrome.jsx) and the theme; a page
// with live sections then loads the island code and the plugins those sections need (./IslandHost.jsx). The `@dms-host/*` modules are the
// host app's, named by aliases in its build config (./README.md).
//
// Every nav widget the server registers must be registered by `@dms-host/widgets` too, or the Layout draws
// its empty placeholder where the server drew the widget, and hydration fails.
import React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, useLoaderData, useLocation, redirectDocument } from 'react-router'
import loadThemes from '@dms-host/themes'
import '@dms-host/widgets'
import { API_HOST } from '@dms-host/api-host'
import pluginLoaders from '@dms-host/plugins'
import { configureIslandsClient } from './clientConfig.js'
import ClientChrome, { preloadChromeTheme } from './ClientChrome.jsx'
import StaticSlot from './StaticSlot.jsx'
import { readIslandData, isShownPage, NAV_HEADER } from './islandData.js'

const ROUTE_ID = 'dms-islands'

// The page: the chrome around the three slots. On the first render the slots' HTML is the page's own
// (StaticSlot reads it from the DOM once); after a navigation it comes with the page data.
function Page() {
  const page = useLoaderData()
  const { pathname, hash } = useLocation()
  React.useEffect(() => { if (!hash) window.scrollTo(0, 0) }, [pathname])
  const slot = (name) => <StaticSlot key={page.slots ? `${name}:${page.key}` : name} name={name} html={page.slots ? page.slots[name] : null} />
  return <ClientChrome island={page.island} top={slot('top')} content={slot('content')} bottom={slot('bottom')} />
}

// A navigation inside the chrome (a nav link, a URL-bound filter): the destination as JSON from the same
// server render. A page this path does not serve, or one that needs a different head, is a document load.
//
// One navigation is answered without the server. A page opened with no search string moves to itself with
// its page variables written out (`?state=&year=2024`, patterns/page/pages/usePageViewState.js). The
// server names that URL with the page (`island.variablesUrl`), and it is the render the browser already
// has: fetching it ran every query of the page a second time and remounted every live section.
function makeLoader(first) {
  let shown = { bare: !window.location.search, data: { island: first.island, slots: null, key: null } }
  return async function loader({ request }) {
    const url = new URL(request.url)
    if (isShownPage(shown.data.island, shown.bare, url)) return shown.data
    const response = await fetch(url.pathname + url.search, { headers: { [NAV_HEADER]: '1' }, signal: request.signal })
    const next = response.ok && (response.headers.get('content-type') || '').includes('json') ? await response.json() : null
    if (!next?.island || next.island.headKey !== first.island.headKey) throw redirectDocument(url.pathname + url.search + url.hash)
    await preloadChromeTheme(next.island.selection)
    if (next.title) document.title = next.title
    shown = { bare: !url.search, data: { island: next.island, slots: next.slots, key: url.pathname + url.search } }
    return shown.data
  }
}

async function start() {
  const first = readIslandData()
  if (!first) return
  // this page came from dms-server, which keeps the session cookie (patterns/auth/api.js syncSessionCookie)
  window.__dmsIslandsPage = true
  configureIslandsClient({
    loadThemes, API_HOST, AUTH_HOST: API_HOST, isMultiTenant: import.meta.env.VITE_DMS_MULTI_TENANT === '1',
    // the host's plugins, each loaded only by a page whose live sections need it (IslandHost)
    pluginLoaders,
  })
  // the server rendered with the theme loaded; so must the first render here
  await preloadChromeTheme(first.island.selection)
  const router = createBrowserRouter(
    [{ id: ROUTE_ID, path: '*', Component: Page, loader: makeLoader(first) }],
    { hydrationData: { loaderData: { [ROUTE_ID]: { island: first.island, slots: null, key: null } } } },
  )
  // A link inside the static HTML is a plain anchor, which the browser would follow with a document load.
  // Give it to the router instead, like the chrome's own links. React's links have already handled their
  // click by the time it reaches the document (defaultPrevented), and a file link is left to the browser.
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (!anchor || !anchor.closest('[data-dms-slot]')) return
    if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return
    const url = new URL(anchor.href, window.location.href)
    if (url.origin !== window.location.origin || /\.[a-z0-9]{2,5}$/i.test(url.pathname)) return
    // the same page with a hash: the browser scrolls
    if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return
    event.preventDefault()
    router.navigate(url.pathname + url.search + url.hash)
  })
  React.startTransition(() => {
    hydrateRoot(document.getElementById('root'), <React.StrictMode><RouterProvider router={router} /></React.StrictMode>)
  })
}

start()
