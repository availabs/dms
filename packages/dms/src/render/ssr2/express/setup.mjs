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
 * @returns {Promise<{ invalidateRoutes: Function, noteChange: Function }>} drops the handler's per-host route cache;
 *   tells it an app's row was written (both no-ops in dev)
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
    return { invalidateRoutes() {}, noteChange() {} }
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

    // Static HTML with islands (static-html-islands.md): DMS_ISLANDS=1 serves an opted-in page view from this
    // same handler, with the client build's second entry (render/islands/entry.browser.jsx) in place of the app's.
    const islandsOn = process.env.DMS_ISLANDS === '1'
    const islandsTemplate = islandsOn ? await buildIslandsTemplate(clientDir, cachedTemplate) : null
    if (islandsOn) console.log(islandsTemplate ? '[SSR] static HTML with islands on (DMS_ISLANDS)' : '[SSR] DMS_ISLANDS is set but this build has no islands entry: off')

    // Mount SSR catch-all
    app.use('*', createSSRMiddleware({
      getHandler: () => cachedHandler,
      getTemplate: () => cachedTemplate,
      getHeadTags,
      resolveSession,
      getSiteCss,
      getIslandsTemplate: islandsTemplate ? () => islandsTemplate.page : null,
      getIslandPreloads: islandsTemplate ? islandsTemplate.islandPreloads : null,
    }))

    console.log(`[SSR] Production mode — client ${clientDir}, server ${serverBundle}`)
    return {
      invalidateRoutes: () => cachedHandler.invalidateRoutes(),
      // a handler built before this hook existed has none: its pages stay cached as before
      noteChange: (app, msg) => cachedHandler.noteChange?.(app, msg),
    }
  }
}

const IMMUTABLE = 'public, max-age=31536000, immutable'

const ISLANDS_ENTRY = 'render/islands/entry.browser.jsx'
// a compiled-in plugin's entry among the islands entry's dynamic imports, by its built file's name:
// plugin.<plugin name>-<hash>.js (the app's build config names it: render/islands/README.md)
const PLUGIN_ENTRY = /(?:^|\/)plugin\.([a-z][a-z0-9_]*)-[^/]*\.js$/

/**
 * The page template for the islands path: the build's own, with the app's entry script and its preloads
 * replaced by the islands entry's (from the client build's Vite manifest). Null when the build has none.
 * `islandPreloads(plugins)`: preload tags for the code a page imports after it hydrates when it has sections to
 * mount at once (the entry's dynamic imports and what they import: the section code, and of the plugins only
 * the ones named), so those chunks download with the entry and not in a chain after it.
 */

async function buildIslandsTemplate(clientDir, template) {
  let manifest
  try { manifest = JSON.parse(await fs.readFile(path.join(clientDir, '.vite', 'manifest.json'), 'utf-8')) }
  catch { return null }
  const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry && k.endsWith(ISLANDS_ENTRY))
  if (!entryKey) return null
  // the entry's static imports, transitively: preloaded so they download with the entry, not after it
  const preloads = new Set()
  const styles = new Set()
  const walk = (key) => {
    const chunk = manifest[key]
    if (!chunk) return
    ;(chunk.css || []).forEach((c) => styles.add(c))
    for (const dep of chunk.imports || []) {
      if (preloads.has(dep)) continue
      preloads.add(dep)
      walk(dep)
    }
  }
  walk(entryKey)
  const tags = [
    `<script type="module" crossorigin src="/${manifest[entryKey].file}"></script>`,
    ...[...preloads].map((k) => `<link rel="modulepreload" crossorigin href="/${manifest[k].file}">`),
    ...[...styles].filter((c) => !template.includes(`/${c}"`)).map((c) => `<link rel="stylesheet" crossorigin href="/${c}">`),
  ].join('\n    ')
  let replaced = false
  const page = template
    .replace(/[ \t]*<link rel="modulepreload"[^>]*>\n?/g, '')
    .replace(/<script type="module"[^>]*\bsrc="[^"]*"[^>]*><\/script>/, () => { replaced = true; return tags })
  if (!replaced) return null
  const sectionCode = []
  const pluginEntries = {}
  for (const key of manifest[entryKey].dynamicImports || []) {
    const plugin = PLUGIN_ENTRY.exec(manifest[key]?.file || '')
    if (plugin) pluginEntries[plugin[1]] = key
    else sectionCode.push(key)
  }
  const tagsFor = new Map()
  const islandPreloads = (plugins = []) => {
    const id = plugins.join(',')
    if (!tagsFor.has(id)) {
      const later = new Set()
      const walkLater = (key) => {
        const chunk = manifest[key]
        if (!chunk || later.has(key) || preloads.has(key) || key === entryKey) return
        later.add(key)
        ;(chunk.imports || []).forEach(walkLater)
      }
      ;[...sectionCode, ...plugins.map((name) => pluginEntries[name]).filter(Boolean)].forEach(walkLater)
      tagsFor.set(id, [...later].map((k) => `<link rel="modulepreload" crossorigin href="/${manifest[k].file}">`).join(''))
    }
    return tagsFor.get(id)
  }
  return { page, islandPreloads }
}
