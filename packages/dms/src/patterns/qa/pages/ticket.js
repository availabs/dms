import { PAGE_STAGES } from '../ticketRecord'
import {
  T, SEV_PILL, PRIO_PILL, STATUS_PILL, CATEGORY_PILL, TNUM, tnum, PAGE_DISP, siteCase, sqlText, CLOSED_STATUSES, ticketFieldLabel,
  ticketsSource, historySource, pagesByKey, dataWrapper, col, pcol, calc, staticCell, PANEL, PANEL_TOP, PANEL_BOTTOM,
  group, section, pageVariable,
} from './helpers'

// The Ticket page (`ticket?id=<row id>`; mockup: tessera design_system_v6 pages/qa-ticket.html): a
// header band (crumb + actions, badges, title, target line), the ticket's body and details rail (both
// edited in place), comments and the ticket's change history. The look is the qa pattern's own styles
// (qa.theme.js). Data shapes are ported from build_cr_tickets.mjs (TICKET DETAIL). `ctx` as for
// ticketsPage.
export function ticketPage(ctx) {
  const dw = dataWrapper(ticketsSource(ctx))
  const G = { hdr: 'ticket_header', body: 'ticket_body', com: 'ticket_comments' }
  // `?id=` → the DMS row id. `id` isn't a dataset column, so the filter compiler passes it through
  // as the split table's own key; requireResolved holds the query until the parameter arrives.
  const byId = (idCol = 'id') => [{ col: idCol, op: 'filter', value: [], usePageFilters: true, searchParamKey: 'id', requireResolved: true }]
  const detail = (columns, display = {}) => dw({
    columns,
    filters: byId(),
    display: { usePagination: false, pageSize: 1, fetchMode: 'smart', headerValueLayout: 'col', ...display },
  })
  // The header rows join the ticket's page (`p`) for its live name, stage and URL, so their columns
  // are alias-prefixed and the `?id=` filter reads `ds.id`.
  const joined = (columns, display = {}) => dw({
    columns,
    filters: byId('ds.id'),
    join: pagesByKey(ctx),
    display: {
      usePagination: false, pageSize: 1, fetchMode: 'smart', cardStyle: 'qa_header', headerValueLayout: 'col',
      cellsColumnGap: 8, cellsRowGap: 0, cardsPadding: 0, cardBorder: false, cellsVAlign: 'center',
      // refetch after a rail pill/select change, so the badges match
      _functions: { subscribers: [{ functionId: 'data_refresh', enabled: true, paramKey: 'ticket_v' }] },
      ...display,
    },
  })
  // Row-level calc: no fn (see calc in helpers).
  const rcalc = (sql, label, over = {}) => ({
    name: sql, type: 'calculated', normalName: (sql.match(/ as (\w+)$/) || [])[1] || label,
    display_name: label, customName: label, show: true, formatFn: ' ', justify: 'left', hideHeader: true, ...over,
  })
  // the header rows sit close together inside the band
  const ROW = { padding: { top: '0', bottom: '2' } }
  const S = []

  // ── header band: four rows, each its own Card (their cells don't share column widths) ──
  // 1 · crumb + actions
  S.push(section({
    trackingId: 'qa_ticket_crumb', group: G.hdr, type: 'Card', ...ROW,
    data: joined([
      rcalc(`('${sqlText(ctx.pattern.name)}  /  Tickets  /  ' || ${tnum('ds.id')}) as crumb`, '', { valueFontStyle: T.crumb }),
      // the tracked page's own address, when it has one
      rcalc("(case when p.data->>'url' is null then '' else (p.data->>'url') end) as open_url", '', {
        isLink: true, linkText: 'open page ↗', valueFontStyle: T.buttonSM, justify: 'right',
      }),
      staticCell('alltix', 'all tickets', { isLink: true, location: `${ctx.baseUrl}/tickets`, searchParams: 'none', valueFontStyle: T.buttonSM, justify: 'right' }),
    ], { cellsGridSize: 3, cellsTracksTemplate: 'minmax(0,1fr) auto auto' }),
  }))
  // 2 · badges: number · severity · status · priority · who found it
  S.push(section({
    trackingId: 'qa_ticket_badges', group: G.hdr, type: 'Card', ...ROW,
    data: joined([
      rcalc(`${tnum('ds.id')} as num`, '', { valueFontStyle: T.mono }),
      pcol('ds.severity', '', SEV_PILL, { hideHeader: true }),
      pcol('ds.status', '', STATUS_PILL, { hideHeader: true }),
      pcol('ds.priority', '', PRIO_PILL, { hideHeader: true }),
      rcalc("(case data->>'source' when 'ai' then 'AI found' when 'dev' then 'Dev found' when 'client' then 'Client found' else (data->>'source') end) as found", '',
        { valueFontStyle: T.small }),
      staticCell('b_fill', ''),
    ], { cellsGridSize: 6, cellsTracksTemplate: 'repeat(5, max-content) minmax(0,1fr)' }),
  }))
  // 3 · the title
  S.push(section({
    trackingId: 'qa_ticket_title', group: G.hdr, type: 'Card', ...ROW,
    data: joined([col('ds.title', '', { hideHeader: true, valueFontStyle: T.pageTitle })], { cellsGridSize: 1 }),
  }))
  // 4 · target: the page (site / name), the route it was filed from, and the page's stage
  const siteLabel = siteCase(ctx.siteLabels)
  S.push(section({
    trackingId: 'qa_ticket_target', group: G.hdr, type: 'Card', padding: { top: '0', bottom: '0' },
    data: joined([
      staticCell('t_lbl', 'target', { valueFontStyle: T.eyebrow }),
      rcalc(`(${siteLabel} || ' / ' || ${PAGE_DISP.replace(/ as page_disp$/, '')}) as target_disp`, '', {
        isLink: true, location: `${ctx.baseUrl}/page?key=`, searchParamsCol: 'ds.page_key', valueFontStyle: T.link,
      }),
      // the route the ticket was filed from, its own (not the page's)
      col('ds.page_route', '', { hideHeader: true, valueFontStyle: T.mono }),
      staticCell('t_dot', '·', { valueFontStyle: T.smallMuted }),
      staticCell('t_stage', 'page stage', { valueFontStyle: T.eyebrow }),
      // the library's compact stage meter (accent fill), with the stage name and "n of 6"
      col('p.stage', '', { hideHeader: true, type: 'stage_progress', stages: PAGE_STAGES, activeStyle: 'meter' }),
      staticCell('t_fill', ''),
      // fetched for the page link's searchParamsCol, not shown
      col('ds.page_key', '', { hideHeader: true, selectOnly: true }),
    ], { cellsGridSize: 7, cellsTracksTemplate: 'repeat(6, max-content) minmax(0,1fr)' }),
  }))

  // ── body: the ticket's prose, edited in place. Textarea columns (a text column edits as a
  // single-line input); each field is a band of the card, the rule below it the cell's border. ──
  const BAND = { cellPaddingTop: 16, cellPaddingBottom: 16, cellPaddingLeft: 24, cellPaddingRight: 24, cellBorderBottom: true }
  const field = (name, label, placeholder, over = {}) => col(name, label, {
    type: 'textarea', allowEditInView: true, hideHeader: false, headerFontStyle: T.eyebrow, valueFontStyle: T.prose, placeholder, cellSpan: 2, ...BAND, ...over,
  })
  const LEFT = { cellSpan: 1, cellPaddingRight: 12 }
  const RIGHT = { cellSpan: 1, cellPaddingLeft: 12 }
  S.push(section({
    trackingId: 'qa_ticket_body', group: G.body, size: '2/3', type: 'Card', ...PANEL,
    data: detail([
      field('description', 'description', 'What happened?', { cellPaddingTop: 20 }),
      field('steps', 'steps to reproduce', 'How to make it happen again'),
      field('expected', 'expected', 'What should happen', LEFT),
      field('actual', 'actual', 'What happens instead', RIGHT),
      field('suggested_solution', 'suggested solution', 'Add a suggested solution', LEFT),
      field('resolution', 'resolution', 'Add how it was fixed', RIGHT),
      { name: 'screenshot', customName: 'screenshot', show: true, hideHeader: false, headerFontStyle: T.eyebrow, type: 'image', imageSize: 'img8XL', cellSpan: 2, ...BAND },
      // captured by the report form; read-only chips
      col('env', 'environment', { type: 'kv_chips', hideHeader: false, headerFontStyle: T.eyebrow, emptyText: 'none captured', cellSpan: 2, ...BAND, cellBorderBottom: false, cellPaddingBottom: 20 }),
    ], {
      cardStyle: 'qa_body', cellsGridSize: 2, cellsColumnGap: 0, cellsRowGap: 0, cardsPadding: 0, cardBorder: false,
      allowEditInView: true, liveEdit: true, fetchMode: 'force',
    }),
  }))

  // ── details rail: label | value rows in groups (workflow, links, verification, record). The
  // workflow and verification fields are edited in place (live edit saves on change); the record is
  // read-only. ──
  const PAD = { cellPaddingLeft: 16, cellPaddingRight: 16, cellPaddingTop: 2, cellPaddingBottom: 2 }
  const row = (over = {}) => ({ hideHeader: false, headerFontStyle: T.label, cellSpan: 2, ...PAD, ...over })
  const edit = (over = {}) => row({ allowEditInView: true, ...over })
  const pillEdit = (over = {}) => edit({ activeStyle: 'qa_inline', ...over })
  // a text column with no type renders a plain div in a Card (not editable); `text` makes it an input
  const text = (over = {}) => edit({ type: 'text', valueFontStyle: T.body, ...over })
  const groupLabel = (name, text) => staticCell(name, text, { valueFontStyle: T.eyebrow, cellSpan: 2, cellBorderTop: true, ...PAD, cellPaddingTop: 12, cellPaddingBottom: 4 })
  // A date as MM/DD/YYYY HH:MI (as stored, UTC), formatted in SQL: a Card strips the spaces out of
  // any formatFn result (Card.jsx, the generic formatFn branch), so formatFn 'datetime' would print
  // "09/24/202610:00am". Comma-free substrings: the UDA SELECT list is comma-split.
  const date = (name, label) => {
    const d = `(data->>'${name}')`
    return rcalc(`(case when ${d} is null or ${d} = '' then '' else (substring(${d} from 6 for 2) || '/' || substring(${d} from 9 for 2) || '/' || substring(${d} from 1 for 4) || ' ' || substring(${d} from 12 for 5)) end) as ${name}_disp`,
      label, row({ editable: false, valueFontStyle: T.mono }))
  }
  S.push(section({
    trackingId: 'qa_ticket_rail', group: G.body, size: '1/3', type: 'Card', ...PANEL,
    data: detail([
      staticCell('r_title', 'Details', { valueFontStyle: T.cardTitle, cellPaddingLeft: 16, cellPaddingTop: 14, cellPaddingBottom: 12 }),
      staticCell('r_cap', 'saves as you edit', { valueFontStyle: T.eyebrow, justify: 'right', cellVAlign: 'center', cellPaddingRight: 16, cellPaddingTop: 2 }),
      // closing stamps resolved_date (the first close's date is kept), reopening clears it
      pcol('status', 'Status', STATUS_PILL, pillEdit({ cellBorderTop: true, cellPaddingTop: 10, setDateOnValue: { field: 'resolved_date', values: CLOSED_STATUSES } })),
      pcol('severity', 'Severity', SEV_PILL, pillEdit()),
      pcol('priority', 'Priority', PRIO_PILL, pillEdit()),
      pcol('category', 'Category', CATEGORY_PILL, pillEdit()),
      col('assignee', 'Assignee', text({ placeholder: 'Unassigned' })),
      col('effort', 'Effort', text({ placeholder: '—', cellPaddingBottom: 10 })),
      groupLabel('g_links', 'links'),
      // The rail is a live-edit Card, so it can't join the pages (see joinDataset): the stored
      // name, else the page key. The header shows the page's live name.
      rcalc("(case when (data->>'page_name') is null or (data->>'page_name') = '' then (data->>'page_key') else (data->>'page_name') end) as target_page", 'Target page',
        row({ editable: false, isLink: true, location: `${ctx.baseUrl}/page?key=`, searchParamsCol: 'page_key', valueFontStyle: T.link })),
      col('duplicate_of', 'Duplicate of', text({ placeholder: 'Ticket #', cellPaddingBottom: 10 })),
      groupLabel('g_verify', 'verification'),
      col('verified', 'Verified', text({ placeholder: 'Not yet' })),
      col('verified_by', 'Verified by', text({ placeholder: '—', cellPaddingBottom: 10 })),
      groupLabel('g_record', 'record'),
      col('reporter', 'Reporter', row({ editable: false, valueFontStyle: T.body })),
      date('opened', 'Opened'),
      date('updated', 'Updated'),
      { ...date('resolved_date', 'Resolved'), cellPaddingBottom: 14 },
      col('page_key', '', { hideHeader: true, selectOnly: true }),
      // fetched (not shown) so the status pill's setDateOnValue can keep a ticket's first close date
      col('resolved_date', '', { hideHeader: true, selectOnly: true }),
    ], {
      cardStyle: 'qa_rail', cellsGridSize: 2, cellsColumnGap: 0, cellsRowGap: 0, cardsPadding: 0, cardBorder: false,
      headerValueLayout: 'row', headerWidth: 30, valueWidth: 70, cellsVAlign: 'center',
      liveEdit: true, allowEditInView: true,
      // a pill/select change publishes 'ticket_v' once saved; the header refetches on it
      _functions: { providers: [{ functionId: 'save_publish', enabled: true, paramKey: 'ticket_v' }] },
    }),
  }))

  // ── comments: the thread (read-only; writing one is planned) ──
  S.push(section({
    trackingId: 'qa_ticket_comments', group: G.com, size: '2/3', type: 'Card', ...PANEL,
    data: detail([
      staticCell('c_title', 'Comments', { valueFontStyle: T.cardTitle, cellPaddingBottom: 8 }),
      col('comments', '', { type: 'comment_thread', hideHeader: true, emptyText: 'No comments yet' }),
      staticCell('c_add', 'add a comment · planned', { type: 'status_pill', pillColors: { 'add a comment · planned': 'qa_planned' }, cellPaddingTop: 12 }),
    ], { cardStyle: 'qa_summary', cellsGridSize: 1, cellsRowGap: 0, cardsPadding: 20, cardBorder: false }),
  }))
  // ── history: every change to the ticket's tracked fields, newest first. The server writes the
  // rows inside each save (datasets.js, `change_history`), so edits from the rail, Page QA and the
  // CLI all list here. Refetches after a rail pill/select change ('ticket_v'). ──
  if (ctx.datasets.history) {
    const dwHistory = dataWrapper(historySource(ctx))
    const byRow = [{ col: 'row_id', op: 'filter', value: [], usePageFilters: true, searchParamKey: 'id', requireResolved: true }]
    const refresh = { _functions: { subscribers: [{ functionId: 'data_refresh', enabled: true, paramKey: 'ticket_v' }] } }
    const FIELD = ticketFieldLabel()
    const shown = (name) => `(case when (data->>'${name}') is null or (data->>'${name}') = '' then '—' else (data->>'${name}') end)`
    // as stored (UTC), like the rail's dates: comma-free substrings, the SELECT list is comma-split.
    // The list's widths add up to 620 px, inside the 2/3 panel (646 px at a 1440 px window).
    const at = "(data->>'at')"
    S.push(section({
      trackingId: 'qa_ticket_history', group: G.com, size: '2/3', type: 'Card', ...PANEL_TOP,
      data: dwHistory({
        columns: [
          staticCell('h_title', 'History', { valueFontStyle: T.cardTitle }),
          calc("(count(*)::text || ' change' || (case when count(*) = 1 then '' else 's' end)) as h_count", '',
            { hideHeader: true, normalName: 'h_count', valueFontStyle: T.small, cellVAlign: 'center' }),
        ],
        filters: byRow,
        display: {
          usePagination: false, pageSize: 1, fetchMode: 'smart', cardStyle: 'qa_summary', cardBorder: false, headerValueLayout: 'col',
          cellsGridSize: 2, cellsTracksTemplate: 'max-content minmax(0,1fr)', cellsColumnGap: 10, cellsRowGap: 0, cardsPadding: 18, ...refresh,
        },
      }),
    }))
    S.push(section({
      trackingId: 'qa_ticket_history_list', group: G.com, size: '2/3', type: 'Spreadsheet', ...PANEL_BOTTOM,
      data: dwHistory({
        columns: [
          { name: '(id)::bigint as idsort', type: 'calculated', normalName: 'idsort', display_name: '', customName: '', show: true, formatFn: ' ', hideHeader: true, size: 0, sort: 'desc' },
          {
            name: `(case when ${at} is null or ${at} = '' then '' else (substring(${at} from 6 for 2) || '/' || substring(${at} from 9 for 2) || '/' || substring(${at} from 1 for 4) || ' ' || substring(${at} from 12 for 5)) end) as when_disp`,
            type: 'calculated', normalName: 'when_disp', customName: 'When', show: true, formatFn: ' ', justify: 'left', size: 128, valueFontStyle: T.mono,
          },
          { name: `${FIELD} as field_disp`, type: 'calculated', normalName: 'field_disp', customName: 'Field', show: true, formatFn: ' ', justify: 'left', size: 92, valueFontStyle: T.strong },
          {
            name: `(${shown('old_value')} || '  →  ' || ${shown('new_value')}) as change_disp`,
            type: 'calculated', normalName: 'change_disp', customName: 'Change', show: true, formatFn: ' ', justify: 'left', size: 180, stretch: true, valueFontStyle: T.body,
          },
          {
            name: "((case when (data->>'user_email') is null then '' else (data->>'user_email') end) || (case data->>'via' when 'cli' then ' · CLI' when 'agent' then ' · agent' else '' end)) as who_disp",
            type: 'calculated', normalName: 'who_disp', customName: 'By', show: true, formatFn: ' ', justify: 'left', size: 220, valueFontStyle: T.small,
          },
        ],
        filters: byRow,
        display: {
          usePagination: true, pageSize: 25, fetchMode: 'smart', autoResize: false, tableStyle: 'qa_list',
          emptyRowMode: 'placeholder', emptyRowText: 'No changes yet', ...refresh,
        },
      }),
    }))
  }

  return {
    title: 'Ticket', url_slug: 'ticket', index: 2, hide_in_nav: true,
    section_groups: [
      group(G.hdr, 0, 'Header', 'qa_header'), group(G.body, 1, 'Ticket body', 'qa_content'), group(G.com, 2, 'Comments', 'qa_content_end'),
    ],
    sections: S,
    filters: [pageVariable('qa-ticket-id', 'id')],
  }
}
