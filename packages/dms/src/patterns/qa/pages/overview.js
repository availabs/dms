import { PAGE_STAGES } from '../ticketRecord'
import {
  T, STAGE_SHORT, STAGE_RANK, OPEN, CLOSED, st, sqlText, STATUS_PILL, SEV_PILL, PRIO_PILL, CATEGORY_PILL, OUTCOME_PILL, ticketFieldLabel,
  pagesSource, ticketsSource, historySource, dataWrapper, joinDataset, calc, staticCell, PANEL, PANEL_TOP, PANEL_BOTTOM,
  group, section, pageVariable,
} from './helpers'

// The Overview, the install's home page (mockup: tessera design_system_v6 pages/qa-overview.html):
// a header with live figures, "How delivery works" (pages per stage, who does what), one group per
// covered sub-site (its stage and tickets bars, then its pages), and Recent activity (the tickets' change
// history, activitySections below).
// The look is the qa pattern's own styles (qa.theme.js). Data shapes are ported from
// build_cr_overview.mjs. `ctx` is the Tickets page's plus `datasets` and `sites`: the enabled rows of
// the install's covered-sites dataset, or null until they've loaded.

// Who does what at each stage: the library's default wording (TransportNY's), install-editable later.
const STAGE_ROLE = {
  Proposed: ['product', 'scope the stories'], Design: ['design', 'design the page'], Implemented: ['our team', 'build the page'],
  QA: ['our team', 'test and fix'], 'Dev Acceptance': ['our team', 'internal sign-off'], 'Client Acceptance': ['you', 'review and approve'],
}
// A stage's flow-step dot and bar segment (qa.theme.js qa_stage_* keys: the accent ramp)
const STAGE_KEY = {
  Proposed: 'qa_stage_proposed', Design: 'qa_stage_design', Implemented: 'qa_stage_implemented',
  QA: 'qa_stage_qa', 'Dev Acceptance': 'qa_stage_dev', 'Client Acceptance': 'qa_stage_client',
}
// A stage as the site legend reads it ("1 built · 1 in QA · 1 client accepted")
const STAGE_PHRASE = {
  Proposed: 'proposed', Design: 'design', Implemented: 'built', QA: 'in QA', 'Dev Acceptance': 'dev sign-off', 'Client Acceptance': 'client accepted',
}

// The covered sites' short keys, as a filter value: every figure and list on the Overview counts only
// the install's covered sites, never rows left from a site that was switched off. Until the sites load,
// and when none is covered, it's a value no short key can be (configure.js KEY_RE), so nothing counts.
const coveredKeys = (ctx) => ctx.sites?.length ? ctx.sites.map((site) => `${site.surface}`) : ['(none)']

