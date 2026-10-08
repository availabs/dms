import { DEFAULT_STATUSES, PAGE_STAGES } from '../ticketRecord'

// Section and column shapes for the QA pages. The data shapes (sources, calcs, filters) and the
// gotchas noted beside them come from TransportNY's control-room builders
// (src/themes/transportny/qa_skills/tools/builds/build_cr_*.mjs). The look does not: every style
// key below is one the library default theme defines, so the pages read the same on any site
// that keeps the defaults.

// ── text styles: the qa pattern's text keys (qa.theme.js qaTextStyles, added to textSettings by
// withQaTheme). Card valueFontStyle / headerFontStyle resolve through textSettings. ──
export const T = {
  pageTitle: 'qaPageTitle', cardTitle: 'qaCardTitle',
  crumb: 'qaCrumb', eyebrow: 'qaEyebrow', body: 'qaBody', strong: 'qaBodyStrong',
  small: 'qaSmall', smallMuted: 'qaSmallMuted', figure: 'qaFigure', mono: 'qaMono',
  button: 'qaButton', buttonSM: 'qaButtonSM', buttonPrimary: 'qaButtonPrimary', segment: 'qaSegment', prose: 'qaProse', label: 'qaLabel', link: 'qaLink',
}

// ── pill colours: the qa pattern's own pill style names (qa.theme.js). The keys double as a pill's
// edit-in-place options. ──
export const SEV_PILL = { Blocker: 'qa_sev_blocker', Major: 'qa_sev_major', Minor: 'qa_sev_minor', Polish: 'qa_sev_polish', Feature: 'qa_sev_feature' }
export const PRIO_PILL = { Now: 'qa_prio_now', Next: 'qa_prio_next', Later: 'qa_prio_later' }
// by the status's kind (ticketRecord.js DEFAULT_STATUSES); In review is the active kind's half-filled step
export const STATUS_PILL = {
  Triage: 'qa_status_triage', 'In progress': 'qa_status_active', 'In review': 'qa_status_review',
  'Needs decision': 'qa_status_waiting', 'Needs data': 'qa_status_waiting', Resolved: 'qa_status_done', Closed: 'qa_status_canceled',
}
export const CATEGORY_PILL = { bug: 'qa_tag', style: 'qa_tag', data: 'qa_tag', content: 'qa_tag', enhancement: 'qa_tag' }
export const BUILD_PILL = { 'Not started': 'qa_build_none', 'In progress': 'qa_build_progress', 'Built (draft)': 'qa_build_draft', Published: 'qa_build_published' }
export const DATA_PILL = { Real: 'qa_data_real', Partial: 'qa_data_partial', Mock: 'qa_data_mock' }
export const STORY_PILL = { proposed: 'qa_story_proposed', accepted: 'qa_story_accepted', verified: 'qa_story_verified' }
export const staticOptions = (map) => Object.keys(map).map((v) => ({ label: v, value: v }))

// ── page stages: short labels and order ──
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
// A tracked page's open tickets, over the tickets joined as `t` (rows grouped by page): every open
// status, whatever the severity, as TransportNY's sync counted `open_bugs`. A page with no
// tickets has one all-null `t` row, which the filter leaves out.
export const OPEN_COUNT = `(count(*) filter (where t.data->>'status' in ${OPEN}))::text as open_n`

