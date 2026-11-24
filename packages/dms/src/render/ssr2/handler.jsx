import React from 'react'
import { renderToString } from 'react-dom/server'
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
} from 'react-router'
import { falcorGraph } from '@availabs/avl-falcor'

import dmsSiteFactory from '../spa/dmsSiteFactory.jsx'
import { preloadAllLazyComponents, collectRenderedLazyComponents } from '../../utils/lazyComponent.js'
import { setRootDomain } from '../../utils/hostResolver'
import { IslandsCaptureContext } from '../islands/captureContext.js'
import { configureIslandsClient } from '../islands/clientConfig.js'
import { createIslandsRenderer } from '../islands/servePage.js'
import { AsyncLocalStorage } from 'node:async_hooks'
import { setRequestScopeProvider, sendTokenWith } from '../../utils/requestScope.js'
import { authProvider } from '../../patterns/auth/providers.jsx'

// Who each page render is for (rsc-view-pages.md phase 1): { session, user, token, models }, read through
// utils/requestScope.js. Outside a render (route building, the islands capture) there is no scope: anonymous.
const requestScope = new AsyncLocalStorage()
setRequestScopeProvider(() => requestScope.getStore() || null)

// Stub `window` and `document` for SSR — many components access window.location,
// window.localStorage, document.createElement, etc. during render.
// Uses linkedom for a real DOM implementation (needed by Lexical's $generateHtmlFromNodes).
if (typeof globalThis.window === 'undefined') {
  const { parseHTML } = await import('linkedom')
  const dom = parseHTML('<!doctype html><html><head></head><body></body></html>')

  globalThis.document = dom.document
  globalThis.window = {
    document: dom.document,
    location: {
      host: 'localhost', hostname: 'localhost', port: '',
      pathname: '/', search: '', hash: '',
      href: 'http://localhost/', origin: 'http://localhost',
      protocol: 'http:',
    },
    localStorage: {
      getItem: () => null, setItem: () => {}, removeItem: () => {},
    },
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener: () => {},
    removeEventListener: () => {},
    navigator: { userAgent: '' },
    matchMedia: () => ({ matches: false, addListener: () => {}, removeListener: () => {} }),
    // Node's own URL (has createObjectURL). maplibre-gl runs
    // `window.URL.createObjectURL(new Blob(...))` at import time whenever
    // `window` exists — and it's now imported lazily, AFTER this stub is
    // installed (code-split Map section; see utils/lazyComponent.js).
    URL: globalThis.URL,
    __dmsStub: true,
  }
}

// The stub's location says which request is rendering, for components that read window.location while they
// render (e.g. the admin's site list shows the host). Set right before each renderToString, which is
// synchronous, so no other request's render can run in between.
function setStubLocation(url) {
  if (!globalThis.window?.__dmsStub) return
  const { host, hostname, port, pathname, search, hash, href, origin, protocol } = url
  Object.assign(globalThis.window.location, { host, hostname, port, pathname, search, hash, href, origin, protocol })
}

const USER_ROUTES_TTL_MS = 5 * 60 * 1000
const USER_ROUTES_MAX = 200

// Site data with rows this visitor may not read (dms-server scrubs every field of such a row to 'no-access')
function hasNoAccessStubs(data) {
  if (Array.isArray(data)) return data.some(hasNoAccessStubs)
  if (!data || typeof data !== 'object') return false
  // `no_access` is the marker that survives ref expansion, which overwrites the stub's `id` with the row's
  // (api/proecessNewData.js; render/spa/utils/snapshot.js reads it the same way)
  if (data.no_access === true || data.id === 'no-access') return true
  return Object.values(data).some(hasNoAccessStubs)
}

/**
 * Platform-agnostic SSR handler.
 * Accepts a Web Request, returns { html, status, headers, siteData }.
 *
 * @param {object} config
 * @param {Function} config.adminConfigFn - adminConfig[0] factory function
 * @param {object} config.themes - Theme definitions
 * @param {string} config.apiHost - Falcor API base URL (e.g., 'http://localhost:4444')
 * @param {object} config.siteConfig - { app, type, baseUrl, authPath, pgEnvs, ... }
 * @param {string[]} [config.pgEnvs] - PostgreSQL environments
 * @param {boolean} [config.isMultiTenant] - resolve the request host to a tenant's own site (see dmsSiteFactory)
 * @param {string} [config.rootDomain] - the tenant hub's root domain (DMS_ROOT_DOMAIN; utils/hostResolver.js)
 * @param {Function} [config.resolvePluginUrl] - (name, version) => the file URL of an installed plugin's SSR entry,
 *   or null (dms-server, from its plugins folder; plugins/load.js). Without it no installed plugin is loaded here.
 */
