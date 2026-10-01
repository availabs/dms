import { lexicalElementData, headingBodyLexicalState } from '../../../ui/pageTemplates'
import { ticketsPage } from './tickets'
import { ticketPage } from './ticket'
import { overviewPage } from './overview'
import { pageQaPage } from './pageQa'

// The pages of a `qa` install, defined in code — the same page shape the page
// pattern renders (PageView → SectionGroup → sections), but never stored as rows.
// - No page or section carries an `id`: they aren't rows, and visit tracking
//   skips pages without one (patterns/page/pages/view.jsx).
// - Section-group names and trackingIds are fixed strings, so every build of a
//   page is identical: server render and client hydration key groups by name,
//   and data sections key their cache and URL params on trackingId.
// - `published` is left unset: the nav hides pages marked 'draft'.

const CONTENT_GROUP = { name: 'default', position: 'content', index: 0, theme: 'content' }

const textSection = (trackingId, heading, ...paragraphs) => ({
  title: '', level: '0', group: CONTENT_GROUP.name, trackingId,
  element: {
    'element-type': 'lexical',
    'element-data': lexicalElementData(headingBodyLexicalState(heading, ...paragraphs)),
  },
})

const codePage = ({ sections, ...page }) => ({
  ...page,
  section_groups: [{ ...CONTENT_GROUP }],
  sections,
})

// The Datasets admin's table for the install's tickets, when a Datasets pattern lists the
// install's environment.
const addTicketUrl = (pattern, tickets, datasetPatterns = []) => {
  const datasets = datasetPatterns.find(p => p?.pattern_type === 'datasets' && p.dmsEnvId && +p.dmsEnvId === +pattern?.dmsEnvId)
  if (!datasets) return null
  return `/${`${datasets.base_url || ''}`.replace(/^\/+|\/+$/g, '')}/internal_source/${tickets.source_id}/table`
}

// A fresh array (and fresh page objects) on every call: the nav and the page format's
// defaultSort sort their input in place.
// Every page has a non-empty url_slug, as on a page pattern: the nav links by slug (an empty one
// falls through to the page id, which code pages lack), and the bare pattern URL shows the
// `index: 0` page.
// `pattern` is the install's pattern row; its `qa.datasets` bind the data sections. `app`,
// `baseUrl` and `datasetPatterns` come from the route config (loaded pattern rows don't carry app).
// `sites`: the covered sub-sites (coveredSites below), or null until they've loaded.
export function buildQaPages(pattern, { app, baseUrl = '', datasetPatterns = [], sites = null } = {}) {
  const datasets = pattern?.qa?.datasets || {}
  const tickets = datasets.tickets
  if (!tickets || !datasets.pages || !datasets.stories) {
    // An install whose datasets aren't set up yet (see its Overview in the admin).
    const notYet = 'This install\'s datasets aren\'t set up yet.'
    return [
      codePage({ title: 'Overview', url_slug: 'overview', index: 0, sections: [textSection('qa_overview_intro', 'Overview', notYet)] }),
      codePage({ title: 'Tickets', url_slug: 'tickets', index: 1, sections: [textSection('qa_tickets_intro', 'Tickets', notYet)] }),
      codePage({ title: 'Ticket', url_slug: 'ticket', index: 2, hide_in_nav: true, sections: [textSection('qa_ticket_intro', 'Ticket', notYet)] }),
    ]
  }
  const ctx = {
    app, pattern, baseUrl, datasets, tickets, sites,
    siteLabels: pattern.qa.siteLabels || {},
    addTicketUrl: addTicketUrl(pattern, tickets, datasetPatterns),
  }
  return [overviewPage(ctx), ticketsPage(ctx), ticketPage(ctx), pageQaPage(ctx)]
}

// The covered sub-sites the Overview shows: the covered-sites dataset's enabled rows ('yes', as
// TransportNY's control room stores them), in sort_order.
export const COVERED_SITE_COLUMNS = ['pattern', 'surface', 'surface_label', 'sort_order', 'enabled']
export function coveredSites(rows = []) {
  return rows
    .filter((r) => r?.enabled === 'yes' && r.surface)
    .sort((a, b) => (+a.sort_order || 0) - (+b.sort_order || 0))
}

// The page for a URL slug (the route's `*` param); a trailing slash is ignored.
// The bare URL and an unknown slug get the `index: 0` page, as on a page pattern
// (the matcher's empty-slug default, and the wrapper keeping its first row when
// nothing matches: dms-manager/_utils.jsx, wrapper.jsx).
export function findQaPage(pages, slug = '') {
  const clean = slug.replace(/\/+$/, '')
  return pages.find(p => p.url_slug === clean) || pages.find(p => p.index === 0)
}
