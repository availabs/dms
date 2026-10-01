import {
  T, cardTitle, SEV_PILL, PRIO_PILL, STATUS_PILL, SOURCE_PILL, CATEGORY_PILL, STAGE_PILL, TNUM, SOURCE_CASE, sqlText,
  ticketsSource, dataWrapper, col, pcol, staticCell, WHITE_CARD, CARD_TOP, CARD_BOTTOM, group, section, pageVariable,
} from './helpers'

// The Ticket page (`ticket?id=<row id>`): breadcrumb, header, the ticket's body and Details rail
// (both edited in place), and comments. Ported from build_cr_tickets.mjs (TICKET DETAIL). `ctx` as
// for ticketsPage.
export function ticketPage(ctx) {
  const dw = dataWrapper(ticketsSource(ctx))
  const G = { hdr: 'ticket_header', body: 'ticket_body', com: 'ticket_comments' }
  // `?id=` → the DMS row id. `id` isn't a dataset column, so the filter compiler passes it through
  // as the split table's own key; requireResolved holds the query until the parameter arrives.
  const detail = (columns, display = {}) => dw({
    columns,
    filters: [{ col: 'id', op: 'filter', value: [], usePageFilters: true, searchParamKey: 'id', requireResolved: true }],
    display: { usePagination: false, pageSize: 1, fetchMode: 'smart', ...display },
  })
  // Row-level calc: no fn (see calc in helpers).
  const rcalc = (sql, label, over = {}) => ({
    name: sql, type: 'calculated', normalName: (sql.match(/ as (\w+)$/) || [])[1] || label,
    display_name: label, customName: label, show: true, formatFn: ' ', justify: 'left', hideHeader: true, ...over,
  })
  const S = []

  S.push(section({
    trackingId: 'qa_ticket_crumb', group: G.hdr, type: 'Card',
    data: detail([rcalc(`('${sqlText(ctx.pattern.name)}  /  Tickets  /  ' || ${TNUM}) as crumb`, '', { valueFontStyle: T.meta })], { cardBorder: false, cardsPadding: 0 }),
  }))

  // Header: badge row (+ All tickets) → title → target page line. Six max-content tracks and a
  // stretch tail; full-row cells span 6.
  S.push(section({
    trackingId: 'qa_ticket_header', group: G.hdr, type: 'Card',
    data: detail([
      rcalc(`${TNUM} as num`, '', { valueFontStyle: T.strong }),
      pcol('severity', '', SEV_PILL, { hideHeader: true }),
      pcol('priority', '', PRIO_PILL, { hideHeader: true }),
      pcol('status', '', STATUS_PILL, { hideHeader: true }),
      rcalc("(case data->>'source' when 'ai' then 'AI found' when 'dev' then 'Dev found' when 'client' then 'Client found' else (data->>'source') end) as found", '',
        { type: 'status_pill', pillColors: { 'AI found': 'blue', 'Dev found': 'gray', 'Client found': 'orange' } }),
      staticCell('alltix', 'All tickets', { justify: 'right', isLink: true, location: `${ctx.baseUrl}/tickets`, searchParams: 'none' }),
      col('title', '', { hideHeader: true, valueFontStyle: T.subtitle, cellSpan: 6 }),
      staticCell('tgt', 'target ·', { valueFontStyle: T.bodySmall }),
      { name: 'page_name', customName: '', show: true, hideHeader: true, isLink: true, location: `${ctx.baseUrl}/page?key=`, searchParamsCol: 'page_key' },
      col('page_route', '', { hideHeader: true, valueFontStyle: T.value }),
      staticCell('pis', '· page is', { valueFontStyle: T.bodySmall }),
      pcol('page_stage', '', STAGE_PILL, { hideHeader: true }),
      staticCell('fill', ' ', { valueFontStyle: T.bodySmall }),
      // fetched for the page link's searchParamsCol, not shown
      col('page_key', '', { hideHeader: true, hideValue: true }),
    ], {
      cellsTracksTemplate: 'max-content max-content max-content max-content max-content minmax(0,1fr)',
      cellsGridGap: 10, cellsRowGap: 6, cellsPadding: 0, cardsPadding: 0, cardBorder: false, cellsVAlign: 'center',
    }),
  }))

  // Body: the ticket's prose, edited in place. Textarea columns, since a text column edits as a
  // single-line input.
  const tacol = (name, label, over = {}) => col(name, label, { type: 'textarea', allowEditInView: true, hideHeader: false, ...over })
  S.push(section({
    trackingId: 'qa_ticket_body', group: G.body, size: '2/3', type: 'Card', ...WHITE_CARD,
    data: detail([
      tacol('description', 'description', { valueFontStyle: T.body }),
      tacol('steps', 'steps to reproduce', { valueFontStyle: T.body }),
      tacol('expected', 'expected', { valueFontStyle: T.body }),
      tacol('actual', 'actual', { valueFontStyle: T.body }),
      tacol('suggested_solution', 'suggested solution', { valueFontStyle: T.body }),
      tacol('resolution', 'resolution', { valueFontStyle: T.body }),
      { name: 'screenshot', customName: 'screenshot', show: true, hideHeader: false, type: 'image', imageSize: 'img8XL' },
      tacol('env', 'environment', { valueFontStyle: T.value }),
    ], {
      cellsGridSize: 1, cellsRowGap: 12, cardsPadding: 18, cardBorder: false, headerValueLayout: 'col',
      headerFontStyle: T.label, allowEditInView: true, liveEdit: true, fetchMode: 'force',
    }),
  }))

  // Details rail: one section, its title a static first cell. Status and the workflow fields are
  // edited in place (live edit saves on change).
  const fld = (over = {}) => ({ hideHeader: false, headerFontStyle: T.label, cellBorderBottom: true, ...over })
  const efld = (over = {}) => fld({ allowEditInView: true, ...over })
  S.push(section({
    trackingId: 'qa_ticket_rail', group: G.body, size: '1/3', type: 'Card', ...WHITE_CARD,
    data: detail([
      staticCell('dtitle', 'Details', { valueFontStyle: T.heading, cellBorderBottom: true }),
      pcol('status', 'status', STATUS_PILL, efld()),
      rcalc(`${SOURCE_CASE} as src`, 'source', { type: 'status_pill', pillColors: SOURCE_PILL, hideHeader: false, headerFontStyle: T.label, cellBorderBottom: true }),
      col('assignee', 'assignee', efld({ valueFontStyle: T.value })),
      col('reporter', 'reporter', fld({ valueFontStyle: T.value })),
      pcol('severity', 'severity', SEV_PILL, efld()),
      pcol('priority', 'priority', PRIO_PILL, efld()),
      pcol('category', 'category', CATEGORY_PILL, efld()),
      col('effort', 'effort', efld({ valueFontStyle: T.value })),
      {
        name: 'duplicate_of', customName: 'duplicate of', show: true, hideHeader: false, headerFontStyle: T.label, cellBorderBottom: true,
        isLink: true, location: `${ctx.baseUrl}/ticket?id=`, searchParams: 'value',
      },
      col('verified', 'verified', efld({ valueFontStyle: T.value })),
      col('verified_by', 'verified by', efld({ valueFontStyle: T.value })),
      {
        name: 'page_name', customName: 'target page', show: true, hideHeader: false, headerFontStyle: T.label, cellBorderBottom: true,
        isLink: true, location: `${ctx.baseUrl}/page?key=`, searchParamsCol: 'page_key',
      },
      col('opened', 'opened', fld({ valueFontStyle: T.value })),
      col('resolved_date', 'resolved', fld({ valueFontStyle: T.value })),
      col('updated', 'updated', { hideHeader: false, headerFontStyle: T.label, valueFontStyle: T.value }),
      col('page_key', '', { hideHeader: true, hideValue: true }),
    ], { cellsGridSize: 1, cellsRowGap: 6, cardsPadding: 14, headerValueLayout: 'col', liveEdit: true, allowEditInView: true }),
  }))

  S.push(section({ trackingId: 'qa_ticket_comments_title', group: G.com, type: 'lexical', data: cardTitle('Comments'), ...CARD_TOP }))
  S.push(section({
    trackingId: 'qa_ticket_comments', group: G.com, type: 'Card', ...CARD_BOTTOM,
    data: detail([col('comments', '', { hideHeader: true, valueFontStyle: T.body })], { cellsGridSize: 1, cardsPadding: 18, cardBorder: false }),
  }))

  return {
    title: 'Ticket', url_slug: 'ticket', index: 2, hide_in_nav: true,
    section_groups: [group(G.hdr, 0, 'Header'), group(G.body, 1, 'Ticket body'), group(G.com, 2, 'Comments')],
    sections: S,
    filters: [pageVariable('qa-ticket-id', 'id')],
  }
}
