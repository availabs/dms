// Static HTML with islands (static-html-islands.md), server side. Serves an opted-in page view as content
// HTML that is never hydrated, one client component for the chrome, and live sections as islands, from
// today's SSR handler.
//
//   1. decide before rendering where it can be known: a URL whose route did not opt in passes straight to
//      today's path with no render;
//   2. otherwise the capture render (render/ssr2/handler.jsx captureInScope): today's route tree with
//      IslandsCaptureContext set. Not eligible → remembered for a while, pass;
//   3. eligible → the chrome rendered to a string around the three slots' HTML (document request), or the
//      island data and the slots as JSON (a browser navigation: entry.browser.jsx).
//
// Runs inside the request's scope (the handler), so the chrome renders as the request's user.
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createStaticHandler, createStaticRouter, StaticRouterProvider, matchRoutes } from 'react-router'
import ClientChrome, { preloadChromeTheme } from './ClientChrome.jsx'
import StaticSlot from './StaticSlot.jsx'
import { SlotHtmlContext } from './slotHtmlContext.js'
import { getIslandsClientConfig } from './clientConfig.js'
import { buildIsland, headKey } from './islandData.js'
import { pluginsOfSections } from '../../plugins/registries.js'

// Pages this path can't serve, remembered for a while: deciding means a capture render, and a page that
// can't be served is then rendered again by today's path. Only "can't serve" is remembered: a stale entry
// sends a page down today's path, which is always correct. A signed-in visitor's render is their own, so
// their entries are keyed by user as well as URL.
const INELIGIBLE_TTL_MS = 5 * 60 * 1000
const INELIGIBLE_MAX = 5000

const SLOTS = ['top', 'content', 'bottom']

export function chromeElement(island, slots = null) {
  const slot = (name) => React.createElement(StaticSlot, { name, html: slots ? slots[name] || '' : null })
  return React.createElement(ClientChrome, { island, top: slot('top'), content: slot('content'), bottom: slot('bottom') })
}

/**
 * @param {object} o
 * @param {(host: string, scope: object) => Promise<{ routes: object[] }>} o.ensureRoutes - the host's route tree
 * @param {(request: Request, scope: object) => Promise<object>} o.capture - the capture render, in scope
 * @param {(url: URL) => void} o.setStubLocation
 */
export function createIslandsRenderer({ ensureRoutes, capture, setStubLocation }) {
  const ineligible = new Map()

  const keyOf = (url, scope) =>
    `${scope?.user ? `${scope.user.id ?? scope.user.email}|` : ''}${url.host}${url.pathname}${url.search}`

  function recall(key) {
    const hit = ineligible.get(key)
    if (!hit) return null
    if (Date.now() - hit.at > INELIGIBLE_TTL_MS) { ineligible.delete(key); return null }
    return hit.reason
  }

  function remember(key, reason) {
    if (ineligible.size >= INELIGIBLE_MAX) ineligible.delete(ineligible.keys().next().value)
    ineligible.set(key, { at: Date.now(), reason })
  }

  /**
   * @param {Request} request
   * @param {object} scope - the request scope ({ session, user, token })
   * @param {{ nav?: boolean }} [options] - nav: a browser navigation; return the slots as data, render no chrome
   * @returns {Promise<{ served: false, reason: string } | { served: true, status, island, slots, html?, themeFontsHtml, islands, mountNow, plugins }>}
   */
  async function render(request, scope, { nav = false } = {}) {
    const url = new URL(request.url)
    const pass = (reason) => ({ served: false, reason })

    // 1. a route that did not opt in is never rendered here (dmsPageFactory sets `handle.islandsView`)
    const { routes } = await ensureRoutes(url.host, scope)
    const matches = matchRoutes(routes, url.pathname) || []
    if (!matches.some((m) => m.route.handle?.islandsView)) return pass('route not opted in')

    const key = keyOf(url, scope)
    const remembered = recall(key)
    if (remembered) return pass(remembered)

    // 2. the capture render
    const r = await capture(request, scope)
    if (r.redirect) return pass(`redirect ${r.redirect}`)
    if (!r.capture?.eligible) {
      const reason = r.capture?.reason || 'not an opted-in page view'
      remember(key, reason)
      return pass(reason)
    }

    const island = buildIsland(r.capture, scope?.session)
    if (island.sectionIslands) {
      // the plugins the live sections need, so the browser loads those and no others (IslandHost.jsx)
      const { page: islandPage, sections } = island.sectionIslands
      const plugins = pluginsOfSections(sections.map((s) => islandPage.item?.sections?.[s.index]))
      if (plugins.length) island.sectionIslands.plugins = plugins
    }
    const { loadThemes } = getIslandsClientConfig()
    if (island.selection !== 'default' && loadThemes) {
      // the browser rebuilds the theme from code themes only; a theme saved in the database stays on today's path
      const themes = await loadThemes([island.selection])
      if (!themes?.[island.selection]) {
        const reason = `theme ${island.selection} is not a code theme`
        remember(key, reason)
        return pass(reason)
      }
    }
    const slots = Object.fromEntries(SLOTS.map((name) => [name, r.slots[name] || '']))
    const themeFontsHtml = r.themeFontsHtml || ''
    island.headKey = headKey(themeFontsHtml)
    const page = {
      served: true,
      status: r.status,
      island,
      slots,
      themeFontsHtml,
      islands: island.sectionIslands?.sections?.length || 0,
      // sections that mount as soon as the page has hydrated (the rest keep their HTML until used)
      mountNow: island.sectionIslands?.sections?.filter((s) => !s.wake).length || 0,
      plugins: island.sectionIslands?.plugins?.map((p) => p.name) || [],
    }
    if (nav) return page

    // 3. the chrome, around the slots' HTML (StaticSlot reads it from SlotHtmlContext)
    await preloadChromeTheme(island.selection)
    const handler = createStaticHandler([{ id: 'dms-islands', path: '*', element: chromeElement(island) }])
    const context = await handler.query(new Request(url, { headers: request.headers }))
    if (context instanceof Response) return pass('chrome redirect')
    const router = createStaticRouter(handler.dataRoutes, context)
    setStubLocation(url)
    page.html = renderToString(
      React.createElement(SlotHtmlContext.Provider, { value: slots },
        React.createElement(StaticRouterProvider, { router, context, hydrate: false })))
    return page
  }

  return { render, clear: () => ineligible.clear() }
}
