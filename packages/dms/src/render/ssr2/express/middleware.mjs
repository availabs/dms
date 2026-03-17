/**
 * Express SSR middleware.
 * Converts Express req/res to Web Request, calls the SSR handler,
 * injects rendered HTML into the template.
 */

/**
 * @param {object} options
 * @param {Function} options.getHandler - () => { render, invalidateRoutes }
 * @param {Function} options.getTemplate - () => string (HTML template)
 * @returns {Function} Express middleware
 */
export function createSSRMiddleware({ getHandler, getTemplate }) {
  return async function ssrMiddleware(req, res, next) {
    try {
      const handler = getHandler()
      const template = getTemplate()

      if (!handler || !template) {
        return next()
      }

      // Convert Express request to Web Request
      const protocol = req.protocol || 'http'
      const host = req.headers.host || 'localhost'
      const url = `${protocol}://${host}${req.originalUrl}`

      const request = new Request(url, {
        method: req.method,
        headers: new Headers(
          Object.entries(req.headers).reduce((acc, [k, v]) => {
            if (typeof v === 'string') acc[k] = v
            return acc
          }, {})
        ),
      })

      const result = await handler.render(request)

      // Handle redirects
      if (result.redirect) {
        return res.redirect(result.status || 302, result.redirect)
      }

      // Inject HTML into template
      // Always set __dmsSSRData so the client uses hydrateRoot instead of createRoot.
      // defaultData: site data for building routes synchronously on the client.
      // hydrationData: not needed here — StaticRouterProvider embeds
      // window.__staticRouterHydrationData automatically.
      const ssrPayload = {
        defaultData: result.siteData || null,
      }
      const serializedData = JSON.stringify(ssrPayload)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')

      const headContent = `<script>window.__dmsSSRData=${serializedData}</script>`

      const content = template
        .replace('<!--app-head-->', headContent)
        .replace('<!--app-html-->', result.html || '')

      res
        .status(result.status || 200)
        .set({ ...result.headers, 'Content-Type': 'text/html; charset=utf-8' })
        .send(content)
    } catch (error) {
      console.error('[SSR] Render error, falling back to SPA shell:', error)
      // Graceful fallback: serve the SPA shell (no SSR content)
      try {
        const template = getTemplate()
        if (template) {
          return res.status(200).set('Content-Type', 'text/html').send(template)
        }
      } catch (_) {
        // ignore
      }
      next(error)
    }
  }
}
