import {
  text, styled, lexical, SEV_PILL, PRIO_PILL, STATUS_PILL, SOURCE_PILL, CATEGORY_PILL, STAGE_PILL, TNUM, SOURCE_CASE, sqlText,
  ticketsSource, dataWrapper, col, pcol, staticCell, WHITE_CARD, CARD_TOP, CARD_BOTTOM, group, section, pageVariable,
} from './helpers'

// The Ticket page (`ticket?id=<row id>`): breadcrumb, header, the ticket's body and Details rail
// (both edited in place), and comments. Ported from build_cr_tickets.mjs (TICKET DETAIL). `ctx` as
// for ticketsPage.
export function ticketPage(ctx) {
  const dw = dataWrapper(ticketsSource(ctx))
  const G = { crumb: 'ticket_crumb', hdr: 'ticket_header', body: 'ticket_body', com: 'ticket_comments' }
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
    trackingId: 'qa_ticket_crumb', group: G.crumb, type: 'Card',
    data: detail([rcalc(`('${sqlText(ctx.pattern.name)}     /     Tickets     /     ' || ${TNUM}) as crumb`, '', { valueFontStyle: 'metaXS' })], { cardBorder: false, cardsPadding: 0 }),
  }))

  // Header: kicker → badge row (+ All tickets) → title → target page line. Six max-content tracks
  // and a stretch tail; full-row cells span 6.
  S.push(section({
    trackingId: 'qa_ticket_header', group: G.hdr, type: 'Card',
    data: detail([
      staticCell('kick', '// ticket', { valueFontStyle: 'kicker', cellSpan: 6 }),
      rcalc(`${TNUM} as num`, '', { valueFontStyle: 'metaXS' }),
      pcol('severity', '', SEV_PILL, { hideHeader: true }),
      pcol('priority', '', PRIO_PILL, { hideHeader: true }),
      pcol('status', '', STATUS_PILL, { hideHeader: true }),
      rcalc("(case data->>'source' when 'ai' then 'AI found' when 'dev' then 'Dev found' when 'client' then 'Client found' else (data->>'source') end) as found", '',
        { type: 'status_pill', pillColors: { 'AI found': 'blue', 'Dev found': 'slate', 'Client found': 'ink' } }),
      staticCell('alltix', 'All tickets', { valueFontStyle: 'btnOutline', justify: 'right', isLink: true, location: `${ctx.baseUrl}/tickets`, searchParams: 'none' }),
      col('title', '', { hideHeader: true, valueFontStyle: 'displayMD', cellSpan: 6 }),
      staticCell('tgt', 'target ·', { valueFontStyle: 'proseSM' }),
      { name: 'page_name', customName: '', show: true, hideHeader: true, isLink: true, location: `${ctx.baseUrl}/page?key=`, searchParamsCol: 'page_key' },
      col('page_route', '', { hideHeader: true, valueFontStyle: 'metaMD' }),
      staticCell('pis', '· page is', { valueFontStyle: 'proseSM' }),
      pcol('page_stage', '', STAGE_PILL, { hideHeader: true }),
      staticCell('fill', ' ', { valueFontStyle: 'proseSM' }),
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
    trackingId: 'qa_ticket_body', group: G.body, size: '8', type: 'Card', ...WHITE_CARD,
    data: detail([
      tacol('description', 'description', { valueFontStyle: 'prose' }),
      tacol('steps', 'steps to reproduce', { valueFontStyle: 'prosePre' }),
      tacol('expected', 'expected', { valueFontStyle: 'prose' }),
      tacol('actual', 'actual', { valueFontStyle: 'prose' }),
      tacol('suggested_solution', 'suggested solution', { valueFontStyle: 'prosePre' }),
      tacol('resolution', 'resolution', { valueFontStyle: 'prosePre' }),
      { name: 'screenshot', customName: 'screenshot', show: true, hideHeader: false, type: 'image', imageSize: 'img8XL' },
      tacol('env', 'environment', { valueFontStyle: 'chip' }),
    ], {
      cellsGridSize: 1, cellsRowGap: 12, cardsPadding: 18, cardBorder: false, headerValueLayout: 'col',
      headerFontStyle: 'metaXS', allowEditInView: true, liveEdit: true, fetchMode: 'force',
    }),
  }))

  // Details rail: one section, its title a static first cell. Status and the workflow fields are
  // edited in place (live edit saves on change).
  const fld = (over = {}) => ({ hideHeader: false, headerFontStyle: 'metaXS', cellBorderBottom: true, ...over })
  const efld = (over = {}) => fld({ allowEditInView: true, ...over })
  S.push(section({
    trackingId: 'qa_ticket_rail', group: G.body, size: '4', type: 'Card', ...WHITE_CARD,
    data: detail([
      staticCell('dtitle', 'Details', { valueFontStyle: 'cardTitleSM', cellBorderBottom: true }),
      pcol('status', 'status', STATUS_PILL, efld()),
      rcalc(`${SOURCE_CASE} as src`, 'source', { type: 'status_pill', pillColors: SOURCE_PILL, hideHeader: false, headerFontStyle: 'metaXS', cellBorderBottom: true }),
      col('assignee', 'assignee', efld({ valueFontStyle: 'proseSM' })),
      col('reporter', 'reporter', fld({ valueFontStyle: 'proseSM' })),
      pcol('severity', 'severity', SEV_PILL, efld()),
      pcol('priority', 'priority', PRIO_PILL, efld()),
      pcol('category', 'category', CATEGORY_PILL, efld()),
      col('effort', 'effort', efld({ valueFontStyle: 'metaMD' })),
      {
        name: 'duplicate_of', customName: 'duplicate of', show: true, hideHeader: false, headerFontStyle: 'metaXS', cellBorderBottom: true,
        valueFontStyle: 'metaMD', isLink: true, location: `${ctx.baseUrl}/ticket?id=`, searchParams: 'value',
      },
      col('verified', 'verified', efld({ valueFontStyle: 'metaMD' })),
      col('verified_by', 'verified by', efld({ valueFontStyle: 'proseSM' })),
      {
        name: 'page_name', customName: 'target page', show: true, hideHeader: false, headerFontStyle: 'metaXS', cellBorderBottom: true,
        isLink: true, location: `${ctx.baseUrl}/page?key=`, searchParamsCol: 'page_key',
      },
      col('opened', 'opened', fld({ valueFontStyle: 'metaMD' })),
      col('resolved_date', 'resolved', fld({ valueFontStyle: 'metaMD' })),
      col('updated', 'updated', { hideHeader: false, headerFontStyle: 'metaXS', valueFontStyle: 'metaMD' }),
      col('page_key', '', { hideHeader: true, hideValue: true }),
    ], { cellsGridSize: 1, cellsRowGap: 6, cardsPadding: 14, headerValueLayout: 'col', liveEdit: true, allowEditInView: true }),
  }))

  S.push(section({ trackingId: 'qa_ticket_comments_title', group: G.com, type: 'lexical', data: lexical(styled('cardTitleSM', text('Comments'))), ...CARD_TOP }))
  S.push(section({
    trackingId: 'qa_ticket_comments', group: G.com, type: 'Card', ...CARD_BOTTOM,
    data: detail([col('comments', '', { hideHeader: true, valueFontStyle: 'prosePre' })], { cellsGridSize: 1, cardsPadding: 18, cardBorder: false }),
  }))

  return {
    title: 'Ticket', url_slug: 'ticket', index: 2, hide_in_nav: true,
    section_groups: [
      group(G.crumb, 0, 'breadcrumb', 'Breadcrumb'),
      group(G.hdr, 1, 'header', 'Header'),
      group(G.body, 2, 'content', 'Ticket body'),
      group(G.com, 3, 'content', 'Comments'),
    ],
    sections: S,
    filters: [pageVariable('qa-ticket-id', 'id')],
  }
}
