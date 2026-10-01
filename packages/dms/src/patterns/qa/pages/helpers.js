import { DEFAULT_STATUSES, PAGE_STAGES } from '../ticketRecord'

// Section and column shapes for the QA pages. The data shapes (sources, calcs, filters) and the
// gotchas noted beside them come from TransportNY's control-room builders
// (src/themes/transportny/qa_skills/tools/builds/build_cr_*.mjs). The look does not: every style
// key below is one the library default theme defines, so the pages read the same on any site
// that keeps the defaults.

// ── lexical ──
export const text = (t, format = 0, style = '') => ({ type: 'text', version: 1, detail: 0, format, mode: 'normal', style, text: t })
export const styled = (styleKey, ...children) => ({
  type: 'styled-paragraph', version: 1, direction: 'ltr', format: '', indent: 0, textFormat: 0, textStyle: '', styleKey, children,
})
export const lexical = (...nodes) => JSON.stringify({
  bgColor: 'rgba(0,0,0,0)', isCard: '', showToolbar: false,
  text: { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: nodes } },
})

// ── text styles: keys of the default theme's textSettings (Card valueFontStyle / headerFontStyle
// and lexical styleKey both resolve through it) ──
export const T = {
  title: 'text3XLBold', // page title
  subtitle: 'text2XLBold', // a ticket's or page's own name
  heading: 'textLGBold', // card and band titles
  statSM: 'text2XLBold', statXS: 'textXLBold', // figures (stat_value)
  value: 'textSMReg', strong: 'textSMBold',
  meta: 'caption', // small secondary text
  label: 'textXS', // field labels
  body: 'body', bodySmall: 'bodySmall',
}
// The breadcrumb and title of a page's header band.
export const crumb = (...parts) => lexical(styled(T.meta, text(parts.join('  /  '))))
export const pageTitle = (title, subtitle) => lexical(styled(T.title, text(title)), ...(subtitle ? [styled(T.meta, text(subtitle))] : []))
export const cardTitle = (title, caption) => lexical(styled(T.heading, text(title)), ...(caption ? [styled(T.meta, text(caption))] : []))

// ── pill colours: the default theme's pill styles (the keys double as a pill's edit-in-place options) ──
export const SEV_PILL = { Blocker: 'red', Major: 'orange', Minor: 'blue', Polish: 'gray', Feature: 'green' }
export const PRIO_PILL = { Now: 'red', Next: 'orange', Later: 'gray' }
export const STATUS_PILL = {
  Triage: 'gray', 'In progress': 'blue', 'In review': 'orange', 'Needs decision': 'orange', 'Needs data': 'gray', Resolved: 'green', Closed: 'green',
}
export const CATEGORY_PILL = { bug: 'red', style: 'orange', data: 'blue', content: 'gray', enhancement: 'green' }
export const STAGE_PILL = {
  Proposed: 'gray', Design: 'blue', Implemented: 'orange', QA: 'blue', 'Dev Acceptance': 'orange', 'Client Acceptance': 'green',
}
export const BUILD_PILL = { 'Not started': 'gray', 'In progress': 'orange', 'Built (draft)': 'blue', Published: 'green' }
export const DATA_PILL = { Real: 'green', Partial: 'orange', Mock: 'gray' }
export const STORY_PILL = { proposed: 'orange', accepted: 'blue', verified: 'green' }
export const SOURCE_KEY_PILL = { ai: 'blue', dev: 'gray', client: 'orange', qa: 'gray' }
export const staticOptions = (map) => Object.keys(map).map((v) => ({ label: v, value: v }))

// ── page stages: bar colours and short labels ──
export const STAGE_HEX = {
  Proposed: '#a1a1aa', Design: '#8b5cf6', Implemented: '#f59e0b', QA: '#38bdf8', 'Dev Acceptance': '#14b8a6', 'Client Acceptance': '#10b981',
}
export const STAGE_SHORT = { Proposed: 'proposed', Design: 'design', Implemented: 'impl', QA: 'qa', 'Dev Acceptance': 'dev', 'Client Acceptance': 'client' }
// A page's position in the stage order, for sorting without a stored stage_order.
export const STAGE_RANK = `(case data->>'stage' ${PAGE_STAGES.map((s, i) => `when '${s}' then ${i + 1}`).join(' ')} else 0 end)`

// ── status groups, from the ticket record's kinds ──
const statusesOf = (kinds) => DEFAULT_STATUSES.filter(s => kinds.includes(s.kind)).map(s => s.value)
export const OPEN_STATUSES = statusesOf(['triage', 'active', 'waiting'])
export const CLOSED_STATUSES = statusesOf(['done', 'canceled'])
// The same lists as SQL `in` lists.
export const OPEN = `(${OPEN_STATUSES.map(v => `'${v}'`).join(',')})`
export const CLOSED = `(${CLOSED_STATUSES.map(v => `'${v}'`).join(',')})`