export function createSSRHandler({
  adminConfigFn,
  themes,
  apiHost,
  siteConfig,
  pgEnvs = [],
  isMultiTenant = false,
  rootDomain = '',
  resolvePluginUrl = () => null,
}) {
  setRootDomain(isMultiTenant ? rootDomain : '')
  // Cache per-host — different subdomains produce different route sets
  // (pattern2routes filters by subdomain).
  const routeCache = new Map()
  // host|user id → routes built from that user's site data (ensureRoutes)
  const userRouteCache = new Map()
  // bumped by invalidateRoutes, so a build that started before it does not store stale routes
  let generation = 0

  // token: build as a signed-in user (their site data: patterns an anonymous visitor gets as no-access stubs)
  async function buildRoutes(host, token = null) {
    const falcor = sendTokenWith(falcorGraph(apiHost), token)

    const dmsConfig = adminConfigFn({
      app: siteConfig.app,
      type: siteConfig.type,
      baseUrl: siteConfig.baseUrl || '/list',
      authPath: siteConfig.authPath || '/auth',
    })

    // Build routes. dmsSiteFactory does the tenant/subdomain resolution
    // itself when isMultiTenant is set (same logic the client uses), and
    // onResolvedSiteData reports back the {app, type, data} it actually
    // resolved — the master site, or the subdomain-matched tenant's own
    // site — so this doesn't need its own separate, always-master fetch.
    //
    // ssrCollect: threaded down into every pattern's getPatternTheme() call
    // (via pattern2routes -> each siteConfig.jsx) so their theme's font/CSS
    // <style> content is collected as HTML strings here instead of being
    // silently dropped (loadThemeFonts no-ops without `document`). See
    // ui/useTheme.js and planning/tasks/current/ssr-runtime-theme-css-fouc.md.
    let siteData = null
    let resolvedApp = null
    const ssrCollect = []
    const routes = await dmsSiteFactory({
      dmsConfig,
      falcor,
      API_HOST: apiHost,
      DAMA_HOST: apiHost,
      themes,
      pgEnvs,
      host,
      adminPath: siteConfig.baseUrl || '/list',
      isMultiTenant,
      rootDomain,
      resolvePluginUrl,
      onResolvedSiteData: (app, type, data) => { siteData = data; resolvedApp = app },
      ssrCollect,
    })

    // Add a catch-all 404 at the end (must match client's PageNotFoundRoute)
    routes.push({
      path: '/*',
      Component: () => React.createElement('div', null, '404 - Not Found'),
    })

    // The browser renders the router inside authProvider (dmsSiteFactory's AuthedRouteProvider); so does
    // the server, so components that read the user (menus, auth checks) render the same on both sides.
    // Its first state is the request's user (patterns/auth/providers.jsx reads the scope).
    const Router = authProvider(StaticRouterProvider, {
      AUTH_HOST: apiHost,
      PROJECT_NAME: resolvedApp || dmsConfig.app,
      isMultiTenant,
      siteType: dmsConfig.type,
    })

    return { routes, siteData, themeFontsHtml: ssrCollect.join(''), Router }
  }

  // The host's routes, built anonymously and shared by every request. A signed-in request uses them too
  // (its loaders read through models of its own: dmsPageFactory's requestScopedModel) unless the host's
  // site data has no-access stubs, i.e. patterns only some users may see: then that user gets routes built
  // from their own site data, kept a few minutes (userRouteCache).
  async function ensureRoutes(host, scope = null) {
    let entry = routeCache.get(host)
    if (!entry) {
      const gen = generation
      // never inside a request's scope: these routes are everyone's
      const { routes, siteData, themeFontsHtml, Router } = await requestScope.exit(() => buildRoutes(host))
      // v8_middleware: as the browser router (dmsSiteFactory.jsx)
      const handler = createStaticHandler(routes, { future: { v8_middleware: true } })
      entry = { routes, handler, siteData, themeFontsHtml, Router, restricted: hasNoAccessStubs(siteData) }
      if (gen === generation) routeCache.set(host, entry)
    }
    if (!scope?.token || !entry.restricted) return entry
    const key = `${host}|${scope.user?.id}`
    const hit = userRouteCache.get(key)
    if (hit && Date.now() - hit.at < USER_ROUTES_TTL_MS) return hit.entry
    const gen = generation
    const { routes, siteData, themeFontsHtml, Router } = await buildRoutes(host, scope.token)
    const userEntry = { routes, handler: createStaticHandler(routes, { future: { v8_middleware: true } }), siteData, themeFontsHtml, Router }
    if (gen === generation) {
      if (userRouteCache.size >= USER_ROUTES_MAX) userRouteCache.delete(userRouteCache.keys().next().value)
      userRouteCache.set(key, { at: Date.now(), entry: userEntry })
    }
    return userEntry
  }

  /**
   * Render a Web Request to HTML.
   * @param {Request} request - Web standard Request object
   * @returns {Promise<{ html: string, status: number, headers: object, siteData: object|null, themeFontsHtml: string, lazy: string[] }>}
   */
  async function render(request, { session = null } = {}) {
    // session (render/ssr2/express/middleware.mjs, from the session cookie): { state, user, token }
    const scope = { session, user: session?.user || null, token: session?.user ? session.token : null, models: new Map() }
    return requestScope.run(scope, () => renderInScope(request, scope))
  }

  async function renderInScope(request, scope) {
    const url = new URL(request.url)
    const host = url.host

    const { handler, siteData, themeFontsHtml, Router } = await ensureRoutes(host, scope)

    const context = await handler.query(request)

    // If the handler returned a Response (redirect), pass it through
    if (context instanceof Response) {
      return {
        html: '',
        status: context.status,
        headers: Object.fromEntries(context.headers.entries()),
        redirect: context.headers.get('Location'),
        siteData: null,
      }
    }

    const router = createStaticRouter(handler.dataRoutes, context)

    // Code-split components (utils/lazyComponent.js) must be loaded before
    // renderToString, which never waits for a Suspense boundary — it would
    // emit the fallback instead of the content. Memoized per component, so
    // this is a no-op after the first request. The ids that actually render
    // go to the client (`lazy`), which loads the same chunks before
    // hydrateRoot so its first render matches this HTML.
    await preloadAllLazyComponents()
    setStubLocation(url)
    const [html, lazy] = collectRenderedLazyComponents(() => renderToString(
      React.createElement(Router, {
        router,
        context,
      })
    ))

    // Collect headers from the deepest matching route
    const headers = { 'Content-Type': 'text/html; charset=utf-8' }
    if (context.matches?.length) {
      const leaf = context.matches[context.matches.length - 1]
      const loaderHeaders = context.loaderHeaders?.[leaf.route.id]
      if (loaderHeaders) {
        for (const [key, value] of loaderHeaders.entries()) {
          headers[key] = value
        }
      }
    }

    return {
      html,
      status: context.statusCode || 200,
      headers,
      siteData,
      themeFontsHtml,
      lazy,
    }
  }

  /**
   * The islands path's server pass (render/islands): today's render, with IslandsCaptureContext set. An opted-in
   * route component that can be served with no JavaScript fills `capture` and renders its content slots
   * in <dms-slot name="…"> elements, which are cut out here. Not eligible → `capture.eligible` unset.
   * Runs as `session`'s user, as render() does: the user's route tree, data and auth state.
   * @returns {Promise<{ status, headers, redirect?, siteData, themeFontsHtml, capture, slots }>}
   */
  async function captureRender(request, { session = null } = {}) {
    const scope = { session, user: session?.user || null, token: session?.user ? session.token : null, models: new Map() }
    return requestScope.run(scope, () => captureInScope(request, scope))
  }

  async function captureInScope(request, scope) {
    const url = new URL(request.url)
    const { siteData, handler, themeFontsHtml, Router } = await ensureRoutes(url.host, scope)
    const context = await handler.query(request)
    if (context instanceof Response) {
      return { status: context.status, redirect: context.headers.get('Location'), capture: {}, slots: {} }
    }
    const router = createStaticRouter(handler.dataRoutes, context)
    await preloadAllLazyComponents()
    setStubLocation(url)
    const capture = {}
    const html = renderToString(
      React.createElement(IslandsCaptureContext.Provider, { value: capture },
        React.createElement(Router, { router, context, hydrate: false }))
    )
    const slots = {}
    if (capture.eligible) {
      for (const m of html.matchAll(/<dms-slot name="(\w+)">([\s\S]*?)<\/dms-slot>/g)) slots[m[1]] = m[2]
    }
    return { status: context.statusCode || 200, siteData, themeFontsHtml, capture, slots }
  }

  // Static HTML with islands (render/islands, static-html-islands.md): the same capture, served from this
  // handler. The chrome it renders reads the app's themes and hosts from the client config.
  configureIslandsClient({
    // `themes` is the app's lazy loader (src/themes/index.js), or a plain map of themes
    loadThemes: typeof themes === 'function' ? themes : async (names) => Object.fromEntries(names.map((n) => [n, themes?.[n]])),
    API_HOST: apiHost, AUTH_HOST: apiHost, isMultiTenant,
  })
  const islands = createIslandsRenderer({ ensureRoutes, capture: captureInScope, setStubLocation })

  /**
   * A page as static HTML with islands, or `{ served: false, reason }` when today's render should serve it.
   * @param {Request} request
   * @param {{ session?: object, nav?: boolean }} [options] - nav: a browser navigation (data, no chrome HTML)
   */
  async function renderIslands(request, { session = null, nav = false } = {}) {
    const scope = { session, user: session?.user || null, token: session?.user ? session.token : null, models: new Map() }
    return requestScope.run(scope, () => islands.render(request, scope, { nav }))
  }

  /**
   * Clear cached routes. Called by dms-server when the hub's tenants or domain aliases change
   * (routes/domains/store.js onChange); also the hook for other admin changes.
   */
  function invalidateRoutes() {
    generation++
    routeCache.clear()
    userRouteCache.clear()
    islands.clear()
  }

  return { render, captureRender, renderIslands, invalidateRoutes }
}
