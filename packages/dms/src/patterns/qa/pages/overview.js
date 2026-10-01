import { PAGE_STAGES } from '../ticketRecord'
import {
  text, styled, lexical, GOLD, STAGE_PILL, STAGE_HEX, STAGE_SHORT, STAGE_WHO, STAGE_RANK, OPEN, CLOSED, st, sqlText,
  pagesSource, ticketsSource, dataWrapper, calc, staticCell, group, section,
} from './helpers'

// The Overview, the install's home page: header with live counts, the "How delivery works"
// stage tiles, and one card per covered sub-site (its page count, stage bar, tickets bar and
// pages). Ported from build_cr_overview.mjs. `ctx` is 3a's plus `datasets` and `sites`: the
// enabled rows of the install's covered-sites dataset, or null until they've loaded.
export function overviewPage(ctx) {
  const dwPages = dataWrapper(pagesSource(ctx))
  const dwTickets = dataWrapper(ticketsSource(ctx))
  const AGG = {
    usePagination: false, pageSize: 1, fetchMode: 'smart', cardBorder: false,
    cellsGridSize: 1, cellsGridGap: 0, cellsRowGap: 2, cellsPadding: 0, cardsPadding: 14,
  }
  const agg = (sql, alias, over = {}) => calc(sql, alias, { hideHeader: true, ...over })
  const stageCount = (stage) => `(count(*) filter (where (data->>'stage') = '${stage}'))::text`
  const G = { crumb: 'overview_crumb', hdr: 'overview_header', how: 'overview_stages' }
  const groups = [
    group(G.crumb, 0, 'breadcrumb', 'Breadcrumb'),
    group(G.hdr, 1, 'header', 'Header'),
    group(G.how, 2, 'content', 'How delivery works'),
  ]
  const sites = ctx.sites || []
  const S = []

  S.push(section({ trackingId: 'qa_overview_crumb', group: G.crumb, type: 'lexical', data: lexical(styled('metaXS', text(`${ctx.pattern.name}     /     Overview`))) }))
  S.push(section({
    trackingId: 'qa_overview_title', group: G.hdr, type: 'lexical',
    data: lexical(
      styled('kicker', text(`// ${`${ctx.pattern.name}`.toLowerCase()} · QA workflow${ctx.sites ? ` · ${sites.length} site${sites.length === 1 ? '' : 's'}` : ''}`)),
      styled('displayLG', text('Overview'), text('.', 0, GOLD)),
    ),
  }))
  // live counts (the builder baked these in at build time)
  S.push(section({
    trackingId: 'qa_overview_page_counts', group: G.hdr, size: '6', type: 'Card',
    data: dwPages({
      columns: [agg(`(count(*)::text || ' pages · ' || ${stageCount('Client Acceptance')} || ' accepted') as page_counts`, 'page_counts', { valueFontStyle: 'metaSM' })],
      display: { ...AGG, cardsPadding: 0 },
    }),
  }))
  S.push(section({
    trackingId: 'qa_overview_ticket_counts', group: G.hdr, size: '6', type: 'Card',
    data: dwTickets({
      columns: [agg(`((count(*) filter (where ${st()} in ${OPEN}))::text || ' open / ' || (count(*) filter (where ${st()} in ${CLOSED}))::text || ' done tickets') as ticket_counts`, 'ticket_counts', { valueFontStyle: 'metaSM' })],
      display: { ...AGG, cardsPadding: 0 },
    }),
  }))

  // ── How delivery works: one live tile per stage ──
  S.push(section({
    trackingId: 'qa_overview_stages_title', group: G.how, type: 'lexical',
    data: lexical(styled('kicker', text('// how delivery works — issues get flagged · we fix & sign off · you approve'))),
  }))
  PAGE_STAGES.forEach((stage) => S.push(section({
    trackingId: `qa_overview_stage_${STAGE_SHORT[stage]}`, group: G.how, size: '2', type: 'Card', bg: 'white', border: 'full', height: 'fill',
    data: dwPages({
      columns: [
        agg(`${stageCount(stage)} as n_stage`, 'n_stage', { valueFontStyle: 'statXL' }),
        staticCell('lbl', stage, { valueFontStyle: 'metaSM' }),
        staticCell('who', STAGE_WHO[stage], { valueFontStyle: 'metaXS' }),
      ],
      display: AGG,
    }),
  })))

  // ── one compound card per covered site: identity → stage bar → tickets bar → pages ──
  sites.forEach((site, i) => {
    const key = `${site.surface}`.replace(/[^a-z0-9_]/gi, '_')
    const g = `overview_site_${key}`
    groups.push(group(g, 3 + i, 'content', site.surface_label || site.surface))
    const bySite = [{ col: 'surface', op: 'filter', value: [site.surface] }]
    S.push(section({
      trackingId: `qa_overview_${key}_title`, group: g, type: 'Card',
      bg: 'white', border: { top: true, left: true, right: true }, radius: { tl: true, tr: true }, padding: { bottom: '0' },
      data: dwPages({
        columns: [
          staticCell('ttl', site.surface_label || site.surface, { valueFontStyle: 'displaySM' }),
          agg(`('${sqlText(site.surface)} · ' || count(*) || ' page' || (case when count(*) = 1 then '' else 's' end)) as meta`, 'meta', { valueFontStyle: 'metaXS' }),
        ],
        filters: bySite, display: AGG,
      }),
    }))
    // Stacked bars read sibling selectOnly count columns; their legends are the breakdown.
    S.push(section({
      trackingId: `qa_overview_${key}_stages`, group: g, type: 'Card',
      bg: 'white', border: { left: true, right: true }, padding: { top: '0', bottom: '0' },
      data: dwPages({
        columns: [
          ...PAGE_STAGES.map((stage) => agg(`${stageCount(stage)} as seg_${STAGE_SHORT[stage]}`, `seg_${STAGE_SHORT[stage]}`, { selectOnly: true })),
          agg('count(*)::text as bar_total', 'bar_total', {
            type: 'stacked_bar',
            segments: PAGE_STAGES.map((stage) => ({ col: `seg_${STAGE_SHORT[stage]}`, label: STAGE_SHORT[stage], color: STAGE_HEX[stage] })),
          }),
        ],
        filters: bySite, display: AGG,
      }),
    }))
    S.push(section({
      trackingId: `qa_overview_${key}_tickets`, group: g, type: 'Card',
      bg: 'white', border: { left: true, right: true }, padding: { top: '0', bottom: '0' },
      data: dwTickets({
        columns: [
          agg(`(count(*) filter (where ${st()} in ${CLOSED}))::text as seg_done`, 'seg_done', { selectOnly: true }),
          agg(`(count(*) filter (where ${st()} in ${OPEN} or ${st()} is null))::text as seg_open`, 'seg_open', { selectOnly: true }),
          agg('count(*)::text as tix_total', 'tix_total', {
            type: 'stacked_bar',
            segments: [{ col: 'seg_done', label: 'done', color: '#10b981' }, { col: 'seg_open', label: 'open', color: '#fca5a5' }],
            emptyText: 'no tickets yet',
          }),
        ],
        filters: bySite, display: AGG,
      }),
    }))
    S.push(section({
      trackingId: `qa_overview_${key}_pages`, group: g, type: 'Spreadsheet',
      bg: 'white', border: { left: true, right: true, bottom: true }, radius: { bl: true, br: true }, padding: { top: '0' },
      data: dwPages({
        columns: [
          // stage order, without a stored stage_order
          { name: `${STAGE_RANK} as stage_rank`, type: 'calculated', normalName: 'stage_rank', display_name: '', customName: '', show: true, formatFn: ' ', hideHeader: true, size: 0, sort: 'asc' },
          { name: 'name', customName: 'Page', show: true, justify: 'left', isLink: true, location: `${ctx.baseUrl}/page?key=`, searchParamsCol: 'page_key', size: 320, stretch: true },
          { name: 'stage', customName: 'Stage', type: 'status_pill', pillColors: STAGE_PILL, show: true, justify: 'left', size: 160 },
          { name: 'url', customName: 'Live page', show: true, justify: 'right', isLink: true, isLinkExternal: true, searchParams: 'none', linkText: 'view →', size: 110 },
          // fetched for the Page link's searchParamsCol; zero width, like stage_rank
          { name: 'page_key', customName: '', show: true, hideHeader: true, size: 0 },
        ],
        filters: bySite,
        // fixed widths, so the two helper columns stay at zero width
        display: { usePagination: true, pageSize: 50, fetchMode: 'smart', autoResize: false },
      }),
    }))
  })

  return { title: 'Overview', url_slug: 'overview', index: 0, section_groups: groups, sections: S, filters: [] }
}