export function overviewPage(ctx) {
  const dwPages = dataWrapper(pagesSource(ctx))
  const dwTickets = dataWrapper(ticketsSource(ctx))
  const ticketsByPage = joinDataset(ctx, ctx.tickets, 't', ['page_key', 'status', 'severity'], [['page_key', 'page_key']])
  const AGG = {
    usePagination: false, pageSize: 1, fetchMode: 'smart', cardBorder: false, headerValueLayout: 'col',
    cellsRowGap: 0, cellsColumnGap: 0, cardsPadding: 0,
  }
  const agg = (sql, alias, over = {}) => calc(sql, alias, { hideHeader: true, normalName: alias, ...over })
  const stageCount = (stage) => `(count(*) filter (where (data->>'stage') = '${stage}'))::text`
  const G = { hdr: 'overview_header', how: 'overview_stages', end: 'overview_activity' }
  const sites = ctx.sites || []
  const byCovered = [{ col: 'surface', op: 'filter', value: coveredKeys(ctx) }]
  const groups = [group(G.hdr, 0, 'Header', 'qa_header'), group(G.how, 1, 'How delivery works', 'qa_content')]
  const S = []

  // ── header band: crumb; title + sites line | the figures (pages, then tickets: two datasets, two Cards) ──
  S.push(section({
    trackingId: 'qa_overview_crumb', group: G.hdr, type: 'Card', padding: { top: '0', bottom: '2' },
    data: dwPages({
      columns: [staticCell('crumb', `${ctx.pattern.name}  /  Overview`, { valueFontStyle: T.crumb })],
      display: { ...AGG, cardStyle: 'qa_header', cellsGridSize: 1 },
    }),
  }))
  const sitesLine = ctx.sites
    ? (sites.length ? `${sites.length} site${sites.length === 1 ? '' : 's'} covered · pages join as they're published` : 'No sites covered yet')
    : ''
  S.push(section({
    trackingId: 'qa_overview_title', group: G.hdr, size: '1/3', type: 'Card', padding: { top: '0', bottom: '0' },
    data: dwPages({
      columns: [
        staticCell('title', 'Overview', { valueFontStyle: T.pageTitle }),
        staticCell('sites', sitesLine, { valueFontStyle: T.body, cellPaddingTop: 2 }),
      ],
      display: { ...AGG, cardStyle: 'qa_header', cellsGridSize: 1 },
    }),
  }))
  // a figure over its label; the second of a pair opens with a rule
  const figure = (sql, alias, label, over = {}) => calc(sql, label, {
    normalName: alias, valueFontStyle: T.cardTitle, headerFontStyle: T.eyebrow, hideHeader: false,
    cellPaddingTop: 10, cellPaddingBottom: 10, cellPaddingLeft: 16, cellPaddingRight: 16, ...over,
  })
  const FIGS = { ...AGG, cardStyle: 'qa_header', cellsGridSize: 2, reverse: true }
  S.push(section({
    trackingId: 'qa_overview_page_counts', group: G.hdr, size: '1/3', type: 'Card', ...PANEL, padding: { top: '0', bottom: '0' },
    data: dwPages({
      columns: [
        figure('count(*)::text as n_pages', 'n_pages', 'pages tracked'),
        figure(`${stageCount('Client Acceptance')} as n_accepted`, 'n_accepted', 'client accepted', { cellBorderLeft: true }),
      ],
      filters: byCovered,
      display: FIGS,
    }),
  }))
  S.push(section({
    trackingId: 'qa_overview_ticket_counts', group: G.hdr, size: '1/3', type: 'Card', ...PANEL, padding: { top: '0', bottom: '0' },
    data: dwTickets({
      columns: [
        figure(`(count(*) filter (where ${st()} in ${OPEN}))::text as n_open`, 'n_open', 'open tickets'),
        figure(`(count(*) filter (where ${st()} in ${OPEN} and data->>'severity' = 'Blocker'))::text as n_blocker`, 'n_blocker', 'blockers', { cellBorderLeft: true }),
      ],
      filters: byCovered,
      display: FIGS,
    }),
  }))

  // ── how delivery works: one step per stage (its live page count), who does it and what ──
  S.push(section({
    trackingId: 'qa_overview_stages', group: G.how, type: 'Card', ...PANEL,
    data: dwPages({
      columns: [
        staticCell('how_title', 'How delivery works', { valueFontStyle: T.cardTitle, cellSpan: 4, cellPaddingBottom: 14 }),
        staticCell('how_cap', 'pages by stage', { valueFontStyle: T.eyebrow, cellSpan: 2, justify: 'right', cellPaddingTop: 6 }),
        ...PAGE_STAGES.map((stage) => calc(`${stageCount(stage)} as n_${STAGE_SHORT[stage]}`, stage, {
          type: 'flow_step', stepColor: STAGE_KEY[stage], stepNote: STAGE_ROLE[stage].join(' · '), hideHeader: true,
          normalName: `n_${STAGE_SHORT[stage]}`, ...(stage === 'Client Acceptance' ? { stepTint: true } : {}),
        })),
      ],
      filters: byCovered,
      display: { ...AGG, cardStyle: 'qa_summary', cellsGridSize: 6, cellsColumnGap: 8, cardsPadding: 20 },
    }),
  }))

  // ── no sites yet: say so, and where to turn one on ──
  if (ctx.sites && !sites.length) {
    S.push(section({
      trackingId: 'qa_overview_no_sites', group: G.how, type: 'Card', ...PANEL,
      data: dwPages({
        columns: [
          staticCell('ns_title', 'No sites covered yet', { valueFontStyle: T.cardTitle }),
          staticCell('ns_body', "Turn a site on in the install's Configure tab (admin pages). Its published pages join on their own; nothing on the site changes.",
            { valueFontStyle: T.body, cellPaddingTop: 6 }),
        ],
        display: { ...AGG, cardStyle: 'qa_summary', cellsGridSize: 1, cardsPadding: 24 },
      }),
    }))
  }

  // ── one group per covered site: header (identity + stage bar | tickets bar), then its pages.
  // The band is the card (qa_site), collapsible and collapsed at first: the header stays, the pages
  // table opens from the corner toggle. ──
  sites.forEach((site, i) => {
    const key = `${site.surface}`.replace(/[^a-z0-9_]/gi, '_')
    const g = `overview_site_${key}`
    groups.push({ ...group(g, 2 + i, site.surface_label || site.surface, 'qa_site'), collapsible: true, startCollapsed: true })
    const bySite = [{ col: 'surface', op: 'filter', value: [site.surface] }]
    const LINE = { color: 'var(--t-rule)' }
    // the header's two halves sit side by side in the card, and no section in the card has a gutter
    // (the card's own width allows for it, qa.theme.js qa_site); equal heights
    S.push(section({
      trackingId: `qa_overview_${key}_title`, group: g, size: '2/3', type: 'Card', height: 'fill', showWhenCollapsed: true,
      padding: { top: '0', right: '0', bottom: '0', left: '0' },
      data: dwPages({
        columns: [
          staticCell('ttl', site.surface_label || site.surface, { valueFontStyle: T.cardTitle }),
          staticCell('s_lbl', 'stages', { valueFontStyle: T.eyebrow, cellPaddingTop: 4 }),
          agg(`('${sqlText(site.surface)} · ' || count(*) || ' page' || (case when count(*) = 1 then '' else 's' end)) as meta`, 'meta', { valueFontStyle: T.mono }),
          // the bar reads sibling count columns; its legend is the breakdown
          ...PAGE_STAGES.map((stage) => agg(`${stageCount(stage)} as seg_${STAGE_SHORT[stage]}`, `seg_${STAGE_SHORT[stage]}`, { selectOnly: true })),
          agg('count(*)::text as bar_total', 'bar_total', {
            type: 'stacked_bar', cellPaddingTop: 6,
            segments: PAGE_STAGES.map((stage) => ({ col: `seg_${STAGE_SHORT[stage]}`, label: STAGE_PHRASE[stage], color: STAGE_KEY[stage] })),
          }),
        ],
        filters: bySite,
        display: { ...AGG, cardStyle: 'qa_summary', cellsGridSize: 2, cellsTracksTemplate: 'minmax(0,1fr) minmax(0,1.1fr)', cellsColumnGap: 24, cardsPadding: 20 },
      }),
    }))
    S.push(section({
      trackingId: `qa_overview_${key}_tickets`, group: g, size: '1/3', type: 'Card', height: 'fill', showWhenCollapsed: true,
      padding: { top: '0', right: '0', bottom: '0', left: '0' },
      data: dwTickets({
        columns: [
          staticCell('t_lbl', 'tickets', { valueFontStyle: T.eyebrow, cellPaddingTop: 4 }),
          agg(`(count(*) filter (where ${st()} in ${CLOSED}))::text as seg_done`, 'seg_done', { selectOnly: true }),
          agg(`(count(*) filter (where ${st()} in ${OPEN} or ${st()} is null))::text as seg_open`, 'seg_open', { selectOnly: true }),
          agg('count(*)::text as tix_total', 'tix_total', {
            type: 'stacked_bar', cellPaddingTop: 6,
            segments: [{ col: 'seg_done', label: 'done', color: 'qa_tix_done' }, { col: 'seg_open', label: 'open', color: 'qa_tix_open' }],
            emptyText: 'no tickets yet',
          }),
        ],
        filters: bySite,
        display: { ...AGG, cardStyle: 'qa_summary', cellsGridSize: 1, cardsPadding: 20 },
      }),
    }))
    // Each page with its open-ticket count, read live: the tickets join on page_key and the rows
    // group by page (TransportNY's sync stored this count as `open_bugs`). Joined, so every
    // column is alias-prefixed (joinDataset).
    S.push(section({
      trackingId: `qa_overview_${key}_pages`, group: g, type: 'Spreadsheet',
      border: { top: true, ...LINE }, padding: { top: '0', right: '0', left: '0' },
      data: dwPages({
        columns: [
          // stage order, without a stored stage_order; an aggregate, as the rows are grouped
          { name: `min${STAGE_RANK} as stage_rank`, type: 'calculated', normalName: 'stage_rank', display_name: '', customName: '', show: true, fn: 'exempt', formatFn: ' ', hideHeader: true, size: 0, sort: 'asc' },
          {
            name: 'ds.name', customName: 'Page', show: true, group: true, justify: 'left', isLink: true, location: `${ctx.baseUrl}/page?key=`, searchParamsCol: 'ds.page_key',
            size: 220, stretch: true, valueFontStyle: T.strong,
          },
          // a blank header: an empty customName falls back to the column name
          { name: 'ds.route', customName: ' ', show: true, group: true, justify: 'left', size: 180, valueFontStyle: T.mono },
          { name: 'ds.stage', customName: 'Stage', type: 'stage_progress', stages: PAGE_STAGES, activeStyle: 'qa_ramp', show: true, group: true, justify: 'left', size: 210 },
          // an open count, '—' for none
          calc(`(case when (count(*) filter (where t.data->>'status' in ${OPEN})) = 0 then '—' else (count(*) filter (where t.data->>'status' in ${OPEN}))::text end) as open_n`,
            'open_n', { customName: 'Open tickets', justify: 'right', size: 130, valueFontStyle: T.body }),
          { name: 'ds.url', customName: ' ', show: true, group: true, justify: 'right', isLink: true, isLinkExternal: true, searchParams: 'none', linkText: 'view ↗', size: 80, valueFontStyle: T.link },
          // fetched for the Page link's searchParamsCol; zero width, like stage_rank
          { name: 'ds.page_key', customName: '', show: true, group: true, hideHeader: true, size: 0 },
          // Not shown; listed so the site filter resolves. Under a join a filter column must be
          // one of the section's columns, alias-prefixed: a bare `surface` compiles to an ambiguous
          // data->>'surface', and an unlisted `ds.surface` reaches the server as is.
          { name: 'ds.surface', show: false },
        ],
        filters: [{ col: 'ds.surface', op: 'filter', value: [site.surface] }],
        join: ticketsByPage,
        // fixed widths, so the two helper columns stay at zero width
        display: { usePagination: true, pageSize: 10, fetchMode: 'smart', autoResize: false, tableStyle: 'qa_list' },
      }),
    }))
  })

  // ── recent activity: the tickets' change history (activitySections below); without a history
  // dataset, a note that set-up turns it on ──
  groups.push(group(G.end, 2 + sites.length, 'Recent activity', 'qa_content_end'))
  if (ctx.datasets.history) {
    S.push(...activitySections(ctx, G.end))
  } else {
    S.push(section({
      trackingId: 'qa_overview_activity', group: G.end, type: 'Card',
      data: dwPages({
        columns: [
          staticCell('a_title', 'Recent activity', { valueFontStyle: T.cardTitle }),
          staticCell('a_tag', 'needs set-up', { type: 'status_pill', pillColors: { 'needs set-up': 'qa_planned' }, cellVAlign: 'center' }),
          staticCell('a_fill', ''),
          staticCell('a_note', "Tickets filed and their status changes list here once the install's change history is on: finish set-up on the install's datasets card (admin pages).",
            { valueFontStyle: T.small, cellSpan: 3, cellPaddingTop: 6 }),
        ],
        display: {
          ...AGG, cardStyle: 'qa_planned', cardBorder: true, cellsGridSize: 3, cellsTracksTemplate: 'max-content max-content minmax(0,1fr)',
          cellsColumnGap: 8, cardsPadding: 20,
        },
      }),
    }))
  }

  return {
    title: 'Overview', url_slug: 'overview', index: 0, section_groups: groups, sections: S,
    filters: ctx.datasets.history ? ACTIVITY_FILTERS.map(([key]) => pageVariable(`qa-overview-${key}`, key)) : [],
  }
}

