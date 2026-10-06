import { PAGE_STAGES } from '../ticketRecord'
import {
  T, SEV_PILL, STATUS_PILL, STORY_PILL, BUILD_PILL, DATA_PILL, STAGE_RANK, OPEN, CLOSED, CLOSED_STATUSES, W, TNUM, sqlText,
  pagesSource, storiesSource, ticketsSource, dataWrapper, col, pcol, calc, stat, staticCell, group, section, pageVariable,
} from './helpers'

// Page QA (`page?key=<page_key>`; mockup: tessera design_system_v6 pages/qa-page.html): one tracked
// page's header (crumb, name, description, add ticket), its stories and tickets, a Page-status rail
// (the stage as a clickable list, facts, work completed) and the New ticket modal. The look is the qa
// pattern's own styles (qa.theme.js). Data shapes are ported from build_cr_page.mjs. The QA ⇄ Design
// toggle is left out until the Design page feature exists.
export function pageQaPage(ctx) {
  const dwPages = dataWrapper(pagesSource(ctx))
  const dwStories = dataWrapper(storiesSource(ctx))
  const dwTickets = dataWrapper(ticketsSource(ctx))
  // `?key=` → the page's key; requireResolved holds each query until the parameter arrives.
  const byKey = { col: 'page_key', op: 'filter', value: [], usePageFilters: true, searchParamKey: 'key', requireResolved: true }
  const G = { hdr: 'page_header', main: 'page_main', side: 'page_status', modal: 'page_add_ticket' }
  const ONE = { usePagination: false, pageSize: 1, fetchMode: 'smart', cardBorder: false, headerValueLayout: 'col', cellsRowGap: 0, cellsColumnGap: 0, cardsPadding: 0 }
  // "+ add ticket" (header button, tickets card link): a static cell whose click_publish provider
  // publishes the 'addticket' action param, which opens the modal group.
  const opensModal = (column) => ({ providers: [{ functionId: 'click_publish', enabled: true, paramKey: 'addticket', args: { column } }] })
  const LINE = { color: 'var(--t-rule)' }
  const SITE = "(case when (data->>'surface_label') is null or (data->>'surface_label') = '' then (data->>'surface') else (data->>'surface_label') end)"
  const S = []

  // ── header band: crumb + open page; name + description | add ticket ──
  S.push(section({
    trackingId: 'qa_page_crumb', group: G.hdr, type: 'Card', padding: { top: '0', bottom: '2' },
    data: dwPages({
      columns: [
        calc(`('${sqlText(ctx.pattern.name)}  /  ' || ${SITE} || '  /  ' || (data->>'name')) as crumb`, '', { fn: undefined, hideHeader: true, normalName: 'crumb', valueFontStyle: T.crumb }),
        // the row's url is the href; opens in a new tab
        { name: 'url', customName: '', show: true, hideHeader: true, isLink: true, isLinkExternal: true, linkText: 'open page ↗', justify: 'right', valueFontStyle: T.buttonSM },
      ],
      filters: [byKey],
      display: { ...ONE, cardStyle: 'qa_header', cellsGridSize: 2, cellsTracksTemplate: 'minmax(0,1fr) auto', cellsVAlign: 'center' },
    }),
  }))
  S.push(section({
    trackingId: 'qa_page_header', group: G.hdr, type: 'Card', padding: { top: '0', bottom: '0' },
    data: dwPages({
      columns: [
        col('name', '', { valueFontStyle: T.pageTitle, hideHeader: true }),
        staticCell('add_ticket', '+  add ticket', { valueFontStyle: T.buttonPrimary, justify: 'right', cellRowSpan: 2, cellVAlign: 'center' }),
        col('description', '', { valueFontStyle: T.body, hideHeader: true, cellPaddingTop: 2 }),
      ],
      filters: [byKey],
      display: { ...ONE, cardStyle: 'qa_header', cellsGridSize: 2, cellsTracksTemplate: 'minmax(0,1fr) auto', _functions: opensModal('add_ticket') },
    }),
  }))

  // ── main band (the rail's host): stories, then tickets; each a header Card fused onto its table ──
  const top = { bg: 'bg-[var(--t-panel)]', border: { top: true, left: true, right: true, bottom: true, ...LINE }, radius: { tl: true, tr: true }, padding: { bottom: '0' } }
  const body = { bg: 'bg-[var(--t-panel)]', border: { left: true, right: true, bottom: true, ...LINE }, radius: { bl: true, br: true }, padding: { top: '0' } }
  const storyStage = (stage) => `(count(*) filter (where (data->>'stage') = '${stage}'))::text`
  S.push(section({
    trackingId: 'qa_page_stories_title', group: G.main, type: 'Card', ...top,
    data: dwStories({
      columns: [
        staticCell('s_title', 'Stories', { valueFontStyle: T.cardTitle }),
        calc(`(${storyStage('verified')} || ' of ' || count(*)::text || ' verified') as s_verified`, '', { hideHeader: true, normalName: 's_verified', valueFontStyle: T.small, cellVAlign: 'center' }),
        staticCell('s_fill', ''),
        // verified · accepted · proposed, as the stories' pills colour them
        ...['verified', 'accepted', 'proposed'].map((stage) => calc(`${storyStage(stage)} as st_${stage}`, '', { hideHeader: true, normalName: `st_${stage}`, selectOnly: true })),
        calc('count(*)::text as st_total', '', {
          hideHeader: true, normalName: 'st_total', type: 'stacked_bar', showLegend: false, cellVAlign: 'center',
          segments: [{ col: 'st_verified', label: 'verified', color: 'qa_story_verified' }, { col: 'st_accepted', label: 'accepted', color: 'qa_story_accepted' }, { col: 'st_proposed', label: 'proposed', color: 'qa_story_proposed' }],
        }),
      ],
      filters: [byKey],
      display: { ...ONE, cardStyle: 'qa_summary', cellsGridSize: 4, cellsTracksTemplate: 'max-content max-content minmax(0,1fr) 7rem', cellsColumnGap: 10, cardsPadding: 18 },
    }),
  }))
  S.push(section({
    trackingId: 'qa_page_stories', group: G.main, type: 'Spreadsheet', ...body,
    data: dwStories({
      columns: [
        col('story', 'Story', { size: 420, stretch: true, valueFontStyle: T.body }),
        pcol('stage', 'Status', STORY_PILL, { size: 150, justify: 'right', allowEditInView: true, activeStyle: 'qa_inline' }),
      ],
      filters: [byKey, { col: 'sort_order', op: 'filter', value: [], sort: 'asc' }],
      display: { usePagination: true, pageSize: 50, fetchMode: 'smart', autoResize: false, tableStyle: 'qa_list', emptyRowMode: 'placeholder', emptyRowText: 'No stories on this page yet' },
    }),
  }))
  S.push(section({
    trackingId: 'qa_page_tickets_title', group: G.main, type: 'Card', ...top,
    data: dwTickets({
      columns: [
        staticCell('t_title', 'Tickets', { valueFontStyle: T.cardTitle }),
        calc(`((count(*) filter (where (data->>'status') in ${OPEN}))::text || ' open · ' || (count(*) filter (where (data->>'status') in ${CLOSED}))::text || ' done') as t_counts`, '',
          { hideHeader: true, normalName: 't_counts', valueFontStyle: T.small, cellVAlign: 'center' }),
        staticCell('t_fill', ''),
        staticCell('t_add', '+  add ticket', { valueFontStyle: T.link, justify: 'right', cellVAlign: 'center' }),
      ],
      filters: [byKey],
      display: {
        ...ONE, cardStyle: 'qa_summary', cellsGridSize: 4, cellsTracksTemplate: 'max-content max-content minmax(0,1fr) auto', cellsColumnGap: 10, cardsPadding: 18,
        _functions: { ...opensModal('t_add'), subscribers: [{ functionId: 'data_refresh', enabled: true, paramKey: 'tickets_v' }] },
      },
    }),
  }))
  S.push(section({
    trackingId: 'qa_page_tickets', group: G.main, type: 'Spreadsheet', ...body,
    data: dwTickets({
      columns: [
        { name: '(id)::bigint as idsort', type: 'calculated', normalName: 'idsort', display_name: '', customName: '', show: true, formatFn: ' ', hideHeader: true, size: 0, sort: 'desc' },
        { name: `${TNUM} as num`, type: 'calculated', normalName: 'num', customName: '#', show: true, justify: 'right', isLink: true, location: `${ctx.baseUrl}/ticket?id=`, searchParams: 'id', size: 64, valueFontStyle: T.mono },
        col('title', 'Ticket', { size: 260, stretch: true, valueFontStyle: T.strong, isLink: true, location: `${ctx.baseUrl}/ticket?id=`, searchParams: 'id' }),
        pcol('severity', 'Severity', SEV_PILL, { size: 108 }),
        // closing stamps resolved_date (the first close's date is kept), reopening clears it
        pcol('status', 'Status', STATUS_PILL, { size: 132, allowEditInView: true, activeStyle: 'qa_inline', setDateOnValue: { field: 'resolved_date', values: CLOSED_STATUSES } }),
        {
          name: "substring((data->>'opened') from 1 for 10) as opened_day", type: 'calculated', normalName: 'opened_day',
          display_name: 'Opened', customName: 'Opened', show: true, formatFn: 'date', justify: 'left', size: 108, valueFontStyle: T.mono,
        },
        // fetched so a Resolved → Closed change sees the existing date (and keeps it); zero width
        { name: 'resolved_date', customName: '', show: true, hideHeader: true, size: 0 },
      ],
      filters: [byKey],
      // refetch when the modal's add_publish bumps 'tickets_v', so a new ticket appears without a reload;
      // a status change publishes 'tickets_v' too, which refreshes Work completed
      display: {
        usePagination: true, pageSize: 25, fetchMode: 'smart', autoResize: false, tableStyle: 'qa_list',
        emptyRowMode: 'placeholder', emptyRowText: 'No tickets on this page',
        _functions: {
          providers: [{ functionId: 'save_publish', enabled: true, paramKey: 'tickets_v' }],
          subscribers: [{ functionId: 'data_refresh', enabled: true, paramKey: 'tickets_v' }],
        },
      },
    }),
  }))

  // ── the Page-status rail: stage list → facts → work completed, one panel ──
  const railTop = { bg: 'bg-[var(--t-panel)]', border: { top: true, left: true, right: true, bottom: true, ...LINE }, radius: { tl: true, tr: true }, padding: { top: '0', bottom: '0' } }
  const railMid = { bg: 'bg-[var(--t-panel)]', border: { left: true, right: true, bottom: true, ...LINE }, padding: { top: '0', bottom: '0' } }
  const railBottom = { bg: 'bg-[var(--t-panel)]', border: { left: true, right: true, bottom: true, ...LINE }, radius: { bl: true, br: true }, padding: { top: '0', bottom: '0' } }
  const PAD = { cellPaddingLeft: 16, cellPaddingRight: 16 }
  S.push(section({
    trackingId: 'qa_page_stage', group: G.side, type: 'Card', ...railTop,
    data: dwPages({
      columns: [
        staticCell('rail_title', 'Page status', { valueFontStyle: T.cardTitle, cellSpan: 2, ...PAD, cellPaddingTop: 16, cellPaddingBottom: 12, cellBorderBottom: true }),
        staticCell('stage_lbl', 'stage', { valueFontStyle: T.eyebrow, ...PAD, cellPaddingTop: 12, cellPaddingBottom: 6 }),
        // row-level calcs carry no fn: a Card mixing an aggregate (fn) with row columns never fetches
        calc(`(${STAGE_RANK}::text || ' of ${PAGE_STAGES.length}') as stage_n`, '', { fn: undefined, hideHeader: true, normalName: 'stage_n', valueFontStyle: T.eyebrow, justify: 'right', editable: false, ...PAD, cellPaddingTop: 12 }),
        // the stage as a clickable list: done stages filled, the current one marked; live edit saves
        // on change, then publishes 'page_v'
        {
          name: 'stage', customName: '', type: 'radio', show: true, hideHeader: true, allowEditInView: true, inline: false,
          activeStyle: 'qa_steps', checkedTag: 'current', options: PAGE_STAGES.map((v) => ({ label: v, value: v })), cellSpan: 2, ...PAD, cellPaddingBottom: 14,
        },
      ],
      filters: [byKey],
      display: {
        ...ONE, cardStyle: 'qa_summary', cellsGridSize: 2, allowEditInView: true, liveEdit: true,
        // and refetches on its own publish, so the "n of 6" counter follows the pick
        _functions: {
          providers: [{ functionId: 'save_publish', enabled: true, paramKey: 'page_v' }],
          subscribers: [{ functionId: 'data_refresh', enabled: true, paramKey: 'page_v' }],
        },
      },
    }),
  }))
  const fact = (name, label, over = {}) => col(name, label, { hideHeader: false, headerFontStyle: T.label, valueFontStyle: T.body, ...PAD, cellPaddingTop: 4, cellPaddingBottom: 4, ...over })
  S.push(section({
    trackingId: 'qa_page_facts', group: G.side, type: 'Card', ...railMid,
    data: dwPages({
      columns: [
        fact('surface_label', 'Site', { cellPaddingTop: 12 }), fact('route', 'Route', { valueFontStyle: T.mono }), fact('owner', 'Owner'),
        calc("(case when (data->>'updated') is null then '' else (substring((data->>'updated') from 6 for 2) || '/' || substring((data->>'updated') from 9 for 2) || '/' || substring((data->>'updated') from 1 for 4)) end) as updated_disp",
          'Updated', { fn: undefined, hideHeader: false, normalName: 'updated_disp', headerFontStyle: T.label, valueFontStyle: T.mono, ...PAD, cellPaddingTop: 4, cellPaddingBottom: 4 }),
        pcol('build', 'Build', BUILD_PILL, { hideHeader: false, headerFontStyle: T.label, ...PAD, cellPaddingTop: 4, cellPaddingBottom: 4 }),
        pcol('data', 'Data', DATA_PILL, { hideHeader: false, headerFontStyle: T.label, ...PAD, cellPaddingTop: 4, cellPaddingBottom: 12 }),
      ],
      filters: [byKey],
      display: { ...ONE, cardStyle: 'qa_rail', cellsGridSize: 1, headerValueLayout: 'row', headerWidth: 35, valueWidth: 65 },
    }),
  }))
  const PCT = `coalesce(round(100.0 * sum(${W}) filter (where data->>'status' in ${CLOSED}) / nullif(sum(${W}),0)),0)`
  S.push(section({
    trackingId: 'qa_page_work', group: G.side, type: 'Card', ...railBottom,
    data: dwTickets({
      columns: [
        staticCell('w_lbl', 'work completed', { valueFontStyle: T.eyebrow, ...PAD, cellPaddingTop: 14 }),
        stat(`(${PCT}::text || '%') as complete`, '', { hideHeader: true, normalName: 'complete', valueFontStyle: T.figure, unit: 'weighted by severity', unitFontStyle: T.smallMuted, ...PAD, cellPaddingTop: 4 }),
        {
          name: `${PCT}::text as complete_bar`, normalName: 'complete_bar', type: 'data_bar', origin: 'calculated-column', fn: 'exempt', formatFn: ' ', show: true, hideHeader: true,
          barMin: 0, barMax: 100, barColorKey: 'qa_accent', ...PAD, cellPaddingTop: 8,
        },
        calc(`((count(*) filter (where data->>'status' in ${CLOSED}))::text || ' closed · ' || (count(*) filter (where data->>'status' in ${OPEN}))::text || ' open') as work_counts`, '',
          { hideHeader: true, normalName: 'work_counts', valueFontStyle: T.small, ...PAD, cellPaddingTop: 8, cellPaddingBottom: 16 }),
      ],
      filters: [byKey],
      display: { ...ONE, cardStyle: 'qa_summary', cellsGridSize: 1, _functions: { subscribers: [{ functionId: 'data_refresh', enabled: true, paramKey: 'tickets_v' }] } },
    }),
  }))

  // ── New ticket modal: an allowAdddNew Card is the create form. Three fields (title, severity,
  // description); the rest are create-time defaults with no form field (selectOnly). The
  // never-match filter keeps existing tickets out, so only the new-item form renders. ──
  const field = (name, label, over = {}) => ({ name, customName: label, show: true, hideHeader: false, headerFontStyle: T.strong, justify: 'left', cellSpan: 2, cellPaddingBottom: 14, ...over })
  S.push(section({
    trackingId: 'qa_page_add_ticket', group: G.modal, type: 'Card',
    data: dwTickets({
      columns: [
        staticCell('m_hdr', 'New ticket', { valueFontStyle: T.cardTitle, cellSpan: 2 }),
        { name: 'ticket_id', show: true, selectOnly: true, autoNumber: true, autoNumberStart: 101 },
        { name: 'status', show: true, selectOnly: true, defaultValue: 'Triage' },
        { name: 'source', show: true, selectOnly: true, defaultValue: 'client' },
        { name: 'reporter', show: true, selectOnly: true, defaultFn: 'user' },
        { name: 'opened', show: true, selectOnly: true, defaultFn: 'now' },
        { name: 'updated', show: true, selectOnly: true, defaultFn: 'now' },
        // page keys are `surface:route`: the ticket lands in the right site before anything else runs
        { name: 'surface', show: true, selectOnly: true, defaultFrom: { column: 'page_key', split: ':', index: 0 } },
        { name: 'page_route', show: true, selectOnly: true, defaultFrom: { column: 'page_key', split: ':', index: 1, prefix: '/' } },
        // the page it's filed against, pre-filled from ?key=
        field('page_key', 'on', { valueFontStyle: T.small, headerFontStyle: T.small, usePageParams: true, pageParamKey: 'key', editable: false, headerValueLayout: 'row', cellPaddingBottom: 18, cellBorderBottom: true }),
        field('title', 'Title', { type: 'text', placeholder: 'Short, specific summary', cellPaddingTop: 18 }),
        field('severity', 'Severity', { type: 'radio', activeStyle: 'qa_choice', options: Object.keys(SEV_PILL).map((v) => ({ label: v, value: v })) }),
        field('description', 'Description', { type: 'textarea', rows: 4, placeholder: 'What happened? What did you expect?' }),
        staticCell('m_note', 'numbered automatically · starts in triage', { valueFontStyle: T.smallMuted, cellSpan: 2 }),
      ],
      filters: [{ col: 'ticket_id', op: 'filter', value: ['__none__'] }],
      // closes the modal on a successful create, and publishes the new row id to 'tickets_v'
      display: {
        usePagination: false, pageSize: 1, fetchMode: 'smart', allowAdddNew: true, addItemLabel: 'add ticket', closeModalOnAdd: 'addticket', cardBorder: false,
        cardStyle: 'qa_form', cellsGridSize: 2, cellsColumnGap: 14, cellsRowGap: 0, cardsPadding: 24, headerValueLayout: 'col',
        _functions: { providers: [{ functionId: 'add_publish', enabled: true, paramKey: 'tickets_v' }] },
      },
    }),
  }))

  return {
    title: 'Page QA', url_slug: 'page', index: 3, hide_in_nav: true,
    // the Page-status group renders in the right-hand rail of the band flagged railHost
    sidebar: 'right',
    section_groups: [
      group(G.hdr, 0, 'Header', 'qa_header'),
      { ...group(G.main, 1, 'Content', 'qa_content_end'), railHost: true },
      { ...group(G.side, 2, 'Page status'), position: 'sidebar' },
      { ...group(G.modal, 3, 'Add-ticket modal'), isModal: true, modalParamKey: 'addticket', modalSize: 'xl' },
    ],
    sections: S,
    filters: [pageVariable('qa-page-key', 'key')],
  }
}
