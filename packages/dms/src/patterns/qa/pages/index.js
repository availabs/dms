import { lexicalElementData, headingBodyLexicalState } from '../../../ui/pageTemplates'

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

// A stand-in list of the install's tickets, bound to its own tickets dataset, so a new
// install can be checked end to end. Phase 3 replaces it with the real ticket list.
// Binding shape from TransportNY's control-room builder (build_cr_tickets.mjs, TICKETS_SRC).
const LIST_COLUMNS = [['title', 'Title'], ['severity', 'Severity'], ['status', 'Status'], ['assignee', 'Assignee'], ['opened', 'Opened']]
const ticketListSection = (app, pattern, tickets) => ({
  title: '', level: '0', group: CONTENT_GROUP.name, trackingId: 'qa_tickets_list',
  element: {
    'element-type': 'Spreadsheet',
    'element-data': JSON.stringify({
      externalSource: {
        isDms: true, app, type: tickets.slug, name: `${pattern.name} — Tickets`,
        source_id: tickets.source_id, view_id: tickets.view_id,
        env: `${app}+${tickets.slug}`, srcEnv: `${app}+${tickets.slug}`,
        columns: LIST_COLUMNS.map(([name]) => ({ name, display_name: name, type: 'text' })),
      },
      columns: LIST_COLUMNS.map(([name, label]) => ({ name, customName: label, show: true, justify: 'left' })),
      filters: { op: 'AND', groups: [] },
      display: {
        usePagination: true, pageSize: 25, readyToLoad: true, fetchMode: 'smart', showAttribution: false,
        allowEditInView: true, allowAdddNew: true, addNewBehaviour: 'append',
      },
      data: [],
      join: { sources: {} },
    }),
  },
})

const codePage = ({ sections, ...page }) => ({
  ...page,
  section_groups: [{ ...CONTENT_GROUP }],
  sections,
})

// A fresh array (and fresh page objects) on every call: the nav and the page
// format's defaultSort sort their input in place.
// Every page has a non-empty url_slug, as on a page pattern: the nav links by
// slug (an empty one falls through to the page id, which code pages lack), and
// the bare pattern URL shows the `index: 0` page.
// `pattern` is the install's pattern row; its `qa.datasets` bind the data sections. `app` is
// the site's app (loaded pattern rows don't carry it).
export function buildQaPages(pattern, app) {
  const tickets = pattern?.qa?.datasets?.tickets
  return [
    codePage({
      title: 'Tickets', url_slug: 'tickets', index: 0,
      sections: tickets
        ? [textSection('qa_tickets_intro', 'Tickets', 'Stand-in list of this install\'s tickets.'), ticketListSection(app, pattern, tickets)]
        : [textSection('qa_tickets_intro', 'Tickets', 'Placeholder for the ticket list.')],
    }),
    codePage({
      title: 'Ticket', url_slug: 'ticket', index: 1, hide_in_nav: true,
      sections: [textSection('qa_ticket_intro', 'Ticket', 'Placeholder for a single ticket.')],
    }),
  ]
}

// The page for a URL slug (the route's `*` param); a trailing slash is ignored.
// The bare URL and an unknown slug get the `index: 0` page, as on a page pattern
// (the matcher's empty-slug default, and the wrapper keeping its first row when
// nothing matches: dms-manager/_utils.jsx, wrapper.jsx).
export function findQaPage(pages, slug = '') {
  const clean = slug.replace(/\/+$/, '')
  return pages.find(p => p.url_slug === clean) || pages.find(p => p.index === 0)
}
