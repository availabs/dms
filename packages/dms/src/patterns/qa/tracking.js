import { PAGE_STAGES } from './ticketRecord.js'

// Track-on-publish: a page published in a sub-site a QA install covers gets a row in that
// install's pages dataset, so it shows on the install's Overview without a sync. Only publishing
// writes (viewers never do), and only a page with no row yet: a re-publish leaves the row, and its
// stage, as they are. Both publish paths call trackPublishedPage, the page editor's Publish
// (patterns/page/pages/edit/editFunctions.jsx) and `dms page publish` (cli/src/commands/page.js).
// It does no I/O of its own; each caller passes its reads and writes:
//   loadRows(ref, columns) → rows of the dataset `ref` ({slug, source_id, view_id})
//   createRow(ref, data)   → creates one row in it
// So it imports nothing that needs a browser.

// The covered-sites dataset's columns this reads.
export const COVERED_SITE_COLUMNS = ['pattern', 'surface', 'surface_label', 'sort_order', 'enabled', 'include_slugs']

// The covered sub-sites: the covered-sites dataset's enabled rows ('yes', as TransportNY's control
// room stores them), in sort_order.
export function coveredSites(rows = []) {
  return rows
    .filter((r) => r?.enabled === 'yes' && r.surface)
    .sort((a, b) => (+a.sort_order || 0) - (+b.sort_order || 0))
}

// A covered-sites row names its page pattern by the pattern's name or row id (TransportNY's
// control room, which looks patterns up that way) or its instance (the slug in its type).
// `patternKeys`: those three for the published page's pattern.
export const coversPattern = (site, patternKeys = []) => patternKeys.filter(Boolean).map(String).includes(`${site.pattern}`)

// A non-empty `include_slugs` (comma-separated) limits the site to those pages.
export const slugAllowed = (site, slug) => {
  const list = `${site.include_slugs || ''}`.split(',').map((s) => s.trim()).filter(Boolean)
  return !list.length || list.includes(slug)
}

// The pages row a newly tracked page starts with: at the first stage, keyed `<surface>:<slug>`
// (the key the add-ticket form splits back into site and route). `url` is the live page's address,
// when the caller can tell it.
export function trackedPageRow({ site, page, url, now }) {
  const slug = page.url_slug
  return {
    page_key: `${site.surface}:${slug}`,
    surface: site.surface,
    surface_label: site.surface_label || site.surface,
    name: page.title || slug,
    route: `/${slug}`,
    ...(url ? { url } : {}),
    build: 'Published',
    stage: PAGE_STAGES[0],
    updated: now,
  }
}

// Adds the published `page` ({url_slug, title}) to every install that covers its pattern and has
// no row for it yet. `qaInstalls`: the site's qa pattern rows; one whose settings this user can't
// read (no `qa.datasets`) is skipped. Returns [{install, page_key}] for the rows it created.
export async function trackPublishedPage({ page, patternKeys, qaInstalls = [], url, now = new Date().toISOString(), loadRows, createRow }) {
  const slug = page?.url_slug
  if (!slug) return []
  const tracked = []
  for (const install of qaInstalls) {
    const { patterns, pages } = install?.qa?.datasets || {}
    if (!patterns || !pages) continue
    const site = coveredSites(await loadRows(patterns, COVERED_SITE_COLUMNS)).find((s) => coversPattern(s, patternKeys))
    if (!site || !slugAllowed(site, slug)) continue
    const row = trackedPageRow({ site, page, url, now })
    const existing = await loadRows(pages, ['page_key'])
    if (existing.some((r) => r.page_key === row.page_key)) continue
    await createRow(pages, row)
    tracked.push({ install: install.name, page_key: row.page_key })
  }
  return tracked
}