// ── SQL fragments ──
export const st = () => `(data->>'status')`
// Severity weight for the resolution %.
export const W = "(case (data->>'severity') when 'Blocker' then 5 when 'Major' then 3 when 'Minor' then 2 else 1 end)"
// Display number: the friendly ticket_id when set, else the DMS row id. Links and filters key on the
// ROW id, so every ticket is openable the moment it exists. Comma-free CASE only: the UDA SELECT
// list is comma-split.
// `idRef`: `ds.id` in a joined section, where a bare `id` is ambiguous.
export const tnum = (idRef = 'id') => `('#' || (case when (data->>'ticket_id') is null or (data->>'ticket_id') = '' then (${idRef})::text else (data->>'ticket_id') end))`
export const TNUM = tnum()
// Free text inside an SQL string literal: no quotes, and no commas (the SELECT list is comma-split).
export const sqlText = (s) => `${s || ''}`.replace(/[',]/g, '')
export const SOURCE_CASE = "(case data->>'source' when 'ai' then 'AI' when 'dev' then 'Dev' when 'client' then 'Client' else (data->>'source') end)"
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
// The change history (one row per changed field; written by the server, see datasets.js).
export const historySource = (ctx) => datasetSource(ctx, ctx.datasets.history, 'Change history', [
  'row_id', 'source_id', 'field', 'old_value', 'new_value', 'user_email', 'at', 'via',
])
// A ticket's page, joined as `p` (joinDataset), for its live name and stage: tickets keep only
// copies of them, which TransportNY's sync refreshed and nothing here writes.
export const pagesByKey = (ctx) => joinDataset(ctx, ctx.datasets.pages, 'p', ['page_key', 'name', 'stage', 'url'], [['page_key', 'page_key']])
// The ticket's page name, else its raw page key (a ticket whose page isn't tracked).
export const PAGE_DISP = "(case when p.data->>'name' is null or p.data->>'name' = '' then data->>'page_key' else p.data->>'name' end) as page_disp"

// A data section's element-data over `source`. `join`: extra sources by alias (joinDataset).
export const dataWrapper = (source) => ({ columns, filters = [], display = {}, join }) => JSON.stringify({
  externalSource: source, columns, filters: { op: 'AND', groups: filters },
  display: { usePagination: true, pageSize: 25, readyToLoad: true, fetchMode: 'smart', showAttribution: false, striped: false, ...display },
  data: [], join: { sources: join ? { ds: {}, ...join } : {} },
})

// One of the install's datasets left-joined onto a section's own source (alias `ds`), on
// `[dsColumn, joinedColumn]` pairs; the values a sync used to copy between datasets, read live.
// A joined section names its plain columns alias-prefixed (`ds.name`, `t.status`): every DMS table
// has `id` and `data`, so bare names are ambiguous, and rows come back keyed by the prefixed name.
// Joined sections stay read-only, since a live-edit save would write those prefixed keys as fields.
export const joinDataset = (ctx, ref, alias, columns, on) => {
  const env = `${ctx.app}+${ref.slug}`
  return {
    [alias]: {
      source: ref.source_id, view: ref.view_id, env, type: 'left', mergeStrategy: 'join',
      // the columns are required: the section menu reads them
      sourceInfo: {
        isDms: true, env, source_id: ref.source_id, view_id: ref.view_id,
        columns: columns.map(name => ({ name, display_name: name, type: 'text', source_id: ref.source_id })),
      },
      joinColumns: on.map(([dsColumn, joinSourceColumn]) => ({ dsColumn, joinSourceColumn })),
    },
  }
}
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
export const stat = (sql, label, over = {}) => calc(sql, label, { type: 'stat_value', origin: 'calculated-column', valueFontStyle: T.figure, ...over })
export const staticCell = (name, value, over = {}) => ({ name, origin: 'static', staticValue: value, show: true, hideHeader: true, ...over })

// ── section frames: a fused stack of cards in one band zeroes every interior edge ──
// On the theme's own panel surface and rule line (a literal `bg-…` class and an inline border
// colour), so a dark theme or a re-skinned site carries them along.
const RULE_LINE = { color: 'var(--t-rule)' }
export const PANEL = { bg: 'bg-[var(--t-panel)]', border: { top: true, left: true, right: true, bottom: true, ...RULE_LINE }, radius: { tl: true, tr: true, bl: true, br: true } }
export const PANEL_TOP = { bg: 'bg-[var(--t-panel)]', border: { top: true, left: true, right: true, bottom: true, ...RULE_LINE }, radius: { tl: true, tr: true }, padding: { bottom: '0' } }
export const PANEL_BOTTOM = { bg: 'bg-[var(--t-panel)]', border: { left: true, right: true, bottom: true, ...RULE_LINE }, radius: { bl: true, br: true }, padding: { top: '0' } }

// ── page parts ──
// A group's band is a layout-group style: the default theme's `content`, or one of the qa pattern's
// own (`qa_header`, `qa_content`, `qa_content_end`, qa.theme.js). Sizes are the default theme's
// fractions of its 6-column grid ('1/3', '1/2', '2/3', '1').
export const group = (name, index, displayName, theme = 'content') => ({ name, index, theme, position: 'content', displayName })
export const section = ({ trackingId, group, size = '1', type, data, ...frame }) => ({
  title: '', level: '0', group, trackingId, size, element: { 'element-type': type, 'element-data': data }, ...frame,
})
// A URL-bound page variable.
export const pageVariable = (id, searchKey) => ({ id, values: '', searchKey, useSearchParams: true })
