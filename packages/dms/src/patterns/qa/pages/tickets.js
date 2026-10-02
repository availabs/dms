import {
  T, crumb, pageTitle, SEV_PILL, STATUS_PILL, SOURCE_PILL, staticOptions, OPEN, CLOSED, CLOSED_STATUSES, st, W, tnum,
  SOURCE_CASE, PAGE_DISP, siteCase, ticketsSource, pagesByKey, dataWrapper, col, pcol, calc, stat, staticCell,
  WHITE_CARD, CARD_TOP, CARD_MID, CARD_BOTTOM, group, section, pageVariable,
} from './helpers'

// The Tickets page: header, the "Where tickets stand" summary and opened/resolved charts, then
// filters and the tickets table. Ported from build_cr_tickets.mjs (TICKETS LIST). `ctx`:
// { app, pattern, baseUrl, tickets: {slug, source_id, view_id}, siteLabels, addTicketUrl }.
export function ticketsPage(ctx) {
  const source = ticketsSource(ctx)
  const dw = dataWrapper(source)
  const agg = (columns, display = {}) => dw({ columns, display: { usePagination: false, pageSize: 1, cardBorder: false, ...display } })
  const G = { hdr: 'tickets_header', sum: 'tickets_summary', tbl: 'tickets_table' }
  const hasLabels = Object.keys(ctx.siteLabels || {}).length > 0
  const S = []

  S.push(section({ trackingId: 'qa_tickets_crumb', group: G.hdr, type: 'lexical', data: crumb(ctx.pattern.name, 'Tickets') }))
  S.push(section({ trackingId: 'qa_tickets_title', group: G.hdr, size: ctx.addTicketUrl ? '2/3' : '1', type: 'lexical', data: pageTitle('Tickets') }))
  // "+ Add ticket" opens the tickets table in the Datasets admin, when one lists the install's datasets.
  if (ctx.addTicketUrl) {
    S.push(section({
      trackingId: 'qa_tickets_add', group: G.hdr, size: '1/3', type: 'Card', height: 'fill',
      data: dw({
        columns: [staticCell('add_ticket', '+ Add ticket', {
          justify: 'right', isLink: true, location: ctx.addTicketUrl, searchParams: 'none', cellPaddingTop: 12,
        })],
        display: { usePagination: false, pageSize: 1, cardBorder: false, cellsGridSize: 1, cardsPadding: 0 },
      }),
    }))
  }

  // ── "Where tickets stand": title row → flow strip → stats row, fused into one card ──
  S.push(section({
    trackingId: 'qa_tickets_summary_title', group: G.sum, type: 'Card', ...CARD_TOP,
    data: agg([
      staticCell('t_title', 'Where tickets stand', { valueFontStyle: T.heading }),
      staticCell('t_cap', 'lifecycle · reported → resolved', { valueFontStyle: T.meta, justify: 'right' }),
    ], { cellsGridSize: 2, cellsGridGap: 10, cardsPadding: 14, cellsVAlign: 'center', headerValueLayout: 'col' }),
  }))
  const step = (stepColor, over = {}) => ({ type: 'flow_step', stepColor, connector: true, hideHeader: true, ...over })
  S.push(section({
    trackingId: 'qa_tickets_flow', group: G.sum, type: 'Card', ...CARD_MID,
    data: agg([
      calc(`(count(*) filter (where ${st()} = 'Triage'))::text as c_triage`, 'Triage', step('neutral')),
      calc(`(count(*) filter (where ${st()} = 'In progress'))::text as c_prog`, 'In progress', step('info')),
      calc(`(count(*) filter (where ${st()} = 'In review'))::text as c_review`, 'In review', step('warn')),
      calc(`(count(*) filter (where ${st()} in ${CLOSED}))::text as c_done`, 'Resolved / closed', step('done', { connector: false, stepTint: true })),
    ], { cellsGridSize: 4, cellsGridGap: 6, cellsRowGap: 8, cardsPadding: 14 }),
  }))
  // One 12-cell card so the three stat groups (resolution | open by severity | found by) share rows.
  const leg = (over = {}) => ({ valueFontStyle: T.value, headerFontStyle: T.label, headerValueLayout: 'col', justify: 'right', cellSpan: 1, ...over })
  const resolution = `coalesce(round(100.0 * sum(${W}) filter (where ${st()} in ${CLOSED}) / nullif(sum(${W}),0)),0)`
  S.push(section({
    trackingId: 'qa_tickets_stats', group: G.sum, type: 'Card', ...CARD_BOTTOM,
    data: agg([
      stat(`(${resolution}::text || '%') as res`, 'resolution', { headerFontStyle: T.label, justify: 'right', cellSpan: 4 }),
      staticCell('s_lbl', 'open by severity', { valueFontStyle: T.meta, cellSpan: 5 }),
      staticCell('f_lbl', 'found by', { valueFontStyle: T.meta, cellSpan: 3 }),
      // A data_bar in a row-aligned card needs col layout, or it collapses to its content width.
      {
        name: `${resolution}::text as res_bar`, type: 'data_bar', origin: 'calculated-column', fn: 'exempt', formatFn: ' ', show: true,
        hideHeader: true, cellSpan: 4, barMin: 0, barMax: 100, headerValueLayout: 'col',
      },
      ...Object.keys(SEV_PILL).map((sev) =>
        calc(`(count(*) filter (where ${st()} in ${OPEN} and data->>'severity' = '${sev}'))::text as s_${sev.toLowerCase()}`, sev, leg())),
      calc(`(count(*) filter (where data->>'source' = 'ai'))::text as f_ai`, 'AI', leg()),
      calc(`(count(*) filter (where data->>'source' = 'dev'))::text as f_dev`, 'Dev', leg()),
      calc(`(count(*) filter (where data->>'source' = 'client'))::text as f_client`, 'Client', leg()),
      calc(`((count(*) filter (where ${st()} in ${OPEN}))::text || ' open · ' || (count(*) filter (where ${st()} in ${CLOSED}))::text || ' done') as od`, '',
        { valueFontStyle: T.value, hideHeader: true, cellSpan: 4 }),
    ], { cellsGridSize: 12, cellsGridGap: 12, cellsRowGap: 4, cardsPadding: 14, headerValueLayout: 'row', cellsVAlign: 'center' }),
  }))

  // ── per-day charts on a time x-axis: bars sit at their real date, empty days are gaps ──
  const barChart = ({ xExpr, xName, color, title, filters = [] }) => dw({
    columns: [
      { name: `${xExpr} as ${xName}`, type: 'calculated', normalName: xName, show: true, group: true, sort: 'asc', target: 'xAxis' },
      { name: 'count(*)::integer as n', type: 'calculated', normalName: 'n', show: true, fn: 'exempt', target: 'yAxis', color },
    ],
    filters,
    // the graph theme's own fonts, axis and background; only the series colour is set
    display: {
      usePagination: false, totalLength: 366, graphType: 'BarGraph', height: 200, hideExternalToggle: true,
      margin: { top: 30, right: 16, bottom: 34, left: 34 }, paddingInner: 0.35, paddingOuter: 0,
      title: { title, position: 'start', fontSize: 14, fontWeight: '600' }, description: '',
      colors: { type: 'palette', value: [color] },
      xAxis: { scaleType: 'time', timeFormat: '%-m/%d', show: true, showGridLines: false },
      yAxis: { show: true, showGridLines: true, format: 'integer' },
      legend: { show: false }, tooltip: { show: true },
    },
  })
  S.push(section({
    trackingId: 'qa_tickets_opened_chart', group: G.sum, size: '1/2', type: 'AVL Graph', ...WHITE_CARD,
    data: barChart({ xExpr: "substring((data->>'opened') from 1 for 10)", xName: 'opened_day', color: '#3b82f6', title: 'Opened / day' }),
  }))
  S.push(section({
    trackingId: 'qa_tickets_resolved_chart', group: G.sum, size: '1/2', type: 'AVL Graph', ...WHITE_CARD,
    data: barChart({
      xExpr: "substring((data->>'resolved_date') from 1 for 10)", xName: 'resolved_day', color: '#10B981', title: 'Done / day',
      filters: [{ col: 'status', op: 'filter', value: CLOSED_STATUSES }],
    }),
  }))

  // ── filters: each writes a URL page variable the table's filters read. Status and severity
  // carry static options, so values no ticket holds yet are still pickable. ──
  const facet = (trackingId, column, label, key, over = {}) => section({
    trackingId, group: G.tbl, size: '1/2', type: 'Filter',
    data: JSON.stringify({
      externalSource: source,
      columns: [{
        name: column, customName: label, type: 'multiselect', show: true, ...over,
        filters: [{ type: 'external', operation: 'filter', values: [], isMulti: true, usePageFilters: true, searchParamKey: key }],
      }],
      filters: { op: 'AND', groups: [] },
      display: { totalLength: 1, hideExternalToggle: true, showAttribution: false, fetchMode: 'smart' },
      data: [], join: { sources: {} },
    }),
  })
  S.push(facet('qa_tickets_facet_status', 'status', 'Status', 'status', { options: staticOptions(STATUS_PILL) }))
  S.push(facet('qa_tickets_facet_severity', 'severity', 'Severity', 'severity', { options: staticOptions(SEV_PILL) }))
  S.push(facet('qa_tickets_facet_source', 'source', 'Source', 'source'))
  // With site labels, the picker shows the label while ?surface= keeps the raw key.
  S.push(facet('qa_tickets_facet_site', 'surface', 'Site', 'surface',
    hasLabels ? { display: 'meta-variable', meta_lookup: JSON.stringify(ctx.siteLabels) } : {}))

  // ── the tickets table, newest first ──
  // Each ticket's page is joined (`p`) for its live name, so every column is alias-prefixed.
  S.push(section({
    trackingId: 'qa_tickets_table', group: G.tbl, type: 'Spreadsheet', ...WHITE_CARD,
    data: dw({
      columns: [
        // Newest first by row id (monotonic with creation), whatever the opened/updated string formats.
        { name: '(ds.id)::bigint as idsort', type: 'calculated', normalName: 'idsort', display_name: '', customName: '', show: true, formatFn: ' ', hideHeader: true, size: 0, sort: 'desc' },
        // Shows the friendly number; the link carries the row id.
        {
          name: `${tnum('ds.id')} as num`, type: 'calculated', normalName: 'num', display_name: '#', customName: '#', show: true, formatFn: ' ',
          justify: 'right', size: 96, isLink: true, location: `${ctx.baseUrl}/ticket?id=`, searchParams: 'id',
        },
        pcol('ds.severity', 'Severity', SEV_PILL, { size: 100 }),
        { name: `${SOURCE_CASE} as src`, type: 'status_pill', normalName: 'src', display_name: 'Source', customName: 'Source', show: true, formatFn: ' ', pillColors: SOURCE_PILL, justify: 'left', size: 88 },
        pcol('ds.status', 'Status', STATUS_PILL, { size: 116 }),
        col('ds.title', 'Ticket', { size: 280, wrapText: true, stretch: true }),
        hasLabels
          ? {
            name: `${siteCase(ctx.siteLabels)} as site`, type: 'status_pill', normalName: 'site', display_name: 'Site', customName: 'Site', show: true, formatFn: ' ',
            pillColors: Object.fromEntries(Object.values(ctx.siteLabels).map((l) => [l, 'gray'])), justify: 'left', size: 124,
          }
          : col('ds.surface', 'Site', { size: 124 }),
        { name: PAGE_DISP, type: 'calculated', normalName: 'page_disp', display_name: 'Page', customName: 'Page', show: true, formatFn: ' ', justify: 'left', size: 136 },
        col('ds.reporter', 'Reporter', { size: 264 }),
        {
          name: "substring((data->>'updated') from 1 for 10) as updated_day", type: 'calculated', normalName: 'updated_day',
          display_name: 'Updated', customName: 'Updated', show: true, formatFn: ' ', justify: 'left', size: 112,
        },
        // Not shown; listed so the URL filters resolve (a joined section's filter columns must be
        // its own, alias-prefixed: see the Overview's site tables).
        { name: 'ds.source', show: false },
        ...(hasLabels ? [{ name: 'ds.surface', show: false }] : []),
      ],
      filters: ['status', 'severity', 'source', 'surface'].map((key) => ({ col: `ds.${key}`, op: 'filter', value: [], usePageFilters: true, searchParamKey: key })),
      join: pagesByKey(ctx),
      display: { usePagination: true, pageSize: 25, fetchMode: 'force', autoResize: false, allowDownload: true },
    }),
  }))

  return {
    title: 'Tickets', url_slug: 'tickets', index: 1,
    section_groups: [group(G.hdr, 0, 'Header'), group(G.sum, 1, 'Summary'), group(G.tbl, 2, 'Tickets')],
    sections: S,
    filters: ['status', 'severity', 'source', 'surface'].map((key) => pageVariable(`qa-tickets-${key}`, key)),
  }
}

