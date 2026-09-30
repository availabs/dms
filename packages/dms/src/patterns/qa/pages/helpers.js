import { DEFAULT_STATUSES } from '../ticketRecord'

// Section and column shapes for the QA pages, ported from TransportNY's control-room builders
// (src/themes/transportny/qa_skills/tools/builds/build_cr_*.mjs), which author the same native
// sections through the CLI. The shapes, and the gotchas noted beside them, are theirs.

// ── lexical ──
export const text = (t, format = 0, style = '') => ({ type: 'text', version: 1, detail: 0, format, mode: 'normal', style, text: t })
export const styled = (styleKey, ...children) => ({
  type: 'styled-paragraph', version: 1, direction: 'ltr', format: '', indent: 0, textFormat: 0, textStyle: '', styleKey, children,
})
export const lexical = (...nodes) => JSON.stringify({
  bgColor: 'rgba(0,0,0,0)', isCard: '', showToolbar: false,
  text: { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: nodes } },
})
export const GOLD = 'color:#CA8A04'

// ── pill colours (the keys double as a pill's edit-in-place options) ──
export const SEV_PILL = { Blocker: 'red', Major: 'amber', Minor: 'slate', Polish: 'zinc', Feature: 'blue' }
export const PRIO_PILL = { Now: 'red', Next: 'amber', Later: 'slate' }
export const STATUS_PILL = {
  Triage: 'slate', 'In progress': 'blue', 'In review': 'amber', 'Needs decision': 'ink', 'Needs data': 'zinc', Resolved: 'green', Closed: 'green',
}
export const CATEGORY_PILL = { bug: 'red', style: 'amber', data: 'blue', content: 'slate', enhancement: 'zinc' }
export const STAGE_PILL = {
  Proposed: 'zinc', Design: 'slate', Implemented: 'amber', QA: 'blue', 'Dev Acceptance': 'ink', 'Client Acceptance': 'green',
}
export const staticOptions = (map) => Object.keys(map).map((v) => ({ label: v, value: v }))

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
export const SOURCE_PILL = { AI: 'blue', Dev: 'slate', Client: 'ink' }
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
export const ticketsSource = ({ app, pattern, tickets }) => ({
  isDms: true, app, type: tickets.slug, name: `${pattern.name} — Tickets`,
  source_id: tickets.source_id, view_id: tickets.view_id,
  env: `${app}+${tickets.slug}`, srcEnv: `${app}+${tickets.slug}`,
  columns: TICKET_COLUMNS.map(name => ({ name, display_name: name, type: 'text' })),
})

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
export const staticCell = (name, value, over = {}) => ({ name, origin: 'static', staticValue: value, show: true, hideHeader: true, ...over })

// ── section frames: a fused stack of cards on a gap-0 band zeroes every interior edge ──
export const WHITE_CARD = { bg: 'white', border: { top: true, left: true, right: true, bottom: true }, radius: { tl: true, tr: true, bl: true, br: true } }
export const CARD_TOP = { bg: 'white', border: { top: true, left: true, right: true, bottom: true }, radius: { tl: true, tr: true }, padding: { bottom: '0' } }
export const CARD_MID = { bg: 'white', border: { left: true, right: true, bottom: true }, padding: { top: '0', bottom: '0' } }
export const CARD_BOTTOM = { bg: 'white', border: { left: true, right: true, bottom: true }, radius: { bl: true, br: true }, padding: { top: '0' } }

// ── page parts ──
export const group = (name, index, theme, displayName) => ({ name, index, theme, position: 'content', displayName })
export const section = ({ trackingId, group, size = '12', type, data, ...frame }) => ({
  title: '', level: '0', group, trackingId, size, element: { 'element-type': type, 'element-data': data }, ...frame,
})
// A URL-bound page variable.
export const pageVariable = (id, searchKey) => ({ id, values: '', searchKey, useSearchParams: true })
