// RSC spike, SSR environment (rsc-view-pages.md, phase 2). Decides whether a request can be served by
// the RSC path, and if so gathers everything the server component needs, as plain data:
//   - today's route tree is rendered once with RscCaptureContext set (render/ssr2/handler.jsx
//     captureRender). An opted-in page view whose sections are all static fills the capture and renders
//     its three section-group slots as HTML;
//   - the head is the normal build's own index.html head (its CSS, fonts, Tailwind runtime, analytics),
//     without the normal client app's module scripts, plus the theme's font tags; as tag data, because
//     the server component renders <head> as React elements.
// Runs in the `ssr` environment, where the whole app (contexts, Lexical, linkedom) can load; the `rsc`
// environment only orchestrates (react-server has no createContext).

let parseHTML = null
async function headTags(html) {
  if (!html) return []
  if (!parseHTML) parseHTML = (await import('linkedom')).parseHTML
  const { document } = parseHTML(`<!doctype html><html><head>${html}</head><body></body></html>`)
  return [...document.head.children].flatMap((el) => {
    const tag = el.tagName.toLowerCase()
    if (tag === 'script' && el.getAttribute('type') === 'module') return []
    if (tag === 'link' && el.getAttribute('rel') === 'modulepreload') return []
    const attrs = {}
    for (const a of el.attributes) attrs[a.name] = a.value
    return [{ tag, attrs, text: el.textContent || '' }]
  })
}

// The sections that stay live in the browser (section islands, patterns/page/components/sections/
// RscSection.jsx) and what the browser needs to run them: the page row, with element-data kept only on the
// island sections (the static ones are HTML already), the page list's nav fields, and the CMS fields the
// data sections read. Null when every section is static.
function islandsOf(capture) {
  const live = (capture.sections || []).filter((s) => !s.eligible)
  if (!live.length || !capture.islandPage) return null
  const page = JSON.parse(JSON.stringify(capture.islandPage))
  const keep = new Set(live.map((s) => s.index))
  if (Array.isArray(page.item?.sections)) {
    page.item.sections = page.item.sections.map((section, i) =>
      keep.has(i) || !section?.element ? section : { ...section, element: { ...section.element, 'element-data': '{}' } })
  }
  return { page, sections: live.map(({ key, index }) => ({ key, index })) }
}

/**
 * @param {Function} createHandler - the app's SSR handler factory (src/entry-ssr.jsx's default export)
 * @returns {(request: Request, config: { handlerConfig, templateHead, session }) => Promise<object>}
 */
export function createRscPageResolver(createHandler) {
  let handler = null
  let templateTags = null
  // session (the Express mount, from the session cookie): { state, user, token }, or null. The page renders
  // as that user, and carries who it was rendered for (never the token) so the browser starts from them.
  return async function resolveRscPage(request, { handlerConfig, templateHead, session = null, siteCss = null }) {
    if (!handler) handler = createHandler(handlerConfig)
    if (!templateTags) templateTags = await headTags(templateHead)

    const r = await handler.captureRender(request, { session })
    if (r.redirect) return { eligible: false, status: r.status, redirect: r.redirect }
    if (!r.capture?.eligible) return { eligible: false, reason: r.capture?.reason || 'not an opted-in route' }

    const island = JSON.parse(JSON.stringify(r.capture.island))
    if (session?.user) {
      const { token, password, ...user } = session.user
      island.session = { state: 'user', user: JSON.parse(JSON.stringify(user)) }
    } else island.session = { state: 'anonymous' }
    const sectionIslands = islandsOf(r.capture)
    if (sectionIslands) island.sectionIslands = sectionIslands
    const { loadThemes } = (await import('./clientConfig')).getRscClientConfig()
    if (island.selection !== 'default' && loadThemes) {
      // the client rebuilds the theme from code themes only; a theme saved in the database stays on today's path
      const themes = await loadThemes([island.selection])
      if (!themes?.[island.selection]) return { eligible: false, reason: `theme ${island.selection} is not a code theme` }
    }
    return {
      eligible: true,
      status: r.status,
      title: island.title || '',
      head: [
        ...(await Promise.all(templateTags.map(async (t) => {
          if (t.tag === 'title' && island.documentTitle) return [{ ...t, text: island.documentTitle }]
          // the build's link to the site's sheet, pointed at the server-compiled one (server-compiled-site-css.md);
          // the in-browser compiler comes with it while that sheet is partial
          if (siteCss && t.tag === 'link' && 'data-dms-site-css' in (t.attrs || {})) {
            return [{ ...t, attrs: { ...t.attrs, href: siteCss.href } }, ...(await headTags(siteCss.fallbackHtml))]
          }
          return [t]
        }))).flat(),
        ...(await headTags(r.themeFontsHtml)),
      ],
      island,
      slots: { top: r.slots.top || '', content: r.slots.content || '', bottom: r.slots.bottom || '' },
    }
  }
}
