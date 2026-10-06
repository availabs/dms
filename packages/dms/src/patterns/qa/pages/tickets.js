import {
  T, SEV_PILL, STATUS_PILL, OPEN, CLOSED, OPEN_STATUSES, CLOSED_STATUSES, st, W, tnum,
  SOURCE_CASE, PAGE_DISP, siteCase, ticketsSource, pagesByKey, dataWrapper, col, pcol, calc, stat, staticCell,
  PANEL, PANEL_TOP, PANEL_BOTTOM, group, section, pageVariable,
} from './helpers'

// The Tickets page (mockup: tessera design_system_v6 pages/qa-tickets.html): a header band, the
// "Where tickets stand" summary (status flow, then resolved / open by severity / found by), the
// opened / done charts, a filter bar and the tickets table. The look is the qa pattern's own styles
// (qa.theme.js: cardStyle qa_*, tableStyle qa_list, the qa* text keys). Data shapes are ported from
// TransportNY's build_cr_tickets.mjs. `ctx`:
// { app, pattern, baseUrl, tickets: {slug, source_id, view_id}, siteLabels, addTicketUrl }.
export function ticketsPage(ctx) {
  const source = ticketsSource(ctx)
  const dw = dataWrapper(source)
  // one-row aggregate Cards; cells stack their (usually hidden) header over the value
  const agg = (columns, display = {}) => dw({ columns, display: { usePagination: false, pageSize: 1, cardBorder: false, headerValueLayout: 'col', ...display } })
  const G = { hdr: 'tickets_header', sum: 'tickets_summary', tbl: 'tickets_table' }
  const hasLabels = Object.keys(ctx.siteLabels || {}).length > 0
  const S = []
  const OPEN_N = `(count(*) filter (where ${st()} in ${OPEN}))`
  const CLOSED_N = `(count(*) filter (where ${st()} in ${CLOSED}))`

  // ── header: crumb, then title · counts · add ticket on one line (one Card) ──
  S.push(section({
    trackingId: 'qa_tickets_header', group: G.hdr, type: 'Card',
    data: agg([
      staticCell('h_crumb', `${ctx.pattern.name}  /  Tickets`, { valueFontStyle: T.crumb, cellSpan: 4 }),
      staticCell('h_title', 'Tickets', { valueFontStyle: T.pageTitle }),
      calc(`(count(*)::text || ' tickets · ' || ${OPEN_N}::text || ' open') as h_counts`, '', { valueFontStyle: T.body, hideHeader: true, normalName: 'h_counts', cellPaddingBottom: 2 }),
      staticCell('h_space', ''),
      // "add ticket" opens the tickets table in the Datasets admin, when one lists the install's datasets
      ...(ctx.addTicketUrl
        ? [staticCell('h_add', '+  add ticket', { isLink: true, location: ctx.addTicketUrl, searchParams: 'none', valueFontStyle: T.button, justify: 'right' })]
        : [staticCell('h_add', '')]),
    ], {
      cardStyle: 'qa_header', cellsGridSize: 4, cellsTracksTemplate: 'auto auto minmax(0,1fr) auto',
      cellsColumnGap: 16, cellsRowGap: 12, cardsPadding: 0, cellsVAlign: 'bottom',
    }),
  }))

  // ── "Where tickets stand": title + status flow (the waiting statuses beside it) ──
  const step = (stepColor, over = {}) => ({ type: 'flow_step', stepColor, connector: true, hideHeader: true, ...over })
  S.push(section({
    trackingId: 'qa_tickets_summary_flow', group: G.sum, type: 'Card', ...PANEL_TOP,
    data: agg([
      staticCell('t_title', 'Where tickets stand', { valueFontStyle: T.cardTitle, cellSpan: 3 }),
      staticCell('t_cap', 'filed → resolved', { valueFontStyle: T.eyebrow, cellSpan: 2, justify: 'right', cellVAlign: 'center' }),
      calc(`(count(*) filter (where ${st()} = 'Triage'))::text as c_triage`, 'Triage', step('qa_triage')),
      calc(`(count(*) filter (where ${st()} = 'In progress'))::text as c_prog`, 'In progress', step('qa_active')),
      calc(`(count(*) filter (where ${st()} = 'In review'))::text as c_review`, 'In review', step('qa_review')),
      calc(`${CLOSED_N}::text as c_done`, 'Resolved / closed', step('qa_done', { connector: false, stepTint: true })),
      calc(`(count(*) filter (where ${st()} in ('Needs decision','Needs data')))::text as c_wait`, 'Waiting',
        step('qa_waiting', { connector: false, stepDashed: true, stepNote: 'needs a decision or data' })),
    ], {
      cardStyle: 'qa_summary', cellsGridSize: 5, cellsTracksTemplate: 'repeat(4, minmax(0,1fr)) minmax(13.5rem,1fr)',
      cellsColumnGap: 14, cellsRowGap: 14, cardsPadding: 20,
    }),
  }))

  // ── figures: resolved | open by severity | found by, one grid of six tracks so the three groups
  // share rows; each group after the first opens with a rule. ──
  const resolution = `coalesce(round(100.0 * sum(${W}) filter (where ${st()} in ${CLOSED}) / nullif(sum(${W}),0)),0)`
  const RULE = { cellBorderLeft: true, cellPaddingLeft: 20 }
  const ROW = { cellPaddingTop: 3, cellPaddingBottom: 3 }
  const blank = (name, over = {}) => staticCell(name, '', { ...ROW, ...over })
  const sevRows = Object.keys(SEV_PILL).map((sev) => {
    const k = sev.toLowerCase()
    const countSql = `(count(*) filter (where ${st()} in ${OPEN} and data->>'severity' = '${sev}'))`
    return [
      staticCell(`sk_${k}`, sev, { type: 'status_pill', pillColors: { [sev]: `qa_key_sev_${k}` }, ...ROW, ...RULE }),
      {
        name: `${countSql}::text as sb_${k}`, normalName: `sb_${k}`, type: 'data_bar', origin: 'calculated-column', fn: 'exempt', formatFn: ' ',
        show: true, hideHeader: true, barMaxColumn: 'open_total', barColorKey: `qa_sev_${k}`, ...ROW, cellVAlign: 'center',
      },
      calc(`${countSql}::text as sc_${k}`, '', { valueFontStyle: T.small, hideHeader: true, justify: 'right', normalName: `sc_${k}`, ...ROW }),
    ]
  })
  const SOURCES = [['ai', 'AI'], ['dev', 'Dev'], ['client', 'Client']]
  const foundRows = SOURCES.map(([key, label]) => [
    staticCell(`fk_${key}`, label, { type: 'status_pill', pillColors: { [label]: `qa_key_source_${key}` }, ...ROW, ...RULE }),
    calc(`(count(*) filter (where data->>'source' = '${key}'))::text as f_${key}`, '', { valueFontStyle: T.small, hideHeader: true, justify: 'right', normalName: `f_${key}`, ...ROW }),
  ])
  S.push(section({
    trackingId: 'qa_tickets_summary_figures', group: G.sum, type: 'Card', ...PANEL_BOTTOM,
    data: agg([
      // row 1: the three eyebrows
      staticCell('r_lbl', 'resolved', { valueFontStyle: T.eyebrow, cellPaddingBottom: 8 }),
      staticCell('s_lbl', 'open by severity', { valueFontStyle: T.eyebrow, cellSpan: 3, cellPaddingBottom: 8, ...RULE }),
      staticCell('f_lbl', 'found by', { valueFontStyle: T.eyebrow, cellSpan: 2, cellPaddingBottom: 8, ...RULE }),
      // rows 2–3: the figure (two rows tall, so it doesn't stretch one severity row) · Blocker,
      // Major · the found-by bar, AI
      stat(`(${resolution}::text || '%') as res`, '', {
        hideHeader: true, valueFontStyle: T.figure, unit: 'weighted by severity', unitFontStyle: T.smallMuted, normalName: 'res', cellRowSpan: 2, ...ROW,
      }),
      ...sevRows[0],
      {
        name: 'count(1) as found_bar', normalName: 'found_bar', type: 'stacked_bar', origin: 'calculated-column', fn: 'exempt', formatFn: ' ',
        show: true, hideHeader: true, showLegend: false, cellSpan: 2, cellVAlign: 'center', ...ROW, ...RULE,
        segments: SOURCES.map(([key, label]) => ({ col: `f_${key}`, label, color: `qa_source_${key}` })),
      },
      ...sevRows[1], ...foundRows[0],
      // row 4: the resolved bar · Minor · Dev
      {
        name: `${resolution}::text as res_bar`, normalName: 'res_bar', type: 'data_bar', origin: 'calculated-column', fn: 'exempt', formatFn: ' ',
        show: true, hideHeader: true, barMin: 0, barMax: 100, barColorKey: 'qa_accent', cellVAlign: 'center', ...ROW, cellPaddingRight: 20,
      },
      ...sevRows[2], ...foundRows[1],
      // row 5: open · done · Polish · Client
      calc(`(${OPEN_N}::text || ' open · ' || ${CLOSED_N}::text || ' done') as od`, '', { valueFontStyle: T.small, hideHeader: true, normalName: 'od', ...ROW }),
      ...sevRows[3], ...foundRows[2],
      // row 6: Feature
      blank('b6'), ...sevRows[4], blank('b6f', { cellSpan: 2, ...RULE }),
      // the open total the severity bars scale against
      { name: `${OPEN_N}::text as open_total`, normalName: 'open_total', type: 'calculated', origin: 'calculated-column', fn: 'exempt', formatFn: ' ', show: true, selectOnly: true },
    ], {
      cardStyle: 'qa_summary', cellsGridSize: 6, cellsTracksTemplate: 'minmax(0,1fr) 96px minmax(0,1fr) 28px minmax(0,0.8fr) 28px',
      cellsColumnGap: 12, cellsRowGap: 0, cardsPadding: 20, headerValueLayout: 'col',
    }),
  }))

  // ── per-day charts on a time x-axis: bars sit at their real date, one day wide ──
  const barChart = ({ xExpr, xName, color, title, filters = [] }) => dw({
    columns: [
      { name: `${xExpr} as ${xName}`, type: 'calculated', normalName: xName, show: true, group: true, sort: 'asc', target: 'xAxis' },
      { name: 'count(*)::integer as n', type: 'calculated', normalName: 'n', show: true, fn: 'exempt', target: 'yAxis', color },
    ],
    filters,
    // the graph theme's own fonts, axis and background; the series colour is a theme token
    display: {
      usePagination: false, totalLength: 366, graphType: 'BarGraph', height: 190, hideExternalToggle: true,
      margin: { top: 16, right: 8, bottom: 28, left: 26 }, paddingInner: 0.6, paddingOuter: 0,
      // title and caption take the section's qa_chart graph style
      title: { title, position: 'start' }, description: 'last 14 days',
      colors: { type: 'palette', value: [color] },
      xAxis: { scaleType: 'time', windowDays: 14, show: true, showGridLines: false },
      yAxis: { show: true, showGridLines: true, format: 'integer' },
      legend: { show: false }, tooltip: { show: true },
    },
  })
  S.push(section({
    trackingId: 'qa_tickets_opened_chart', group: G.sum, size: '1/2', type: 'AVL Graph', activeStyle: 'qa_chart', ...PANEL,
    data: barChart({ xExpr: "substring((data->>'opened') from 1 for 10)", xName: 'opened_day', color: 'var(--t-cobalt)', title: 'Opened per day' }),
  }))
  S.push(section({
    trackingId: 'qa_tickets_resolved_chart', group: G.sum, size: '1/2', type: 'AVL Graph', activeStyle: 'qa_chart', ...PANEL,
    data: barChart({
      xExpr: "substring((data->>'resolved_date') from 1 for 10)", xName: 'resolved_day', color: 'var(--qa-tix-done)', title: 'Done per day',
      filters: [{ col: 'status', op: 'filter', value: CLOSED_STATUSES }],
    }),
  }))

  // ── filter bar (one Card): All / Open / Closed shortcuts, a title search, four filter chips. Each
  // control writes a URL page variable the table's filters read. The shortcuts are status presets
  // (`|||` joins a page variable's values); the active one is the card's cellActive. ──
  const SEG = { valueFontStyle: T.segment, hideHeader: true, isLink: true, activeOnSearchParam: true, searchParams: 'none', cellBgColor: 'var(--t-well)', cellRadius: 6 }
  const chip = (name, label, key, over = {}) => ({
    // the name shows as the chip's placeholder; an empty customName keeps it from also showing as a label
    name, customName: '', type: 'filter_control', show: true, hideHeader: true,
    searchParamKey: key, isMulti: true, placeholder: label, activeStyle: 'qa_chip', ...over,
  })
  S.push(section({
    trackingId: 'qa_tickets_filters', group: G.tbl, type: 'Card',
    data: agg([
      // an explicit empty value clears the status filter (a bare `?` left the last preset applied)
      calc(`('All ' || count(*)::text) as seg_all`, '', { ...SEG, normalName: 'seg_all', location: '?status=' }),
      calc(`('Open ' || ${OPEN_N}::text) as seg_open`, '', { ...SEG, normalName: 'seg_open', location: `?status=${OPEN_STATUSES.join('|||')}` }),
      calc(`('Closed ' || ${CLOSED_N}::text) as seg_closed`, '', { ...SEG, normalName: 'seg_closed', location: `?status=${CLOSED_STATUSES.join('|||')}` }),
      chip('title', '', 'q', { controlOp: 'like', isMulti: false, placeholder: 'Search titles', controlIcon: 'Search' }),
      // the chips list the values tickets hold (filter_control reads the column's distinct values)
      chip('status', 'Status', 'status'),
      chip('severity', 'Severity', 'severity'),
      chip('source', 'Source', 'source'),
      // with site labels, the chip shows the label while ?surface= keeps the raw key
      chip('surface', 'Site', 'surface', hasLabels ? { optionLabels: ctx.siteLabels } : {}),
      staticCell('f_space', ''),
    ], {
      cardStyle: 'qa_filters', cellsGridSize: 9,
      cellsTracksTemplate: 'auto auto auto minmax(180px,20rem) auto auto auto auto minmax(0,1fr)',
      cellsColumnGap: 8, cardsPadding: 0, cellsVAlign: 'center',
    }),
  }))

  // ── the tickets table, newest first ──
  // Each ticket's page is joined (`p`) for its live name, so every column is alias-prefixed.
  const ticketLink = { isLink: true, location: `${ctx.baseUrl}/ticket?id=`, searchParams: 'id' }
  S.push(section({
    trackingId: 'qa_tickets_table', group: G.tbl, type: 'Spreadsheet', ...PANEL,
    data: dw({
      columns: [
        // Newest first by row id (monotonic with creation), whatever the opened/updated string formats.
        { name: '(ds.id)::bigint as idsort', type: 'calculated', normalName: 'idsort', display_name: '', customName: '', show: true, formatFn: ' ', hideHeader: true, size: 0, sort: 'desc' },
        // Shows the friendly number; the link carries the row id.
        {
          name: `${tnum('ds.id')} as num`, type: 'calculated', normalName: 'num', display_name: '#', customName: '#', show: true, formatFn: ' ',
          justify: 'right', size: 64, valueFontStyle: T.mono, ...ticketLink,
        },
        col('ds.title', 'Ticket', { size: 240, stretch: true, valueFontStyle: T.strong, ...ticketLink }),
        pcol('ds.severity', 'Severity', SEV_PILL, { size: 104 }),
        pcol('ds.status', 'Status', STATUS_PILL, { size: 124 }),
        hasLabels
          ? { name: `${siteCase(ctx.siteLabels)} as site`, type: 'calculated', normalName: 'site', display_name: 'Site', customName: 'Site', show: true, formatFn: ' ', justify: 'left', size: 108 }
          : col('ds.surface', 'Site', { size: 108 }),
        { name: PAGE_DISP, type: 'calculated', normalName: 'page_disp', display_name: 'Page', customName: 'Page', show: true, formatFn: ' ', justify: 'left', size: 120 },
        { name: `${SOURCE_CASE} as src`, type: 'calculated', normalName: 'src', display_name: 'Source', customName: 'Source', show: true, formatFn: ' ', justify: 'left', size: 84 },
        {
          name: "substring((data->>'updated') from 1 for 10) as updated_day", type: 'calculated', normalName: 'updated_day',
          display_name: 'Updated', customName: 'Updated', show: true, formatFn: 'date', justify: 'left', size: 104, valueFontStyle: T.mono,
        },
        // Not shown; listed so the URL filters resolve (a joined section's filter columns must be
        // its own, alias-prefixed: see the Overview's site tables).
        { name: 'ds.source', show: false },
        ...(hasLabels ? [{ name: 'ds.surface', show: false }] : []),
      ],
      filters: [
        ...['status', 'severity', 'source', 'surface'].map((key) => ({ col: `ds.${key}`, op: 'filter', value: [], usePageFilters: true, searchParamKey: key })),
        { col: 'ds.title', op: 'like', value: [], usePageFilters: true, searchParamKey: 'q' },
      ],
      join: pagesByKey(ctx),
      display: {
        usePagination: true, pageSize: 25, fetchMode: 'force', autoResize: false, allowDownload: true,
        tableStyle: 'qa_list', emptyRowMode: 'placeholder', emptyRowText: 'No tickets match these filters',
      },
    }),
  }))

  return {
    title: 'Tickets', url_slug: 'tickets', index: 1,
    section_groups: [
      group(G.hdr, 0, 'Header', 'qa_header'), group(G.sum, 1, 'Summary', 'qa_content'), group(G.tbl, 2, 'Tickets', 'qa_content_end'),
    ],
    sections: S,
    filters: ['status', 'severity', 'source', 'surface', 'q'].map((key) => pageVariable(`qa-tickets-${key}`, key)),
  }
}
