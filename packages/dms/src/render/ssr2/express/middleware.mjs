/**
 * Express SSR middleware.
 * Converts Express req/res to Web Request, calls the SSR handler,
 * injects rendered HTML into the template.
 */

/**
 * @param {object} options
 * @param {Function} options.getHandler - () => { render, invalidateRoutes }
 * @param {Function} options.getTemplate - () => string (HTML template)
 * @param {Function} [options.getHeadTags] - async (req) => HTML added to the head. When it has its own
 *   `<link rel="icon">`, the template's (the build's favicon) is dropped.
 * @param {Function} [options.resolveSession] - async (req) => { state: 'absent'|'signed-out'|'user', user, token }
 *   from the page host's session cookie (dms-server auth/session.js). Without it every render is anonymous.
 * @param {Function} [options.getSiteCss] - async (req) => { href, partial, fallbackHtml } | null: the site's
 *   server-compiled stylesheet, put in place of the build's `<link data-dms-site-css>` (server-compiled-site-css.md)
 * @returns {Function} Express middleware
 */
export function createSSRMiddleware({ getHandler, getTemplate, getHeadTags = null, resolveSession = null, getSiteCss = null }) {
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

      // who is asking (rsc-view-pages.md phase 1): the render runs as that user
      const session = resolveSession ? await resolveSession(req) : null
      const result = await handler.render(request, { session })

      // Handle redirects
      if (result.redirect) {
        return res.redirect(result.status || 302, result.redirect)
      }

      // Inject HTML into template
      // Always set __dmsSSRData so the client uses hydrateRoot instead of createRoot.
      // defaultData: site data for building routes synchronously on the client.
      // hydrationData: not needed here — StaticRouterProvider embeds
      // window.__staticRouterHydrationData automatically.
      // lazy: ids of the code-split components this HTML contains — the
      // client loads them before hydrateRoot (utils/lazyComponent.js).
      // session: what the server rendered as, so the browser's first render starts from the same user
      // (patterns/auth/providers.jsx) and rewrites the cookie when it differs from the stored token.
      // Never the token.
      const ssrPayload = {
        defaultData: result.siteData || null,
        lazy: result.lazy || [],
        // null: this server has no session cookie (no resolveSession), so there is nothing to sync
        session: session ? { state: session.state, user: session.user ? publicUser(session.user) : null } : null,
      }
      const serializedData = JSON.stringify(ssrPayload)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')

      // themeFontsHtml: the resolved pattern(s)' theme font/CSS <style> tags,
      // collected server-side during route building (see handler.jsx /
      // ui/useTheme.js's loadThemeFonts) — embedding them here means the
      // theme's real look (colors, backgrounds, brand fonts) is present at
      // first paint instead of only appearing once client JS hydrates and
      // re-injects them, which was a visible flash of unstyled content.
      // Per-site head tags from the server (its app settings), best effort: a failure keeps the build's.
      let siteHead = ''
      if (getHeadTags) {
        try { siteHead = (await getHeadTags(req)) || '' }
        catch (e) { console.warn('[SSR] head tags failed:', e.message) }
      }
      const headContent =
        `<script>window.__dmsSSRData=${serializedData}</script>` +
        (result.themeFontsHtml || '') +
        siteHead

      // The site's server-compiled sheet in place of the build's link to it (best effort: the build's link
      // otherwise); while the sheet is partial the in-browser compiler comes with it.
      let siteCss = null
      if (getSiteCss) {
        try { siteCss = await getSiteCss(req) }
        catch (e) { console.warn('[SSR] site css failed:', e.message) }
      }
      let page = /<link[^>]*rel="icon"/.test(siteHead)
        ? template.replace(/<link\s+rel="icon"[^>]*>\s*/, '')
        : template
      if (siteCss) {
        page = page.replace(/<link\b[^>]*\bdata-dms-site-css\b[^>]*>/,
          () => `<link rel="stylesheet" data-dms-site-css href="${siteCss.href}">${siteCss.fallbackHtml || ''}`)
      }
      // Replacer functions, not strings: in a replacement string `$'`, `$&` and `` $` `` are patterns, and page
      // content holds them (a SQL regex ending `\d{2}$'` in a page's loader data pasted the rest of the template
      // into its data script, which then failed to parse and the page rendered twice).
      const content = page
        .replace('<!--app-head-->', () => headContent)
        .replace('<!--app-html-->', () => result.html || '')

      res
        .status(result.status || 200)
        .set({ ...result.headers, 'Content-Type': 'text/html; charset=utf-8' })
      // a page rendered for one user is theirs alone; the cookie decides what a URL renders as
      res.vary('Cookie')
      if (session?.user) res.set('Cache-Control', 'private, no-store')
      res.send(content)
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

// the user as the browser's auth state holds it (AuthAPI.getUser), minus the token
function publicUser(user) {
  const { token, password, ...rest } = user
  return rest
}