// ── SQL fragments ──
export const st = () => `(data->>'status')`
// Severity weight for the resolution %.
export const W = "(case (data->>'severity') when 'Blocker' then 5 when 'Major' then 3 when 'Minor' then 2 else 1 end)"
// Display number: the friendly ticket_id when set, else the DMS row id. Links and filters key on the
// ROW id, so every ticket is openable the moment it exists. Comma-free CASE only: the UDA SELECT
// list is comma-split.
export const TNUM = `('#' || (case when (data->>'ticket_id') is null or (data->>'ticket_id') = '' then (id)::text else (data->>'ticket_id') end))`
// Free text inside an SQL string literal: no quotes, and no commas (the SELECT list is comma-split).
export const sqlText = (s) => `${s || ''}`.replace(/[',]/g, '')
export const SOURCE_CASE = "(case data->>'source' when 'ai' then 'AI' when 'dev' then 'Dev' when 'client' then 'Client' else (data->>'source') end)"
export const SOURCE_PILL = { AI: 'blue', Dev: 'gray', Client: 'orange' }
// Site (surface) display labels as a CASE; raw values when the install sets none. Labels must be
// comma-free for the same reason as TNUM.
export const siteCase = (siteLabels = {}) => {
  const entries = Object.entries(siteLabels)
  if (!entries.length) return `(data->>'surface')`
  return `(case data->>'surface' ${entries.map(([k, v]) => `when '${k}' then '${v}'`).join(' ')} else (data->>'surface') end)`
}

// ── the install's tickets dataset as a section's external source ──
// Filter and group-by columns MUST be listed in `columns`, or the query uses the bare name and
// errors ("column surface does not exist"); display-only calcs can use explicit data->> SQL.
const TICKET_COLUMNS = [
  'ticket_id', 'title', 'page_key', 'severity', 'priority', 'status', 'source', 'assignee', 'reporter', 'opened', 'updated',
  'description', 'steps', 'expected', 'actual', 'env', 'comments', 'surface', 'page_name', 'page_route', 'page_stage',
]
// One of the install's datasets (`ref` = {slug, source_id, view_id} from qa.datasets) as a section's source.
export const datasetSource = ({ app, pattern }, ref, label, columns) => ({
  isDms: true, app, type: ref.slug, name: `${pattern.name} — ${label}`,
  source_id: ref.source_id, view_id: ref.view_id,
  env: `${app}+${ref.slug}`, srcEnv: `${app}+${ref.slug}`,
  columns: columns.map(name => ({ name, display_name: name, type: 'text' })),
})
export const ticketsSource = (ctx) => datasetSource(ctx, ctx.tickets, 'Tickets', TICKET_COLUMNS)
export const pagesSource = (ctx) => datasetSource(ctx, ctx.datasets.pages, 'Pages', [
  'page_key', 'surface', 'surface_label', 'name', 'route', 'url', 'description', 'build', 'data', 'owner', 'updated', 'stage',
])
export const storiesSource = (ctx) => datasetSource(ctx, ctx.datasets.stories, 'Stories', ['story', 'stage', 'source', 'sort_order', 'page_key'])

// A data section's element-data over `source`.
export const dataWrapper = (source) => ({ columns, filters = [], display = {} }) => JSON.stringify({
  externalSource: source, columns, filters: { op: 'AND', groups: filters },
  display: { usePagination: true, pageSize: 25, readyToLoad: true, fetchMode: 'smart', showAttribution: false, striped: false, ...display },
  data: [], join: { sources: {} },
})
export const col = (name, label, over = {}) => ({ name, customName: label, show: true, justify: 'left', ...over })
export const pcol = (name, label, map, over = {}) => ({ name, customName: label, type: 'status_pill', pillColors: map, show: true, justify: 'left', ...over })
// Aggregate calc (fn "exempt"). Row-level calcs must carry NO fn: getData's invalid-state guard
// counts any truthy fn, and a mix of fn / no-fn columns never fetches.
export const calc = (sql, label, over = {}) => ({
  name: sql, type: 'calculated', display_name: label, normalName: label, show: true, fn: 'exempt', formatFn: ' ', justify: 'left',
  hideHeader: false, hideValue: false, ...over,
})
// An aggregate shown as a figure. Card's own value class fixes the size of a plain value cell on
// the default theme, so a big number renders through the stat_value column type, which sizes the
// figure with its valueFontStyle.
export const stat = (sql, label, over = {}) => calc(sql, label, { type: 'stat_value', origin: 'calculated-column', valueFontStyle: T.statSM, ...over })
export const staticCell = (name, value, over = {}) => ({ name, origin: 'static', staticValue: value, show: true, hideHeader: true, ...over })

// ── section frames: a fused stack of cards in one band zeroes every interior edge ──
export const WHITE_CARD = { bg: 'white', border: { top: true, left: true, right: true, bottom: true }, radius: { tl: true, tr: true, bl: true, br: true } }
export const CARD_TOP = { bg: 'white', border: { top: true, left: true, right: true, bottom: true }, radius: { tl: true, tr: true }, padding: { bottom: '0' } }
export const CARD_MID = { bg: 'white', border: { left: true, right: true, bottom: true }, padding: { top: '0', bottom: '0' } }
export const CARD_BOTTOM = { bg: 'white', border: { left: true, right: true, bottom: true }, radius: { bl: true, br: true }, padding: { top: '0' } }

// ── page parts ──
// Every group is a default-theme `content` band; sizes are the default theme's fractions of its
// 6-column grid ('1/3', '1/2', '2/3', '1').
export const group = (name, index, displayName) => ({ name, index, theme: 'content', position: 'content', displayName })
export const section = ({ trackingId, group, size = '1', type, data, ...frame }) => ({
  title: '', level: '0', group, trackingId, size, element: { 'element-type': type, 'element-data': data }, ...frame,
})
// A URL-bound page variable.
export const pageVariable = (id, searchKey) => ({ id, values: '', searchKey, useSearchParams: true })
