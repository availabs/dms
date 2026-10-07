import { PAGE_STAGES } from '../ticketRecord'
import {
  T, STAGE_SHORT, STAGE_RANK, OPEN, CLOSED, st, sqlText,
  pagesSource, ticketsSource, dataWrapper, joinDataset, calc, staticCell, PANEL, group, section,
} from './helpers'

// The Overview, the install's home page (mockup: tessera design_system_v6 pages/qa-overview.html):
// a header with live figures, "How delivery works" (pages per stage, who does what), one group per
// covered sub-site (its stage and tickets bars, then its pages), and a Recent activity placeholder.
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

  // ── recent activity: a marked placeholder ──
  groups.push(group(G.end, 2 + sites.length, 'Recent activity', 'qa_content_end'))
  S.push(section({
    trackingId: 'qa_overview_activity', group: G.end, type: 'Card',
    data: dwPages({
      columns: [
        staticCell('a_title', 'Recent activity', { valueFontStyle: T.cardTitle }),
        staticCell('a_tag', 'planned', { type: 'status_pill', pillColors: { planned: 'qa_planned' }, cellVAlign: 'center' }),
        staticCell('a_fill', ''),
        staticCell('a_note', 'Tickets filed, resolved and closed across the install will list here.', { valueFontStyle: T.small, cellSpan: 3, cellPaddingTop: 6 }),
      ],
      display: {
        ...AGG, cardStyle: 'qa_planned', cardBorder: true, cellsGridSize: 3, cellsTracksTemplate: 'max-content max-content minmax(0,1fr)',
        cellsColumnGap: 8, cardsPadding: 20,
      },
    }),
  }))

  return { title: 'Overview', url_slug: 'overview', index: 0, section_groups: groups, sections: S, filters: [] }
}