// The activity filters: each chip writes a URL page variable (its key, the tickets column it lists),
// and the list filters the column beside it. Status filters the status a row changed TO.
const ACTIVITY_FILTERS = [['surface', 't.surface'], ['page_name', 't.page_name'], ['category', 't.category'], ['status', 'ds.new_value']]

// A row-level calc (no fn: a mix of aggregate and row calcs never fetches, helpers.js calc).
const rowCalc = (sql, alias, over = {}) => ({
  name: `${sql} as ${alias}`, type: 'calculated', normalName: alias, display_name: '', customName: '',
  show: true, formatFn: ' ', hideHeader: true, justify: 'left', ...over,
})

// Recent activity: every ticket filed and every change to its tracked fields after (status,
// severity, priority, category, assignee, outcome: datasets.js QA_TRACKED_COLUMNS), newest first, 10
// a page. It reads the install's change history (the server writes it on each create and edit),
// joined to the tickets (`t`) for the number, title, site, page and category, and keeps to the
// tickets of the covered sites, as the site cards above do. A create writes a row per field with a
// value (op 'create'); only its status row shows, as "Filed".
// Three sections fused into one panel:
//   1. title + a live count over the same rows and filters as the list ("No activity" when none);
//   2. the filter chips: a Card over the tickets themselves, so each chip lists the values tickets
//      hold (a chip names its column plainly; under a join its option query can't resolve
//      `t.surface`). Status lists the statuses tickets hold. A chip ignores filters on its own
//      column, so the Site chip drops the known but switched-off sites by value;
//   3. the list, one row per change: the ticket first (`#number`, title; both open it), then the
//      field and its old and new values as pills (`Filed → Triage` for a create; free text such as an
//      assignee as plain text, '—' for empty), then the day (MM/DD, as stored: UTC, like the Ticket
//      page's History).
function activitySections(ctx, grp) {
  const dwHistory = dataWrapper(historySource(ctx))
  const dwTickets = dataWrapper(ticketsSource(ctx))
  // `t.id` is a native column, so the join key is a calc on that side
  const join = joinDataset(ctx, ctx.tickets, 't', ['ticket_id', 'title', 'surface', 'page_name', 'category'], [['row_id', '(t.id)::text as t_key']])
  // inner: a change whose ticket is gone has nothing to show
  join.t.type = 'inner'
  const covered = coveredKeys(ctx)
  const offSites = Object.keys(ctx.siteLabels || {}).filter((key) => !covered.includes(key))
  // An edit is op 'edit' (rows from before `op` existed have none, and read as edits); anything else is
  // a create. Tested that way round because the UDA query layer drops any SELECT expression containing
  // the word "create" (dms-server uda/utils.js sanitizeName).
  const EDIT = "((ds.data->>'op') is null or (ds.data->>'op') = 'edit')"
  // a create's rows but its status row are the filing's details, not changes
  const SHOWN = `(case when (ds.data->>'field') = 'status' or ${EDIT} then 'yes' else 'no' end) as a_shown`
  // a filter column must be one of the section's own columns, alias-prefixed (the site tables above)
  const filterCols = [
    ...['ds.source_id', ...ACTIVITY_FILTERS.map(([, col]) => col)].map((name) => ({ name, show: false })),
    // not fetched (the count above the list is an aggregate, and a mix of row and aggregate calcs never fetches)
    rowCalc(SHOWN.split(' as ')[0], 'a_shown', { show: false }),
  ]
  const filters = [
    { col: SHOWN, op: 'filter', value: ['yes'] },
    { col: 'ds.source_id', op: 'filter', value: [String(ctx.tickets.source_id)] },
    { col: 't.surface', op: 'filter', value: covered },
    ...ACTIVITY_FILTERS.map(([key, col]) => ({ col, op: 'filter', value: [], usePageFilters: true, searchParamKey: key })),
  ]
  const hasLabels = Object.keys(ctx.siteLabels || {}).length > 0
  const chip = (name, label, over = {}) => ({
    // the name shows as the chip's placeholder; an empty customName keeps it from also showing as a label
    name, customName: '', type: 'filter_control', show: true, hideHeader: true,
    searchParamKey: name, isMulti: true, placeholder: label, activeStyle: 'qa_chip', ...over,
  })
  const one = { usePagination: false, pageSize: 1, fetchMode: 'smart', cardBorder: false, headerValueLayout: 'col', cardStyle: 'qa_summary' }
  const at = "(ds.data->>'at')"
  const tnum = "(case when (t.data->>'ticket_id') is null or (t.data->>'ticket_id') = '' then (t.id)::text else (t.data->>'ticket_id') end)"
  // every ticket field's values as its own pills; anything else (an assignee, '—') as plain text
  const ticketLink = { isLink: true, location: `${ctx.baseUrl}/ticket?id=`, searchParamsCol: 'a_tid' }
  const pill = {
    type: 'status_pill', origin: 'calculated-column', cellVAlign: 'center',
    pillColors: { Filed: 'qa_tag', ...STATUS_PILL, ...SEV_PILL, ...PRIO_PILL, ...CATEGORY_PILL, ...OUTCOME_PILL, '*': 'qa_plain' },
  }
  const shown = (name) => `(case when (ds.data->>'${name}') is null or (ds.data->>'${name}') = '' then '—' else (ds.data->>'${name}') end)`

  return [
    section({
      // the panel's top: no rule under it, the chips sit with the title
      trackingId: 'qa_overview_activity', group: grp, type: 'Card', ...PANEL_TOP,
      border: { top: true, left: true, right: true, color: 'var(--t-rule)' },
      data: dwHistory({
        columns: [
          staticCell('a_title', 'Recent activity', { valueFontStyle: T.cardTitle }),
          calc(`(case when count(*) = 0 then 'No activity' else (count(*)::text || ' change' || (case when count(*) = 1 then '' else 's' end) || ' · newest first') end) as a_count`,
            '', { hideHeader: true, normalName: 'a_count', valueFontStyle: T.small, justify: 'right', cellVAlign: 'center' }),
          ...filterCols,
        ],
        filters, join,
        display: { ...one, cellsGridSize: 2, cellsTracksTemplate: 'max-content minmax(0,1fr)', cellsColumnGap: 12, cardsPadding: 20 },
      }),
    }),
    section({
      trackingId: 'qa_overview_activity_filters', group: grp, type: 'Card', bg: PANEL.bg,
      border: { left: true, right: true, color: 'var(--t-rule)' }, padding: { top: '0', bottom: '0' },
      data: dwTickets({
        columns: [
          chip('surface', 'Site', {
            ...(hasLabels ? { optionLabels: ctx.siteLabels } : {}),
            ...(offSites.length ? { excludeOptionValues: offSites } : {}),
          }),
          chip('page_name', 'Page'),
          chip('category', 'Category'),
          chip('status', 'Status'),
          staticCell('af_space', ''),
          // one aggregate: the card's request is valid and it always has its one row
          calc('count(*)::text as af_n', 'af_n', { selectOnly: true, normalName: 'af_n' }),
        ],
        // the other chips list only the covered sites' values
        filters: [{ col: 'surface', op: 'filter', value: covered }],
        display: {
          ...one, cardStyle: 'qa_filters', cellsGridSize: 5, cellsTracksTemplate: 'auto auto auto auto minmax(0,1fr)',
          cellsColumnGap: 8, cellsVAlign: 'center', cardsPadding: 0, cardsGridPadding: '0 20px 12px',
        },
      }),
    }),
    section({
      trackingId: 'qa_overview_activity_list', group: grp, type: 'Card', ...PANEL_BOTTOM,
      data: dwHistory({
        columns: [
          // newest first: history row ids grow with each write
          rowCalc('(ds.id)::bigint', 'a_sort', { selectOnly: true, sort: 'desc' }),
          // the ticket first (number, then title; both open it), then the change, then the day
          rowCalc(`('#' || ${tnum})`, 'a_num', { valueFontStyle: T.bold, cellVAlign: 'center', ...ticketLink }),
          rowCalc("(case when (t.data->>'title') is null then '' else (t.data->>'title') end)", 'a_title', {
            valueFontStyle: T.bold, cellVAlign: 'center', ...ticketLink,
          }),
          rowCalc(ticketFieldLabel('ds.data'), 'a_field', { valueFontStyle: T.smallMuted, cellVAlign: 'center' }),
          rowCalc(`(case when ${EDIT} then ${shown('old_value')} else 'Filed' end)`, 'a_from', pill),
          staticCell('a_arrow', '→', { valueFontStyle: T.smallMuted, justify: 'center', cellVAlign: 'center' }),
          rowCalc(shown('new_value'), 'a_to', pill),
          rowCalc(`(substring(${at} from 6 for 2) || '/' || substring(${at} from 9 for 2))`, 'a_day', {
            valueFontStyle: T.smallMuted, justify: 'right', cellVAlign: 'center',
          }),
          // the ticket's row id, for the link
          rowCalc('(t.id)::text', 'a_tid', { selectOnly: true }),
          ...filterCols,
        ],
        filters, join,
        display: {
          // one change per row (qa_feed: a rule under it, the well on hover); fixed tracks but the
          // title's, so numbers, fields, arrows and pills line up down the list
          usePagination: true, pageSize: 10, fetchMode: 'smart', cardBorder: true, cardStyle: 'qa_feed',
          cardsGridSize: 1, cardsGridGap: 0, cardsGridPadding: '0 20px 16px', cardsPadding: '9px 8px',
          cellsGridSize: 8, cellsTracksTemplate: '3.25rem minmax(0,1fr) 4.75rem 9rem 1.25rem 9rem 2.75rem', cellsColumnGap: 8, cellsRowGap: 0,
        },
      }),
    }),
  ]
}
