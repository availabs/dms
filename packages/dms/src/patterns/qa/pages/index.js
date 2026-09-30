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
// `pattern` is the install's pattern row; later phases read its settings here.
export function buildQaPages(pattern) {
  return [
    codePage({
      title: 'Tickets', url_slug: 'tickets', index: 0,
      sections: [textSection('qa_tickets_intro', 'Tickets', 'Placeholder for the ticket list.')],
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
