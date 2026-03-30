import React from 'react'
import { renderToString } from 'react-dom/server'
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
} from 'react-router'
import { falcorGraph } from '@availabs/avl-falcor'
import { cloneDeep } from 'lodash-es'

import dmsSiteFactory from '../spa/dmsSiteFactory.jsx'
import { dmsDataLoader, updateRegisteredFormats, updateAttributes } from '../../'
import { getInstance } from '../../utils/type-utils.js'

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
 */
export function createSSRHandler({
  adminConfigFn,
  themes,
  apiHost,
  siteConfig,
  pgEnvs = [],
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

    // Pre-fetch site data for client hydration.
    // dmsDataLoader needs the same updated config that dmsSiteFactory builds internally.
    const dmsConfigUpdated = cloneDeep(dmsConfig)
    const siteType = dmsConfig?.format?.type || dmsConfig.type
    const siteInstance = getInstance(siteType) || siteType
    dmsConfigUpdated.registerFormats = updateRegisteredFormats(dmsConfigUpdated.registerFormats, dmsConfig.app, siteInstance)
    dmsConfigUpdated.attributes = updateAttributes(dmsConfigUpdated.attributes, dmsConfig.app, siteInstance)
    const siteData = await dmsDataLoader(falcor, dmsConfigUpdated, `/`)

    // Build routes. Falcor cache makes dmsSiteFactory's internal dmsDataLoader call instant.
    const routes = await dmsSiteFactory({
      dmsConfig,
      falcor,
      API_HOST: apiHost,
      DAMA_HOST: apiHost,
      themes,
      pgEnvs,
      host,
      adminPath: siteConfig.baseUrl || '/list',
    })

    // Add a catch-all 404 at the end (must match client's PageNotFoundRoute)
    routes.push({
      path: '/*',
      Component: () => React.createElement('div', null, '404 - Not Found'),
    })

    return { routes, siteData }
  }

  async function ensureRoutes(host) {
    let entry = routeCache.get(host)
    if (!entry) {
      const { routes, siteData } = await buildRoutes(host)
      const handler = createStaticHandler(routes)
      entry = { routes, handler, siteData }
      routeCache.set(host, entry)
    }
    return entry
  }

  /**
   * Render a Web Request to HTML.
   * @param {Request} request - Web standard Request object
   * @returns {Promise<{ html: string, status: number, headers: object, siteData: object|null }>}
   */
  async function render(request) {
    const url = new URL(request.url)
    const host = url.host

    const { routes, handler, siteData } = await ensureRoutes(host)

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
