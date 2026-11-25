// Static HTML with islands (static-html-islands.md, phase 1). The data a served page carries for the
// browser, as plain JSON: the chrome's props (`island`, filled by the page view during the capture render:
// patterns/page/pages/view.jsx) and, when the page has live sections, what they need (`island.sectionIslands`).
// Used on the server (servePage.js) and in the browser (entry.browser.jsx).

export const ISLAND_DATA_ID = 'dms-islands'
// the header a browser navigation sends to get a page as JSON instead of a document
export const NAV_HEADER = 'x-dms-islands-nav'

// The sections that stay live in the browser and what they need: the page row, with element-data kept only
// on the island sections (the static ones are HTML already). Null when every section is static.
function sectionIslandsOf(capture) {
  const live = (capture.sections || []).filter((s) => !s.eligible)
  if (!live.length || !capture.islandPage) return null
  const page = JSON.parse(JSON.stringify(capture.islandPage))
  const keep = new Set(live.map((s) => s.index))
  if (Array.isArray(page.item?.sections)) {
    page.item.sections = page.item.sections.map((section, i) =>
      keep.has(i) || !section?.element ? section : { ...section, element: { ...section.element, 'element-data': '{}' } })
  }
  // `wake`: the section keeps its server HTML until the reader uses it (IslandHost.jsx)
  return { page, sections: live.map(({ key, index, wake }) => (wake ? { key, index, wake: true } : { key, index })) }
}

/** The chrome's props for an eligible capture. `session`: who the page was rendered for (never the token). */
export function buildIsland(capture, session) {
  const island = JSON.parse(JSON.stringify(capture.island))
  if (session?.user) {
    const { token, password, ...user } = session.user
    island.session = { state: 'user', user: JSON.parse(JSON.stringify(user)) }
  } else island.session = { state: 'anonymous' }
  const sectionIslands = sectionIslandsOf(capture)
  if (sectionIslands) island.sectionIslands = sectionIslands
  return island
}

/** JSON safe to put inside a <script> element. */
export function serializeIslandData(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

/** Browser: the page's island data, or null when this document was not served by the islands path. */
export function readIslandData(doc = document) {
  const el = doc.getElementById(ISLAND_DATA_ID)
  return el ? JSON.parse(el.textContent) : null
}

// A short key for the head content a page needs beyond the build's own (its theme's font and style tags).
// A navigation between pages whose keys differ is a document load, since the head is not rebuilt in place.
export function headKey(html = '') {
  let h = 0
  for (let i = 0; i < html.length; i++) h = (h * 31 + html.charCodeAt(i)) | 0
  return `${html.length}:${h}`
}

/**
 * Browser: is a navigation to `url` the page already shown? True for one move only: a page opened with no
 * search string (`shownBare`) going to itself with its page variables written out, the URL the server named
 * with the page (`island.variablesUrl`, patterns/page/pages/view.jsx). That URL renders what the bare one
 * did, so the entry answers it without the server.
 */
export function isShownPage(island, shownBare, url) {
  if (!shownBare || !island?.variablesUrl) return false
  const written = new URL(island.variablesUrl, url.origin)
  return written.pathname === url.pathname && written.search === url.search
}
