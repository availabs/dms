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
 * @param {string} config.clientDir - Built client assets directory (prod)
 * @param {object} config.handlerConfig - Config passed to createHandler (apiHost, siteConfig, etc.)
 */
export async function mountSSR(app, config) {
  const {
    root,
    serverEntry = '/src/entry-ssr.jsx',
    clientDir,
    handlerConfig = {},
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
          async render(request) {
            const mod = await vite.ssrLoadModule(serverEntry)
            const createHandler = mod.default || mod.createHandler
            const handler = createHandler(handlerConfig)
            return handler.render(request)
          },
        }
      },
      getTemplate() {
        // Will be replaced per-request below
        return null
      },
    })

    // Custom dev middleware that transforms the template per-request
    app.use('*', async (req, res, next) => {
      try {
        // Read and transform template on every request (dev mode)
        let template = await fs.readFile(path.resolve(root, 'index.html'), 'utf-8')
        template = await vite.transformIndexHtml(req.originalUrl, template)

        const handler = {
          async render(request) {
            const mod = await vite.ssrLoadModule(serverEntry)
            const createHandler = mod.default || mod.createHandler
            const h = createHandler(handlerConfig)
            return h.render(request)
          },
        }

        const ssrMiddleware = createSSRMiddleware({
          getHandler: () => handler,
          getTemplate: () => template,
        })

        await ssrMiddleware(req, res, next)
      } catch (error) {
        vite.ssrFixStacktrace(error)
        console.error('[SSR Dev] Error:', error.stack)
        next(error)
      }
    })

    console.log('[SSR] Dev mode — Vite middleware + SSR enabled')
  } else {
    // --- Production mode: pre-built bundles ---
    const express = (await import('express')).default

    // Serve static client assets
    if (clientDir) {
      app.use(express.static(clientDir, { index: false }))
    }

    // Load template and server bundle once
    const templatePath = path.resolve(clientDir, 'index.html')
    cachedTemplate = await fs.readFile(templatePath, 'utf-8')

    const serverBundlePath = path.resolve(
      root,
      'dist/server/entry-ssr.js'
    )
    const mod = await import(serverBundlePath)
    const createHandler = mod.default || mod.createHandler
    cachedHandler = createHandler(handlerConfig)

    // Mount SSR catch-all
    app.use('*', createSSRMiddleware({
      getHandler: () => cachedHandler,
      getTemplate: () => cachedTemplate,
    }))

    console.log('[SSR] Production mode — serving pre-built bundles')
  }
}
