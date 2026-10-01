import { PAGE_STAGES } from '../ticketRecord'
import {
  text, styled, lexical, SEV_PILL, STATUS_PILL, SOURCE_KEY_PILL, STORY_PILL, BUILD_PILL, DATA_PILL, STAGE_HEX, OPEN, CLOSED, W, TNUM,
  pagesSource, storiesSource, ticketsSource, dataWrapper, col, pcol, calc, staticCell, group, section, pageVariable,
} from './helpers'

// Page QA (`page?key=<page_key>`): one tracked page's header, its user stories and tickets, a
// Page-status rail (stage, progress, facts, work completed) and an add-ticket modal. Ported from
// build_cr_page.mjs. The QA ⇄ Design toggle is left out until the Design page feature exists.
export function pageQaPage(ctx) {
  const dwPages = dataWrapper(pagesSource(ctx))
  const dwStories = dataWrapper(storiesSource(ctx))
  const dwTickets = dataWrapper(ticketsSource(ctx))
  // `?key=` → the page's key; requireResolved holds each query until the parameter arrives.
  const byKey = { col: 'page_key', op: 'filter', value: [], usePageFilters: true, searchParamKey: 'key', requireResolved: true }
  const G = { crumb: 'page_crumb', hdr: 'page_header', main: 'page_main', side: 'page_status', modal: 'page_add_ticket' }
  const withHeader = (over) => ({ hideHeader: false, ...over })
  const S = []
  // A composed card: a header section fused with its body section (the band is gap-0).
  const cardTop = { bg: 'white', border: { top: true, left: true, right: true, bottom: true }, radius: { tl: true, tr: true }, padding: { bottom: '0' } }
  const cardBody = { bg: 'white', border: { left: true, right: true, bottom: true }, radius: { bl: true, br: true }, padding: { top: '0', bottom: '0' } }
  const cardTitle = (title, caption) => lexical(styled('cardTitleSM', text(title)), ...(caption ? [styled('metaXS', text(caption))] : []))

  S.push(section({ trackingId: 'qa_page_crumb', group: G.crumb, type: 'lexical', data: lexical(styled('metaXS', text(`${ctx.pattern.name}     /     Page QA`))) }))

  // header: eyebrow → page name + "View live page" → description
  S.push(section({
    trackingId: 'qa_page_header', group: G.hdr, type: 'Card',
    data: dwPages({
      columns: [
        staticCell('eyebrow', '// page QA', { valueFontStyle: 'kicker', cellSpan: 2 }),
        col('name', 'Page', { valueFontStyle: 'displayLG', hideHeader: true }),
        // the row's url is the href; opens in a new tab
        { name: 'url', customName: '', show: true, hideHeader: true, valueFontStyle: 'btnOutline', isLink: true, isLinkExternal: true, linkText: 'View live page ↗', justify: 'right', cellVAlign: 'center' },
        col('description', '', { valueFontStyle: 'prose', hideHeader: true, cellSpan: 2 }),
      ],
      filters: [byKey],
      display: {
        usePagination: false, pageSize: 1, cellsGridSize: 2, cellsGridGap: 8, cellsRowGap: 3, cellsPadding: 0,
        cellsTracksTemplate: 'minmax(0,1fr) max-content', cardBorder: false,
      },
    }),
  }))

  // ── main band (the rail's host): user stories, then tickets ──
  S.push(section({ trackingId: 'qa_page_stories_title', group: G.main, type: 'lexical', data: cardTitle('Features & user stories', 'acceptance status per story'), ...cardTop }))
  S.push(section({
    trackingId: 'qa_page_stories', group: G.main, type: 'Spreadsheet', ...cardBody,
    data: dwStories({
      columns: [
        col('story', 'User story', withHeader({ size: 400, wrapText: true, stretch: true })),
        pcol('stage', 'Status', STORY_PILL, withHeader({ size: 150, justify: 'right', allowEditInView: true })),
      ],
      filters: [byKey, { col: 'sort_order', op: 'filter', value: [], sort: 'asc' }],
      display: { usePagination: true, pageSize: 50, fetchMode: 'smart', autoResize: false, tableStyle: 'flush' },
    }),
  }))
  // The tickets header is a Card so it can carry "+ Add ticket": a static cell whose click_publish
  // provider publishes the 'addticket' action param, which opens the modal group.
  S.push(section({
    trackingId: 'qa_page_tickets_title', group: G.main, type: 'Card', ...cardTop,
    data: dwTickets({
      columns: [
        staticCell('t_title', 'Tickets', { valueFontStyle: 'cardTitleSM' }),
        staticCell('add_ticket', '+ Add ticket', { valueFontStyle: 'btnPrimary', justify: 'right', cellRowSpan: 2 }),
        staticCell('t_cap', 'newest first · severity · status · source', { valueFontStyle: 'metaXS' }),
      ],
      display: {
        usePagination: false, pageSize: 1, cardBorder: false, cellsGridSize: 2, cellsTracksTemplate: 'minmax(0,1fr) max-content',
        cellsGridGap: 8, cellsRowGap: 2, cellsPadding: 0, cardsPadding: 10, cellsVAlign: 'center', cardStyle: 'rowaligned',
        _functions: { providers: [{ functionId: 'click_publish', enabled: true, paramKey: 'addticket', args: { column: 'add_ticket' } }] },
      },
    }),
  }))
  // Row-level calcs carry no fn (see calc in helpers). Dates show date-only.
  const dayCol = (field, label) => ({
    name: `substring((data->>'${field}') from 1 for 10) as ${field}_day`, type: 'calculated', normalName: `${field}_day`,
    display_name: label, customName: label, show: true, formatFn: ' ', justify: 'right', size: 104, valueFontStyle: 'metaXS',
  })
  S.push(section({
    trackingId: 'qa_page_tickets', group: G.main, type: 'Spreadsheet', ...cardBody,
    data: dwTickets({
      columns: [
        { name: '(id)::bigint as idsort', type: 'calculated', normalName: 'idsort', display_name: '', customName: '', show: true, formatFn: ' ', hideHeader: true, size: 0, sort: 'desc' },
        { name: `${TNUM} as num`, type: 'calculated', normalName: 'num', customName: '#', show: true, justify: 'left', isLink: true, location: `${ctx.baseUrl}/ticket?id=`, searchParams: 'id', size: 96 },
        col('title', 'Ticket', withHeader({ size: 300, wrapText: true, stretch: true })),
        pcol('severity', 'Sev', SEV_PILL, withHeader({ size: 92, justify: 'right' })),
        pcol('source', 'Source', SOURCE_KEY_PILL, withHeader({ size: 92, justify: 'right' })),
        pcol('status', 'Status', STATUS_PILL, withHeader({ size: 130, justify: 'right', allowEditInView: true })),
        dayCol('opened', 'Opened'),
        dayCol('updated', 'Updated'),
      ],
      filters: [byKey],
      // refetch when the modal's add_publish bumps 'tickets_v', so a new ticket appears without a reload
      display: {
        usePagination: true, pageSize: 25, fetchMode: 'smart', autoResize: false, tableStyle: 'flush',
        _functions: { subscribers: [{ functionId: 'data_refresh', enabled: true, paramKey: 'tickets_v' }] },
      },
    }),
  }))

  // ── the Page-status rail: stage control → progress → facts → work completed, one flat card ──
  const railTop = { bg: 'white', radius: { tl: true, tr: true }, offset: 13, padding: { top: '0', bottom: '0' } }
  const railDivided = { bg: 'white', border: { bottom: true }, padding: { top: '0', bottom: '0' } }
  const railBottom = { bg: 'white', radius: { bl: true, br: true }, padding: { top: '0', bottom: '0' } }
  S.push(section({
    trackingId: 'qa_page_stage', group: G.side, type: 'Card', ...railTop,
    data: dwPages({
      columns: [
        staticCell('eyebrow', '// page status', { valueFontStyle: 'kicker' }),
        {
          name: 'stage', customName: 'Pipeline stage', type: 'select', show: true, justify: 'left', hideHeader: false, headerFontStyle: 'metaXS',
          allowEditInView: true, activeStyle: 'field', options: PAGE_STAGES.map((v) => ({ label: v, value: v })),
        },
      ],
      filters: [byKey],
      // live edit: the stage saves on change
      display: { usePagination: false, pageSize: 1, cellsGridSize: 1, cellsGridGap: 1, cellsPadding: 0, cardsPadding: 14, headerValueLayout: 'col', cardBorder: false, allowEditInView: true, liveEdit: true },
    }),
  }))
  S.push(section({
    trackingId: 'qa_page_progress', group: G.side, type: 'Card', ...railDivided,
    data: dwPages({
      columns: [{ name: 'stage', customName: '', type: 'stage_progress', stages: PAGE_STAGES, stageHex: STAGE_HEX, show: true, justify: 'left', hideHeader: true }],
      filters: [byKey],
      display: { usePagination: false, pageSize: 1, cellsGridSize: 1, cellsGridGap: 8, cardsPadding: 14, headerValueLayout: 'col', cardBorder: false },
    }),
  }))
  const fact = (name, label, over = {}) => col(name, label, { hideHeader: false, headerFontStyle: 'metaXS', valueFontStyle: 'metaMD', justify: 'right', ...over })
  S.push(section({
    trackingId: 'qa_page_facts', group: G.side, type: 'Card', ...railDivided,
    data: dwPages({
      columns: [
        fact('surface_label', 'Surface'), fact('route', 'Route'), fact('owner', 'Owner'), fact('updated', 'Updated'),
        pcol('build', 'Build', BUILD_PILL, { hideHeader: false, headerFontStyle: 'metaXS', justify: 'right' }),
        pcol('data', 'Data', DATA_PILL, { hideHeader: false, headerFontStyle: 'metaXS', justify: 'right' }),
      ],
      filters: [byKey],
      display: { usePagination: false, pageSize: 1, cellsGridSize: 1, cellsRowGap: 5, cardsPadding: 14, headerValueLayout: 'row', headerWidth: 45, valueWidth: 55, cardBorder: false, cardStyle: 'rowaligned' },
    }),
  }))
  const PCT = `coalesce(round(100.0 * sum(${W}) filter (where data->>'status' in ${CLOSED}) / nullif(sum(${W}),0)),0)`
  S.push(section({
    trackingId: 'qa_page_work', group: G.side, type: 'Card', ...railBottom,
    data: dwTickets({
      columns: [
        calc(`(${PCT}::text || '%') as complete`, 'Work completed', { valueFontStyle: 'statLG', headerFontStyle: 'metaXS', cellSpan: 2 }),
        {
          name: `${PCT}::text as complete_bar`, type: 'data_bar', origin: 'calculated-column', fn: 'exempt', formatFn: ' ', show: true, hideHeader: true, hideValue: false,
          justify: 'left', cellSpan: 2, barMin: 0, barMax: 100, barColorKey: 'primary',
        },
        calc(`(count(*) filter (where data->>'status' in ${CLOSED}))::text as closed`, 'Closed', { valueFontStyle: 'statMD', headerFontStyle: 'metaXS' }),
        calc(`(count(*) filter (where data->>'status' in ${OPEN}))::text as open_n`, 'Open', { valueFontStyle: 'statMD', headerFontStyle: 'metaXS' }),
      ],
      filters: [byKey],
      display: {
        usePagination: false, pageSize: 1, cellsGridSize: 2, cellsGridGap: 10, cellsRowGap: 7, cardsPadding: 14, headerValueLayout: 'col', cardBorder: false,
        _functions: { subscribers: [{ functionId: 'data_refresh', enabled: true, paramKey: 'tickets_v' }] },
      },
    }),
  }))

  // ── add-ticket modal: an allowAdddNew Card is the create form. Three fields (title, severity,
  // description); the rest are create-time defaults with no form field (selectOnly). The
  // never-match filter keeps existing tickets out, so only the new-item form renders. ──
  const field = (name, label, over = {}) => ({ name, customName: label, show: true, hideHeader: false, headerFontStyle: 'labelSM', justify: 'left', ...over })
  S.push(section({
    trackingId: 'qa_page_add_ticket', group: G.modal, type: 'Card',
    data: dwTickets({
      columns: [
        staticCell('m_hdr', 'New ticket', { valueFontStyle: 'cardTitleSM', cellSpan: 2 }),
        staticCell('m_cap', 'Tell us what you saw on this page — triage takes it from there.', { valueFontStyle: 'proseSM', cellSpan: 2, cellBorderBottom: true }),
        { name: 'ticket_id', show: true, selectOnly: true, autoNumber: true, autoNumberStart: 101 },
        { name: 'status', show: true, selectOnly: true, defaultValue: 'Triage' },
        { name: 'source', show: true, selectOnly: true, defaultValue: 'client' },
        { name: 'reporter', show: true, selectOnly: true, defaultFn: 'user' },
        { name: 'opened', show: true, selectOnly: true, defaultFn: 'now' },
        { name: 'updated', show: true, selectOnly: true, defaultFn: 'now' },
        // page keys are `surface:route`: the ticket lands in the right site before anything else runs
        { name: 'surface', show: true, selectOnly: true, defaultFrom: { column: 'page_key', split: ':', index: 0 } },
        { name: 'page_route', show: true, selectOnly: true, defaultFrom: { column: 'page_key', split: ':', index: 1, prefix: '/' } },
        field('page_key', 'Filing against', { valueFontStyle: 'chip', usePageParams: true, pageParamKey: 'key', editable: false, cellSpan: 2 }),
        field('title', 'Title', { type: 'text', placeholder: 'Short, specific summary…', cellSpan: 2 }),
        field('severity', 'Severity', { type: 'select', options: Object.keys(SEV_PILL).map((v) => ({ label: v, value: v })), cellSpan: 1 }),
        field('description', 'Description', { type: 'textarea', rows: 4, placeholder: 'What happened? What did you expect?', cellSpan: 2 }),
        staticCell('m_note', 'numbered automatically · starts in triage', { valueFontStyle: 'metaXS', cellSpan: 2 }),
      ],
      filters: [{ col: 'ticket_id', op: 'filter', value: ['__none__'] }],
      // closes the modal on a successful create, and publishes the new row id to 'tickets_v'
      display: {
        usePagination: false, pageSize: 1, fetchMode: 'smart', allowAdddNew: true, addItemLabel: 'Add ticket', closeModalOnAdd: 'addticket', cardBorder: false,
        cellsGridSize: 2, cellsGridGap: 14, cellsRowGap: 12, cardsPadding: 24, headerValueLayout: 'col',
        _functions: { providers: [{ functionId: 'add_publish', enabled: true, paramKey: 'tickets_v' }] },
      },
    }),
  }))

  return {
    title: 'Page QA', url_slug: 'page', index: 3, hide_in_nav: true,
    // the Page-status group renders in the right-hand rail of the band flagged railHost
    sidebar: 'right',
    section_groups: [
      group(G.crumb, 0, 'breadcrumb', 'Breadcrumb'),
      group(G.hdr, 1, 'header', 'Header'),
      { ...group(G.main, 2, 'content', 'Content'), railHost: true },
      { ...group(G.side, 3, 'content', 'Page status'), position: 'sidebar' },
      { ...group(G.modal, 4, 'content', 'Add-ticket modal'), isModal: true, modalParamKey: 'addticket', modalSize: 'xl' },
    ],
    sections: S,
    filters: [pageVariable('qa-page-key', 'key')],
  }
}
