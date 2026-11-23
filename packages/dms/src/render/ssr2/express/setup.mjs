/* global process */
/**
 * mountSSR(app, config) — mounts SSR middleware on an Express app.
 *
 * Handles both dev mode (Vite dev server with HMR) and prod mode
 * (pre-built client/server bundles).
 *
 * .mjs extension for clean dynamic import() from CJS dms-server.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { createSSRMiddleware } from './middleware.mjs'

/**
 * @param {import('express').Express} app - Express app
 * @param {object} config
 * @param {string} config.root - Project root (where index.html lives)
 * @param {string} config.serverEntry - Server entry path (e.g., '/src/entry-ssr.jsx')
 * @param {string} [config.clientDir] - Built client assets directory (prod); default <root>/dist/client
 * @param {string} [config.serverBundle] - Built server entry (prod); default <root>/dist/server/entry-ssr.js.
 *   dms-server derives both from DMS_DIST_DIR so a build can live outside dist/.
 * @param {object} config.handlerConfig - Config passed to createHandler (apiHost, siteConfig, etc.)
 * @param {Function} [config.getHeadTags] - async (req) => HTML for the page head, per request (dms-server's
 *   app settings: the site's manifest, icons and service worker; site-app-settings-pwa.md)
 * @param {Function} [config.resolveSession] - async (req) => { state, user, token }: who is asking, from the page
 *   host's session cookie (dms-server auth/session.js). Pages render as that user (rsc-view-pages.md phase 1).
 * @param {Function} [config.getSiteCss] - async (req) => { href, partial, fallbackHtml } | null: the site's
 *   server-compiled stylesheet (dms-server css/siteCss.js), which replaces the build's `<link data-dms-site-css>`;
 *   fallbackHtml (the in-browser compiler) comes with it while the sheet is partial (server-compiled-site-css.md)
 * @returns {Promise<{ invalidateRoutes: Function }>} drops the handler's per-host route cache (a no-op in dev)
 */
