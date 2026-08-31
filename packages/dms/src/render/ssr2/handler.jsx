import React from 'react'
import { renderToString } from 'react-dom/server'
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
} from 'react-router'
import { falcorGraph } from '@availabs/avl-falcor'

import dmsSiteFactory from '../spa/dmsSiteFactory.jsx'

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
  }
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
 */
export function createSSRHandler({
  adminConfigFn,
  themes,
  apiHost,
  siteConfig,
  pgEnvs = [],
  isMultiTenant = false,
}) {
  // Cache per-host — different subdomains produce different route sets
  // (pattern2routes filters by subdomain).
  const routeCache = new Map()

  async function buildRoutes(host) {
    const falcor = falcorGraph(apiHost)

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
      onResolvedSiteData: (app, type, data) => { siteData = data },
      ssrCollect,
    })

    // Add a catch-all 404 at the end (must match client's PageNotFoundRoute)
    routes.push({
      path: '/*',
      Component: () => React.createElement('div', null, '404 - Not Found'),
    })

    return { routes, siteData, themeFontsHtml: ssrCollect.join('') }
  }

  async function ensureRoutes(host) {
    let entry = routeCache.get(host)
    if (!entry) {
      const { routes, siteData, themeFontsHtml } = await buildRoutes(host)
      const handler = createStaticHandler(routes)
      entry = { routes, handler, siteData, themeFontsHtml }
      routeCache.set(host, entry)
    }
    return entry
  }

  /**
   * Render a Web Request to HTML.
   * @param {Request} request - Web standard Request object
   * @returns {Promise<{ html: string, status: number, headers: object, siteData: object|null, themeFontsHtml: string }>}
   */
  async function render(request) {
    const url = new URL(request.url)
    const host = url.host

    const { routes, handler, siteData, themeFontsHtml } = await ensureRoutes(host)

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

    const html = renderToString(
      React.createElement(StaticRouterProvider, {
        router,
        context,
      })
    )

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
    }
  }

  /**
   * Clear cached routes. Call after admin changes.
   */
  function invalidateRoutes() {
    routeCache.clear()
  }

  return { render, invalidateRoutes }
}