export async function mountSSR(app, config) {
  const {
    root,
    serverEntry = '/src/entry-ssr.jsx',
    clientDir = path.resolve(root, 'dist/client'),
    serverBundle = path.resolve(root, 'dist/server/entry-ssr.js'),
    handlerConfig = {},
    getHeadTags = null,
    resolveSession = null,
    getSiteCss = null,
  } = config

  const isProduction = process.env.NODE_ENV === 'production'

  /** @type {import('vite').ViteDevServer | undefined} */
  let vite
  let cachedTemplate = ''
  let cachedHandler = null

  if (!isProduction) {
    // --- Dev mode: Vite dev server with HMR ---
    const { createServer } = await import('vite')
    vite = await createServer({
      root,
      server: { middlewareMode: true },
      appType: 'custom',
    })

    // Mount Vite's middleware (handles HMR, asset serving, etc.)
    app.use(vite.middlewares)

    // SSR middleware — loads fresh module on each request
    const middleware = createSSRMiddleware({
      getHandler() {
        // Return a handler proxy that loads the module fresh via Vite
        return {
          async render(request, options) {
            const mod = await vite.ssrLoadModule(serverEntry)
            const createHandler = mod.default || mod.createHandler
            const handler = createHandler(handlerConfig)
            return handler.render(request, options)
          },
        }
      },
      getTemplate() {
        // Will be replaced per-request below
        return null
      },
      getHeadTags,
      resolveSession,
      getSiteCss,
    })

    // Custom dev middleware that transforms the template per-request
    app.use('*', async (req, res, next) => {
      try {
        // Read and transform template on every request (dev mode)
        let template = await fs.readFile(path.resolve(root, 'index.html'), 'utf-8')
        template = await vite.transformIndexHtml(req.originalUrl, template)

        const handler = {
          async render(request, options) {
            const mod = await vite.ssrLoadModule(serverEntry)
            const createHandler = mod.default || mod.createHandler
            const h = createHandler(handlerConfig)
            return h.render(request, options)
          },
        }

        const ssrMiddleware = createSSRMiddleware({
          getHandler: () => handler,
          getTemplate: () => template,
          getHeadTags,
          resolveSession,
          getSiteCss,
        })

        await ssrMiddleware(req, res, next)
      } catch (error) {
        vite.ssrFixStacktrace(error)
        console.error('[SSR Dev] Error:', error.stack)
        next(error)
      }
    })

    console.log('[SSR] Dev mode — Vite middleware + SSR enabled')
    // a fresh handler per request: nothing cached to invalidate
    return { invalidateRoutes() {} }
  } else {
    // --- Production mode: pre-built bundles ---
    const express = (await import('express')).default

    // Serve static client assets
    // Hashed build files under assets/ never change, so a browser keeps them for a year. Everything
    // else (favicons, build.css, analytics.js) is revalidated. Without this the server's blanket
    // `no-store` (dms-server index.js) reached the assets too, and every visit downloaded the whole
    // app again. Same policy as hosted sites (dms-server sites/index.js).
    if (clientDir) {
      app.use(express.static(clientDir, {
        index: false,
        cacheControl: false,
        setHeaders(res, filePath) {
          const rel = path.relative(clientDir, filePath)
          res.setHeader('Cache-Control', rel.startsWith(`assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache')
        },
      }))
    }

    // Load template and server bundle once
    const templatePath = path.resolve(clientDir, 'index.html')
    cachedTemplate = await fs.readFile(templatePath, 'utf-8')

    const mod = await import(serverBundle)
    const createHandler = mod.default || mod.createHandler
    cachedHandler = createHandler(handlerConfig)

    // RSC spike (rsc-view-pages.md, phase 2): DMS_RSC=1 with an RSC build in DMS_RSC_DIST_DIR (vite.rsc.config.js)
    // puts the RSC handler in front of today's SSR. It answers what it can serve (an opted-in page view whose
    // sections need no JavaScript, the router's `.rsc` and `.manifest` requests) and passes the rest on.
    if (process.env.DMS_RSC === '1' && process.env.DMS_RSC_DIST_DIR) {
      await mountRsc(app, express, {
        rscDir: path.resolve(root, process.env.DMS_RSC_DIST_DIR),
        handlerConfig,
        templateHead: (cachedTemplate.match(/<head>([\s\S]*)<\/head>/) || [])[1]?.replace('<!--app-head-->', '') || '',
        resolveSession,
        getSiteCss,
      })
    }

    // Mount SSR catch-all
    app.use('*', createSSRMiddleware({
      getHandler: () => cachedHandler,
      getTemplate: () => cachedTemplate,
      getHeadTags,
      resolveSession,
      getSiteCss,
    }))

    console.log(`[SSR] Production mode — client ${clientDir}, server ${serverBundle}`)
    return { invalidateRoutes: () => cachedHandler.invalidateRoutes() }
  }
}

const IMMUTABLE = 'public, max-age=31536000, immutable'

async function mountRsc(app, express, { rscDir, handlerConfig, templateHead, resolveSession, getSiteCss = null }) {
  const { Readable } = await import('node:stream')
  const mod = await import(path.join(rscDir, 'rsc', 'index.js'))
  mod.configure({ handlerConfig, templateHead })
  const handler = mod.default
  const clientDir = path.join(rscDir, 'client')
  app.use(express.static(clientDir, {
    index: false,
    cacheControl: false,
    setHeaders(res, filePath) {
      res.setHeader('Cache-Control', path.relative(clientDir, filePath).startsWith(`rsc-assets${path.sep}`) ? IMMUTABLE : 'no-cache')
    },
  }))
  app.use(async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    const isRouterRequest = req.path.endsWith('.rsc') || req.path.endsWith('.manifest')
    // documents only: a browser navigation asks for text/html
    if (!isRouterRequest && !(req.headers.accept || '').includes('text/html')) return next()
    try {
      // Who is asking (the session cookie): the page renders as them, as on today's path, and a signed-in
      // response (document or `.rsc` payload) is theirs alone: private, never stored.
      const session = resolveSession ? await resolveSession(req) : null
      // the site's server-compiled sheet for the head (navigations render it too, so they get the same one);
      // best effort, the build's link otherwise
      let siteCss = null
      if (getSiteCss) {
        try { siteCss = await getSiteCss(req) } catch (e) { console.warn('[RSC] site css failed:', e.message) }
      }
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
      const response = await handler(new Request(`${req.protocol || 'http'}://${req.headers.host}${req.originalUrl}`, { method: req.method, headers }), { session, siteCss })
      if (response.headers.get('x-dms-rsc') === 'pass') {
        res.setHeader('X-DMS-RSC', `pass: ${decodeURIComponent(response.headers.get('x-dms-rsc-reason') || '')}`.slice(0, 200))
        return next()
      }
      res.status(response.status)
      response.headers.forEach((v, k) => res.setHeader(k, v))
      res.setHeader('X-DMS-RSC', 'served')
      res.vary('Cookie')
      if (session?.user) res.setHeader('Cache-Control', 'private, no-store')
      if (!response.body) return res.end()
      Readable.fromWeb(response.body).pipe(res)
    } catch (error) {
      console.error('[RSC] error, falling back to SSR:', error)
      if (!res.headersSent) return next()
      res.end()
    }
  })
  console.log(`[RSC] spike mounted from ${rscDir}`)
}
